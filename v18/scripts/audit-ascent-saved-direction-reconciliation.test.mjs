import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASSIFICATIONS,
  READ_ONLY_EXPORT_SQL,
  normalizeExplicitSourceToken,
  reconcileSavedDirectionRow,
  reconcileSavedDirections,
  summarizeReconciliationRows,
} from "./audit-ascent-saved-direction-reconciliation.mjs";

function pad(overrides = {}) {
  return {
    pad_id: "pad-a",
    legacy_id: "ascent--alpha",
    pad_name: "ALPHA",
    company: "Ascent",
    state: "OH",
    county: "Belmont",
    written_directions: "Raw saved directions.",
    directions_clear: "Road sequence reference:\nOH-9 → Maynard Rd\n\nStep-by-step directions:\n1. Start on OH-9.\n2. Turn onto Maynard Rd.",
    structured_road_sequence: "OH-9 → Maynard Rd",
    active_primary_prep: {
      id: "prep-a",
      source_sequence: "OH-9 → Maynard Rd",
      steps: [
        { step_order: 1, raw_text: "Start on OH-9.", step_kind: "state_route", road_id: "road-9", match_status: "exact", match_method: "explicit_highway_master_record", source_details: { matched_from_saved_text: "Start on OH-9." } },
        { step_order: 2, raw_text: "Turn onto Maynard Rd.", step_kind: "county_road", road_id: "road-maynard", match_status: "exact", match_method: "exact_road_manager_name_or_alias", source_details: { matched_from_saved_text: "Turn onto Maynard Rd." } },
      ],
    },
    ...overrides,
  };
}

test("preserves an exact ordered source/prep match", () => {
  const row = reconcileSavedDirectionRow(pad());
  assert.equal(row.sequence_exact_match, true);
  assert.deepEqual(row.saved_roads_or_steps_missing_from_prep, []);
  assert.deepEqual(row.prep_roads_or_steps_not_supported_by_saved_source, []);
  assert.deepEqual(row.exact_road_manager_road_ids_already_attached, ["road-9", "road-maynard"]);
  assert.equal(row.classification, "EXACT_SOURCE_PRESERVED");
});

test("detects a dropped source step", () => {
  const input = pad();
  input.active_primary_prep.source_sequence = "OH-9";
  input.active_primary_prep.steps = input.active_primary_prep.steps.slice(0, 1);
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.classification, "SOURCE_STEP_DROPPED");
  assert.deepEqual(row.saved_roads_or_steps_missing_from_prep, [
    "sequence: Maynard Rd",
    "step: Turn onto Maynard Rd.",
  ]);
});

test("detects a prep-only step", () => {
  const input = pad();
  input.active_primary_prep.source_sequence += " → Black Oak Rd";
  input.active_primary_prep.steps.push({ step_order: 3, raw_text: "Continue on Black Oak Rd.", step_kind: "county_road", road_id: "road-black-oak", match_status: "exact" });
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.classification, "PREP_STEP_NOT_IN_SAVED_SOURCE");
  assert.deepEqual(row.prep_roads_or_steps_not_supported_by_saved_source, [
    "sequence: Black Oak Rd",
  ]);
});

test("detects a pending official road identity", () => {
  const input = pad();
  input.active_primary_prep.steps[1].road_id = null;
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.classification, "ROAD_IDENTITY_PENDING");
  assert.deepEqual(row.steps_needing_official_identity_match, [{ step_order: 2, text: "Turn onto Maynard Rd." }]);
});

test("does not count a road ID with a non-exact status as an exact attachment", () => {
  const input = pad();
  input.active_primary_prep.steps[0].match_status = "no_match";
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.classification, "ROAD_IDENTITY_PENDING");
  assert.deepEqual(row.exact_road_manager_road_ids_already_attached, ["road-maynard"]);
  assert.deepEqual(row.steps_needing_official_identity_match, [{ step_order: 1, text: "Start on OH-9." }]);
});

