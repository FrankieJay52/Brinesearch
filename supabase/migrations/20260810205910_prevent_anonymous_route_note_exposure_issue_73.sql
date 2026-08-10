-- GitHub #73: keep private route/review notes out of anonymous pad APIs.
--
-- The detailed public projection previously copied the complete
-- extra_data.official_pad_record object, including internal review notes. The
-- V17.3.29 structured-route publisher also placed brinesearch_pad_roads.step_note
-- in the public route snapshot. Private source rows and owner-only RPCs retain
-- those notes; this migration allow-lists the public facts at both snapshot and
-- projection boundaries, scrubs already-materialized rows, and adds constraints
-- that prevent either path from reopening.

create or replace function private_verification.brinesearch_strip_internal_json_keys_issue73(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      v_result := '{}'::jsonb;
      for v_key,v_child in
        select e.key,e.value
        from pg_catalog.jsonb_each(p_value) e
        order by e.key
      loop
        -- These are editorial/reconciliation concepts, never driver facts.
        -- Match anywhere in a key so future variants such as source_note or
        -- operator_conflict cannot bypass the boundary.
        if pg_catalog.lower(v_key) ~ '(note|comment|review|conflict|evidence)' then
          continue;
        end if;
        v_result := v_result || pg_catalog.jsonb_build_object(
          v_key,
          private_verification.brinesearch_strip_internal_json_keys_issue73(v_child)
        );
      end loop;
      return v_result;
    when 'array' then
      select coalesce(
        pg_catalog.jsonb_agg(
          private_verification.brinesearch_strip_internal_json_keys_issue73(e.value)
          order by e.ordinality
        ),
        '[]'::jsonb
      )
      into v_result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality e(value,ordinality);
      return v_result;
    else
      return p_value;
  end case;
end;
$$;

create or replace function private_verification.brinesearch_public_object_issue73(
  p_value jsonb,
  p_allowed_keys text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object' then null
    else coalesce(
      (
        select pg_catalog.jsonb_object_agg(e.key,e.value order by e.key)
        from pg_catalog.jsonb_each(
          private_verification.brinesearch_strip_internal_json_keys_issue73(p_value)
        ) e
        where e.key = any(p_allowed_keys)
          and e.value <> 'null'::jsonb
      ),
      '{}'::jsonb
    )
  end
$$;

create or replace function private_verification.brinesearch_public_object_array_issue73(
  p_value jsonb,
  p_allowed_keys text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'array' then null
    else coalesce(
      (
        select pg_catalog.jsonb_agg(
          private_verification.brinesearch_public_object_issue73(e.value,p_allowed_keys)
          order by e.ordinality
        )
        filter (where pg_catalog.jsonb_typeof(e.value) = 'object')
        from pg_catalog.jsonb_array_elements(p_value) with ordinality e(value,ordinality)
      ),
      '[]'::jsonb
    )
  end
$$;

create or replace function private_verification.brinesearch_public_scalar_issue73(
  p_value jsonb,
  p_allow_scalar_array boolean default false
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(p_value) in ('string','number','boolean') then p_value
    when p_allow_scalar_array
      and pg_catalog.jsonb_typeof(p_value) = 'array'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_value) e(value)
        where pg_catalog.jsonb_typeof(e.value) not in ('string','number','boolean','null')
      )
      then p_value
    else null
  end
$$;

create or replace function private_verification.brinesearch_sanitize_public_route_steps_issue73(
  p_steps jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    private_verification.brinesearch_public_object_array_issue73(
      p_steps,
      array[
        'route_step_id','step_order','step_index','road_id','road_name','aliases',
        'start_coordinate','end_coordinate','clipped_geometry','miles',
        'turn_direction','inbound_turn','instruction','geometry_status',
        'geometry_version','route_revision'
      ]::text[]
    ),
    '[]'::jsonb
  )
$$;

create or replace function private_verification.brinesearch_sanitize_public_turn_route_issue73(
  p_route jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_route is null or pg_catalog.jsonb_typeof(p_route) <> 'object' then null
    else pg_catalog.jsonb_strip_nulls(
      coalesce(
        private_verification.brinesearch_public_object_issue73(
          p_route,
          array[
            'batch','entrance_side','exit','field_verification_status',
            'geometry_status','highway_anchor','mileage_source',
            'road_manager_incorporated','route_sequence','source','step_count',
            'updated_at','version'
          ]::text[]
        ),
        '{}'::jsonb
      )
      ||
      case
        when pg_catalog.jsonb_typeof(p_route->'public_segments') = 'array' then
          pg_catalog.jsonb_build_object(
            'public_segments',
            private_verification.brinesearch_public_object_array_issue73(
              p_route->'public_segments',
              array['aliases','miles','road','travel_direction','turn']::text[]
            )
          )
        else '{}'::jsonb
      end
    )
  end
$$;

create or replace function private_verification.brinesearch_sanitize_public_extra_data_issue73(
  p_extra_data jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_extra_data is null or pg_catalog.jsonb_typeof(p_extra_data) <> 'object'
      then pg_catalog.jsonb_build_object('_public_summary',false)
    else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      '_public_summary',false,
      'official_pad_record',
        private_verification.brinesearch_public_object_issue73(
          p_extra_data->'official_pad_record',
          array[
            'agency','county','database','distance_from_saved_miles','latitude','longitude',
            'match_method','matched_on','object_id','official_source','operator',
            'pad_id','pad_name','pad_permit','pad_status','pad_type',
            'record_level','service','source_api','source_key','source_method',
            'state','township','well_name'
          ]::text[]
        ),
      'official_well_records',
        private_verification.brinesearch_public_object_array_issue73(
          p_extra_data->'official_well_records',
          array[
            'api','api_digits','checked','completion_date','county',
            'latest_production_date','operator','permit_approved_date','source',
            'township','verification_method','well_name','well_status',
            'wellhead_latitude','wellhead_longitude'
          ]::text[]
        ),
      'api_verification_summary',
        private_verification.brinesearch_public_object_issue73(
          p_extra_data->'api_verification_summary',
          array[
            'checked','exact_odnr_matches','exact_official_matches',
            'saved_api_count','unmatched_count','unmatched_saved_apis'
          ]::text[]
        ),
      'official_operator',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'official_operator'
        ),
      'official_status',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'official_status'
        ),
      'turn_by_turn_route',
        private_verification.brinesearch_sanitize_public_turn_route_issue73(
          p_extra_data->'turn_by_turn_route'
        ),
      'field_address_confirmed',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'field_address_confirmed'
        ),
      'field_pad_alias',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'field_pad_alias'
        ),
      'field_property_number_observation',
        private_verification.brinesearch_public_object_issue73(
          p_extra_data->'field_property_number_observation',
          array['confirmed','method','observed_on','source','unresolved']::text[]
        ),
      'field_sign_api_as_displayed',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'field_sign_api_as_displayed',
          true
        ),
      'field_sign_section',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'field_sign_section'
        ),
      'field_sign_township',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'field_sign_township'
        ),
      'field_well_sign_observation',
        private_verification.brinesearch_public_object_issue73(
          p_extra_data->'field_well_sign_observation',
          array[
            'address_on_sign','county_on_sign','observed_on','section_on_sign',
            'source','township_on_sign','well_count'
          ]::text[]
        ),
      'section',
        private_verification.brinesearch_public_scalar_issue73(p_extra_data->'section'),
      'site_operator_sign',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'site_operator_sign'
        ),
      'spill_contact',
        private_verification.brinesearch_public_scalar_issue73(
          p_extra_data->'spill_contact'
        )
    ))
  end
