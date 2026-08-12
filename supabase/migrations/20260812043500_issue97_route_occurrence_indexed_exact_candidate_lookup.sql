-- GitHub #97 — make Ohio route-occurrence candidate discovery use exact indexed
-- authoritative fields instead of normalizing the entire state road/name corpus
-- once per route step.
--
-- This is performance-only candidate discovery. It does NOT promote a candidate
-- to route truth: exact name/designation matches remain strong_proof=false and the
-- existing unique authoritative graph-path resolver still decides whether an
-- occurrence can be resolved. No fuzzy/name-only/nearest-road resolution is added.
--
-- Production proof before this migration:
--   * 47,483 active Ohio authoritative identities;
--   * 207,835 active Ohio authoritative name rows;
--   * only one stale normalized_name value in each table, both the same source
--     record (FOUR SEASONS CAR WASH/ with a trailing normalized space);
--   * active Ohio route_number values are alphanumeric only, so every existing
--     exact designation form necessarily ends in the exact route_number token.

-- Repair the derived Ohio normalized fields before relying on them for exact
-- equality. Source names/identities/provenance are untouched.
update public.brinesearch_authoritative_road_identities i
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(i.display_name)
where i.state_code='OH' and i.active
  and coalesce(i.normalized_name,'') is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(i.display_name);

update public.brinesearch_authoritative_road_names n
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(n.road_name),
    updated_at=now()
from public.brinesearch_authoritative_road_identities i
where i.id=n.identity_id and i.state_code='OH' and i.active and n.active
  and coalesce(n.normalized_name,'') is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(n.road_name);

-- Exact equality lookup indexes. Identity normalized-name already has a partial
-- btree index in the #97 schema; name rows need the matching exact lookup path.
create index if not exists brinesearch_authoritative_names_exact_issue97_idx
  on public.brinesearch_authoritative_road_names(normalized_name,identity_id)
  where active;

create index if not exists brinesearch_authoritative_identities_oh_route_number_issue97_idx
  on public.brinesearch_authoritative_road_identities(state_code,pg_catalog.lower(route_number),id)
  where active and route_number is not null;

-- The Ohio designation prefilter below is logically entailed by every existing
-- exact designation form only while route_number itself is one alphanumeric token.
do $issue97_oh_route_number_contract$
begin
  if exists(
    select 1 from public.brinesearch_authoritative_road_identities i
    where i.state_code='OH' and i.active and i.route_number is not null
      and i.route_number!~'^[0-9A-Za-z]+$'
  ) then
    raise exception 'Issue #97 Ohio indexed designation prefilter requires alphanumeric one-token route numbers';
  end if;
  if exists(
    select 1 from public.brinesearch_authoritative_road_identities i
    where i.state_code='OH' and i.active
      and coalesce(i.normalized_name,'') is distinct from
          private_verification.brinesearch_issue97_normalize_route_token(i.display_name)
  ) or exists(
    select 1
    from public.brinesearch_authoritative_road_names n
    join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
    where i.state_code='OH' and i.active and n.active
      and coalesce(n.normalized_name,'') is distinct from
          private_verification.brinesearch_issue97_normalize_route_token(n.road_name)
  ) then
    raise exception 'Issue #97 Ohio normalized-name repair did not converge';
  end if;
end
$issue97_oh_route_number_contract$;

