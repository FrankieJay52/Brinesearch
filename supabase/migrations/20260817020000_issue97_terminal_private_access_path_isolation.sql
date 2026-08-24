-- Issue #97: a generic terminal "Pad" / "Lease Road" step is retained as
-- explicit private-destination evidence, but it is not a fabricated road
-- identity and must not prevent the preceding authoritative road sequence from
-- reaching the exact graph-path solver.

create or replace function private_verification.brinesearch_issue97_terminal_private_access_destination(
  p_step_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select
      step.active
      and route.active
      and step.step_kind='private_segment'
      and pg_catalog.lower(pg_catalog.btrim(step.normalized_text)) in ('pad','lease road')
      and step.road_id is null
      and private_verification.brinesearch_issue97_explicit_occurrence_source_key(
        route.state,step.match_method,coalesce(step.source_details,'{}'::jsonb)
      ) is null
      and not exists(
        select 1
        from public.brinesearch_route_prep_steps later
        where later.route_prep_id=step.route_prep_id
          and later.active
          and later.step_kind in (
            'interstate','us_route','state_route','county_road',
            'township_road','local_road','private_segment'
          )
          and (
            later.step_order>step.step_order
            or (later.step_order=step.step_order and later.id>step.id)
          )
      )
    from public.brinesearch_route_prep_steps step
    join public.brinesearch_route_prep route on route.id=step.route_prep_id
    where step.id=p_step_id
  ),false)
$$;

revoke all on function private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)
from public,anon,authenticated,service_role;

do $issue97_patch_terminal_candidate$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.md5(v_definition)<>'fe7e266f1ed459bccf17b06010c2a050' then
    raise exception 'Issue #97 occurrence-candidate definition drifted before terminal-access patch';
  end if;

  v_old:=E'  v_evidence jsonb:=''{}''::jsonb;\nbegin';
  v_new:=E'  v_evidence jsonb:=''{}''::jsonb;\n  v_terminal_private_access boolean:=false;\nbegin';
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 occurrence-candidate declaration patch point missing';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  v_source_key:=private_verification.brinesearch_issue97_explicit_occurrence_source_key(\n    v_step.route_state,v_step.match_method,coalesce(v_step.source_details,''{}''::jsonb)\n  );\n  v_input_digest:=';
  v_new:=E'  v_source_key:=private_verification.brinesearch_issue97_explicit_occurrence_source_key(\n    v_step.route_state,v_step.match_method,coalesce(v_step.source_details,''{}''::jsonb)\n  );\n  v_terminal_private_access:=private_verification.brinesearch_issue97_terminal_private_access_destination(p_step_id);\n  v_input_digest:=';
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 occurrence-candidate terminal-classification patch point missing';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  if v_source_key is not null then\n    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(';
  v_new:=E'  if not v_terminal_private_access then\n  if v_source_key is not null then\n    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(';
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 occurrence-candidate scope-open patch point missing';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)\n  into v_candidate_count,v_strong_count';
  v_new:=E'  end if;\n\n  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)\n  into v_candidate_count,v_strong_count';
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 occurrence-candidate scope-close patch point missing';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  elsif v_candidate_count=0 then\n    v_reason:=case when v_step.step_kind=''private_segment''\n      then ''no_authoritative_private_or_access_identity_candidate''\n      else ''no_authoritative_identity_candidate'' end;\n    v_evidence:=pg_catalog.jsonb_build_object(''candidate_count'',0,''token'',v_token);';
  v_new:=E'  elsif v_candidate_count=0 then\n    if v_terminal_private_access then\n      v_reason:=''terminal_private_access_destination_requires_authoritative_geometry'';\n      v_evidence:=pg_catalog.jsonb_build_object(\n        ''candidate_count'',0,''token'',v_token,\n        ''disposition'',''terminal_private_access_destination'',\n        ''participates_in_authoritative_road_path'',false,\n        ''retained_route_evidence'',true,\n        ''pad_gps_selects_road_identity'',false,\n        ''requires_authoritative_private_or_access_geometry'',true\n      );\n    else\n      v_reason:=case when v_step.step_kind=''private_segment''\n        then ''no_authoritative_private_or_access_identity_candidate''\n        else ''no_authoritative_identity_candidate'' end;\n      v_evidence:=pg_catalog.jsonb_build_object(''candidate_count'',0,''token'',v_token);\n    end if;';
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 occurrence-candidate zero-candidate patch point missing';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_terminal_candidate$;

revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_resolve_route_identity_path(
  p_route_prep_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_occurrences integer:=0;
  v_path_occurrences integer:=0;
  v_terminal_private_access integer:=0;
  v_zero integer:=0;
  v_broad integer:=0;
  v_path_count integer:=0;
  v_path jsonb;
  v_choice record;
  v_identity uuid;
  v_road uuid;
  v_source_key text;
  v_source_digest text;
  v_mapping_fingerprint text;
  v_driver text;
  v_aliases text[];
  v_input_digest text;
  v_evidence jsonb;
  v_receipt_digest text;
begin
  select
    count(*),
    count(*) filter(where private_verification.brinesearch_issue97_terminal_private_access_destination(
      receipt.route_prep_step_id
    )),
    count(*) filter(where
      not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      ) and receipt.candidate_count=0
    ),
    count(*) filter(where
      not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      ) and receipt.candidate_count>50
    )
  into v_occurrences,v_terminal_private_access,v_zero,v_broad
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  where receipt.route_prep_id=p_route_prep_id;

  v_path_occurrences:=v_occurrences-v_terminal_private_access;

  if v_occurrences=0 then
    return pg_catalog.jsonb_build_object('status','no_road_occurrences');
  end if;
  if v_path_occurrences=0 then
    return pg_catalog.jsonb_build_object(
      'status','held',
      'reason','terminal_private_access_destination_requires_authoritative_geometry',
      'authoritative_road_occurrences',0,
      'terminal_private_access_destinations',v_terminal_private_access
    );
  end if;
  if v_path_occurrences=1 then
    if exists(
      select 1
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      where receipt.route_prep_id=p_route_prep_id
        and not private_verification.brinesearch_issue97_terminal_private_access_destination(
          receipt.route_prep_step_id
        )
        and receipt.resolution_status='resolved'
    ) then
      return pg_catalog.jsonb_build_object(
        'status','resolved_by_explicit_receipt','path_count',1,
        'authoritative_road_occurrences',1,
        'terminal_private_access_destinations',v_terminal_private_access
      );
    end if;
    update private_verification.brinesearch_route_occurrence_receipts_issue97 receipt set
      resolution_status='held',resolution_method=null,
      hold_reason='single_occurrence_requires_explicit_geographic_proof',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(receipt.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','authoritative_road_occurrences',1,
        'terminal_private_access_destinations',v_terminal_private_access
      ),
      receipt_digest=pg_catalog.md5(
        receipt.input_digest||'|held|single_occurrence_requires_explicit_geographic_proof'
      ),updated_at=now()
    where receipt.route_prep_id=p_route_prep_id
      and not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      )
      and receipt.resolution_status<>'resolved';
    perform private_verification.brinesearch_issue97_write_occurrence_history(receipt.route_prep_step_id)
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_id=p_route_prep_id
      and not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      );
    return pg_catalog.jsonb_build_object(
      'status','held','reason','single_occurrence_requires_explicit_geographic_proof',
      'terminal_private_access_destinations',v_terminal_private_access
    );
  end if;

  if v_zero>0 or v_broad>0 then
    return pg_catalog.jsonb_build_object(
      'status','held','zero_candidate_occurrences',v_zero,
      'broad_candidate_occurrences',v_broad,
      'terminal_private_access_destinations',v_terminal_private_access
    );
  end if;

  perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache();

  with recursive ordered as (
    select receipt.route_prep_step_id,receipt.occurrence_index,
      receipt.resolution_status,receipt.identity_id as resolved_identity,
      max(receipt.occurrence_index) over() as max_occurrence
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_id=p_route_prep_id
      and not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      )
  ), admissible as (
    select distinct ordered.route_prep_step_id,ordered.occurrence_index,
      ordered.max_occurrence,candidate.identity_id
    from ordered
    join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
      on candidate.route_prep_step_id=ordered.route_prep_step_id
    where ordered.resolution_status<>'resolved'
      or candidate.identity_id=ordered.resolved_identity
  ), paths as (
    select admissible.occurrence_index,admissible.max_occurrence,admissible.identity_id,
      pg_catalog.jsonb_build_array(admissible.identity_id::text) as identity_path
    from admissible
    where admissible.occurrence_index=(select min(first.occurrence_index) from admissible first)
    union all
    select next.occurrence_index,next.max_occurrence,next.identity_id,
      path.identity_path||pg_catalog.to_jsonb(next.identity_id::text)
    from paths path
    join admissible next on next.occurrence_index=path.occurrence_index+1
    where private_verification.brinesearch_issue97_identities_connected(
      path.identity_id,next.identity_id
    )
  )
  select count(*),(pg_catalog.array_agg(identity_path))[1]
  into v_path_count,v_path
  from (
    select identity_path
    from paths
    where occurrence_index=max_occurrence
    limit 2
  ) complete;

  if v_path_count=1 then
    for v_choice in
      select (value #>> '{}')::uuid as identity_id,ordinality::integer as path_index
      from pg_catalog.jsonb_array_elements(v_path) with ordinality
    loop
      select identity.id,mapping.road_id,identity.source_identity_key,identity.source_digest,
        private_verification.brinesearch_issue97_mapping_fingerprint(identity.id)
      into strict v_identity,v_road,v_source_key,v_source_digest,v_mapping_fingerprint
      from public.brinesearch_authoritative_road_identities identity
      left join public.brinesearch_road_identity_mappings mapping
        on mapping.identity_id=identity.id and mapping.mapping_status='verified'
      where identity.id=v_choice.identity_id and identity.active;
      v_driver:=private_verification.brinesearch_issue97_identity_driver_name(v_identity);
      v_aliases:=private_verification.brinesearch_issue97_identity_aliases(v_identity,v_road);
      select receipt.input_digest,receipt.evidence
      into strict v_input_digest,v_evidence
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      where receipt.route_prep_id=p_route_prep_id
        and not private_verification.brinesearch_issue97_terminal_private_access_destination(
          receipt.route_prep_step_id
        )
      order by receipt.occurrence_index
      offset v_choice.path_index-1 limit 1;
      v_evidence:=coalesce(v_evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','unique full-sequence authoritative graph path',
        'terminal_private_access_destinations_excluded',v_terminal_private_access,
        'selection_uses_name_similarity',false,
        'selection_uses_nearest_road',false,
        'selection_uses_route_number_alone',false,
        'canonical_mapping_present',v_road is not null
      );
      v_receipt_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
        v_input_digest,'resolved','route_graph_unique_identity_path',v_identity::text,
        coalesce(v_road::text,''),v_source_digest,coalesce(v_mapping_fingerprint,''),v_evidence::text
      ));
      update private_verification.brinesearch_route_occurrence_receipts_issue97 receipt set
        resolution_status='resolved',
        resolution_method=case when receipt.resolution_method='explicit_authoritative_source_receipt'
          then receipt.resolution_method else 'route_graph_unique_identity_path' end,
        hold_reason=null,identity_id=v_identity,canonical_road_id=v_road,
        source_identity_key=v_source_key,driver_road_name=v_driver,
        valid_aliases=coalesce(v_aliases,'{}'::text[]),source_digest=v_source_digest,
        mapping_fingerprint=v_mapping_fingerprint,evidence=v_evidence,
        receipt_digest=v_receipt_digest,resolved_at=coalesce(receipt.resolved_at,now()),updated_at=now()
      where receipt.route_prep_id=p_route_prep_id
        and not private_verification.brinesearch_issue97_terminal_private_access_destination(
          receipt.route_prep_step_id
        )
        and receipt.occurrence_index=(
          select indexed.occurrence_index
          from private_verification.brinesearch_route_occurrence_receipts_issue97 indexed
          where indexed.route_prep_id=p_route_prep_id
            and not private_verification.brinesearch_issue97_terminal_private_access_destination(
              indexed.route_prep_step_id
            )
          order by indexed.occurrence_index
          offset v_choice.path_index-1 limit 1
        );
      perform private_verification.brinesearch_issue97_write_occurrence_history(
        (select receipt.route_prep_step_id
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_id=p_route_prep_id
           and not private_verification.brinesearch_issue97_terminal_private_access_destination(
             receipt.route_prep_step_id
           )
         order by receipt.occurrence_index
         offset v_choice.path_index-1 limit 1)
      );
    end loop;
    return pg_catalog.jsonb_build_object(
      'status','resolved','path_count',1,
      'authoritative_road_occurrences',v_path_occurrences,
      'terminal_private_access_destinations',v_terminal_private_access
    );
  end if;

  if v_path_count=0 then
    update private_verification.brinesearch_route_occurrence_receipts_issue97 receipt set
      resolution_status='held',resolution_method=null,
      hold_reason='saved_sequence_has_no_exact_authoritative_graph_path',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(receipt.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','full_path_count',0,
        'terminal_private_access_destinations_excluded',v_terminal_private_access
      ),
      receipt_digest=pg_catalog.md5(
        receipt.input_digest||'|held|saved_sequence_has_no_exact_authoritative_graph_path'
      ),updated_at=now()
    where receipt.route_prep_id=p_route_prep_id
      and not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      )
      and receipt.resolution_status<>'resolved';
  else
    update private_verification.brinesearch_route_occurrence_receipts_issue97 receipt set
      resolution_status='held',resolution_method=null,
      hold_reason='authoritative_route_identity_path_ambiguous',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(receipt.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','full_path_count_lower_bound',v_path_count,
        'terminal_private_access_destinations_excluded',v_terminal_private_access
      ),
      receipt_digest=pg_catalog.md5(
        receipt.input_digest||'|held|authoritative_route_identity_path_ambiguous'
      ),updated_at=now()
    where receipt.route_prep_id=p_route_prep_id
      and not private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      )
      and receipt.resolution_status<>'resolved';
  end if;

  perform private_verification.brinesearch_issue97_write_occurrence_history(receipt.route_prep_step_id)
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  where receipt.route_prep_id=p_route_prep_id
    and not private_verification.brinesearch_issue97_terminal_private_access_destination(
      receipt.route_prep_step_id
    );
  return pg_catalog.jsonb_build_object(
    'status','held','path_count_lower_bound',v_path_count,
    'terminal_private_access_destinations',v_terminal_private_access,
    'reason',case when v_path_count=0
      then 'saved_sequence_has_no_exact_authoritative_graph_path'
      else 'authoritative_route_identity_path_ambiguous' end
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_terminal_private_access_destination(uuid) is
  'Issue #97 exact classifier for an unbound terminal Pad/Lease Road private destination. It never uses GPS, name similarity, nearest geometry, or a route-number fallback.';
comment on function private_verification.brinesearch_issue97_resolve_route_identity_path(uuid) is
  'Issue #97 no-guess route graph solver. Exact generic terminal private destinations remain explicit held evidence while the preceding authoritative road sequence is solved independently.';

do $issue97_verify_terminal_access_contract$
declare
  v_candidate text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  );
  v_resolver text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
  );
  v_classifier text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'::pg_catalog.regprocedure
  );
begin
  if v_candidate not like '%if not v_terminal_private_access then%'
     or v_candidate not like '%terminal_private_access_destination_requires_authoritative_geometry%'
     or v_candidate not like '%participates_in_authoritative_road_path'',false%'
     or v_resolver not like '%terminal_private_access_destinations_excluded%'
     or v_resolver not like '%brinesearch_issue97_terminal_private_access_destination(%'
     or v_classifier not ilike '%in (''pad'',''lease road'')%'
     or v_classifier not ilike '%step.road_id is null%'
     or v_classifier not ilike '%explicit_occurrence_source_key%'
     or v_classifier not ilike '%later.step_order>step.step_order%'
     or v_classifier ~* 'similarity\s*\(|<->|nearest_road|nearest_point'
     or v_candidate ~* 'similarity\s*\(|<->'
     or v_resolver ~* 'similarity\s*\(|<->|pad.*latitude|pad.*longitude'
  then
    raise exception 'Issue #97 terminal private-access no-guess contract did not install cleanly';
  end if;
end
$issue97_verify_terminal_access_contract$;
