-- Requires additive 20260724014214 reliability primitives. No activation or RLS cutover.
create table public.order_submission_claims (
 capability uuid primary key, submission_id uuid not null unique,
 mode text not null check(mode in ('direct','xendit')), request_fingerprint text not null,
 provider_state text not null default 'unstarted' check(provider_state in ('unstarted','creating','uncertain','recorded')),
 created_at timestamptz not null default now()
);
alter table public.order_submission_claims enable row level security;
revoke all on public.order_submission_claims from public,anon,authenticated;
grant all on public.order_submission_claims to service_role;

create function public.claim_order_submission(p_capability uuid,p_submission_id uuid,p_mode text,p_fingerprint text)
returns uuid language plpgsql set search_path='' as $$
declare c public.order_submission_claims; f public."New PRE Facebook Orders"; existing_id uuid;
begin
 if p_capability is null or p_submission_id is null or p_mode not in ('direct','xendit') or nullif(p_fingerprint,'') is null then raise exception 'submission_reference_invalid'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('order:'||p_capability::text,0));
 perform 1 from public.messenger_sessions where facebook_u=p_capability for update;
 select * into f from public."New PRE Facebook Orders" where "facebookU"=p_capability for update;
 -- The default form uses its random submission UUID as its new capability.
 if f.id is null and p_capability<>p_submission_id then raise exception 'order_capability_not_found'; end if;
 select submission_id into existing_id from public."New Facebook Orders" where "facebookU"=p_capability order by created_at desc limit 1;
 if found then
   if existing_id is not null then return existing_id; end if;
   raise exception 'preorder_already_submitted';
 end if;
 select * into c from public.order_submission_claims where capability=p_capability for update;
 if c.capability is not null then
   if c.mode<>p_mode then raise exception 'order_payment_in_progress'; end if;
   if c.request_fingerprint<>p_fingerprint then raise exception 'submission_payload_conflict'; end if;
   return c.submission_id;
 end if;
 if f.submitted then raise exception 'preorder_already_submitted'; end if;
 if exists(select 1 from public.pending_facebook_orders q where (q.preorder_facebook_u=p_capability or q.order_data->>'facebookU'=p_capability::text) and q.submission_status<>'completed') then raise exception 'order_payment_in_progress'; end if;
 insert into public.order_submission_claims(capability,submission_id,mode,request_fingerprint) values(p_capability,p_submission_id,p_mode,p_fingerprint);
 update public."New PRE Facebook Orders" set submission_id=p_submission_id,submission_status=case when p_mode='xendit' then 'payment_pending' else 'draft' end,submission_updated_at=now() where id=f.id;
 -- Payment intent protects a Messenger draft before provider network work.
 update public.messenger_sessions set customer_opened_at=coalesce(customer_opened_at,now()) where facebook_u=p_capability;
 return p_submission_id;