-- Replace only the optional exact-name/designation candidate block. WV/PA retain
-- the prior runtime-normalization path because their historical normalized fields
-- intentionally have more legacy variation; this change is Ohio-scoped.
do $issue97_patch_oh_indexed_candidate_lookup$
declare
  v_definition text;
  v_start_marker constant text:=E'  if v_state is not null and v_token<>'''' then\n';
  v_end_marker constant text:=E'  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)\n';
  v_outer_end constant text:=E'  end if;\n\n';
  v_start integer;
  v_end integer;
  v_old text;
  v_legacy_body text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start:=pg_catalog.strpos(v_definition,v_start_marker);
  v_end:=pg_catalog.strpos(v_definition,v_end_marker);
  if v_start=0 or v_end=0 or v_end<=v_start then
    raise exception 'Issue #97 Ohio candidate lookup patch markers not found';
  end if;
  if pg_catalog.strpos(pg_catalog.substr(v_definition,v_start+1),v_start_marker)>0
     or pg_catalog.strpos(pg_catalog.substr(v_definition,v_end+1),v_end_marker)>0 then
    raise exception 'Issue #97 Ohio candidate lookup patch markers are not unique';
  end if;

  v_old:=pg_catalog.substr(v_definition,v_start,v_end-v_start);
  if pg_catalog.right(v_old,pg_catalog.length(v_outer_end))<>v_outer_end then
    raise exception 'Issue #97 Ohio candidate lookup outer block shape drifted';
  end if;
  v_legacy_body:=pg_catalog.substr(
    v_old,
    pg_catalog.length(v_start_marker)+1,
    pg_catalog.length(v_old)-pg_catalog.length(v_start_marker)-pg_catalog.length(v_outer_end)
  );

  v_new:=v_start_marker||E'    if v_state=''OH'' then\n'
||E'      insert into private_verification.brinesearch_route_occurrence_candidates_issue97(\n'
||E'        route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,\n'
||E'        source_identity_key,source_digest,mapping_fingerprint,evidence\n'
||E'      )\n'
||E'      select distinct p_step_id,i.id,m.road_id,''exact_authoritative_name_candidate'',false,\n'
||E'        i.source_identity_key,i.source_digest,\n'
||E'        private_verification.brinesearch_issue97_mapping_fingerprint(i.id),\n'
||E'        pg_catalog.jsonb_build_object(\n'
||E'          ''token'',v_token,''warning'',''exact name equality is candidate evidence only''\n'
||E'        )\n'
||E'      from (\n'
||E'        select i.id as identity_id\n'
||E'        from public.brinesearch_authoritative_road_identities i\n'
||E'        where i.state_code=''OH'' and i.active and i.normalized_name=v_token\n'
||E'        union\n'
||E'        select n.identity_id\n'
||E'        from public.brinesearch_authoritative_road_names n\n'
||E'        join public.brinesearch_authoritative_road_identities i\n'
||E'          on i.id=n.identity_id and i.state_code=''OH'' and i.active\n'
||E'        where n.active and n.normalized_name=v_token\n'
||E'          and (n.valid_from is null or n.valid_from<=now())\n'
||E'          and (n.valid_to is null or n.valid_to>now())\n'
||E'          and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'            n.source_dataset_id,i.state_code,i.county_code\n'
||E'          )\n'
||E'      ) hit\n'
||E'      join public.brinesearch_authoritative_road_identities i\n'
||E'        on i.id=hit.identity_id and i.active\n'
||E'      left join public.brinesearch_road_identity_mappings m\n'
||E'        on m.identity_id=i.id and m.mapping_status=''verified''\n'
||E'      where private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'          i.dataset_id,i.state_code,i.county_code\n'
||E'        )\n'
||E'        and i.drivable_status=''drivable''\n'
||E'        and (v_step.step_kind=''private_segment''\n'
||E'          or i.public_access_status=''public''\n'
||E'          or i.public_access_status=''access'')\n'
||E'      on conflict(route_prep_step_id,identity_id,candidate_basis) do update set\n'
||E'        canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,\n'
||E'        mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();\n\n'
||E'      insert into private_verification.brinesearch_route_occurrence_candidates_issue97(\n'
||E'        route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,\n'
||E'        source_identity_key,source_digest,mapping_fingerprint,evidence\n'
||E'      )\n'
||E'      select distinct p_step_id,i.id,m.road_id,''exact_authoritative_designation_candidate'',false,\n'
||E'        i.source_identity_key,i.source_digest,\n'
||E'        private_verification.brinesearch_issue97_mapping_fingerprint(i.id),\n'
||E'        pg_catalog.jsonb_build_object(\n'
||E'          ''token'',v_token,''route_system'',i.route_system,''route_number'',i.route_number,\n'
||E'          ''warning'',''route designation is candidate evidence only''\n'
||E'        )\n'
||E'      from public.brinesearch_authoritative_road_identities i\n'
||E'      left join public.brinesearch_road_identity_mappings m\n'
||E'        on m.identity_id=i.id and m.mapping_status=''verified''\n'
||E'      where i.state_code=''OH'' and i.active and nullif(i.route_number,'''') is not null\n'
||E'        and pg_catalog.lower(i.route_number)=pg_catalog.regexp_replace(v_token,''^.*[[:space:]]'','''')\n'
||E'        and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'          i.dataset_id,i.state_code,i.county_code\n'
||E'        )\n'
||E'        and i.drivable_status=''drivable''\n'
||E'        and (v_step.step_kind=''private_segment''\n'
||E'          or i.public_access_status=''public''\n'
||E'          or i.public_access_status=''access'')\n'
||E'        and v_token=any(array[\n'
||E'          private_verification.brinesearch_issue97_normalize_route_token(pg_catalog.concat_ws('' '',i.route_system,i.route_number)),\n'
||E'          private_verification.brinesearch_issue97_normalize_route_token(case i.road_class\n'
||E'            when ''interstate'' then ''I-''||i.route_number\n'
||E'            when ''us_route'' then ''US-''||i.route_number\n'
||E'            when ''state_route'' then ''SR-''||i.route_number\n'
||E'            when ''county'' then ''CR-''||i.route_number\n'
||E'            when ''township'' then ''TR-''||i.route_number\n'
||E'            else null end),\n'
||E'          private_verification.brinesearch_issue97_normalize_route_token(case i.road_class\n'
||E'            when ''state_route'' then ''Route ''||i.route_number\n'
||E'            when ''county'' then ''County Road ''||i.route_number\n'
||E'            when ''township'' then ''Township Road ''||i.route_number\n'
||E'            else null end),\n'
||E'          private_verification.brinesearch_issue97_normalize_route_token(case\n'
||E'            when i.road_class=''state_route'' then i.state_code||''-''||i.route_number else null end)\n'
||E'        ])\n'
||E'      on conflict(route_prep_step_id,identity_id,candidate_basis) do update set\n'
||E'        canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,\n'
||E'        mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();\n'
||E'    else\n'||v_legacy_body||E'    end if;\n  end if;\n\n';

  v_definition:=pg_catalog.overlay(
    v_definition placing v_new from v_start for pg_catalog.length(v_old)
  );
  execute v_definition;
end
$issue97_patch_oh_indexed_candidate_lookup$;

-- Composed-runtime proof. The original runtime normalization path must remain in
-- the non-Ohio branch, while Ohio exact name lookup uses stored indexed equality
-- and route designations first restrict by exact route_number.
do $issue97_verify_oh_indexed_candidate_lookup$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%if v_state=''OH'' then%'
     or v_definition not like '%i.normalized_name=v_token%'
     or v_definition not like '%n.normalized_name=v_token%'
     or v_definition not like '%pg_catalog.lower(i.route_number)=pg_catalog.regexp_replace(v_token,''^.*[[:space:]]'','''')%'
     or v_definition not like '%private_verification.brinesearch_issue97_normalize_route_token(i.display_name)=v_token%'
     or v_definition not like '%exact name equality is candidate evidence only%'
     or v_definition not like '%route designation is candidate evidence only%'
     or v_definition like '%nearest_road_used'',true%'
  then
    raise exception 'Issue #97 Ohio indexed candidate lookup contract did not install cleanly';
  end if;
end
$issue97_verify_oh_indexed_candidate_lookup$;
