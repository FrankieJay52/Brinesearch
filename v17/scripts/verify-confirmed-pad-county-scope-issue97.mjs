import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const correction = read("supabase/migrations/20260811200000_issue97_confirmed_pad_county_scope.sql");

const expected = [
  "OH:ATH","OH:BEL","OH:CAR","OH:COL","OH:COS","OH:GUE","OH:HAS","OH:JEF",
  "OH:MAH","OH:MEG","OH:MOE","OH:MUS","OH:NOB","OH:POR","OH:STA","OH:TRU",
  "OH:TUS","OH:VIN","OH:WAS",
  "PA:ALL","PA:ARM","PA:BEA","PA:BRA","PA:BUT","PA:FAY","PA:GRE","PA:IND",
  "PA:WAS","PA:WES",
  "WV:BRO","WV:DOD","WV:LEW","WV:MAR","WV:MON","WV:MSH","WV:OHI","WV:RIT",
  "WV:TYL","WV:WET"
].sort();

const arrayMatch = correction.match(/v_expected constant text\[\] := array\[([\s\S]*?)\n  \];/);
assert.ok(arrayMatch, "Issue #97 final county invariant array is missing");
const actual = [...arrayMatch[1].matchAll(/'((?:OH|PA|WV):[A-Z]{3})'/g)].map(m => m[1]).sort();
assert.deepEqual(actual, expected, "Issue #97 final active county manifest must be exactly the confirmed 39 counties");
assert.equal(actual.filter(v => v.startsWith("OH:")).length, 19, "Issue #97 must have 19 Ohio counties");
assert.equal(actual.filter(v => v.startsWith("PA:")).length, 10, "Issue #97 must have 10 Pennsylvania counties");
assert.equal(actual.filter(v => v.startsWith("WV:")).length, 10, "Issue #97 must have 10 West Virginia counties");

for (const token of [
  "('OH','MEG','Meigs','39105','MEG','ODOT COUNTY_CD',true)",
  "('OH','VIN','Vinton','39163','VIN','ODOT COUNTY_CD',true)",
  "('WV','LEW','Lewis','54041','21','WVDOT CO_CountyID / Route ID prefix',true)",
  "county_code in ('HOL','LIC')",
  "county_code='HAR'",
  "'oh_odot_tims_road_inventory','oh_ogrip_lbrs_centerlines'",
  "'wv_wvdot_publication_lrs'",
  "'wv_wvdot_street_name_doh'",
  "'wv_wvdot_street_name_sams'",
  "'wv_wvdot_alternate_route_name'",
  "'pa_penndot_state_roads'",
  "'pa_penndot_local_roads'",
  "'pa_penndot_at_grade_intersections'",
  "'pa_allegheny_ng911_centerlines','ALL'",
  "'pa_bradford_ng911_centerlines','BRA'",
  "'pa_butler_centerlines','BUT'",
  "'pa_fayette_ng911_centerlines','FAY'",
  "'pa_indiana_ng911_centerlines','IND'",
  "'pa_washington_ng911_centerlines','WAS'",
  "v_required_scope_count<>114",
  "exactly 114 active blocking source scopes"
]) {
  assert.ok(correction.includes(token), `Issue #97 effective county/source correction missing: ${token}`);
}

for (const forbidden of ["'OH:HOL'", "'OH:LIC'", "'WV:HAR'"]) {
  assert.ok(!arrayMatch[1].includes(forbidden), `Issue #97 removed county leaked into final manifest: ${forbidden}`);
}

assert.match(correction, /where \(state_code='OH' and county_code in \('HOL','LIC'\)\)[\s\S]*or \(state_code='WV' and county_code='HAR'\);/,
  "Issue #97 must disable every source scope for the three removed counties");
assert.match(correction, /d\.source_key in \('oh_odot_tims_road_inventory','oh_ogrip_lbrs_centerlines'\)/,
  "Meigs/Vinton must receive both blocking Ohio authoritative datasets");
assert.ok(correction.includes("d.source_key='us_census_tiger_roads_qa_oh'"),
  "Ohio TIGER QA scope registration is missing");
assert.ok(correction.includes("d.source_key='us_census_tiger_roads_qa_wv'"),
  "West Virginia TIGER QA scope registration is missing");

console.log("Issue #97 confirmed 39-county / 114-source-scope regression passed.");
