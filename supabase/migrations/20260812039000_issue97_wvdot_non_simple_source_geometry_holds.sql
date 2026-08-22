-- GitHub #97 — account for authoritative WVDOT source rows whose geometry is
-- valid source data but cannot safely become routing topology.
--
-- Rule: a non-simple path may become routable components only when the earlier
-- endpoint-loop proof can split it at an exact repeated SOURCE vertex. Every
-- other valid non-simple source path is preserved verbatim in a private source
-- hold receipt, contributes to source freshness/content digests, and forces the
-- affected authoritative identity to HELD. It contributes no graph segment and
-- no inferred junction. A later official-source correction retires the hold and
-- the finalizer restores the identity from its then-current clean segments.

create table if not exists private_verification.brinesearch_issue97_source_geometry_holds (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  source_identity_key text not null,
  state_code text not null,
  county_code text not null,
  county_name text,
  source_record_id text not null,
  source_label text,
  hold_reason text not null,
  source_attributes jsonb not null default '{}'::jsonb,
  source_geometry_zm jsonb not null,
  source_digest text not null,
  source_timestamp timestamptz,
  classified_public_access_status text not null,
  classified_drivable_status text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  constraint brinesearch_issue97_source_geometry_holds_scope_unique
    unique(dataset_id,state_code,county_code,source_record_id),
  constraint brinesearch_issue97_source_geometry_holds_state_check
    check(state_code in ('WV','PA')),
  constraint brinesearch_issue97_source_geometry_holds_reason_check
    check(hold_reason in ('non_simple_source_geometry_topology_unproven')),
  constraint brinesearch_issue97_source_geometry_holds_access_check
    check(classified_public_access_status in ('public','private','access','unknown','held')),
  constraint brinesearch_issue97_source_geometry_holds_drivable_check
    check(classified_drivable_status in ('drivable','non_drivable','held'))
);

create index if not exists brinesearch_issue97_source_geometry_holds_scope_active_idx
  on private_verification.brinesearch_issue97_source_geometry_holds(dataset_id,state_code,county_code,active);
create index if not exists brinesearch_issue97_source_geometry_holds_identity_active_idx
  on private_verification.brinesearch_issue97_source_geometry_holds(identity_id,active);

revoke all on private_verification.brinesearch_issue97_source_geometry_holds
from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_issue97_source_geometry_holds
to service_role;

create or replace function private_verification.brinesearch_issue97_wv_path_holdable(
  p_path jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $issue97_wv_path_holdable$
declare
  v_n integer;
  v_seen integer;
  v_geom extensions.geometry;
  v_from numeric;
  v_to numeric;
begin
  if pg_catalog.jsonb_typeof(p_path) is distinct from 'array' then return false; end if;
  v_n:=pg_catalog.jsonb_array_length(p_path);
  if v_n<2 then return false; end if;

  begin
    select count(*)::integer,
      extensions.st_force2d(extensions.st_makeline(
        extensions.st_setsrid(extensions.st_makepoint(
          (point.coordinate->>0)::double precision,
          (point.coordinate->>1)::double precision
        ),4326) order by point.point_number
      )),
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number))[1],
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number desc))[1]
    into v_seen,v_geom,v_from,v_to
    from pg_catalog.jsonb_array_elements(p_path) with ordinality point(coordinate,point_number)
    where pg_catalog.jsonb_typeof(point.coordinate)='array'
      and pg_catalog.jsonb_array_length(point.coordinate)>=2;
  exception when others then
    return false;
  end;

  return v_seen=v_n
    and v_geom is not null
    and not extensions.st_isempty(v_geom)
    and extensions.st_dimension(v_geom)=1
    and extensions.st_isvalid(v_geom)
    and not extensions.st_issimple(v_geom)
    and not private_verification.brinesearch_issue97_wv_endpoint_loop_safe(v_geom)
    and extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
    and ((v_from is null and v_to is null) or (v_from is not null and v_to is not null));
end
$issue97_wv_path_holdable$;

revoke all on function private_verification.brinesearch_issue97_wv_path_holdable(jsonb)
from public,anon,authenticated;

-- Synthetic safety proof: a normal path is not a hold, an exact endpoint-loop
-- remains segmentable by the earlier rule (and therefore is not a hold), while
-- an interior/interior bow-tie crossing is holdable but never routable.
do $issue97_wv_source_hold_regression$
declare
  v_simple boolean;
  v_endpoint_loop boolean;
  v_bowtie boolean;