test("keeps private access private and does not request a road identity", () => {
  const input = pad({
    directions_clear: "Road sequence reference:\nOH-9 → Lease Road\n\nStep-by-step directions:\n1. Start on OH-9.\n2. Continue on Lease Road through Gate to Pad.",
    structured_road_sequence: "OH-9 → Lease Road",
  });
  input.active_primary_prep.source_sequence = "OH-9 → Lease Road";
  input.active_primary_prep.steps[1] = { step_order: 2, raw_text: "Continue on Lease Road through Gate to Pad.", step_kind: "access", road_id: null, match_status: "private", source_details: { matched_from_saved_text: "Continue on Lease Road through Gate to Pad." } };
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.classification, "PRIVATE_ACCESS_PENDING");
  assert.equal(row.private_or_lease_steps.length, 1);
  assert.deepEqual(row.steps_needing_official_identity_match, []);
});

test("never accepts fuzzy or name-only equivalence", () => {
  assert.notEqual(normalizeExplicitSourceToken("Maynard"), normalizeExplicitSourceToken("Maynard Road"));
  const input = pad();
  input.active_primary_prep.source_sequence = "OH-9 → Maynard Road";
  input.active_primary_prep.steps[1].raw_text = "Turn onto Maynard Road.";
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.sequence_exact_match, false);
  assert.equal(row.classification, "SOURCE_STEP_DROPPED");
});

test("never treats a forbidden nearest, fuzzy, or name-only match method as exact", () => {
  const input = pad();
  input.active_primary_prep.steps[1].match_method = "nearest_road";
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.sequence_exact_match, true);
  assert.equal(row.classification, "GENERIC_OR_AMBIGUOUS");
  assert.deepEqual(row.forbidden_match_method_steps, [{
    step_order: 2,
    text: "Turn onto Maynard Rd.",
    match_method: "nearest_road",
  }]);
  assert.match(row.exact_blocker, /forbidden fuzzy\/name-only\/nearest/u);
});

test("never treats semantic similarity or an unknown exact-status method as proof", () => {
  for (const method of ["semantic_similarity", "future_unreviewed_method"]) {
    const input = pad();
    input.active_primary_prep.steps[1].match_method = method;
    const row = reconcileSavedDirectionRow(input);
    assert.equal(row.classification, "GENERIC_OR_AMBIGUOUS");
    assert.deepEqual(row.exact_road_manager_road_ids_already_attached, ["road-9"]);
    if (method === "semantic_similarity") {
      assert.equal(row.forbidden_match_method_steps[0].match_method, method);
    } else {
      assert.deepEqual(row.unresolved_exact_match_method_steps, [{
        step_order: 2,
        text: "Turn onto Maynard Rd.",
        match_method: method,
      }]);
      assert.match(row.exact_blocker, /unreviewed or missing/u);
    }
  }
});

test("never normalizes state-route aliases into equality", () => {
  const input = pad();
  input.active_primary_prep.source_sequence = "SR-9 → Maynard Rd";
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.sequence_exact_match, false);
  assert.equal(row.classification, "SOURCE_STEP_DROPPED");
});

test("reports an exact conflict between directions_clear and structured_road_sequence", () => {
  const row = reconcileSavedDirectionRow(pad({
    structured_road_sequence: "OH-9 → Kagg Hill Rd",
  }));
  assert.equal(row.sequence_exact_match, true);
  assert.equal(row.classification, "GENERIC_OR_AMBIGUOUS");
  assert.deepEqual(row.saved_sequence_source_conflict, {
    directions_clear: "OH-9 → Maynard Rd",
    structured_road_sequence: "OH-9 → Kagg Hill Rd",
  });
  assert.match(row.exact_blocker, /directions_clear and structured_road_sequence disagree/u);
});

