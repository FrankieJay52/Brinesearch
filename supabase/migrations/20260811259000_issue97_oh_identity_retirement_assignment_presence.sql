-- GitHub #97 — Ohio source-identity retirement performance/correctness hardening.
--
-- Mahoning's 8,477-row production-scale rehearsal proved the optimized connected-
-- component builder, then timed out in finalization while rejoining every active
-- segment assignment to the ODOT catalog only to ask whether the identity still
-- exists. refresh_oh_identities already retires the county's old assignments and
-- republishes active assignments exclusively from the current source_active ODOT
-- generation, including source-valid geometry intentionally held from topology.
-- Therefore active exact assignment presence is the authoritative post-refresh
-- source-presence test. Use the existing (identity_id,active) index directly.

do $issue97_patch_oh_identity_retirement$
declare
  v_definition text;
  v_old text:='and not exists(
          select 1
          from public.brinesearch_authoritative_segment_identity_assignments a
          join public.brinesearch_odot_road_catalog c
            on a.source_segment_key=''OH:ODOT:SEGMENT:''||c.roadway_inventory_id
          where a.dataset_id=v_run.dataset_id
            and a.identity_id=i.id and a.active
            and c.county_code=v_source_county and c.source_active
        );';
  v_new text:='and not exists(
          select 1
          from public.brinesearch_authoritative_segment_identity_assignments a
          where a.dataset_id=v_run.dataset_id
            and a.identity_id=i.id and a.active
        );';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 Ohio retirement source-presence block changed unexpectedly: % matches',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_oh_identity_retirement$;

revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
to service_role;

comment on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) is
  'Issue #97 authoritative ingest finalizer. Ohio identity retirement uses active exact segment-assignment presence rebuilt from the current ODOT generation; WV/PA use active external source segments. No topology/name/nearest-road existence inference.';
