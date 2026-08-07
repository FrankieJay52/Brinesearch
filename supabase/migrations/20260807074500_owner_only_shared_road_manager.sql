alter table public.brinesearch_roads enable row level security;

drop policy if exists roads_editor_insert on public.brinesearch_roads;
drop policy if exists roads_editor_update on public.brinesearch_roads;
drop policy if exists roads_owner_insert on public.brinesearch_roads;
drop policy if exists roads_owner_update on public.brinesearch_roads;

create policy roads_owner_insert
on public.brinesearch_roads
for insert
to authenticated
with check (public.is_brinesearch_owner(auth.uid()));

create policy roads_owner_update
on public.brinesearch_roads
for update
to authenticated
using (public.is_brinesearch_owner(auth.uid()))
with check (public.is_brinesearch_owner(auth.uid()));

comment on table public.brinesearch_roads is
  'Shared BrineSearch road master. Publicly readable; only the BrineSearch owner may create, update, or delete master road records.';