end $$;
revoke all on function public.claim_order_submission(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_order_submission(uuid,uuid,text,text) to service_role;

create function public.claim_order_invoice_creation(p_submission_id uuid) returns boolean language plpgsql set search_path='' as $$
begin
 update public.order_submission_claims set provider_state='creating' where submission_id=p_submission_id and provider_state='unstarted';
 return found;
end $$;
revoke all on function public.claim_order_invoice_creation(uuid) from public,anon,authenticated;
grant execute on function public.claim_order_invoice_creation(uuid) to service_role;

create function public.order_customer_status(p_capability uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public."New Facebook Orders"; p public."New PRE Facebook Orders"; c public.order_submission_claims; x public.xendit_payments;
begin
 perform 1 from public.messenger_sessions where facebook_u=p_capability for update;
 select * into f from public."New Facebook Orders" where "facebookU"=p_capability or submission_id=p_capability order by created_at desc limit 1;
 if f.id is not null then return jsonb_build_object('kind','completed','orderNumber',f.order_number_text); end if;
 select * into c from public.order_submission_claims where capability=p_capability;
 if c.mode='xendit' then
   select * into x from public.xendit_payments where submission_id=c.submission_id;
   return jsonb_build_object('kind','payment_pending','submissionId',c.submission_id,'paymentUrl',case when x.status='PENDING' then x.payment_link_url else null end,'providerState',c.provider_state);
 end if;
 select xp.* into x from public.xendit_payments xp join public.pending_facebook_orders q on xp.order_id=q.id::text
 where (q.preorder_facebook_u=p_capability or q.order_data->>'facebookU'=p_capability::text) and q.submission_status<>'completed' limit 1;
 if x.id is not null then return jsonb_build_object('kind','payment_pending','paymentUrl',case when x.status='PENDING' then x.payment_link_url else null end,'providerState','legacy_review'); end if;
 select * into p from public."New PRE Facebook Orders" where "facebookU"=p_capability;
 if p.id is null then return jsonb_build_object('kind','unavailable'); end if;
 update public.messenger_sessions set customer_opened_at=coalesce(customer_opened_at,now()) where facebook_u=p_capability;
 return jsonb_build_object('kind','draft','draft',to_jsonb(p));
end $$;
revoke all on function public.order_customer_status(uuid) from public;
grant execute on function public.order_customer_status(uuid) to anon,authenticated,service_role;

create table public.order_confirmation_outbox (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.messenger_sessions(id),
 transition text not null check(transition in ('submitted','payment_pending')), order_number text,
 status text not null default 'pending' check(status in ('pending','sending','accepted','uncertain','blocked')),
 provider_message_id text, last_error text, updated_at timestamptz not null default now(), unique(session_id,transition)
);
alter table public.order_confirmation_outbox enable row level security;
revoke all on public.order_confirmation_outbox from public,anon,authenticated;
grant all on public.order_confirmation_outbox to service_role;
create function public.enqueue_order_confirmation() returns trigger language plpgsql set search_path='' as $$
declare session_uuid uuid; capability uuid; transition_value text; number_value text;
begin
 if tg_table_name='New Facebook Orders' then
   capability=new."facebookU"; transition_value='submitted'; number_value=new.order_number_text;
 else
   capability=new.preorder_facebook_u; transition_value='payment_pending';
 end if;
 select id into session_uuid from public.messenger_sessions where facebook_u=capability;
 if session_uuid is not null then
   insert into public.order_confirmation_outbox(session_id,transition,order_number) values(session_uuid,transition_value,number_value) on conflict do nothing;
   if transition_value='submitted' then update public.messenger_sessions set status='completed',updated_at=now() where id=session_uuid; end if;
 end if;
 return new;
end $$;
create trigger queue_messenger_submission_confirmation after insert on public."New Facebook Orders" for each row execute function public.enqueue_order_confirmation();
create trigger queue_messenger_payment_confirmation after insert on public.pending_facebook_orders for each row execute function public.enqueue_order_confirmation();
revoke all on function public.enqueue_order_confirmation() from public,anon,authenticated;

-- Adapt old invoices without creating a second final order. Keep ambiguous
-- already-paid/default legacy records in review rather than guessing identity.
create function public.finalize_legacy_xendit_order(p_invoice_id text,p_external_id text,p_paid_amount numeric,p_paid_at timestamptz,p_method text)
returns table(order_id bigint,order_number text,created boolean) language plpgsql set search_path='' as $$
declare xp public.xendit_payments; q public.pending_facebook_orders; f public."New Facebook Orders"; cap uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('legacy-invoice:'||p_invoice_id,0));
 select * into xp from public.xendit_payments where xendit_invoice_id=p_invoice_id for update;
 if xp.id is null or xp.xendit_external_id is distinct from p_external_id or xp.amount is distinct from p_paid_amount then raise exception 'paid_invoice_conflict'; end if;
 if xp.final_order_id is not null then
   select * into f from public."New Facebook Orders" where id=xp.final_order_id;
   return query select f.id,f.order_number_text,false; return;
 end if;
 select * into q from public.pending_facebook_orders where id::text=xp.order_id for update;
 if q.id is null then raise exception 'pending_order_not_found'; end if;
 if q.order_data->>'facebookU' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then cap=(q.order_data->>'facebookU')::uuid; end if;
 if cap is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('order:'||cap::text,0));
   select * into f from public."New Facebook Orders" where "facebookU"=cap order by created_at desc limit 1;
   if f.id is not null then
     update public.xendit_payments set final_order_id=f.id,status='PAID',updated_at=now() where id=xp.id;
     update public.pending_facebook_orders set submission_status='completed',updated_at=now() where id=q.id;
     return query select f.id,f.order_number_text,false; return;
   end if;
 elsif xp.status in ('PAID','SETTLED') then
   raise exception 'legacy_payment_identity_ambiguous';
 end if;
 update public.pending_facebook_orders set submission_id=q.id,preorder_facebook_u=cap,submission_status='payment_pending',route_kind=case when cap is null then 'default' else 'facebook_uuid' end where id=q.id;
 update public.xendit_payments set submission_id=q.id where id=xp.id;
 return query select * from public.finalize_xendit_order(q.id,p_invoice_id,p_external_id,p_paid_amount,p_paid_at,p_method);
