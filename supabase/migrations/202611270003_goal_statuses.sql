begin;

alter table public.goals
  add column required_status_ids uuid[] not null default array[]::uuid[];

create function public.validate_goal_statuses()
returns trigger language plpgsql set search_path='' as $$
begin
  if cardinality(new.required_status_ids) <> (
    select count(*) from public.statuses
    where user_id = new.user_id and id = any(new.required_status_ids)
  ) or coalesce(array_ndims(new.required_status_ids), 1) <> 1 then
    raise exception 'Invalid goal statuses' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_goal_statuses
before insert or update of required_status_ids on public.goals
for each row execute function public.validate_goal_statuses();

grant insert (required_status_ids), update (required_status_ids)
  on public.goals to authenticated;

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
    'AI', 'フロントエンド', 'バックエンド', 'テスト', '英語'
  ]) with ordinality as status(name, ord)
  on conflict (user_id, name) do update
    set display_order = excluded.display_order
    where statuses.display_order is distinct from excluded.display_order;
end;
$$;

commit;
