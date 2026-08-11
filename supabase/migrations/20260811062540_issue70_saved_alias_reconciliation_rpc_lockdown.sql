-- #70 reconciliation is a maintenance pipeline, not a browser RPC surface.
-- The functions already enforce the BrineSearch Owner identity internally, but the
-- Supabase advisor correctly notes that granting EXECUTE to every authenticated
-- user needlessly exposes SECURITY DEFINER entry points. Keep them database-owner
-- only; production maintenance invokes them through controlled SQL with the Owner
-- claim, not from browser code.

revoke all on function public.brinesearch_stage_saved_alias_reconcile_issue70() from public,anon,authenticated;
revoke all on function public.brinesearch_apply_saved_alias_reconcile_issue70() from public,anon,authenticated;
revoke all on function public.brinesearch_apply_saved_alias_reconcile_all_issue70() from public,anon,authenticated;
