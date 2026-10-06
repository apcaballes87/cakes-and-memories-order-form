-- MANUAL coordinated cutover; intentionally excluded from automatic migrations.
-- Run only after Cebu+Molino forms and both staff dashboards pass the rollout checklist.
-- The approved roster must contain every legitimate staff account before execution.
begin;
do $$ begin
 if current_setting('app.final_order_access_cutover_verified',true) is distinct from 'true' then
   raise exception 'Complete docs/customer-boundary-rollout.md and set the session readiness gate first';
 end if;
end $$;
alter table public."New Facebook Orders" enable row level security;
drop policy if exists final_order_legacy_access on public."New Facebook Orders";
revoke all on public."New Facebook Orders" from public,anon,authenticated;
grant select,insert,update,delete on public."New Facebook Orders" to authenticated;
create policy final_order_staff_access on public."New Facebook Orders" for all to authenticated
using(exists(select 1 from public.finished_product_editors e where e.user_id=(select auth.uid())))
with check(exists(select 1 from public.finished_product_editors e where e.user_id=(select auth.uid())));
commit;