$$;

revoke all on function
  private_verification.brinesearch_strip_internal_json_keys_issue73(jsonb),
  private_verification.brinesearch_public_object_issue73(jsonb,text[]),
  private_verification.brinesearch_public_object_array_issue73(jsonb,text[]),
  private_verification.brinesearch_public_scalar_issue73(jsonb,boolean),
  private_verification.brinesearch_sanitize_public_route_steps_issue73(jsonb),
  private_verification.brinesearch_sanitize_public_turn_route_issue73(jsonb),
  private_verification.brinesearch_sanitize_public_extra_data_issue73(jsonb)
from public,anon,authenticated;

grant execute on function
  private_verification.brinesearch_strip_internal_json_keys_issue73(jsonb),
  private_verification.brinesearch_public_object_issue73(jsonb,text[]),
  private_verification.brinesearch_public_object_array_issue73(jsonb,text[]),
  private_verification.brinesearch_public_scalar_issue73(jsonb,boolean),
  private_verification.brinesearch_sanitize_public_route_steps_issue73(jsonb),
  private_verification.brinesearch_sanitize_public_turn_route_issue73(jsonb),
  private_verification.brinesearch_sanitize_public_extra_data_issue73(jsonb)
to service_role;

-- The stored pads value is explicitly a public snapshot. Sanitize it before
-- the existing AFTER trigger copies a pad into public_pad_detail.
create or replace function private_verification.brinesearch_sanitize_pad_snapshot_issue73()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.structured_route_steps :=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(
      new.structured_route_steps
    );
  return new;
