-- Automatic Messenger "we received your order form" confirmation.
--
-- When a Cebu order is saved with a Messenger PSID (set directly or filled by
-- trg_messenger_fill_order_psid), queue one confirmation row and ask the
-- messenger-order-confirmation Edge Function to send a fixed template.
-- The browser never chooses the recipient or the text, and each order is
-- confirmed at most once.

create table if not exists public.messenger_order_confirmations (
  order_id bigint primary key,
  psid text not null,
  order_number text,
  token uuid not null default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed')),
  detail text,
  fb_message_id text,
  request_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service role only: no policies, no grants for public roles.
alter table public.messenger_order_confirmations enable row level security;
revoke all on table public.messenger_order_confirmations from anon, authenticated;

create or replace function public.queue_messenger_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_request bigint;
begin
  if nullif(btrim(new.subscriberid), '') is null
     or coalesce(new.branch, '') <> 'Cebu' then
    return new;
  end if;

  begin
    insert into public.messenger_order_confirmations (order_id, psid, order_number)
    values (new.id, btrim(new.subscriberid), new.order_number_text)
    on conflict (order_id) do nothing
    returning token into v_token;

    if v_token is null then
      return new;
    end if;

    -- pg_net sends after this transaction commits, so the worker sees the order.
    select net.http_post(
      url := 'https://congofivupobtfudnhni.supabase.co/functions/v1/messenger-order-confirmation',
      body := jsonb_build_object('orderId', new.id, 'token', v_token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 15000
    ) into v_request;

    update public.messenger_order_confirmations
    set request_id = v_request
    where order_id = new.id;
  exception when others then
    -- A confirmation problem must never block saving the order.
    raise warning 'messenger order confirmation not queued for order %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.queue_messenger_order_confirmation() from public, anon, authenticated;

drop trigger if exists trg_queue_messenger_order_confirmation on public."New Facebook Orders";
create trigger trg_queue_messenger_order_confirmation
after insert on public."New Facebook Orders"
for each row execute function public.queue_messenger_order_confirmation();
