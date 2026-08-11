-- GitHub #81 parser-safe wording for source-verified route aliases.
-- Keep road/alias truth explicit without letting direction words such as
-- "west" or "East" be misread as local road aliases by direction intelligence.

update public.pads
set
  directions_clear = case legacy_id
    when 'ascent--albert' then replace(directions_clear,'From I-70 west, take Exit 198.','From westbound I-70, take Exit 198.')
    when 'expand--timmy-minch' then replace(directions_clear,'Turn right on US-40 East / National Rd. Continue 0.76 miles.','Turn right on US-40 / National Rd eastbound. Continue 0.76 miles.')
    else directions_clear
  end,
  directions_clear_updated_at = pg_catalog.now(),
  directions_clear_method = 'Issue #81 source-verified authoritative driver cleanup'
where legacy_id in ('ascent--albert','expand--timmy-minch');

do $$
begin
  if exists(
    select 1
    from public.pads p
    join public.brinesearch_direction_step_intelligence i on i.pad_id=p.id
    where p.legacy_id='ascent--albert' and i.step_order=1 and i.display_road is distinct from 'I-70'
  ) then
    raise exception 'issue81 parser wording failed: Albert start road drifted';
  end if;
  if exists(
    select 1
    from public.pads p
    join public.brinesearch_direction_step_intelligence i on i.pad_id=p.id
    where p.legacy_id='expand--timmy-minch' and i.step_order=2 and i.display_road is distinct from 'US-40 / National Rd'
  ) then
    raise exception 'issue81 parser wording failed: Timmy US-40 alias drifted';
  end if;
end;
$$;
