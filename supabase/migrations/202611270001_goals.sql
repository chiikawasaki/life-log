create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index goals_user_id_idx on public.goals (user_id);

alter table public.goals enable row level security;

create policy goals_select on public.goals for select to authenticated
  using (user_id = auth.uid() and public.is_app_owner());

create policy goals_insert on public.goals for insert to authenticated
  with check (user_id = auth.uid() and public.is_app_owner());

create policy goals_update on public.goals for update to authenticated
  using (user_id = auth.uid() and public.is_app_owner())
  with check (user_id = auth.uid() and public.is_app_owner());

revoke all on public.goals from anon,authenticated;
grant select on public.goals to authenticated;
grant insert (id, user_id, title) on public.goals to authenticated;
grant update (completed_at) on public.goals to authenticated;
