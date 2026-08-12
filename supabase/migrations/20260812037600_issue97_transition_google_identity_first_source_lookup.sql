-- GitHub #97 — make transition-Google source provenance identity-first.
--
-- The route occurrence has already been resolved to one exact authoritative identity and
-- one exact clipped traveled LineString. Re-scanning the union source view with a spatial
-- predicate caused PostgreSQL to scan most of the Ohio catalog before applying identity_id.
-- This patch preserves the same source-segment/1 m coverage proof while forcing the
-- proven identity to drive the ODOT assignment-key or external-segment lookup first.

do $issue97_patch_transition_google_identity_first_source_lookup$
declare
  v_definition text;
  v_old text:=$old$
    join public.brinesearch_authoritative_road_segments s
      on s.identity_id=i.id and s.dataset_id=i.dataset_id and s.active and s.geom is not null
      and extensions.st_dwithin(s.geom::extensions.geography,g.step_geometry::extensions.geography,1)
$old$;
  v_new text:=$new$
    join lateral (
      select q.segment_id,q.source_segment_key,q.source_record_id,q.source_digest,q.geom
      from (
        select
          private_verification.brinesearch_issue97_uuid(a.source_segment_key) as segment_id,
          a.source_segment_key,
          c.roadway_inventory_id as source_record_id,
          pg_catalog.md5(
            c.attributes::text||coalesce(extensions.st_asewkb(c.geom)::text,'')
          ) as source_digest,
          c.geom
        from public.brinesearch_authoritative_segment_identity_assignments a
        join public.brinesearch_odot_road_catalog c
          on a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
        where a.identity_id=i.id and a.dataset_id=i.dataset_id and a.active
          and c.source_active and c.geom is not null
          and not extensions.st_isempty(c.geom)
          and extensions.st_isvalid(c.geom)
          and extensions.st_issimple(c.geom)
          and extensions.st_dimension(c.geom)=1
          and extensions.st_coveredby(
            c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326)
          )
        union all
        select
          s.id as segment_id,
          s.source_segment_key,
          s.source_record_id,
          s.source_digest,
          s.geom
        from public.brinesearch_authoritative_external_road_segments s
        where s.identity_id=i.id and s.dataset_id=i.dataset_id
          and s.active and s.geom is not null
      ) q
      offset 0
    ) s on extensions.st_dwithin(
      s.geom::extensions.geography,g.step_geometry::extensions.geography,1
    )
$new$;
  v_count integer;
  v_select_old text:='s.id as segment_id,s.source_segment_key,s.source_record_id,s.source_digest,s.geom';
  v_select_new text:='s.segment_id as segment_id,s.source_segment_key,s.source_record_id,s.source_digest,s.geom';
  v_select_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 transition Google source lookup patch target changed unexpectedly: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  v_select_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_select_old,'')))
    /pg_catalog.length(v_select_old);
  if v_select_count<>1 then
    raise exception 'Issue #97 transition Google segment alias patch target changed unexpectedly: %',v_select_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_select_old,v_select_new);
  execute v_definition;
end
$issue97_patch_transition_google_identity_first_source_lookup$;

do $issue97_assert_transition_google_identity_first_source_lookup$
declare
  v_definition text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  );
begin
  if v_definition not ilike '%brinesearch_authoritative_segment_identity_assignments%'
     or v_definition not ilike '%brinesearch_authoritative_external_road_segments%'
     or v_definition not ilike '%offset 0%'
     or v_definition not ilike '%brinesearch_issue97_uuid(a.source_segment_key)%'
     or v_definition not ilike '%s.segment_id as segment_id%'
     or v_definition ilike '%join public.brinesearch_authoritative_road_segments s%'
  then
    raise exception 'Issue #97 transition Google identity-first source lookup did not install cleanly';
  end if;
end
$issue97_assert_transition_google_identity_first_source_lookup$;
