do $verify$
begin
  if to_regclass('private_verification.public_data_sources') is null then raise exception 'public_data_sources missing'; end if;
  if to_regclass('private_verification.public_data_source_records') is null then raise exception 'public_data_source_records missing'; end if;
  if to_regclass('private_verification.public_data_match_candidates') is null then raise exception 'public_data_match_candidates missing'; end if;
  if to_regclass('private_verification.public_data_async_requests') is null then raise exception 'public_data_async_requests missing'; end if;
  if to_regprocedure('public.public_data_review_summary()') is null then raise exception 'public_data_review_summary missing'; end if;
  if to_regprocedure('public.public_data_review_queue(text,text,text,text,text,text,text,integer,integer,integer)') is null then raise exception 'public_data_review_queue missing'; end if;
  if to_regprocedure('public.public_data_review_detail(uuid)') is null then raise exception 'public_data_review_detail missing'; end if;
  if to_regprocedure('public.public_data_review_decide(uuid,text,text)') is null then raise exception 'public_data_review_decide missing'; end if;
  if to_regprocedure('private_verification.queue_pa_live_public_data(text)') is null or to_regprocedure('private_verification.process_pa_live_public_data(text)') is null or to_regprocedure('private_verification.finalize_pa_live_public_data()') is null then raise exception 'PA live refresh pipeline incomplete'; end if;
  if to_regprocedure('private_verification.queue_wv_live_public_data(text)') is null or to_regprocedure('private_verification.process_wv_live_public_data(text)') is null or to_regprocedure('private_verification.finalize_wv_live_public_data()') is null then raise exception 'WV live refresh pipeline incomplete'; end if;
  if exists(select 1 from private_verification.public_data_sources where source_key in('oh_odnr_live_wellpads','oh_odnr_live_wells','oh_odnr_live_class_ii_disposal_wells','pa_dep_live_unconventional_wells','pa_dep_live_well_pads','pa_dep_live_well_access_roads','wv_wvdep_live_horizontal_wells','wv_wvdep_live_brine_disposal_wells') and not official) then raise exception 'An official rollout source is not marked official'; end if;
end
$verify$;

comment on function public.public_data_review_decide(uuid,text,text) is 'Owner-only audit decision for staged official public data. This function never applies changes to public.pads; live changes require a separate reviewed workflow.';