begin;

alter table public.goals
  add column due_on date check (due_on between date '0001-01-01' and date '9999-12-31');

grant insert (due_on), update (due_on) on public.goals to authenticated;

commit;
