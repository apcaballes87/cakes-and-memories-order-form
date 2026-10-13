-- Order confirmations are sent through Zernio (like the order-list dashboard),
-- not the Facebook Graph API. Record Zernio's message id, and let sends that
-- the dashboard's Messenger gate or reply window rule out be marked skipped.

alter table public.messenger_order_confirmations
  rename column fb_message_id to provider_message_id;

alter table public.messenger_order_confirmations
  drop constraint if exists messenger_order_confirmations_status_check;

alter table public.messenger_order_confirmations
  add constraint messenger_order_confirmations_status_check
  check (status in ('queued', 'sending', 'sent', 'skipped', 'failed'));