begin
  v_simple:=private_verification.brinesearch_issue97_wv_path_holdable(
    '[[0,0,0,0],[1,0,0,1]]'::jsonb
  );
  v_endpoint_loop:=private_verification.brinesearch_issue97_wv_path_holdable(
    '[[0,0,0,0],[1,0,0,1],[1,1,0,2],[0,1,0,3],[1,0,0,4]]'::jsonb
  );
  v_bowtie:=private_verification.brinesearch_issue97_wv_path_holdable(
    '[[0,0,0,0],[1,1,0,1],[0,1,0,2],[1,0,0,3]]'::jsonb
  );
  if coalesce(v_simple,false) or coalesce(v_endpoint_loop,false) or coalesce(v_bowtie,false) is not true then
    raise exception 'Issue #97 WVDOT source-hold regression failed: simple %, endpoint-loop %, bowtie %',
      v_simple,v_endpoint_loop,v_bowtie;
  end if;
end
$issue97_wv_source_hold_regression$;

-- Patch the current WVDOT loader without replacing any prior lifecycle,
-- multipart, endpoint-loop, or service-only hardening.
do $issue97_patch_wvdot_source_holds$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_source_path_count integer;\n  v_rows integer:=0;';
  v_new:=E'  v_source_path_count integer;\n  v_geometry_hold boolean:=false;\n  v_paths_accounted boolean:=false;\n  v_hold_reason text;\n  v_source_access text;\n  v_source_drivable text;\n  v_held_rows integer:=0;\n  v_rows integer:=0;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT hold declaration patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    -- Every original ArcGIS path must survive independently. An unmeasured path\n    -- is valid only when both endpoint measures are NULL; a half-measured path,\n    -- one-point path, non-simple path, invalid path, or missing path fails closed.\n    if coalesce(v_path_count,0)=0\n       or v_path_count<>v_source_path_count\n       or v_valid_path_count<>v_path_count then\n      continue;\n    end if;\n\n    -- The geometry-only predicate above prevents arbitrary non-simple input.\n    -- The JSON component helper additionally proves that every original path can\n    -- be materialized with valid endpoint measures before the source row counts.\n    if exists(\n      select 1\n      from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'') path(path_value)\n      where not exists(\n        select 1\n        from private_verification.brinesearch_issue97_wv_path_components(path.path_value)\n      )\n    ) then\n      continue;\n    end if;';
  v_new:=E'    -- Every original ArcGIS path must be accounted for. Simple paths and the\n    -- narrowly proven exact-source-vertex endpoint-loop become routable components.\n    -- Any other VALID non-simple path is preserved as an explicit source hold; it\n    -- never becomes a graph segment or an inferred junction. Malformed, invalid,\n    -- half-measured, missing, or otherwise unaccountable paths still fail closed.\n    v_geometry_hold:=false;\n    v_paths_accounted:=false;\n    v_hold_reason:=null;\n    if coalesce(v_path_count,0)=0 or v_path_count<>v_source_path_count then\n      continue;\n    end if;\n\n    if v_valid_path_count<>v_path_count then\n      select\n        coalesce(pg_catalog.bool_and(\n          exists(\n            select 1 from private_verification.brinesearch_issue97_wv_path_components(path.path_value)\n          ) or private_verification.brinesearch_issue97_wv_path_holdable(path.path_value)\n        ),false),\n        coalesce(pg_catalog.bool_or(\n          private_verification.brinesearch_issue97_wv_path_holdable(path.path_value)\n        ),false)\n      into v_paths_accounted,v_geometry_hold\n      from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'') path(path_value);\n      if not coalesce(v_paths_accounted,false) or not coalesce(v_geometry_hold,false) then\n        continue;\n      end if;\n      v_hold_reason:=''non_simple_source_geometry_topology_unproven'';\n    end if;\n\n    if not v_geometry_hold and exists(\n      select 1\n      from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'') path(path_value)\n      where not exists(\n        select 1\n        from private_verification.brinesearch_issue97_wv_path_components(path.path_value)\n      )\n    ) then\n      continue;\n    end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT hold validation patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_drivable:=case\n      when v_sign in (''R'',''T'') or v_supp in (''21'',''51'',''99'') then ''non_drivable''\n      when v_sign=''9'' or v_supp in (''23'',''24'') then ''held''\n      when v_sign in (''0'',''1'',''2'',''3'',''4'',''6'',''7'',''8'') then ''drivable''\n      else ''held'' end;';
  v_new:=v_old||E'\n    v_source_access:=v_access;\n    v_source_drivable:=v_drivable;\n    if v_geometry_hold then\n      v_access:=''held'';\n      v_drivable:=''held'';\n    end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT hold classification patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''multipart_paths_preserved'',v_path_count>1,\n        ''measure_direction_preserved'',true\n      ),pg_catalog.md5(v_props::text||(v_feature->''geometry'')::text),';
  v_new:=E'        ''multipart_paths_preserved'',v_path_count>1,\n        ''measure_direction_preserved'',true,\n        ''source_classified_public_access_status'',v_source_access,\n        ''source_classified_drivable_status'',v_source_drivable,\n        ''source_geometry_hold'',v_geometry_hold,\n        ''source_geometry_hold_reason'',v_hold_reason\n      ),pg_catalog.md5(v_props::text||(v_feature->''geometry'')::text),';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT identity hold provenance patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();\n\n    if v_source_label is not null then';
  v_new:=E'      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();\n\n    if v_geometry_hold then\n      insert into private_verification.brinesearch_issue97_source_geometry_holds(\n        id,dataset_id,identity_id,source_identity_key,state_code,county_code,county_name,\n        source_record_id,source_label,hold_reason,source_attributes,source_geometry_zm,\n        source_digest,source_timestamp,classified_public_access_status,classified_drivable_status,\n        active,first_seen_at,last_seen_at,resolved_at,details\n      ) values (\n        private_verification.brinesearch_issue97_uuid(\n          ''source-geometry-hold:''||v_dataset::text||'':WV:''||v_county||'':''||(v_props->>''OBJECTID'')\n        ),v_dataset,v_identity,v_identity_key,''WV'',v_county,v_county_name,\n        v_props->>''OBJECTID'',v_source_label,v_hold_reason,v_props,v_feature->''geometry'',\n        pg_catalog.md5(v_props::text||(v_feature->''geometry'')::text),\n        case when (v_props->>''SYSTEM_MOD_DATE'') ~ ''^[0-9]+$''\n          then pg_catalog.to_timestamp((v_props->>''SYSTEM_MOD_DATE'')::numeric/1000.0) end,\n        v_source_access,v_source_drivable,true,now(),now(),null,\n        pg_catalog.jsonb_build_object(\n          ''source'',''WVDOT Publication LRS'',\n          ''topology_action'',''hold_without_graph_segment'',\n          ''name_used_for_resolution'',false,\n          ''nearest_road_used'',false,\n          ''source_vertex_invented'',false\n        )\n      ) on conflict(dataset_id,state_code,county_code,source_record_id) do update set\n        identity_id=excluded.identity_id,source_identity_key=excluded.source_identity_key,\n        county_name=excluded.county_name,source_label=excluded.source_label,\n        hold_reason=excluded.hold_reason,source_attributes=excluded.source_attributes,\n        source_geometry_zm=excluded.source_geometry_zm,source_digest=excluded.source_digest,\n        source_timestamp=excluded.source_timestamp,\n        classified_public_access_status=excluded.classified_public_access_status,\n        classified_drivable_status=excluded.classified_drivable_status,\n        active=true,last_seen_at=now(),resolved_at=null,details=excluded.details;\n      v_held_rows:=v_held_rows+1;\n    end if;\n\n    if v_source_label is not null then';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT hold receipt patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''multipart_paths_preserved'',v_path_count>1\n        )';
  v_new:=E'        ''multipart_paths_preserved'',v_path_count>1,\n          ''source_geometry_hold'',v_geometry_hold,\n          ''source_geometry_hold_reason'',v_hold_reason\n        )';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT name hold provenance patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''source_rows'',v_source_rows,''rows'',v_rows,''rejected_rows'',v_source_rows-v_rows,\n    ''has_more'',v_has_more,';
  v_new:=E'    ''source_rows'',v_source_rows,''rows'',v_rows,''held_rows'',v_held_rows,\n    ''rejected_rows'',v_source_rows-v_rows,''has_more'',v_has_more,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 WVDOT hold result patch target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_wvdot_source_holds$;

