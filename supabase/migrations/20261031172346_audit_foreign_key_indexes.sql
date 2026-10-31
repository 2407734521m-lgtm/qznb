-- Improve FK lookup performance for admin, feedback, maintenance, and media workflows.
begin;

create index if not exists sensitive_action_requests_requester_id_idx
  on admin_private.sensitive_action_requests (requester_id);
create index if not exists sensitive_action_requests_decided_by_idx
  on admin_private.sensitive_action_requests (decided_by);
create index if not exists access_codes_created_by_idx
  on maintenance_private.access_codes (created_by);
create index if not exists admin_email_campaign_recipients_profile_id_idx
  on public.admin_email_campaign_recipients (profile_id);
create index if not exists admin_email_campaigns_actor_created_idx
  on public.admin_email_campaigns (actor_id, created_at desc);
create index if not exists feedbacks_handled_by_idx
  on public.feedbacks (handled_by);
create index if not exists love_wall_comments_author_id_idx
  on public.love_wall_comments (author_id);

-- This private append-only rate-limit log had no stable row identifier.
alter table maintenance_private.access_attempts
  add column if not exists id bigint generated always as identity;
alter table maintenance_private.access_attempts
  add constraint access_attempts_pkey primary key (id);

create index if not exists access_attempts_ip_time_idx
  on maintenance_private.access_attempts (client_ip, attempted_at desc);

commit;
