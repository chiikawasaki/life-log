begin;

-- Keep the existing IDs so rule associations and past records stay intact.
update public.statuses
set name = case name when '知識' then 'その他知識' when '芸術' then 'デザイン' end
where name in ('知識', '芸術');

create or replace function public.initialize_statuses()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_owner() then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  insert into public.statuses (user_id, name, display_order)
  select auth.uid(), name, ord::integer
  from unnest(array[
    'デザイン', '研究', '論文', 'その他知識', '生活力', 'コミュ力', '体力', '副業',
    'AI', 'フロントエンド', 'バックエンド', 'テスト'
  ]) with ordinality as status(name, ord)
  on conflict (user_id, name) do update
    set display_order = excluded.display_order
    where statuses.display_order is distinct from excluded.display_order;
end;
$$;

commit;
