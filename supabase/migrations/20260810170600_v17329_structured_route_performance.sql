-- Applied to production as migration version 20260810170600.
-- V17.3.29 follow-up: keep structured-route access checks and foreign-key
-- maintenance efficient without changing the existing authorization rules.

create index if not exists brinesearch_pad_roads_road_id_idx
  on public.brinesearch_pad_roads (road_id);

create index if not exists brinesearch_pad_roads_published_review_id_idx
  on public.brinesearch_pad_roads (published_review_id);

drop policy if exists pad_roads_editor_read on public.brinesearch_pad_roads;
create policy pad_roads_editor_read on public.brinesearch_pad_roads
  for select to authenticated
  using ((select public.is_brinesearch_editor((select auth.uid()))));

drop policy if exists pad_roads_editor_insert on public.brinesearch_pad_roads;
create policy pad_roads_editor_insert on public.brinesearch_pad_roads
  for insert to authenticated
  with check (
    (
      (select public.is_brinesearch_editor((select auth.uid())))
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
    and (
      geometry_version = 0
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
  );

drop policy if exists pad_roads_editor_update on public.brinesearch_pad_roads;
create policy pad_roads_editor_update on public.brinesearch_pad_roads
  for update to authenticated
  using (
    (
      (select public.is_brinesearch_editor((select auth.uid())))
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
    and (
      geometry_version = 0
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
  )
  with check (
    (
      (select public.is_brinesearch_editor((select auth.uid())))
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
    and (
      geometry_version = 0
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
  );

drop policy if exists pad_roads_editor_delete on public.brinesearch_pad_roads;
create policy pad_roads_editor_delete on public.brinesearch_pad_roads
  for delete to authenticated
  using (
    (
      (select public.is_brinesearch_editor((select auth.uid())))
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
    and (
      geometry_version = 0
      or (select public.is_brinesearch_owner((select auth.uid())))
    )
  );

drop policy if exists "Owner manages route review segments"
  on public.brinesearch_route_review_segments;
create policy "Owner manages route review segments"
  on public.brinesearch_route_review_segments
  for all to authenticated
  using ((select public.is_brinesearch_owner((select auth.uid()))))
  with check ((select public.is_brinesearch_owner((select auth.uid()))));
