-- Preserve baseline legacy consumers while protecting session-owned final rows.
-- Full legacy access cutoff remains staged separately after caller migration.
create function public.is_messenger_order(p_facebook_u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messenger_sessions s where s.facebook_u=p_facebook_u);
$$;
revoke all on function public.is_messenger_order(uuid) from public;
grant execute on function public.is_messenger_order(uuid) to anon,authenticated,service_role;
alter table public."New Facebook Orders" enable row level security;
revoke truncate,references,trigger on public."New Facebook Orders" from anon,authenticated;
create policy final_order_legacy_access on public."New Facebook Orders" for all to anon,authenticated
using(not public.is_messenger_order("facebookU")) with check(not public.is_messenger_order("facebookU"));
create policy final_order_messenger_staff_access on public."New Facebook Orders" for all to authenticated
using(exists(select 1 from public.finished_product_editors e where e.user_id=(select auth.uid())))
with check(exists(select 1 from public.finished_product_editors e where e.user_id=(select auth.uid())));
