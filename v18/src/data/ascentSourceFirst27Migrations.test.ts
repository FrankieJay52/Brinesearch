import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) => fs.readFileSync(
  new URL(`../../../supabase/migrations/${name}`, import.meta.url),
  "utf8",
);

const bella = migration("20260830083409_ascent_source_first_bella_airport_identity.sql");
const howell = migration("20260830083415_ascent_source_first_howell_occurrence_checkpoint.sql");

const normalizedSha256 = (value: string) => createHash("sha256")
  .update(value.replace(/\r\n?/gu, "\n"), "utf8")
  .digest("hex");

function mutationTargets(sql: string) {
  const withoutComments = sql.replace(/--.*$/gmu, "");
  return Array.from(withoutComments.matchAll(
    /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+([a-z0-9_.]+)/giu,
  ), (match) => match[1].toLowerCase());
}

describe("Ascent source-first 27 unapplied migrations", () => {
  it("limits BELLA to exact identity adoption and one route-step binding", () => {
    expect(new Set(mutationTargets(bella))).toEqual(new Set([
      "public.brinesearch_roads",
      "public.brinesearch_road_identity_mappings",
      "public.brinesearch_route_prep_steps",
    ]));
    for (const exactValue of [
      "807ccb15-6f57-4c7a-978d-ab02e7a7c4ba",
      "1786265812046205",
      "d67652f025e8812afdddbb879709a313646c2d792419d9c7db00fbfa431f90ef",
      "0116d6cb-5283-4602-8008-9a594c4dfe10",
      "5e78e286-52af-c0e0-904c-4333b603a6c3",
      "OH:ODOT:NLF:CHASCR00038**C:COMP:2025_000000000025902",
      "6eb2d5b0-fc1e-1440-6ea5-c35aabdaf549",
      "8a0accae-9fc2-edf3-ae72-9f38b35116a3",
      "a04480431efc706caca01e45e2789109",
    ]) expect(bella).toContain(exactValue);
    expect(bella).toContain("geometry_status = 'not_started'");
    expect(bella).toContain("'teal_authority', false");
    expect(bella).toContain("'public_google_publication', false");
    expect(bella).toContain("'active_graphs_require_rebuild', true");
    expect(bella).not.toMatch(/brinesearch_issue97_(?:build|activate|publish|release)/iu);
  });

  it("keeps HOWELL in a private non-authority checkpoint", () => {
    expect(new Set(mutationTargets(howell))).toEqual(new Set([
      "private_verification.brinesearch_ascent_source_first_occurrence_checkpoints",
    ]));
    for (const exactValue of [
      "2805772b-58c9-4a41-9c75-de5355f2904a",
      "1787459253071652",
      "e80e04aedff72cf747b135e5a5257e80a712336c4dc9381558a044793738e95c",
      "49721799afd338786209f6ea57ccc13c96e347a03c6c18de4bee56b040c6c3cd",
      "c9bac3a2-82d4-4b76-813c-6a29c1bf062a",
      "97666182-8756-75b9-ea1a-b6d63b8930ef",
      "5f08c51a-14d6-f472-57ef-99f9a264c510",
      "e7e27927-4586-1ba7-7d4c-1e41476c9459",
      "41f2ac39cb99f4466c4dd8f95b30446b",
      "source_first_checkpoint_only",
      "legacy_structured_road_sequence",
      "neutral_gps_only",
      "GPS_ONLY",
    ]) expect(howell).toContain(exactValue);
    expect(howell).toContain("baseline_receipt_proves_cleaned_order = false");
    expect(howell).toContain("'baseline_graph_receipt_proves_cleaned_order', false");
    expect(howell).toContain("'formal_occurrence_receipt_created', false");
    expect(howell).toContain("'formal_transition_receipt_created', false");
    expect(howell).toContain("'promotion_requires_source_first_route_prep', true");
    expect(howell).not.toMatch(/brinesearch_issue97_(?:build|activate|publish|release)/iu);
  });

  it("contains no migration-time map geometry or Google handoff payload", () => {
    for (const sql of [bella, howell]) {
      expect(sql).not.toContain('"type":"LineString"');
      expect(sql).not.toContain("https://www.google.com/maps/dir/");
      expect(sql).not.toMatch(/\b(?:insert\s+into|update|delete\s+from)\s+public\.pads\b/iu);
      expect(sql).not.toMatch(/\b(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_/iu);
      expect(sql).not.toMatch(/\b(?:insert\s+into|update|delete\s+from)\s+private_verification\.brinesearch_route_(?:occurrence|transition)/iu);
    }
  });

  it("pins migration bytes for the source-first package", () => {
    expect(normalizedSha256(bella)).toBe(
      "9c53f20bcd5204b2a8d160bcdf54f3f9dbf1eb7f22c97241f2153a153d58ef5d",
    );
    expect(normalizedSha256(howell)).toBe(
      "dd1383cae3d98028da365bc4406f6b1161fc4b7e2a840d8d9db2838a0a78bc75",
    );
  });
});