-- Patch the source-scope orchestrator so held rows are explicitly accounted in
-- durable run details. They remain included in ingested_rows (because they are
-- ingested authoritative source receipts) and therefore are not rejected rows.
do $issue97_patch_source_scope_hold_metrics$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_source_scope(text,text,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_rejected_rows integer:=0;\n  v_error text;';
  v_new:=E'  v_rejected_rows integer:=0;\n  v_held_rows integer:=0;\n  v_error text;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold metric declaration target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      v_rejected_rows:=v_rejected_rows+coalesce((v_page->>''rejected_rows'')::integer,0);';
  v_new:=v_old||E'\n      v_held_rows:=v_held_rows+coalesce((v_page->>''held_rows'')::integer,0);';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold metric accumulation target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''orchestrator_rejected_rows'',v_rejected_rows\n      )';
  v_new:=E'        ''orchestrator_rejected_rows'',v_rejected_rows,\n        ''orchestrator_held_rows'',v_held_rows\n      )';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold finalizer details target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''rejected_rows_seen'',v_rejected_rows,\n        ''expected_source_rows'',v_expected';
  v_new:=E'        ''rejected_rows_seen'',v_rejected_rows,\n        ''held_rows_seen'',v_held_rows,\n        ''expected_source_rows'',v_expected';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold failure details target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      ''ingested_rows_seen'',v_ingested_rows,\n      ''rejected_rows_seen'',v_rejected_rows\n    );';
  v_new:=E'      ''ingested_rows_seen'',v_ingested_rows,\n      ''rejected_rows_seen'',v_rejected_rows,\n      ''held_rows_seen'',v_held_rows\n    );';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold failure return target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''ingested_rows'',v_ingested_rows,''rejected_rows'',v_rejected_rows,\n    ''status'',coalesce(v_final->>''status'',''failed''),';
  v_new:=E'    ''ingested_rows'',v_ingested_rows,''held_rows'',v_held_rows,\n    ''rejected_rows'',v_rejected_rows,\n    ''status'',coalesce(v_final->>''status'',''failed''),';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 source hold success return target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_source_scope_hold_metrics$;

