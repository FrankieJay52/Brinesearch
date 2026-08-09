-- BrineSearch V17.3.20 follow-up 2
-- Remove prose/direction fragments that were accidentally stored as local road
-- aliases. Preserve exact saved road names and a small set of direct fractional
-- route legs that the source explicitly says are being traveled.

create or replace function public.brinesearch_apply_v17320_alias_sanity()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  bad_alias_rows integer:=0;
  exact_name_rows integer:=0;
  fractional_rows integer:=0;
  neighbor_rows integer:=0;
begin
  -- Remove aliases that are plainly prose rather than a second road name. Do not
  -- remove valid numeric street names such as 2nd St.
  update public.brinesearch_direction_step_intelligence d
  set local_road_name=null,
      display_road=d.primary_road,
      evidence=(d.evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object('invalid_alias_removed_v17320',true)
  where d.local_road_name is not null
    and (
      d.local_road_name ~* '^(continue|travel|follow|go|going|head|turn|onto|on|to[[:space:]]|for[[:space:]]|and[[:space:]]|exit[[:space:]]|intersection[[:space:]]|junction[[:space:]])'
      or d.local_road_name ~* '^[0-9]+[[:space:]]+(east|west|north|south|toward|towards|to)([[:space:]]|$)'
      or d.local_road_name ~* '^(east|west|north|south)[[:space:]]+(toward|towards|to)([[:space:]]|$)'
      or d.local_road_name ~* '[0-9]+([.][0-9]+)?[[:space:]]*(miles?|mile|mi|feet|ft)[[:space:]]+to[[:space:]]+(CR|TR|SR|OH|WV|PA|US|I)[[:space:]-]*[0-9]'
      or d.local_road_name ~* '[[:space:]]to[[:space:]]+(CR|TR|SR|OH|WV|PA|US|I)[[:space:]-]*[0-9]'
      or d.local_road_name ~* 'at[[:space:]]+st$'
    );
  get diagnostics bad_alias_rows=row_count;

  -- Exact saved names where the older generic alias parser stopped before a
  -- directional suffix or missed Trail / route-first formatting. Every row below
  -- is guarded by its own saved source text.
  update public.brinesearch_direction_step_intelligence
  set local_road_name=case
        when legacy_id='eog--mrugala' and step_order=1 then 'New Garden Ave'
        when legacy_id='eog--whitacre' and step_order=1 then 'Waynesburg Rd NW'
        when legacy_id='eog--mitchell' and step_order=2 then 'Autumn Rd SW'
        when legacy_id='eog--kovach' and step_order=2 then 'Gallow Rd NW'
        when legacy_id='eog--pitts' and step_order=5 then 'Nature Rd NE'
        when legacy_id='eog--sproul-tc-rsh' and step_order=2 then 'Feed Springs Rd SE'
        when legacy_id='eclipse--mercury-unit' and step_order=1 then 'Putney Ridge Rd'
        when legacy_id='eclipse--duane-weisend-unit' and step_order=1 then 'Bean Ridge Rd'
        else local_road_name end,
      display_road=primary_road||' / '||case
        when legacy_id='eog--mrugala' and step_order=1 then 'New Garden Ave'
        when legacy_id='eog--whitacre' and step_order=1 then 'Waynesburg Rd NW'
        when legacy_id='eog--mitchell' and step_order=2 then 'Autumn Rd SW'
        when legacy_id='eog--kovach' and step_order=2 then 'Gallow Rd NW'
        when legacy_id='eog--pitts' and step_order=5 then 'Nature Rd NE'
        when legacy_id='eog--sproul-tc-rsh' and step_order=2 then 'Feed Springs Rd SE'
        when legacy_id='eclipse--mercury-unit' and step_order=1 then 'Putney Ridge Rd'
        when legacy_id='eclipse--duane-weisend-unit' and step_order=1 then 'Bean Ridge Rd'
        else local_road_name end,
      evidence=(evidence-'dual_name_support')||jsonb_build_object('dual_name_source','saved_direction_exact_manual_v17320')
  where (
      (legacy_id='eog--mrugala' and step_order=1 and road_key='OH-172' and coalesce(evidence->>'instruction','') ilike '%OH-172 / New Garden Ave%')
      or (legacy_id='eog--whitacre' and step_order=1 and road_key='OH-171' and coalesce(evidence->>'instruction','') ilike '%OH-171 / Waynesburg Rd NW%')
      or (legacy_id='eog--mitchell' and step_order=2 and road_key='CR-19' and coalesce(evidence->>'instruction','') ilike '%Autumn Rd SW / CR-19%')
      or (legacy_id='eog--kovach' and step_order=2 and road_key='CR-152' and coalesce(evidence->>'instruction','') ilike '%Gallow Rd NW / CR-152%')
      or (legacy_id='eog--pitts' and step_order=5 and road_key='CR-748' and coalesce(evidence->>'instruction','') ilike '%Nature Rd NE / CR-748%')
      or (legacy_id='eog--sproul-tc-rsh' and step_order=2 and road_key='CR-36' and coalesce(evidence->>'instruction','') ilike '%Feed Springs Rd SE / CR-36%')
      or (legacy_id='eclipse--mercury-unit' and step_order=1 and road_key='CR-47' and coalesce(evidence->>'instruction','') ilike '%CR 47 Putney Ridge Rd%')
      or (legacy_id='eclipse--duane-weisend-unit' and step_order=1 and road_key='CR-54' and coalesce(evidence->>'instruction','') ilike '%CR 54/bean ridge road%')
    );
  get diagnostics exact_name_rows=row_count;

  -- Direct fractional legs: the saved instruction explicitly says the truck is
  -- traveling ON this fractional route, not merely approaching its intersection.
  update public.brinesearch_direction_step_intelligence
  set road_key=case
        when legacy_id='expand--barry-greathouse-a' and step_order=6 then 'CR-2/2'
        when legacy_id='expand--violet-coss' and step_order in (8,10) then 'CR-67/1'
        when legacy_id='expand--thurman-speece' and step_order=7 then 'CR-28/3'
        when legacy_id='expand--michael-ratcliffe' and step_order=10 then 'CR-53/1'
        else road_key end,
      primary_road=case
        when legacy_id='expand--barry-greathouse-a' and step_order=6 then 'CR-2/2'
        when legacy_id='expand--violet-coss' and step_order in (8,10) then 'CR-67/1'
        when legacy_id='expand--thurman-speece' and step_order=7 then 'CR-28/3'
        when legacy_id='expand--michael-ratcliffe' and step_order=10 then 'CR-53/1'
        else primary_road end,
      local_road_name=case
        when legacy_id='expand--violet-coss' and step_order=8 then 'McCords Hill Road'
        else null end,
      display_road=case
        when legacy_id='expand--barry-greathouse-a' and step_order=6 then 'CR-2/2'
        when legacy_id='expand--violet-coss' and step_order=8 then 'CR-67/1 / McCords Hill Road'
        when legacy_id='expand--violet-coss' and step_order=10 then 'CR-67/1'
        when legacy_id='expand--thurman-speece' and step_order=7 then 'CR-28/3'
        when legacy_id='expand--michael-ratcliffe' and step_order=10 then 'CR-53/1'
        else display_road end,
      evidence=(evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object('direct_fractional_leg_v17320',true)
  where (
      (legacy_id='expand--barry-greathouse-a' and step_order=6 and coalesce(evidence->>'instruction','') ~* 'Travel[[:space:]]+2\.4[[:space:]]+miles[[:space:]]+on[[:space:]]+CR[[:space:]]+2/2')
      or (legacy_id='expand--violet-coss' and step_order=8 and coalesce(evidence->>'instruction','') ~* 'Travel[[:space:]]+1\.03[[:space:]]+miles[[:space:]]+on[[:space:]]+CR[[:space:]]+67/1')
      or (legacy_id='expand--violet-coss' and step_order=10 and coalesce(evidence->>'instruction','') ~* 'Travel[[:space:]]+0\.12[[:space:]]+miles[[:space:]]+on[[:space:]]+CR[[:space:]]+67/1')
      or (legacy_id='expand--thurman-speece' and step_order=7 and coalesce(evidence->>'instruction','') ~* 'Travel[[:space:]]+1\.75[[:space:]]+miles[[:space:]]+on[[:space:]]+CR[[:space:]]+28/3')
      or (legacy_id='expand--michael-ratcliffe' and step_order=10 and coalesce(evidence->>'instruction','') ~* 'Travel[[:space:]]+0\.37[[:space:]]+miles[[:space:]]+on[[:space:]]+CR[[:space:]]+53/1')
    );
  get diagnostics fractional_rows=row_count;

  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();
  return jsonb_build_object(
    'invalid_aliases_removed',bad_alias_rows,
    'exact_saved_names_restored',exact_name_rows,
    'direct_fractional_legs_corrected',fractional_rows,
    'neighbor_rows_rebuilt',neighbor_rows
  );
end
$$;

revoke all on function public.brinesearch_apply_v17320_alias_sanity() from public,anon,authenticated;

create or replace function public.brinesearch_refresh_all_direction_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare base_result jsonb; truth_result jsonb; target_result jsonb; alias_result jsonb;
begin
  base_result:=public.brinesearch_refresh_all_direction_intelligence_v17319_base();
  truth_result:=public.brinesearch_apply_v17320_direction_truth();
  target_result:=public.brinesearch_apply_v17320_target_road_truth();
  alias_result:=public.brinesearch_apply_v17320_alias_sanity();
  return base_result
    ||jsonb_build_object('v17320_road_turn_mileage_truth',truth_result)
    ||jsonb_build_object('v17320_target_road_alias_truth',target_result)
    ||jsonb_build_object('v17320_alias_sanity',alias_result);
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence() from public,anon,authenticated;

select public.brinesearch_apply_v17320_alias_sanity();
