-- GitHub #97 — missing cutover-state helper required by transition Google routes.
--
-- Transition Google-route generation/currentness already calls
-- public.brinesearch_issue97_cutover_active(), but no migration created it. Define
-- the helper directly from the irreversible release-state row. This does not
-- activate cutover and cannot bypass the 114-source / 39-graph / reconciliation
-- gate; it only reports whether that existing gate has already written cutover_at.

create or replace function public.brinesearch_issue97_cutover_active()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select s.cutover_at is not null
    from public.brinesearch_issue97_release_state s
    where s.singleton
  ),false)
$$;

revoke all on function public.brinesearch_issue97_cutover_active()
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_cutover_active() is
  'Issue #97 internal release-state predicate used by Google-route builders/currentness checks. Returns true only after the existing irreversible cutover gate has populated release_state.cutover_at; it performs no activation.';
