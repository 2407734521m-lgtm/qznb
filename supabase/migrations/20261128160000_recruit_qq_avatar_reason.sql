-- 招聘：进度查询返回驳回原因（admin_note），供应聘者看到自动拒绝 / 人工驳回的原因。
-- recruit_my_applications 返回结构变化，Postgres 不允许 CREATE OR REPLACE 直接改返回列，
-- 须先 DROP 再重建；授权与原函数一致。只改这一处，不动现有数据。

drop function if exists public.recruit_my_applications(text);

create or replace function public.recruit_my_applications(p_qq_email text)
returns table(id bigint, position_id bigint, position_title text, status text, created_at timestamptz, reviewed_at timestamptz, admin_note text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.position_id, p.title, a.status, a.created_at, a.reviewed_at, a.admin_note
  from public.recruit_applications a
  join public.recruit_positions p on p.id = a.position_id
  where a.qq_email = lower(btrim(coalesce(p_qq_email, '')))
  order by a.created_at desc
  limit 50;
$$;
revoke all on function public.recruit_my_applications(text) from public;
grant execute on function public.recruit_my_applications(text) to anon, authenticated;
