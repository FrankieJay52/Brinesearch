import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260825210231_v18_cologie_exact_public_google_release.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8").replace(/\r\n?/g, "\n");
const compact = sql.replace(/\s+/g, " ").trim().toLowerCase();
const failures = [];

const requireText = (value, label) => {
  if (!compact.includes(value.replace(/\s+/g, " ").trim().toLowerCase())) {
    failures.push(`missing ${label}`);
  }
};

requireText(
  "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
  "exact Cologie pad identity",
);
requireText(
  "08ec28f968ef6425f10a8170ec9fa36c",
  "reviewed Cologie manifest digest",
);
requireText(
  "dba36e417e59b1746c2e3f09ae6d6980",
  "reviewed Cologie dependency digest",
);
requireText(
  "private_verification.brinesearch_v18_public_google_route_releases",
  "private receipt-bound release table",
);
requireText("force row level security", "FORCE RLS on private release authority");
requireText(
  "private_verification.brinesearch_v18_public_google_release_authorizes_receipt",
  "shared release-to-receipt predicate",
);
requireText(
  "private_verification.brinesearch_v18_public_google_release_managed",
  "persistent per-pad lock predicate",
);
requireText(
  "if not v_release_authorized and (not v_cutover_active or v_release_managed) then",
  "transition projector/current permanent-lock gate",
);
requireText(
  "not public.brinesearch_issue97_cutover_active() or private_verification.brinesearch_v18_public_google_release_managed(p_pad_id)",
  "public dispatcher permanent-lock gate",
);
requireText(
  "if v_cutover_active then update public.pads set",
  "global-only pad marker mutation guard",
);
requireText(
  "'release_mode',case when v_cutover_active then 'global_cutover' else 'explicit_pad' end",
  "explicit per-pad projection result",
);
requireText(
  "public.brinesearch_v18_driver_pad_status(v_cologie)",
  "V18 driver-status acceptance proof",
);
requireText(
  "set local role anon",
  "browser-role FORCE-RLS read proof",
);
requireText(
  "public.brinesearch_issue97_cutover_active() then raise exception",
  "global cutover remains off assertion",
);
requireText(
  "to anon,authenticated,service_role",
  "existing dispatcher execute ACL",
);

if (/update\s+public\.brinesearch_issue97_release_state/i.test(sql)) {
  failures.push("migration must not enable or mutate global Issue #97 cutover");
}
if (/\b(insert\s+into|update|delete\s+from)\s+public\.brinesearch_(?:route_prep|route_prep_steps|roads|road_graph|pad_roads)/i.test(sql)) {
  failures.push("migration must not mutate route or graph authority tables");
}
if (/\b(update|delete\s+from)\s+public\.pads\b/i.test(sql)) {
  const guardedPadWrites = [...sql.matchAll(/update\s+public\.pads\s+set/gi)].length;
  const globalGuards = [...sql.matchAll(/if\s+v_cutover_active\s+then\s+update\s+public\.pads\s+set/gi)].length;
  if (guardedPadWrites !== 3 || globalGuards !== 3) {
    failures.push("every preserved pad marker write must remain global-cutover-only");
  }
}
if (/grant\s+(?:select|insert|update|delete|all)[\s\S]{0,160}brinesearch_v18_public_google_route_releases/i.test(sql)) {
  failures.push("private release authority must not be granted to browser/service roles");
}
if (!/a changed receipt is not auto-authorized/i.test(sql)) {
  failures.push("route-lock intent must be documented on the release authority");
}

if (failures.length) {
  console.error("Cologie public Google release audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Cologie Google release contract passed: exact receipt lock, per-pad-only publication, global cutover off, and no route/graph authority mutation.",
);