end $$;
revoke all on function public.finalize_legacy_xendit_order(text,text,numeric,timestamptz,text) from public,anon,authenticated;
grant execute on function public.finalize_legacy_xendit_order(text,text,numeric,timestamptz,text) to service_role;


create function public.claim_order_confirmation(p_outbox uuid) returns jsonb language plpgsql set search_path='' as $$
declare o public.order_confirmation_outbox; s public.messenger_sessions; cfg public.messenger_settings;
begin
 select * into o from public.order_confirmation_outbox where id=p_outbox;
 if o.id is null then return null; end if;
 select * into s from public.messenger_sessions where id=o.session_id for update;
 select * into o from public.order_confirmation_outbox where id=p_outbox for update;
 if o.status<>'pending' then return null; end if;
 select * into cfg from public.messenger_settings where id for share;
 if cfg.id is null or cfg.mode is distinct from 'live' or cfg.verified_at is null or cfg.legacy_disabled_at is null then return null; end if;
 if s.id is null or s.account_id is distinct from cfg.account_id or s.status='closed' or (o.transition='payment_pending' and s.status='completed') or s.last_inbound_at is null or s.last_inbound_at<now()-interval '24 hours' then
   update public.order_confirmation_outbox set status='blocked',last_error='Session closed, reply window expired or transition superseded; staff review required',updated_at=now() where id=o.id;
   return null;
 end if;
 update public.order_confirmation_outbox set status='sending',updated_at=now() where id=o.id;
 return jsonb_build_object('outbox',to_jsonb(o),'session',to_jsonb(s));
end $$;
revoke all on function public.claim_order_confirmation(uuid) from public,anon,authenticated;
grant execute on function public.claim_order_confirmation(uuid) to service_role;

-- Every submission/payment transaction uses the dashboard's session -> PRE lock order.
-- Acquire the session lock before the reliability primitives take PRE/payment locks.
create function public.lock_order_session(p_capability uuid default null,p_submission uuid default null,p_invoice text default null)
returns void language plpgsql set search_path='' as $$
declare capability uuid;
begin
 capability=p_capability;
 if capability is null and p_submission is not null then
   select c.capability into capability from public.order_submission_claims c where c.submission_id=p_submission;
   if capability is null then select q.preorder_facebook_u into capability from public.pending_facebook_orders q where q.submission_id=p_submission; end if;
 end if;
 if capability is null and p_invoice is not null then
   select coalesce(q.preorder_facebook_u,case when q.order_data->>'facebookU' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (q.order_data->>'facebookU')::uuid end)
   into capability from public.xendit_payments x join public.pending_facebook_orders q on q.id::text=x.order_id where x.xendit_invoice_id=p_invoice;
 end if;
 perform 1 from public.messenger_sessions where facebook_u=capability for update;
end $$;
revoke all on function public.lock_order_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.lock_order_session(uuid,uuid,text) to service_role;
do $$
declare fn record; definition text; insertion text; location integer;
begin
 for fn in select p.oid,p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('create_order_from_submission','prepare_xendit_submission','record_xendit_invoice','record_xendit_payment_status','finalize_xendit_order','finalize_legacy_xendit_order') loop
   definition=pg_catalog.pg_get_functiondef(fn.oid);
   location=position(E'\nbegin\n' in definition);
   if location=0 then raise exception 'Cannot establish session lock order for %',fn.proname; end if;
   insertion=case when fn.proname in ('create_order_from_submission','prepare_xendit_submission') then
     ' perform public.lock_order_session(p_preorder_facebook_u,p_submission_id);'
     when fn.proname='finalize_legacy_xendit_order' then ' perform public.lock_order_session(null,null,p_invoice_id);'
     else ' perform public.lock_order_session(null,p_submission_id);' end;
   definition=overlay(definition placing E'\nbegin\n'||insertion||E'\n' from location for length(E'\nbegin\n'));
   execute definition;
 end loop;
end $$;
