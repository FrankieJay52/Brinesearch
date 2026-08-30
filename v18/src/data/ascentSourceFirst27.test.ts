import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { parseSavedDirectionReference } from "./savedDirectionReference";
import { reviewedNavigationContractRowsForAudit } from "./reviewedNavigationCandidates";

interface SourceFirstRecord {
  padName: string;
  directionsClear: string;
  directionsClearSha256: string;
  cleanedRoadSequence: string;
  currentNavigationState: string;
  tailAuthority: string;
  roadEvidence: Array<{
    roadManagerRoadId: string | null;
    authoritativeIdentityId: string | null;
  }>;
}

interface SourceFirstFixture {
  records: SourceFirstRecord[];
}

const frozenReviewedPadIds = [
  "143f5268-33e4-4598-8101-40220b5cfdc4",
  "59061829-1122-4aae-872d-cf5024310373",
  "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
  "bb351070-6c94-45e5-942f-e155f9e86f7e",
  "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
  "41f0bfc3-7be1-450f-abfc-96dce544547b",
  "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
  "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
  "333598ca-37b3-4b44-9411-a490cc3da672",
  "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
  "58c94af4-32b1-4f80-a278-a5f73688fa23",
  "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
  "71c9c874-5514-46a4-8d91-b105c6734799",
  "ccf7415a-331b-440a-829d-28282a33cde1",
  "1e898176-672d-4174-8878-4aae0aee2128",
  "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
  "b22c557a-950a-4ed7-a65a-f4730b9bc727",
  "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
  "800c877a-6b4f-4a87-a710-b1e00af63c62",
  "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
  "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
  "c10e2066-d6b7-4117-aea9-137dd1237b3a",
  "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
  "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
  "47a0305e-c641-499b-990c-0f7fe83493b8",
  "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
  "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
  "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
  "74032b6e-179d-4672-8720-55ac86cab232",
  "f2f82142-f6d8-4f8d-b440-2ff86f624158",
  "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
  "f80dea77-db11-45f8-b30c-6c6abb85e469",
  "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
  "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
  "475462f4-7e7a-4432-801c-5e513d5e953f",
  "691fb27b-2b35-471d-81fa-9239f6bd4081",
  "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
  "48d810bf-e59f-4314-9efb-8103a818a3bd",
  "8f616827-d7da-4b40-b9c2-49fd5e713822",
  "f2df293f-13a2-401e-96b2-21e71ac63e6a",
  "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
  "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
  "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
  "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
  "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
  "3850e94a-826f-4b6b-a54f-d21d482fca46",
  "952f385d-659a-4f00-80c6-3aff474d5f27",
  "fcbf5085-4ba2-496d-9c20-516e8b52f9bd",
  "c09f4dd1-68f9-46d1-90b3-560240550ecd",
  "be83fc24-5c6a-49cd-88a0-52016ca7b657",
  "fa2d692c-4f3a-4a28-8985-3809c9dbd15d",
  "85d74b99-da49-4a5a-aadf-1ce2b461071c",
] as const;

const fixture = JSON.parse(fs.readFileSync(
  new URL("../../scripts/fixtures/ascent-source-first-27-20260830.json", import.meta.url),
  "utf8",
)) as SourceFirstFixture;

describe("Ascent source-first 27 checkpoint", () => {
  it("parses every directions_clear record without inventing source details", () => {
    expect(fixture.records).toHaveLength(27);
    for (const record of fixture.records) {
      const parsed = parseSavedDirectionReference({ directionsClear: record.directionsClear });
      expect(parsed?.source, record.padName).toBe("directions_clear");
      expect(parsed?.roadSequenceReference, record.padName).toBe(record.cleanedRoadSequence);
      expect(parsed?.orderedSteps.length, record.padName).toBeGreaterThan(0);
      expect(createHash("sha256").update(record.directionsClear, "utf8").digest("hex"), record.padName)
        .toBe(record.directionsClearSha256);
      expect(Object.hasOwn(parsed || {}, "roadId"), record.padName).toBe(false);
      expect(Object.hasOwn(parsed || {}, "geometry"), record.padName).toBe(false);
      expect(record.currentNavigationState, record.padName).toBe("GPS_ONLY");
      expect(record.tailAuthority, record.padName).toBe("neutral_gps_only");
    }
  });

  it("keeps every pre-existing reviewed navigation contract byte-stable", () => {
    const existing = reviewedNavigationContractRowsForAudit();
    expect(existing).toHaveLength(52);
    expect(existing.map((row) => row.padId)).toEqual(frozenReviewedPadIds);
    expect(createHash("sha256").update(JSON.stringify(existing), "utf8").digest("hex"))
      .toBe("1b0626c412c516114766337c3f6eba8b1f5deee1365dddf7b3524e83599c0cbb");
  });
});
