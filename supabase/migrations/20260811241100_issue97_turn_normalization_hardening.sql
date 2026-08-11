-- GitHub #97 — Route Prep already stores normalized `left` / `right` values on
-- many road occurrences. The first geometry pass accepted only the older
-- direction-intelligence spellings (`turn_left` / `turn_right`). Keep both
-- provenance surfaces equivalent without weakening turn validation.

create or replace function private_verification.brinesearch_issue97_normalize_saved_turn(p_maneuver text)
returns text
language sql
immutable
set search_path=''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(coalesce(p_maneuver,'')))
    when 'left' then 'left'
    when 'turn_left' then 'left'
    when 'right' then 'right'
    when 'turn_right' then 'right'
    when 'continue' then 'continue'
    when 'straight' then 'continue'
    when 'follow' then 'continue'
    when 'stay_left' then 'left'
    when 'stay_right' then 'right'
    else null
  end
$$;

revoke all on function private_verification.brinesearch_issue97_normalize_saved_turn(text)
from public,anon,authenticated,service_role;