end;
$$;

revoke all on function
  private_verification.brinesearch_sanitize_pad_snapshot_issue73()
from public,anon,authenticated;

drop trigger if exists pads_sanitize_public_route_snapshot_issue73 on public.pads;
create trigger pads_sanitize_public_route_snapshot_issue73
before insert or update of structured_route_steps on public.pads
for each row execute function
  private_verification.brinesearch_sanitize_pad_snapshot_issue73();

-- Keep the projection source as the authoritative public field allow-list.
-- Its column order remains identical to public_pad_detail because the existing
-- sync trigger deliberately uses INSERT ... SELECT *.
create or replace view private_verification.public_pad_projection_source
with (security_invoker=true, security_barrier=true)
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
  null::text as research_notes,
  p.number_of_road_steps,
  '[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,
  null::text as last_updated_by,
  null::timestamptz as last_updated_date,
  null::text as audit_source,
  null::boolean as audit_verified,
  private_verification.brinesearch_sanitize_public_extra_data_issue73(
    p.extra_data
  ) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  p.created_at,
  p.updated_at,
  p.directions_clear,
  null::text as directions_clear_method,
  p.directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  p.well_entries,
  private_verification.brinesearch_sanitize_public_route_steps_issue73(
    p.structured_route_steps
  ) as structured_route_steps
from public.pads p;

revoke all on private_verification.public_pad_projection_source
from public,anon,authenticated;
grant select on private_verification.public_pad_projection_source
to service_role;

-- Defense in depth for any future service-side write that targets the
-- materialized public table without going through the projection source.
create or replace function private_verification.brinesearch_sanitize_public_pad_detail_issue73()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.extra_data :=
    private_verification.brinesearch_sanitize_public_extra_data_issue73(
      new.extra_data
    );
  new.structured_route_steps :=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(
      new.structured_route_steps
    );
  return new;
end;
$$;

revoke all on function
  private_verification.brinesearch_sanitize_public_pad_detail_issue73()
from public,anon,authenticated;

drop trigger if exists public_pad_detail_sanitize_route_notes_issue73
  on public.public_pad_detail;
create trigger public_pad_detail_sanitize_route_notes_issue73
before insert or update of extra_data,structured_route_steps
on public.public_pad_detail
for each row execute function
  private_verification.brinesearch_sanitize_public_pad_detail_issue73();

-- Remove any note keys from the dormant public structured snapshots first.
update public.pads p
set structured_route_steps =
  private_verification.brinesearch_sanitize_public_route_steps_issue73(
    p.structured_route_steps
  )
where p.structured_route_steps is distinct from
  private_verification.brinesearch_sanitize_public_route_steps_issue73(
    p.structured_route_steps
  );

-- Re-materialize only the public JSON columns from the corrected source.
update public.public_pad_detail d
set extra_data = s.extra_data,
    structured_route_steps = s.structured_route_steps
from private_verification.public_pad_projection_source s
where d.id = s.id
  and (
    d.extra_data is distinct from s.extra_data
    or d.structured_route_steps is distinct from s.structured_route_steps
  );

alter table public.pads
  drop constraint if exists pads_public_route_snapshot_no_internal_keys_issue73;
alter table public.pads
  add constraint pads_public_route_snapshot_no_internal_keys_issue73
  check (
    not pg_catalog.jsonb_path_exists(
      structured_route_steps,
      '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
    )
  );

alter table public.public_pad_detail
  drop constraint if exists public_pad_detail_route_no_internal_keys_issue73;
alter table public.public_pad_detail
  add constraint public_pad_detail_route_no_internal_keys_issue73
  check (
    not pg_catalog.jsonb_path_exists(
      structured_route_steps,
      '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
    )
  );

alter table public.public_pad_detail
  drop constraint if exists public_pad_detail_extra_no_internal_keys_issue73;
alter table public.public_pad_detail
  add constraint public_pad_detail_extra_no_internal_keys_issue73
  check (
    not pg_catalog.jsonb_path_exists(
      extra_data,
      '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
    )
  );

comment on function
  private_verification.brinesearch_sanitize_public_extra_data_issue73(jsonb)
is 'Issue #73 public-pad JSON allow-list. Retains public route and official-record facts while excluding editorial notes, evidence and conflicts.';

comment on function
  private_verification.brinesearch_sanitize_public_route_steps_issue73(jsonb)
is 'Issue #73 public structured-route allow-list. Private brinesearch_pad_roads.step_note remains available only through owner/editor boundaries.';

do $assert$
declare
  v_extra jsonb;
  v_route jsonb;
