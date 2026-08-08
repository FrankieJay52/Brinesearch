    from private_verification.public_submission_rate_events e
    where e.ip_hash=p_ip_hash
      and e.created_at>now()-interval '24 hours'
  )>=20 then
    raise exception 'submission_ip_limit';
  end if;
  if (
    select count(*)
    from private_verification.public_submission_rate_events e
    where e.identity_hash=p_identity_hash
      and e.created_at>now()-interval '1 hour'
  )>=3 or (
    select count(*)
    from private_verification.public_submission_rate_events e
    where e.identity_hash=p_identity_hash
      and e.created_at>now()-interval '24 hours'
  )>=10 then
    raise exception 'submission_identity_limit';
  end if;
  insert into private_verification.public_submission_rate_events(
    request_id,ip_hash,identity_hash,company,state,pad_name,captcha_hostname,dry_run
  ) values (
    p_request_id,p_ip_hash,p_identity_hash,v_company,v_state,v_name,
    nullif(btrim(coalesce(p_captcha_hostname,'')),''),coalesce(p_dry_run,false)
  );
  if coalesce(p_dry_run,false) then
    return p_request_id;
  end if;
  v_id := public.submit_pad(
    p_record_type := p_payload->>'p_record_type',
    p_company := p_payload->>'p_company',
    p_state := p_payload->>'p_state',
    p_pad_name := p_payload->>'p_pad_name',
    p_address := p_payload->>'p_address',
    p_latitude := nullif(p_payload->>'p_latitude','')::double precision,
    p_longitude := nullif(p_payload->>'p_longitude','')::double precision,
    p_county := p_payload->>'p_county',
    p_township := p_payload->>'p_township',
    p_well_name := p_payload->>'p_well_name',
    p_api := p_payload->>'p_api',
    p_property_number := p_payload->>'p_property_number',
    p_structured_road_sequence := p_payload->>'p_structured_road_sequence',
    p_written_directions := p_payload->>'p_written_directions',
    p_notes := p_payload->>'p_notes',
    p_submitter_name := p_payload->>'p_submitter_name',
    p_submitter_contact := p_payload->>'p_submitter_contact',
    p_client_token := 'server-'||left(p_identity_hash,64),
    p_source_page := p_payload->>'p_source_page',
    p_website := p_payload->>'p_website',
    p_well_entries := v_entries
  );
  return v_id;
end;
$function$;
create or replace view public.public_pad_directory_summary
with (security_barrier=true)
as
select
  p.id,
  p.legacy_id,
  p.record_number,
  p.company,
  p.state,
  p.pad_name,
  p.record_type,
  p.address,
  p.latitude,
  p.longitude,
  p.county,
  p.township,
  p.well_name,
  p.api,
  p.property_number,
  p.structured_road_sequence,
  null::text as written_directions,
  null::text as road_sequence_status,
  null::date as road_sequence_reviewed_date,
  null::date as road_sequence_final_cleanup_date,
  p.verification_status,
  p.operating_status,
  null::text as import_source,
  null::text as import_status,
  p.research_status,
  null::text as research_note,
  '[]'::jsonb as research_sources,
  p.research_date,
  p.list_only,
  null::text as research_method,
  null::text as research_notes,
  p.number_of_road_steps,
  '[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,
  null::text as last_updated_by,
  null::timestamptz as last_updated_date,
  null::text as audit_source,
  null::boolean as audit_verified,
  jsonb_strip_nulls(jsonb_build_object(
    '_public_summary',true,
    'official_pad_record',
      case when jsonb_typeof(p.extra_data->'official_pad_record')='object'
        then jsonb_strip_nulls(jsonb_build_object(
          'pad_name',p.extra_data->'official_pad_record'->'pad_name',
          'operator',p.extra_data->'official_pad_record'->'operator',
          'pad_status',p.extra_data->'official_pad_record'->'pad_status'
        ))
        else null end,
    'official_status',p.extra_data->'official_status',
    'official_operator',p.extra_data->'official_operator',
    'field_pad_alias',p.extra_data->'field_pad_alias',
    'section',p.extra_data->'section'
  )) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  p.created_at,
  p.updated_at,
  null::text as directions_clear,
  null::text as directions_clear_method,
  p.directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  p.well_entries
from public.pads p;
create or replace view public.public_pad_detail
with (security_barrier=true)
as
select
  p.id,
  p.legacy_id,
  p.record_number,
  p.company,
  p.state,
  p.pad_name,
  p.record_type,
  p.address,
  p.latitude,
  p.longitude,
  p.county,
  p.township,
  p.well_name,
  p.api,
  p.property_number,
  p.structured_road_sequence,
  p.written_directions,
  p.road_sequence_status,
  p.road_sequence_reviewed_date,
  p.road_sequence_final_cleanup_date,
  p.verification_status,
  p.operating_status,
  null::text as import_source,
  null::text as import_status,
  p.research_status,
  null::text as research_note,
  '[]'::jsonb as research_sources,
  p.research_date,
  p.list_only,
  null::text as research_method,
