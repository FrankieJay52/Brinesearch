-- GitHub #97 — service-only one-scope ingestion orchestrator.
--
-- Each call refreshes exactly one registered authoritative source/county scope
-- under the existing run-bound snapshot/page/finalize contract. Keeping the
-- unit of work to one source scope makes rollout restartable and prevents a
-- failure in one county/feed from invalidating already verified scopes.

create or replace function public.brinesearch_issue97_refresh_source_scope(
  p_source_key text,
  p_county_code text,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.btrim(coalesce(p_source_key,''));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_snapshot jsonb;
  v_expected integer;
  v_expected_pages integer;
  v_begin jsonb;
  v_page jsonb;
  v_final jsonb;
  v_run_id uuid;
  v_offset integer:=0;
  v_pages integer:=0;
  v_source_rows integer:=0;
  v_ingested_rows integer:=0;
  v_rejected_rows integer:=0;
  v_error text;
  v_sqlstate text;
begin
  if v_source='' or v_county='' then
    raise exception 'Source key and county code are required' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.brinesearch_road_source_datasets d
    join public.brinesearch_road_source_dataset_counties scope
      on scope.dataset_id=d.id and scope.state_code=d.state_code
    join public.brinesearch_road_graph_counties county
      on county.state_code=scope.state_code and county.county_code=scope.county_code
    where d.source_key=v_source and d.active
      and scope.county_code=v_county and scope.active and scope.ingest_enabled
      and county.active
  ) then
    raise exception 'Issue #97 source/county scope is not active and ingest-enabled: % / %',
      v_source,v_county using errcode='22023';
  end if;

  v_snapshot:=public.brinesearch_issue97_source_snapshot(v_source,v_county);
  if v_snapshot is null or pg_catalog.jsonb_typeof(v_snapshot)<>'object'
     or coalesce(v_snapshot->>'expected_source_rows','')!~'^[0-9]+$' then
    raise exception 'Issue #97 source snapshot did not return an expected row count'
      using errcode='P0001';
  end if;
  v_expected:=(v_snapshot->>'expected_source_rows')::integer;
  v_expected_pages:=greatest(1,pg_catalog.ceil(v_expected::numeric/v_limit)::integer);

  v_begin:=public.brinesearch_issue97_begin_ingest(
    v_source,v_county,v_expected,v_snapshot
  );
  v_run_id:=(v_begin->>'run_id')::uuid;
  if v_run_id is null then
    raise exception 'Issue #97 begin_ingest did not return a run id' using errcode='P0001';
  end if;

  loop
    v_page:=public.brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit);
    v_pages:=v_pages+1;
    v_source_rows:=v_source_rows+coalesce((v_page->>'source_rows')::integer,0);
    v_ingested_rows:=v_ingested_rows+coalesce((v_page->>'rows')::integer,0);
    v_rejected_rows:=v_rejected_rows+coalesce((v_page->>'rejected_rows')::integer,0);

    if v_pages>v_expected_pages then
      perform public.brinesearch_issue97_fail_ingest(
        v_run_id,'page count exceeded source snapshot expectation',
        pg_catalog.jsonb_build_object(
          'expected_source_rows',v_expected,'expected_pages',v_expected_pages,
          'observed_pages',v_pages,'page_size',v_limit
        )
      );
      return pg_catalog.jsonb_build_object(
        'source_key',v_source,'county_code',v_county,'run_id',v_run_id,
        'status','failed','reason','page_count_exceeded_snapshot_expectation',
        'expected_source_rows',v_expected,'pages',v_pages
      );
    end if;

    exit when coalesce((v_page->>'has_more')::boolean,false) is false;
    v_offset:=v_offset+v_limit;
  end loop;

  v_final:=public.brinesearch_issue97_finalize_ingest(
    v_run_id,
    pg_catalog.jsonb_build_object(
      'orchestrator','brinesearch_issue97_refresh_source_scope',
      'requested_page_size',v_limit,
      'orchestrator_page_count',v_pages,
      'orchestrator_source_rows',v_source_rows,
      'orchestrator_ingested_rows',v_ingested_rows,
      'orchestrator_rejected_rows',v_rejected_rows
    )
  );

  return pg_catalog.jsonb_build_object(
    'source_key',v_source,'county_code',v_county,
    'run_id',v_run_id,'expected_source_rows',v_expected,
    'pages',v_pages,'source_rows',v_source_rows,
    'ingested_rows',v_ingested_rows,'rejected_rows',v_rejected_rows,
    'status',coalesce(v_final->>'status','failed'),
    'coverage_complete',coalesce((v_final->>'coverage_complete')::boolean,false),
    'page_set_digest',v_final->>'page_set_digest',
    'content_digest',v_final->>'content_digest',
    'finalize',v_final
  );
exception when others then
  get stacked diagnostics v_error=message_text,v_sqlstate=returned_sqlstate;
  if v_run_id is not null then
    begin
      perform public.brinesearch_issue97_fail_ingest(
        v_run_id,
        'source-scope orchestrator error',
        pg_catalog.jsonb_build_object(
          'sqlstate',v_sqlstate,'message',v_error,
          'orchestrator','brinesearch_issue97_refresh_source_scope'
        )
      );
    exception when others then
      null;
    end;
  end if;
  return pg_catalog.jsonb_build_object(
    'source_key',v_source,'county_code',v_county,
    'run_id',v_run_id,'status','failed',
    'sqlstate',v_sqlstate,'error',v_error,
    'pages_completed',v_pages,
    'source_rows_seen',v_source_rows,
    'ingested_rows_seen',v_ingested_rows,
    'rejected_rows_seen',v_rejected_rows
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_source_scope(text,text,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_refresh_source_scope(text,text,integer)
to service_role;

comment on function public.brinesearch_issue97_refresh_source_scope(text,text,integer) is
  'Issue #97 service-only restartable one-source/one-county orchestrator: server snapshot -> run-bound contiguous pages -> receipt-derived finalization. Never browser callable.';