test("fails closed on duplicate primaries and road-id status contradictions", () => {
  const input = pad({ active_primary_prep_count: 2 });
  input.active_primary_prep.steps[0].match_status = "needs_official_match";
  const row = reconcileSavedDirectionRow(input);
  assert.match(row.exact_blocker, /duplicate active primary/u);
  assert.match(row.exact_blocker, /road_id\/match_status contradiction/u);
  assert.deepEqual(row.exact_road_manager_road_ids_already_attached, ["road-maynard"]);
  assert.deepEqual(row.steps_needing_official_identity_match, [{ step_order: 1, text: "Start on OH-9." }]);
  assert.deepEqual(row.road_id_match_status_contradictions, ["step 1 road_id/match_status contradiction"]);
  assert.equal(row.classification, "ROAD_IDENTITY_PENDING");
});

test("never classifies duplicate active primary prep records as exact", () => {
  const row = reconcileSavedDirectionRow(pad({ active_primary_prep_count: 2 }));
  assert.equal(row.classification, "ROAD_IDENTITY_PENDING");
  assert.match(row.exact_blocker, /duplicate active primary/u);
});

test("does not classify numbered saved steps as exact without explicit prep reconciliation evidence", () => {
  const input = pad();
  for (const step of input.active_primary_prep.steps) delete step.source_details;
  const row = reconcileSavedDirectionRow(input);
  assert.equal(row.sequence_exact_match, true);
  assert.equal(row.classification, "ROAD_IDENTITY_PENDING");
  assert.match(row.exact_blocker, /lack explicit route-prep reconciliation evidence/u);
});

test("emits deterministic county/name/id order and only allowed classifications", () => {
  const rows = reconcileSavedDirections({
    pads: [
      pad({ pad_id: "z", pad_name: "ZETA", county: "Noble" }),
      pad({ pad_id: "b", pad_name: "BETA", county: "Belmont" }),
      pad({ pad_id: "a", pad_name: "ALPHA", county: "Belmont" }),
      pad({ pad_id: "skip", company: "EOG" }),
    ],
  });
  assert.deepEqual(rows.map((row) => row.pad_id), ["a", "b", "z"]);
  assert.ok(rows.every((row) => CLASSIFICATIONS.includes(row.classification)));
  assert.deepEqual(summarizeReconciliationRows(rows), {
    row_count: 3,
    classifications: {
      EXACT_SOURCE_PRESERVED: 3,
      SOURCE_PRESENT_PREP_MISSING: 0,
      SOURCE_STEP_DROPPED: 0,
      PREP_STEP_NOT_IN_SAVED_SOURCE: 0,
      ROAD_IDENTITY_PENDING: 0,
      GENERIC_OR_AMBIGUOUS: 0,
      PRIVATE_ACCESS_PENDING: 0,
      SOURCE_ONLY_UNSTRUCTURED: 0,
    },
    pads_without_active_primary_prep: 0,
    pads_with_duplicate_active_primary_prep: 0,
    steps_needing_official_identity_match: 0,
    generic_or_ambiguous_steps: 0,
    private_or_lease_steps: 0,
    pads_with_saved_sequence_source_conflict: 0,
    forbidden_match_method_steps: 0,
    unresolved_exact_match_method_steps: 0,
    road_id_match_status_contradictions: 0,
  });
});

test("ships read-only SQL for the exact six-county source export", () => {
  assert.match(READ_ONLY_EXPORT_SQL, /^BEGIN READ ONLY;/u);
  assert.match(READ_ONLY_EXPORT_SQL, /upper\(p\.company\) = 'ASCENT'/u);
  assert.match(READ_ONLY_EXPORT_SQL, /'Belmont','Guernsey','Harrison','Jefferson','Monroe','Noble'/u);
  assert.match(READ_ONLY_EXPORT_SQL, /ROLLBACK;$/u);
  assert.doesNotMatch(READ_ONLY_EXPORT_SQL, /\b(?:insert|update|delete|truncate|alter|create|drop)\b/iu);
});