-- Finalizer: retire stale holds, keep held-only identities active, force any
-- identity with a current hold to HELD, restore it from current clean segments
-- once the hold disappears, and include holds in the immutable source digest.
do $issue97_patch_finalize_source_holds$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_retired_identities integer:=0;\n  v_content_digest text;';
  v_new:=E'  v_retired_identities integer:=0;\n  v_retired_source_holds integer:=0;\n  v_active_source_holds integer:=0;\n  v_content_digest text;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize hold declaration target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()';
  v_new:=E'  if v_role=''primary_network'' and v_run.state_code in (''WV'',''PA'') then\n    update private_verification.brinesearch_issue97_source_geometry_holds h\n    set active=false,resolved_at=now()\n    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n      and h.county_code=v_run.county_code and h.active and h.last_seen_at<v_run.started_at;\n    get diagnostics v_retired_source_holds=row_count;\n  end if;\n\n  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize hold retirement target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'          from public.brinesearch_authoritative_external_road_segments s\n          where s.dataset_id=v_run.dataset_id and s.identity_id=i.id and s.active\n        );';
  v_new:=E'          from public.brinesearch_authoritative_external_road_segments s\n          where s.dataset_id=v_run.dataset_id and s.identity_id=i.id and s.active\n        )\n        and not exists(\n          select 1\n          from private_verification.brinesearch_issue97_source_geometry_holds h\n          where h.dataset_id=v_run.dataset_id and h.identity_id=i.id and h.active\n        );';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize held identity retirement target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      with aggregate_segments as (\n        select s.identity_id,\n          array_agg(distinct s.source_record_id order by s.source_record_id) as source_record_ids,\n          pg_catalog.md5(pg_catalog.string_agg(\n            s.source_segment_key||'':''||s.source_digest,'','' order by s.source_segment_key\n          )) as source_digest,\n          max(s.source_timestamp) as source_timestamp,\n          count(*)::integer as segment_count,\n          case when count(distinct s.public_access_status)=1 then min(s.public_access_status) else ''held'' end as resolved_access,\n          case when count(distinct s.drivable_status)=1 then min(s.drivable_status) else ''held'' end as resolved_drivable\n        from public.brinesearch_authoritative_external_road_segments s\n        where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code\n          and s.county_code=v_run.county_code and s.active\n        group by s.identity_id\n      )\n      update public.brinesearch_authoritative_road_identities i set\n        source_record_ids=a.source_record_ids,source_digest=a.source_digest,\n        source_timestamp=a.source_timestamp,active=true,last_seen_at=now(),\n        public_access_status=a.resolved_access,drivable_status=a.resolved_drivable,\n        attributes=i.attributes||pg_catalog.jsonb_build_object(\n          ''active_segment_count'',a.segment_count,\n          ''identity_digest_method'',''ordered active source-segment digest'',\n          ''identity_access_rule'',''held whenever active segment classifications disagree''\n        )\n      from aggregate_segments a where i.id=a.identity_id;';
  v_new:=E'      with segment_agg as (\n        select s.identity_id,\n          array_agg(distinct s.source_record_id order by s.source_record_id) as segment_record_ids,\n          pg_catalog.string_agg(s.source_segment_key||'':''||s.source_digest,'','' order by s.source_segment_key) as segment_digest_input,\n          max(s.source_timestamp) as source_timestamp,\n          count(*)::integer as segment_count,\n          case when count(distinct s.public_access_status)=1 then min(s.public_access_status) else ''held'' end as resolved_access,\n          case when count(distinct s.drivable_status)=1 then min(s.drivable_status) else ''held'' end as resolved_drivable\n        from public.brinesearch_authoritative_external_road_segments s\n        where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code\n          and s.county_code=v_run.county_code and s.active\n        group by s.identity_id\n      ), hold_agg as (\n        select h.identity_id,\n          array_agg(distinct h.source_record_id order by h.source_record_id) as hold_record_ids,\n          pg_catalog.string_agg(''HOLD:''||h.source_record_id||'':''||h.source_digest,'','' order by h.source_record_id) as hold_digest_input,\n          max(h.source_timestamp) as source_timestamp,\n          count(*)::integer as hold_count,\n          array_agg(distinct h.hold_reason order by h.hold_reason) as hold_reasons\n        from private_verification.brinesearch_issue97_source_geometry_holds h\n        where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n          and h.county_code=v_run.county_code and h.active\n        group by h.identity_id\n      ), aggregate_source as (\n        select i.id as identity_id,\n          (select array_agg(distinct x order by x)\n             from unnest(coalesce(s.segment_record_ids,''{}''::text[])||coalesce(h.hold_record_ids,''{}''::text[])) x\n          ) as source_record_ids,\n          pg_catalog.md5(pg_catalog.concat_ws(''|'',coalesce(s.segment_digest_input,''''),coalesce(h.hold_digest_input,''''))) as source_digest,\n          greatest(s.source_timestamp,h.source_timestamp) as source_timestamp,\n          coalesce(s.segment_count,0) as segment_count,\n          coalesce(h.hold_count,0) as hold_count,\n          coalesce(h.hold_reasons,''{}''::text[]) as hold_reasons,\n          case when coalesce(h.hold_count,0)>0 then ''held'' else coalesce(s.resolved_access,''held'') end as resolved_access,\n          case when coalesce(h.hold_count,0)>0 then ''held'' else coalesce(s.resolved_drivable,''held'') end as resolved_drivable\n        from public.brinesearch_authoritative_road_identities i\n        left join segment_agg s on s.identity_id=i.id\n        left join hold_agg h on h.identity_id=i.id\n        where i.dataset_id=v_run.dataset_id and i.state_code=v_run.state_code\n          and i.county_code=v_run.county_code and (s.identity_id is not null or h.identity_id is not null)\n      )\n      update public.brinesearch_authoritative_road_identities i set\n        source_record_ids=a.source_record_ids,source_digest=a.source_digest,\n        source_timestamp=a.source_timestamp,active=true,last_seen_at=now(),\n        public_access_status=a.resolved_access,drivable_status=a.resolved_drivable,\n        attributes=i.attributes||pg_catalog.jsonb_build_object(\n          ''active_segment_count'',a.segment_count,\n          ''active_source_geometry_hold_count'',a.hold_count,\n          ''active_source_geometry_hold_reasons'',to_jsonb(a.hold_reasons),\n          ''source_geometry_hold_active'',a.hold_count>0,\n          ''identity_digest_method'',''ordered active source-segment + held-source digest'',\n          ''identity_access_rule'',''held whenever active segment classifications disagree or any current source geometry hold exists''\n        )\n      from aggregate_source a where i.id=a.identity_id;\n\n      select count(*)::integer into v_active_source_holds\n      from private_verification.brinesearch_issue97_source_geometry_holds h\n      where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n        and h.county_code=v_run.county_code and h.active;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize identity hold aggregate target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    union all select s.source_digest from public.brinesearch_authoritative_external_road_segments s where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code and s.county_code=v_run.county_code and s.active\n    union all select n.source_digest';
  v_new:=E'    union all select s.source_digest from public.brinesearch_authoritative_external_road_segments s where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code and s.county_code=v_run.county_code and s.active\n    union all select h.source_digest from private_verification.brinesearch_issue97_source_geometry_holds h where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code and h.county_code=v_run.county_code and h.active\n    union all select n.source_digest';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize hold digest target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      ''retired_identities'',v_retired_identities,''content_digest'',v_content_digest,';
  v_new:=E'      ''retired_identities'',v_retired_identities,\n      ''retired_source_geometry_holds'',v_retired_source_holds,\n      ''active_source_geometry_holds'',v_active_source_holds,\n      ''content_digest'',v_content_digest,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize hold details target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''retired_names'',v_retired_names,''retired_identities'',v_retired_identities,\n    ''content_digest'',v_content_digest';
  v_new:=E'    ''retired_names'',v_retired_names,''retired_identities'',v_retired_identities,\n    ''retired_source_geometry_holds'',v_retired_source_holds,\n    ''active_source_geometry_holds'',v_active_source_holds,\n    ''content_digest'',v_content_digest';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 finalize hold return target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_finalize_source_holds$;

