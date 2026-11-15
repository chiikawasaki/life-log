begin;
create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.app_owner enable row level security;
create policy owner_read on public.app_owner for select to authenticated using (user_id = auth.uid());
revoke all on public.app_owner from anon, authenticated;
grant select on public.app_owner to authenticated;

create function public.is_app_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_owner where user_id = auth.uid());
$$;
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

create table public.statuses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 name text not null check (char_length(name) between 1 and 40), display_order integer not null,
 unique (id,user_id), unique(user_id,name)
);
create table public.activity_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 name text not null check(char_length(trim(name)) between 1 and 80), status_id uuid not null, archived_at timestamptz,
 unique(id,user_id), foreign key(status_id,user_id) references public.statuses(id,user_id)
);
create table public.rule_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), rule_id uuid not null,
 unit text not null check(unit in ('分','回','本','冊','件')),
 required_quantity integer not null check(required_quantity between 1 and 1000000),
 reward_points integer not null check(reward_points between 1 and 1000000), created_at timestamptz not null default clock_timestamp(),
 unique(id,user_id), foreign key(rule_id,user_id) references public.activity_rules(id,user_id)
);
create table public.effort_entries (
 id uuid primary key, user_id uuid not null references auth.users(id), rule_version_id uuid not null,
 performed_on date not null check(performed_on <= (now() at time zone 'Asia/Tokyo')::date),
 quantity integer not null check(quantity between 1 and 1000000), note text not null default '' check(char_length(note)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(rule_version_id,user_id) references public.rule_versions(id,user_id)
);
create index effort_entries_user_date on public.effort_entries(user_id,performed_on);
create index rule_versions_user_rule on public.rule_versions(user_id,rule_id);
create index activity_rules_user on public.activity_rules(user_id);

alter table public.statuses enable row level security;
alter table public.activity_rules enable row level security;
alter table public.rule_versions enable row level security;
alter table public.effort_entries enable row level security;
create policy statuses_select on public.statuses for select to authenticated using (user_id=auth.uid() and public.is_app_owner());
create policy rules_select on public.activity_rules for select to authenticated using (user_id=auth.uid() and public.is_app_owner());
create policy rules_archive on public.activity_rules for update to authenticated using (user_id=auth.uid() and public.is_app_owner()) with check(user_id=auth.uid() and public.is_app_owner());
create policy versions_select on public.rule_versions for select to authenticated using (user_id=auth.uid() and public.is_app_owner());
create policy entries_select on public.effort_entries for select to authenticated using(user_id=auth.uid() and public.is_app_owner());
create policy entries_insert on public.effort_entries for insert to authenticated with check(user_id=auth.uid() and public.is_app_owner());
create policy entries_update on public.effort_entries for update to authenticated using(user_id=auth.uid() and public.is_app_owner()) with check(user_id=auth.uid() and public.is_app_owner());
create policy entries_delete on public.effort_entries for delete to authenticated using(user_id=auth.uid() and public.is_app_owner());
revoke all on public.statuses,public.activity_rules,public.rule_versions,public.effort_entries from anon,authenticated;
grant select on public.statuses,public.activity_rules,public.rule_versions,public.effort_entries to authenticated;
grant update(archived_at) on public.activity_rules to authenticated;
grant insert,delete on public.effort_entries to authenticated;
grant update(quantity,note,performed_on,user_id,id,rule_version_id) on public.effort_entries to authenticated;

create function public.protect_entry() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id or new.rule_version_id<>old.rule_version_id then raise exception 'Entry identity is immutable'; end if;
  new.updated_at=now();
 end if;
 return new;
end; $$;
create trigger protect_entry before update on public.effort_entries for each row execute function public.protect_entry();

create function public.initialize_statuses() returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_app_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 insert into public.statuses(user_id,name,display_order)
 select auth.uid(),name,ord::integer from unnest(array['知識','体力','コミュ力','芸術','生活力','副業']) with ordinality as s(name,ord)
 on conflict(user_id,name) do nothing;
end; $$;
revoke all on function public.initialize_statuses() from public;
grant execute on function public.initialize_statuses() to authenticated;

create function public.save_rule(p_rule_id uuid,p_name text,p_status_id uuid,p_unit text,p_required_quantity integer,p_reward_points integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.is_app_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.statuses where id=p_status_id and user_id=auth.uid()) then raise exception 'Invalid status' using errcode='42501'; end if;
 if p_rule_id is null then
  insert into public.activity_rules(user_id,name,status_id) values(auth.uid(),p_name,p_status_id) returning id into target;
 else
  select id into target from public.activity_rules where id=p_rule_id and user_id=auth.uid() and status_id=p_status_id and archived_at is null for update;
  if target is null then raise exception 'Invalid rule' using errcode='42501'; end if;
  update public.activity_rules set name=p_name where id=target;
 end if;
 insert into public.rule_versions(user_id,rule_id,unit,required_quantity,reward_points)
 values(auth.uid(),target,p_unit,p_required_quantity,p_reward_points);
 return target;
end; $$;
revoke all on function public.save_rule(uuid,text,uuid,text,integer,integer) from public;
grant execute on function public.save_rule(uuid,text,uuid,text,integer,integer) to authenticated;
commit;
