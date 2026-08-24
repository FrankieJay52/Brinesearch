-- GitHub #97 — independently corroborated ODOT source vertices.
--
-- An ODOT interior/interior common source vertex remains held unless a current
-- independent OGRIP LBRS source proves that the same exact identity set has
-- verified source endpoints at that physical point. This is not a tolerance
-- relaxation: ODOT still supplies the candidate coordinate and identity set;
-- OGRIP only supplies an independent traversability corroboration. Names,
-- fuzzy similarity, nearest-road selection and coordinate snapping are excluded.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:graph:OH:BEL')
);

-- This migration follows the temp-geography performance migration exactly.
do $issue97_ogrip_vertex_patch$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'06c4b57ff9056b96137b9aaf4f4b856d' then
    raise exception 'Issue #97 OGRIP corroboration expected optimized builder 06c4b57f; found %',
      pg_catalog.md5(v_definition);
  end if;
  v_patched:=v_definition;

  v_old:=$old$  from tmp_issue97_point_raw r group by r.candidate_key,r.identity_id;

  create temporary table tmp_issue97_point_nodes on commit drop as$old$;
  v_new:=$new$  from tmp_issue97_point_raw r group by r.candidate_key,r.identity_id;

  -- Independent endpoint evidence for exact ODOT common-source vertices. Every
  -- ODOT identity at the candidate must be represented by at least one current
  -- verified OGRIP endpoint mapping, and no extra OGRIP-mapped identity may be
  -- present at that point. The OGRIP point is never substituted for the ODOT
  -- candidate coordinate.
  create temporary table tmp_issue97_point_corroboration on commit drop as
  with ogrip_endpoints as (
    select p.candidate_key,p.identity_ids,c.source_feature_key,c.source_record_id,
      c.source_digest,m.identity_id,m.source_segment_keys,m.evidence as mapping_evidence,
      case
        when extensions.st_dwithin(
          extensions.st_startpoint(extensions.st_linemerge(c.geom))::extensions.geography,
          p.geom::extensions.geography,0.03
        ) then 'start'
        else 'end'
      end as endpoint_role,
      case
        when extensions.st_dwithin(
          extensions.st_startpoint(extensions.st_linemerge(c.geom))::extensions.geography,
          p.geom::extensions.geography,0.03
        ) then extensions.st_startpoint(extensions.st_linemerge(c.geom))
        else extensions.st_endpoint(extensions.st_linemerge(c.geom))
      end as endpoint_geom
    from tmp_issue97_point_candidates p
    join public.brinesearch_authoritative_supplemental_centerlines c
      on c.state_code='OH' and c.county_code=v_county and c.active
    join public.brinesearch_road_source_datasets dataset
      on dataset.id=c.dataset_id and dataset.active
      and dataset.source_key='oh_ogrip_lbrs_centerlines'
    join public.brinesearch_supplemental_centerline_identity_mappings m
      on m.centerline_id=c.id and m.active and m.ingest_run_id=c.last_ingest_run_id
      and m.mapping_status='verified' and m.mapping_method='exact_geometry_coverage'
      and m.identity_id=any(p.identity_ids)
    join public.brinesearch_supplemental_centerline_dispositions disposition
      on disposition.centerline_id=c.id and disposition.active
      and disposition.ingest_run_id=c.last_ingest_run_id
      and disposition.disposition='verified'
      and disposition.candidate_count=1 and disposition.verified_mapping_count=1
    where v_state='OH'
      and p.source_method='exact_authoritative_source_vertex'
      and not p.has_at_grade
      and private_verification.brinesearch_issue97_dataset_scope_current(
        c.dataset_id,c.state_code,c.county_code
      )
      and (
        extensions.st_dwithin(
          extensions.st_startpoint(extensions.st_linemerge(c.geom))::extensions.geography,
          p.geom::extensions.geography,0.03
        )
        or extensions.st_dwithin(
          extensions.st_endpoint(extensions.st_linemerge(c.geom))::extensions.geography,
          p.geom::extensions.geography,0.03
        )
      )
      and coalesce((m.evidence->>'name_used_for_mapping')::boolean,false)=false
      and coalesce((m.evidence->>'nearest_road_used_for_mapping')::boolean,false)=false
  ), eligible as (
    select p.candidate_key,p.identity_ids,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'source_method','independent_ogrip_endpoint_corroboration',
        'source_feature_key',e.source_feature_key,
        'source_record_id',e.source_record_id,
        'source_digest',e.source_digest,
        'identity_id',e.identity_id,
        'source_segment_keys',pg_catalog.to_jsonb(e.source_segment_keys),
        'endpoint_role',e.endpoint_role,
        'source_endpoint_coordinate',pg_catalog.jsonb_build_array(
          extensions.st_x(e.endpoint_geom),extensions.st_y(e.endpoint_geom)
        ),
        'candidate_coordinate_retained',true,
        'mapping_evidence',e.mapping_evidence,
        'name_used',false,'nearest_road_used',false,'coordinate_snapping_used',false
      ) order by e.identity_id,e.source_feature_key,e.endpoint_role) as coordinate_evidence
    from tmp_issue97_point_candidates p
    join ogrip_endpoints e on e.candidate_key=p.candidate_key
    where not exists(
      select 1
      from public.brinesearch_authoritative_supplemental_centerlines extra_c
      join public.brinesearch_road_source_datasets extra_dataset
        on extra_dataset.id=extra_c.dataset_id and extra_dataset.active
        and extra_dataset.source_key='oh_ogrip_lbrs_centerlines'
      join public.brinesearch_supplemental_centerline_identity_mappings extra_m
        on extra_m.centerline_id=extra_c.id and extra_m.active
        and extra_m.ingest_run_id=extra_c.last_ingest_run_id
        and extra_m.mapping_status='verified' and extra_m.mapping_method='exact_geometry_coverage'
      join public.brinesearch_supplemental_centerline_dispositions extra_d
        on extra_d.centerline_id=extra_c.id and extra_d.active
        and extra_d.ingest_run_id=extra_c.last_ingest_run_id
        and extra_d.disposition='verified' and extra_d.candidate_count=1
        and extra_d.verified_mapping_count=1
      where extra_c.active and extra_c.state_code='OH' and extra_c.county_code=v_county
        and not (extra_m.identity_id=any(p.identity_ids))
        and (
          extensions.st_dwithin(
            extensions.st_startpoint(extensions.st_linemerge(extra_c.geom))::extensions.geography,
            p.geom::extensions.geography,0.03
          )
          or extensions.st_dwithin(
            extensions.st_endpoint(extensions.st_linemerge(extra_c.geom))::extensions.geography,
            p.geom::extensions.geography,0.03
          )
        )
    )
    group by p.candidate_key,p.identity_ids
    having count(distinct e.identity_id)=pg_catalog.cardinality(p.identity_ids)
      and pg_catalog.cardinality(p.identity_ids)>=2
  )
  select candidate_key,true as corroborated,coordinate_evidence
  from eligible;
  create unique index tmp_issue97_point_corroboration_key_idx
    on tmp_issue97_point_corroboration(candidate_key);

  create temporary table tmp_issue97_point_nodes on commit drop as$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 OGRIP corroboration insertion anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$    p.coordinate_evidence,p.official_conflict,p.source_z_identity_count,p.source_z_span,$old$;
  v_new:=$new$    p.coordinate_evidence||coalesce(corroboration.coordinate_evidence,'[]'::jsonb) as coordinate_evidence,
    p.official_conflict,p.source_z_identity_count,p.source_z_span,$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 OGRIP corroboration evidence-select anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$  join tmp_issue97_point_raw r on r.candidate_key=p.candidate_key and r.identity_id=i.identity_id
  group by p.candidate_key,p.topology_key,p.lng,p.lat,p.geom,p.has_at_grade,p.source_method,p.node_keys,
    p.coordinate_evidence,p.official_conflict,p.source_z_identity_count,p.source_z_span$old$;
  v_new:=$new$  join tmp_issue97_point_raw r on r.candidate_key=p.candidate_key and r.identity_id=i.identity_id
  left join tmp_issue97_point_corroboration corroboration
    on corroboration.candidate_key=p.candidate_key
  group by p.candidate_key,p.topology_key,p.lng,p.lat,p.geom,p.has_at_grade,p.source_method,p.node_keys,
    p.coordinate_evidence,p.official_conflict,p.source_z_identity_count,p.source_z_span,
    corroboration.corroborated,corroboration.coordinate_evidence$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 OGRIP corroboration join/group anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$    (p.has_at_grade
      or count(distinct i.identity_id) filter(where i.endpoint_only)=count(distinct i.identity_id)$old$;
  v_new:=$new$    (p.has_at_grade
      or coalesce(corroboration.corroborated,false)
      or count(distinct i.identity_id) filter(where i.endpoint_only)=count(distinct i.identity_id)$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 OGRIP corroboration topology-supported anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  if v_patched not like '%independent_ogrip_endpoint_corroboration%'
     or v_patched not like '%coalesce(corroboration.corroborated,false)%'
     or v_patched not like '%mapping_method=''exact_geometry_coverage''%'
     or v_patched not like '%name_used_for_mapping%'
     or v_patched not like '%nearest_road_used_for_mapping%' then
    raise exception 'Issue #97 OGRIP corroboration proof did not install fail-closed evidence';
  end if;

  execute v_patched;
end
$issue97_ogrip_vertex_patch$;

-- Guard against accidental broadening of the original generic rule. The new
-- corroboration is an additional independent evidence path only.
do $issue97_ogrip_vertex_verify$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'7abd11f432c3e7b475b10d0817f5e8fc' then
    raise exception 'Issue #97 OGRIP corroboration effective builder MD5 changed: %',
      pg_catalog.md5(v_definition);
  end if;
  if v_definition not like '%interior_vertex_rule%'
     or v_definition not like '%requires a terminus plus explicit compatible grade evidence%'
     or v_definition not like '%independent_ogrip_endpoint_corroboration%'
     or v_definition like '%nearest_road_used'',true%'
     or v_definition like '%name_used'',true%' then
    raise exception 'Issue #97 OGRIP corroboration weakened the generic no-guess topology contract';
  end if;
end
$issue97_ogrip_vertex_verify$;
