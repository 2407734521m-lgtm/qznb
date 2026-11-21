-- 20261121103000_restrict_public_page_view_rpc.sql
-- Keep the public page-view counter useful for the site, but prevent arbitrary
-- page keys from creating unbounded rows through the anon SECURITY DEFINER RPC.
-- The active production page_views key was verified as 'qianzhi-site'.

begin;

create or replace function public.bump_page_view(p_key text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v integer;
begin
  if p_key is distinct from 'qianzhi-site' then
    raise exception 'unsupported page key' using errcode = '22023';
  end if;

  update public.page_views
     set views = views + 1,
         updated_at = pg_catalog.now()
   where page_key = 'qianzhi-site'
   returning views into v;

  if not found then
    insert into public.page_views(page_key, views)
    values ('qianzhi-site', 1)
    returning views into v;
  end if;

  return v;
end;
$function$;

create or replace function public.get_page_views(p_key text)
returns integer
language sql
security definer
set search_path to ''
as $function$
  select case
    when p_key = 'qianzhi-site'
      then coalesce((
        select pv.views
          from public.page_views pv
         where pv.page_key = 'qianzhi-site'
      ), 0)
    else 0
  end
$function$;

commit;