-- Editor-only read surface for the source exception queue. No browser role may
-- write the underlying private ledger.
create or replace function public.brinesearch_issue97_source_geometry_hold_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $issue97_source_geometry_hold_metrics$
declare
  v_total integer;
  v_by_scope jsonb;
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;
  select count(*)::integer into v_total
  from private_verification.brinesearch_issue97_source_geometry_holds h
  where h.active;
  select coalesce(jsonb_agg(jsonb_build_object(
      'state_code',state_code,'county_code',county_code,'hold_reason',hold_reason,'rows',rows
    ) order by state_code,county_code,hold_reason),'[]'::jsonb)
  into v_by_scope
  from (
    select state_code,county_code,hold_reason,count(*)::integer as rows
    from private_verification.brinesearch_issue97_source_geometry_holds
    where active
    group by state_code,county_code,hold_reason
  ) q;
  return jsonb_build_object('active_source_geometry_holds',v_total,'by_scope',v_by_scope);
end
$issue97_source_geometry_hold_metrics$;

revoke all on function public.brinesearch_issue97_source_geometry_hold_metrics()
from public,anon;
grant execute on function public.brinesearch_issue97_source_geometry_hold_metrics()
to authenticated,service_role;

create or replace function public.brinesearch_issue97_source_geometry_hold_queue(
  p_state_code text default null,
  p_county_code text default null,
  p_limit integer default 200
)
returns table(
  state_code text,
  county_code text,
  source_record_id text,
  source_identity_key text,
  source_label text,
  hold_reason text,
  source_timestamp timestamptz,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $issue97_source_geometry_hold_queue$
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;
  return query
  select h.state_code,h.county_code,h.source_record_id,h.source_identity_key,
    h.source_label,h.hold_reason,h.source_timestamp,h.last_seen_at
  from private_verification.brinesearch_issue97_source_geometry_holds h
  where h.active
    and (p_state_code is null or h.state_code=upper(btrim(p_state_code)))
    and (p_county_code is null or h.county_code=upper(btrim(p_county_code)))
  order by h.state_code,h.county_code,h.source_record_id
  limit greatest(1,least(coalesce(p_limit,200),1000));
end
$issue97_source_geometry_hold_queue$;

revoke all on function public.brinesearch_issue97_source_geometry_hold_queue(text,text,integer)
from public,anon;
grant execute on function public.brinesearch_issue97_source_geometry_hold_queue(text,text,integer)
to authenticated,service_role;

-- Final static contract. Arbitrary non-simple source geometry is never admitted
-- to the segment table; it is a private hold receipt, and the finalizer owns
-- lifecycle restoration/retirement.
do $issue97_verify_source_hold_install$
declare
  v_loader text;
  v_finalizer text;
  v_scope text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_finalizer;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_source_scope(text,text,integer)'::pg_catalog.regprocedure
  ) into v_scope;

  if v_loader not ilike '%brinesearch_issue97_wv_path_holdable%'
     or v_loader not ilike '%brinesearch_issue97_source_geometry_holds%'
     or v_loader not ilike '%hold_without_graph_segment%'
     or v_loader not ilike '%held_rows%'
     or v_finalizer not ilike '%active_source_geometry_holds%'
     or v_finalizer not ilike '%source_geometry_hold_active%'
     or v_finalizer not ilike '%brinesearch_issue97_source_geometry_holds%'
     or v_scope not ilike '%orchestrator_held_rows%'
  then
    raise exception 'Issue #97 source geometry hold contract did not install cleanly';
  end if;
end
$issue97_verify_source_hold_install$;
