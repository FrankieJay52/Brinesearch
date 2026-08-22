-- GitHub #97 — compact state/county content-digest hardening.
--
-- Every successful source ingest already has a verified page_set_digest covering
-- the complete ordered authoritative source page set. Use that digest as the
-- source-content anchor, then hash only compact deterministic derived mapping,
-- disposition, and name keys for the current state/county. This avoids repeatedly
-- hashing large geometry/evidence/provenance payloads on large OGRIP counties while
-- preserving source integrity and derived-state drift detection.
-- No identity/name/geometry matching semantics change here.

do $issue97_patch_compact_scope_digest$
declare
  v_definition text;
  v_start integer;
  v_relative_finish integer;
  v_finish integer;
  v_replacement text:=$replacement$
  if nullif(coalesce(p_details->>'page_set_digest',v_run.details->>'page_set_digest'),'') is null then
    raise exception 'Issue #97 verified page_set_digest is required for content receipt' using errcode='55000';
  end if;

  select pg_catalog.md5(
    coalesce(p_details->>'page_set_digest',v_run.details->>'page_set_digest')
    ||':'||coalesce(pg_catalog.string_agg(x.digest,',' order by x.digest),'')
  )
  into v_content_digest
  from (
    select c.source_digest as digest
    from public.brinesearch_authoritative_supplemental_centerlines c
    where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code
      and c.county_code=v_run.county_code and c.active
    union all
    select s.source_digest
    from public.brinesearch_authoritative_external_road_segments s
    where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code
      and s.county_code=v_run.county_code and s.active
    union all
    select n.source_digest
    from public.brinesearch_authoritative_road_nodes n
    where n.dataset_id=v_run.dataset_id and n.state_code=v_run.state_code
      and n.county_code=v_run.county_code and n.active
    union all
    select pg_catalog.md5(
      m.centerline_id::text||':'||m.identity_id::text||':'||m.mapping_status||':'||m.source_segment_keys::text
    )
    from public.brinesearch_supplemental_centerline_identity_mappings m
    where m.dataset_id=v_run.dataset_id and m.state_code=v_run.state_code
      and m.county_code=v_run.county_code and m.active
    union all
    select pg_catalog.md5(
      d.centerline_id::text||':'||d.disposition||':'||d.candidate_count::text||':'||d.verified_mapping_count::text
    )
    from public.brinesearch_supplemental_centerline_dispositions d
    where d.dataset_id=v_run.dataset_id and d.state_code=v_run.state_code
      and d.county_code=v_run.county_code and d.active
    union all
    select pg_catalog.md5(
      n.identity_id::text||':'||n.source_record_id||':'||n.name_type||':'||n.road_name
    )
    from public.brinesearch_authoritative_road_names n
    join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
    where n.source_dataset_id=v_run.dataset_id and n.active
      and i.state_code=v_run.state_code and i.county_code=v_run.county_code and i.active
  ) x;
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start:=pg_catalog.strpos(
    v_definition,
    'select pg_catalog.md5(coalesce(pg_catalog.string_agg(x.digest,'','' order by x.digest),''''))'
  );
  if v_start=0 then
    raise exception 'Issue #97 scope content-digest start marker is missing';
  end if;
  v_relative_finish:=pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_start),
    'update public.brinesearch_road_source_datasets'
  );
  if v_relative_finish=0 then
    raise exception 'Issue #97 scope content-digest finish marker is missing';
  end if;
  v_finish:=v_start+v_relative_finish-1;

  v_definition:=pg_catalog.substr(v_definition,1,v_start-1)
    ||v_replacement
    ||pg_catalog.substr(v_definition,v_finish);
  execute v_definition;
end
$issue97_patch_compact_scope_digest$;

revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
to service_role;

comment on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) is
  'Issue #97 authoritative ingest finalizer. The verified page-set digest anchors source content; compact current-scope mapping/disposition/name keys detect derived-state drift without re-hashing bulky geometry/evidence/provenance payloads. No matching inference.';
