-- Permit the authenticated friend-request email Edge Function to use the shared mail dispatcher.
-- The dispatcher still accepts only its fixed internal service-role credential.
begin;

alter table public.email_delivery_logs
  drop constraint if exists email_delivery_logs_source_check;

alter table public.email_delivery_logs
  add constraint email_delivery_logs_source_check
  check (source in (
    'admin-bulk-email',
    'maintenance-notify',
    'dev-feedback',
    'friend-request-email'
  )) not valid;

alter table public.email_delivery_logs
  validate constraint email_delivery_logs_source_check;

comment on constraint email_delivery_logs_source_check on public.email_delivery_logs is
  'Only explicitly authorized server-side Edge Functions may create email delivery log entries.';

commit;
