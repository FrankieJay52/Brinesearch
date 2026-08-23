import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDirectorySnapshot } from "./directory";
import { loadPadStatus } from "./status";
import type { PadSummary } from "./types";

const padId = "333598ca-37b3-4b44-9411-a490cc3da672";
const snapshotId = "11111111-1111-4111-8111-111111111111";
const routeSequence = "I-70 → Exit 213 → OH-331 → Lafferty-Bannock Rd / CR-10 → Lease Road";
const reviewedDirections = [
  "Road sequence reference:",
  routeSequence,
  "",
  "Step-by-step directions:",
  "1. From I-70, take Exit 213 for OH-331 toward Flushing.",
  "2. Head north on OH-331. Continue approximately 2.5 miles.",
  "3. Turn left onto Lafferty-Bannock Rd / CR-10. Continue 1.6 miles.",
  "4. Continue to the Bannock lease road.",
].join("\n");

function directoryResponse() {
  return new Response(JSON.stringify({
    schemaVersion: 1,
    snapshot: {
      snapshotId,
      sourceRevision: "7",
      generatedAt: "2026-08-23T00:00:00Z",
      publishedAt: "2026-08-23T00:00:00Z",
      publicationState: "current",
      retainedUntil: null,
      rowCount: 1,
      searchableCount: 1,
      typeCounts: { pad: 1, disposal: 0, other: 0 },
      coordinateCounts: { verifiedDriverEntrance: 1, missingDriverEntrance: 0, heldDriverEntrance: 0 },
      identityEventCount: 0,
      contentSha256: "a".repeat(64),
    },
    page: { afterOrdinal: 0, nextAfterOrdinal: 1, rowCount: 1, complete: true },
    rows: [{
      ordinal: 1,
      padId,
      recordRevision: "1786744183028038",
      legacyId: "ascent--bannock",
      recordType: "pad",
      company: "Ascent",
      padName: "BANNOCK",
      state: "Ohio",
      county: "Belmont",
      township: "UNION",
      address: "43811 Lafferty Road, Lafferty, OH 43951",
      structuredRoadSequence: routeSequence,
      driverEntrance: {
        role: "driver_entrance",
        qualityState: "validated",
        latitude: 40.111003,
        longitude: -81.002932,
      },
      coordinateState: "verified",
      aliases: ["ascent--bannock"],
      wellNames: [],
      apis: [],
      propertyNumbers: [],
      safeRoadTerms: ["Lafferty-Bannock Rd / CR-10"],
      verificationState: "official_pad_verified",
      operatingState: "ACTIVE",
      updatedAt: "2026-08-14T21:49:43.028038Z",
    }],
    identityState: [],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function pad(): PadSummary {
  return {
    padId,
    canonicalId: padId,
    legacyId: "ascent--bannock",
    aliases: ["ascent--bannock"],
    recordNumber: 1,
    recordRevision: "1786744183028038",
    recordType: "pad",
    company: "Ascent",
    padName: "BANNOCK",
    state: "Ohio",
    county: "Belmont",
    township: "UNION",
    address: "43811 Lafferty Road, Lafferty, OH 43951",
    coordinate: { latitude: 40.111003, longitude: -81.002932, role: "driver_entrance" },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: ["Lafferty-Bannock Rd / CR-10"],
    structuredRoadSequence: routeSequence,
    writtenDirections: "",
    verificationStatus: "official_pad_verified",
    operatingStatus: "ACTIVE",
    updatedAt: "2026-08-14T21:49:43.028038Z",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("V18 reviewed saved-directions contract", () => {
  it("preserves the camelCase road sequence returned by the live directory RPC", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directoryResponse()));

    const snapshot = await loadDirectorySnapshot();

    expect(snapshot.sourceState).toBe("live_current");
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].structuredRoadSequence).toBe(routeSequence);
  });

  it("shows reviewed directions without opening route, graph, or Google authority", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      padId,
      recordRevision: "1786744183028038",
      statusRevision: "fixture-status-r1",
      route: {
        state: "held",
        source: "legacy_written",
        steps: [],
        geometry: null,
        writtenDirections: reviewedDirections,
        lastVerifiedAt: null,
      },
      graph: {
        state: "held",
        county: null,
        counties: [],
        graphCount: 0,
        publicSource: null,
        lastVerifiedAt: null,
      },
      google: {
        publicState: "held",
        safeReason: "public_route_or_graph_authority_held",
      },
      destination: {
        available: true,
        role: "driver_entrance",
        latitude: 40.111003,
        longitude: -81.002932,
      },
    }]), { status: 200, headers: { "Content-Type": "application/json" } })));

    const status = await loadPadStatus(pad(), "live_current");

    expect(status.route).toMatchObject({
      state: "held",
      source: "legacy_written",
      geometry: null,
      writtenDirections: reviewedDirections,
    });
    expect(status.routeSteps).toEqual([]);
    expect(status.graph.state).toBe("held");
    expect(status.google).toEqual({
      publicState: "held",
      routeUrl: null,
      safeReason: "public_route_or_graph_authority_held",
    });
    expect(status.googleRouteChunks).toEqual([]);
  });

  it("pins the forward-only SQL contract to the reviewed public projection", () => {
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20260823063000_v18_public_saved_directions_contract.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("from public.brinesearch_driver_directions_public directions");
    expect(migration).toContain("v_has_legacy_directions:=");
    expect(migration).toContain("'writtenDirections',case");
    expect(migration).toContain("when v_route_source='legacy_written'");
    expect(migration).toContain("and v_route_state in ('written_only','held','stale')");
    expect(migration).toContain("grant execute on function public.brinesearch_v18_driver_pad_status(uuid)");
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\s+(into|from|public\.)/i);
  });
});
