-- GitHub #97 — preserve valid non-simple supplemental authoritative centerlines.
--
-- Ohio OGRIP and county/NG911 supplemental centerline sources are source evidence,
-- not automatically routable topology. Valid one-dimensional source records must
-- therefore be retained even when ST_IsSimple=false. Ohio exact OGRIP->ODOT
-- equivalence remains fail-closed by requiring simple supplemental geometry before
-- it can produce a verified identity mapping; preserved non-simple rows receive an
-- explicit held disposition instead of being silently rejected or guessed.

alter table public.brinesearch_authoritative_supplemental_centerlines
  drop constraint brinesearch_supplemental_centerlines_geometry_check;
alter table public.brinesearch_authoritative_supplemental_centerlines
  add constraint brinesearch_supplemental_centerlines_geometry_check check(
    extensions.st_dimension(geom)=1
    and not extensions.st_isempty(geom)
    and extensions.st_isvalid(geom)
    and extensions.st_coveredby(geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
  );

do $issue97_patch_supplemental_nonsimple$
declare
  v_ingest text;
  v_oh text;
  v_old_ingest text:='if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1
       or not extensions.st_isvalid(v_geom) or not extensions.st_issimple(v_geom) then continue; end if;';
  v_new_ingest text:='if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1
       or not extensions.st_isvalid(v_geom) then continue; end if;';
  v_old_oh text:='where c.dataset_id=v_run.dataset_id and c.state_code=''OH''
      and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id';
  v_new_oh text:='where c.dataset_id=v_run.dataset_id and c.state_code=''OH''
      and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id
      and extensions.st_issimple(c.geom)';
  v_ingest_count integer;
  v_oh_count integer;
  v_oh_pos integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_ingest;
  v_ingest_count:=(pg_catalog.length(v_ingest)-pg_catalog.length(pg_catalog.replace(v_ingest,v_old_ingest,'')))
    /pg_catalog.length(v_old_ingest);
  if v_ingest_count<>1 then
    raise exception 'Issue #97 supplemental ingest geometry guard changed unexpectedly: % matches',v_ingest_count;
  end if;
  v_ingest:=pg_catalog.replace(v_ingest,v_old_ingest,v_new_ingest);
  execute v_ingest;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_oh;
  v_oh_count:=(pg_catalog.length(v_oh)-pg_catalog.length(pg_catalog.replace(v_oh,v_old_oh,'')))
    /pg_catalog.length(v_old_oh);
  if v_oh_count<1 then
    raise exception 'Issue #97 Ohio supplemental candidate scope changed unexpectedly: % matches',v_oh_count;
  end if;
  -- Only the first occurrence is the exact geometry-equivalence candidate source.
  v_oh_pos:=pg_catalog.strpos(v_oh,v_old_oh);
  v_oh:=pg_catalog.substr(v_oh,1,v_oh_pos-1)
    ||v_new_oh
    ||pg_catalog.substr(v_oh,v_oh_pos+pg_catalog.length(v_old_oh));
  execute v_oh;
end
$issue97_patch_supplemental_nonsimple$;

revoke all on function public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)
to service_role;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on constraint brinesearch_supplemental_centerlines_geometry_check
  on public.brinesearch_authoritative_supplemental_centerlines is
  'Issue #97 source-evidence geometry guard: retain every valid one-dimensional authoritative supplemental centerline, including non-simple geometry; downstream exact mapping/topology remains stricter.';
comment on function public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer) is
  'Issue #97 supplemental authoritative source-page ingest. Valid 1-D source centerlines are preserved even when non-simple; mapping/topology layers decide route eligibility separately and fail closed.';
comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Only simple supplemental geometry may prove exact ODOT identity equivalence; valid non-simple OGRIP rows remain preserved source evidence with explicit held dispositions.';