begin
  v_extra :=
    private_verification.brinesearch_sanitize_public_extra_data_issue73(
      '{
        "official_pad_record":{
          "pad_name":"Public Pad",
          "operator":"Public Operator",
          "latitude":39.1,
          "longitude":-81.2,
          "location_review_note":"private entrance reconciliation",
          "record_selection_note":"private match choice",
          "conflicts":{"operator":{"note":"private conflict"}}
        },
        "turn_by_turn_route":{
          "source":"verified public route",
          "step_count":1,
          "review_note":"private review",
          "public_segments":[{
            "road":"County Road 1",
            "miles":1.25,
            "turn":"left",
            "note":"private landmark"
          }]
        },
        "field_property_number_observation":{
          "confirmed":true,
          "source":"field sign",
          "note":"private observation"
        }
      }'::jsonb
    );

  if pg_catalog.jsonb_path_exists(
    v_extra,
    '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
  ) then
    raise exception 'Issue #73 extra_data fixture retained an internal key';
  end if;

  if not v_extra @> '{
    "official_pad_record":{
      "pad_name":"Public Pad",
      "operator":"Public Operator",
      "latitude":39.1,
      "longitude":-81.2
    },
    "turn_by_turn_route":{
      "source":"verified public route",
      "step_count":1,
      "public_segments":[{
        "road":"County Road 1",
        "miles":1.25,
        "turn":"left"
      }]
    },
    "field_property_number_observation":{
      "confirmed":true,
      "source":"field sign"
    }
  }'::jsonb then
    raise exception 'Issue #73 extra_data fixture lost intended public facts';
  end if;

  v_route :=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(
      '[{
        "route_step_id":"00000000-0000-0000-0000-000000000001",
        "step_order":1,
        "road_id":"00000000-0000-0000-0000-000000000002",
        "road_name":"County Road 1",
        "aliases":["CR 1"],
        "start_coordinate":[-81.2,39.1],
        "end_coordinate":[-81.1,39.2],
        "clipped_geometry":{"type":"LineString","coordinates":[[-81.2,39.1],[-81.1,39.2]]},
        "miles":1.25,
        "turn_direction":"left",
        "instruction":"Turn left",
        "note":"private source landmark",
        "geometry_status":"exact",
        "geometry_version":1,
        "route_revision":3
      }]'::jsonb
    );

  if pg_catalog.jsonb_path_exists(
    v_route,
    '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
  ) then
    raise exception 'Issue #73 route fixture retained an internal key';
  end if;

  if not v_route @> '[{
    "road_name":"County Road 1",
    "aliases":["CR 1"],
    "miles":1.25,
    "turn_direction":"left",
    "instruction":"Turn left",
    "geometry_status":"exact",
    "geometry_version":1,
    "route_revision":3
  }]'::jsonb then
    raise exception 'Issue #73 route fixture lost intended public facts';
  end if;

  if exists (
    select 1
    from public.public_pad_detail d
    where pg_catalog.jsonb_path_exists(
      d.extra_data,
      '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
    )
    or pg_catalog.jsonb_path_exists(
      d.structured_route_steps,
      '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(note|comment|review|conflict|evidence)" flag "i")'
    )
  ) then
    raise exception 'Issue #73 scrub left internal keys in public_pad_detail';
  end if;

  if exists (
    select 1
    from public.public_pad_detail d
    join private_verification.public_pad_projection_source s using(id)
    where d.extra_data is distinct from s.extra_data
       or d.structured_route_steps is distinct from s.structured_route_steps
  ) then
    raise exception 'Issue #73 materialized detail does not match safe source';
  end if;

  if not pg_catalog.has_table_privilege(
    'anon','public.public_pad_detail','select'
  ) then
    raise exception 'Issue #73 removed intended anonymous public-pad reads';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'public_pad_detail'
      and c.relrowsecurity
  ) then
    raise exception 'Issue #73 public_pad_detail RLS is not enabled';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = 'public.public_pad_detail'::regclass
      and p.polcmd = 'r'
      and (
        select r.oid
        from pg_catalog.pg_roles r
        where r.rolname = 'anon'
      ) = any(p.polroles)
      and pg_catalog.pg_get_expr(p.polqual,p.polrelid) = 'true'
  ) then
    raise exception 'Issue #73 intended anonymous SELECT RLS policy is missing';
  end if;

  if pg_catalog.has_table_privilege('anon','public.pads','select')
     or pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_get_structured_route_steps(uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)',
       'execute'
     ) then
    raise exception 'Issue #73 widened a private pad/route boundary';
  end if;
end
$assert$;
