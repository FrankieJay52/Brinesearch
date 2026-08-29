import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(scriptDirectory, "fixtures", "ascent-pad-approach-source-20260829.json");
const outputPath = path.join(scriptDirectory, "..", "src", "data", "ascentExistingIdentityNavigationBatch2.json");

const road = (writtenRoadNames, roadId, roadName, routeNumber, latitude, longitude) => ({
  writtenRoadNames,
  roadId,
  roadName,
  routeNumber,
  control: { latitude, longitude },
});

// Controls are bounded points on the already-loaded exact Road Manager
// identities. They shape the phone handoff only. They are not route geometry,
// teal authority, a graph build, or a public Google release.
const specifications = [
  {
    padName: "BLESSED",
    anchor: "OH-9",
    roads: [
      road(["CR-5"], "5f9cf989-1d29-44cb-8424-3fe81e73f51b", "CR-5", "CR-5", 40.035474, -80.892577),
      road(["Garrett Hill Rd"], "f0e0caab-62e5-41ca-bf57-68745c5d05d6", "Garrett Hill Rd", "TR-257", 40.009951, -80.880346),
      road(["Sutton Rd"], "38e4e373-eb08-4cf3-9e93-abe2617146d0", "Sutton Rd", "TR-753", 40.011421512, -80.878924291),
    ],
  },
  {
    padName: "COOK",
    anchor: "OH-149",
    roads: [
      road(["Tar Run Rd"], "a7806f26-25a3-4558-aff8-fd3d75cabb4a", "Tar Run Rd", "TR-723", 40.002767, -80.875883),
      road(["Cumberland Run Rd"], "f73b1bc0-5aed-45c1-a88c-7c1f769f52b9", "Cumberland Run Rd", "TR-289", 40.002044, -80.87509),
    ],
  },
  {
    padName: "LEE",
    anchor: "US-250",
    roads: [
      road(["Lansing Cheermont Rd"], "7cbc3263-4442-4161-9ba3-4e31dd072a7f", "Chermont Rd", "CR-18", 40.091593514, -80.809829547),
      road(["Blaine Cheermont Rd"], "ff1dfe60-ffb2-4aa1-b2ae-8380690d9129", "CR-20", "CR-20", 40.0901548, -80.8114553),
    ],
  },
  {
    padName: "MILLER",
    anchor: "OH-7",
    roads: [
      road(["TR-476"], "c2514f70-7c63-4ce0-a9fb-b618d9a6b467", "TR-476", "TR-476", 40.0102176, -80.763444),
      road(["Brown Hollow Rd"], "69ee4f55-04e3-4cac-add2-6eedf0c769fc", "Brown Hollow Rd", "TR-302", 39.994284114, -80.790444819),
    ],
  },
  {
    padName: "RICHLAND B",
    anchor: "US-40",
    roads: [
      road(["Lloydsville Bannock Rd"], "dc8ecf1f-a026-4607-878b-42ee0dfda5ed", "Lloydsville Bannock Rd", "CR-80", 40.075237, -80.990567),
      road(["Lude Rd"], "9950715b-d6b1-4093-bef5-04c66c1d8763", "Lude Rd", "TR-264", 40.0769, -80.994086),
    ],
  },
  {
    padName: "SIDWELL",
    anchor: "OH-9",
    roads: [
      road(["Unity Church Rd"], "614c27a7-17a3-4828-b4eb-9c6837cc021b", "CR-64", "CR-64", 40.149932, -80.974296),
    ],
  },
  {
    padName: "THREE DADS",
    anchor: "US-40",
    roads: [
      road(["Barton Rd"], "348bc14e-b613-4c72-90e0-cb3290ef186e", "Barton Rd", "CR-4", 40.097864, -80.870567),
    ],
  },
  {
    padName: "VIOLET",
    anchor: "OH-147",
    roads: [
      road(["CR-4"], "348bc14e-b613-4c72-90e0-cb3290ef186e", "Barton Rd", "CR-4", 40.1024833, -80.8453652),
      road(["Mcclainsville Rd"], "a030075b-b40a-4997-92f5-1b6c923da96e", "Mcclainsville Rd", "TR-308", 40.017196218, -80.795470272),
    ],
  },
  {
    padName: "BETTS",
    anchor: "US-22",
    roads: [
      road(["Mc Coy Rd"], "6ce8ec7b-a330-4ba4-9f41-33ae37e888ad", "Mccoy Rd", "CR-82", 40.103146, -81.254728),
    ],
  },
  {
    padName: "COAD",
    anchor: "OH-513",
    roads: [
      road(["Oxford Rd"], "ab828b60-dfdd-4cab-b6e7-5e00453ea3bb", "CR-962", "CR-962", 40.032423, -81.27029),
    ],
  },
  {
    padName: "J BARR J",
    anchor: "OH-513",
    roads: [
      road(["Oxford Rd"], "ab828b60-dfdd-4cab-b6e7-5e00453ea3bb", "CR-962", "CR-962", 40.030336, -81.276968),
    ],
  },
  {
    padName: "MILLER FARMS",
    anchor: "OH-342",
    roads: [
      road(["Martha Rd", "Titus Rd"], "21c40fdf-2d5c-40d2-b96c-1900a7d5581c", "Titus Rd", "CR-878", 40.1926563, -81.366256),
      road(["Slingo Rd"], "68942fed-3a0a-419c-a5f0-af426909314b", "Sligo Rd", "CR-870", 40.185027035, -81.381535076),
      road(["Sugartree Rd"], "f96e1f2b-8470-4ec2-a79f-fa7007d37e40", "CR-84", "CR-84", 40.1761233, -81.3833817),
    ],
  },
  {
    padName: "SLABAUGH",
    anchor: "OH-313",
    roads: [
      road(["Salem Rd"], "bdae3fc7-0497-4994-a048-5b9e6db12140", "Salem Rd", "CR-74", 39.941409, -81.446907),
      road(["Nighthawk Rd"], "3cffea08-d00d-4aac-862d-658b78cf6d72", "Nighthawk Rd", "TR-59", 39.952222, -81.440069),
    ],
  },
  {
    padName: "TARPLEY",
    anchor: "OH-513",
    roads: [
      road(["Bridgewater Rd"], "7732bb51-8498-4b8b-8d93-3f859aae18e1", "Bridgewater Rd", "CR-690", 40.057381, -81.314105),
    ],
  },
  {
    padName: "BSA",
    anchor: "OH-799",
    roads: [
      road(["Redeye Rd"], "f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965", "CR-60", "CR-60", 40.267062, -81.177933),
    ],
  },
  {
    padName: "TARBERT",
    anchor: "US-22",
    roads: [
      road(["Old Piedmont Rd"], "819e5206-1eda-4cc9-bb7b-903c840afbba", "CR-16", "CR-16", 40.209638527, -81.178024734),
      road(["Moore Rd"], "8b4431ba-9cf6-4c43-b088-5b3cd6b9567b", "TR-336", "TR-336", 40.203940521, -81.176868458),
    ],
  },
  {
    padName: "CERMAK",
    anchor: "OH-152",
    roads: [
      road(["CR-11", "Piney Fork Rd"], "c7610083-6ce1-495c-ba46-7da6f84ce003", "Cr 11", "CR-11", 40.2475711, -80.8104457),
    ],
  },
  {
    padName: "COLLINS",
    anchor: "US-22",
    roads: [
      road(["CR-26"], "b33268d1-19e2-4d9f-9d0f-70e96332ef95", "CR-26", "CR-26", 40.342349, -80.813317),
    ],
  },
  {
    padName: "FERGUSON",
    anchor: "OH-150",
    roads: [
      road(["Dry Fork Rd"], "2d36868a-bb33-451e-943f-a146d8db1734", "Cr 8", "CR-8", 40.231849517, -80.782699349),
    ],
    unapprovedTail: "TR-118 and any final lease/access remain unapproved and are not claimed by this hook.",
  },
  {
    padName: "GRISWOLD",
    anchor: "US-22",
    roads: [
      road(["CR-23"], "96ceebd4-0dc3-4bf9-95b1-b83e99933da8", "Cr 23", "CR-23", 40.329162, -80.805422),
    ],
  },
  {
    padName: "GRYWALSKI",
    anchor: "OH-150",
    roads: [
      road(["CR-6"], "5a6fe603-66e1-400b-85d7-ce99da3edbed", "Blairmont Rd", "CR-6", 40.199234358, -80.835523397),
    ],
  },
  {
    padName: "NOELLE",
    anchor: "OH-26",
    roads: [
      road(["CR-33"], "598f7cf0-b64b-4c6d-aafc-61935b5cf60a", "Fernwood Rd", "CR-33", 40.3615878, -80.7120815),
    ],
  },
  {
    padName: "PUGGLE",
    anchor: "US-22",
    roads: [
      road(["CR-23"], "96ceebd4-0dc3-4bf9-95b1-b83e99933da8", "Cr 23", "CR-23", 40.341887, -80.815764),
      road(["CR-26"], "b33268d1-19e2-4d9f-9d0f-70e96332ef95", "CR-26", "CR-26", 40.340191, -80.795637),
    ],
  },
  {
    padName: "BILLY SHERMAN",
    anchor: "OH-147",
    roads: [
      road(["CR-25"], "6fac3299-89f3-4c9c-910c-e0c583c67266", "CR-25", "CR-25", 39.84881, -81.407812),
    ],
  },
  {
    padName: "VAULT",
    anchor: "OH-146",
    roads: [
      road(["Cowgill Rd"], "bc613553-15e3-4888-a79f-1818567b7f78", "Cowgill Rd", "CR-4", 39.822623, -81.406897),
      road(["Donald Franklin Rd"], "9c1f0401-a8ee-4e42-ae5e-0fb8ab941f0d", "Donald Franklin Rd", "TR-215", 39.815439, -81.400421),
    ],
  },
  {
    padName: "VANNELLE",
    anchor: "OH-9",
    roads: [
      // Existing OH-9 endpoint at the visible pad-specific connector. The
      // connector itself is named VANNELLE lease road below and is never
      // registered as a reusable public-road identity.
      road(["OH-9"], "52b08bc7-9b54-4b8d-a833-f903fc298f7b", "OH-9", "OH-9", 40.147784, -80.959671),
    ],
  },
];

const heldPadNames = new Set();

function buildUrl(destination, waypoints) {
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: `${destination.latitude},${destination.longitude}`,
    waypoints: waypoints.map(({ latitude, longitude }) => `${latitude},${longitude}`).join("|"),
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

function routeLabel(entry) {
  const written = entry.writtenRoadNames.join(" + ");
  if (entry.roadName.toLocaleUpperCase() === entry.routeNumber.toLocaleUpperCase()) return written;
  return `${written} / ${entry.routeNumber}`;
}

function uniqueIdentities(roads, county) {
  const identities = new Map();
  for (const entry of roads) {
    identities.set(entry.roadId, {
      roadId: entry.roadId,
      county,
      roadName: entry.roadName,
      routeNumber: entry.routeNumber,
    });
  }
  return [...identities.values()];
}

async function render() {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const sourceByName = new Map(source.records.map((record) => [record.padName, record]));
  assert.equal(specifications.length, 26);
  assert.equal(new Set(specifications.map(({ padName }) => padName)).size, 26);

  const records = specifications.map((specification) => {
    const sourceRecord = sourceByName.get(specification.padName);
    assert.ok(sourceRecord, `Missing source record for ${specification.padName}`);
    assert.equal(sourceRecord.destinationGpsSource, "saved", `${specification.padName} is not saved-GPS bound`);
    assert.equal(sourceRecord.directoryCoordinateRole, "saved pad reference", `${specification.padName} coordinate role drifted`);
    assert.ok(specification.roads.length >= 1 && specification.roads.length <= 3, `${specification.padName} has an invalid control count`);

    for (const entry of specification.roads) {
      const exactSteps = sourceRecord.routePrep.steps.filter((step) => step.roadId === entry.roadId);
      assert.ok(exactSteps.length >= 1, `${specification.padName} lost ${entry.roadId}`);
      assert.ok(exactSteps.every((step) => step.matchStatus === "exact_master"), `${specification.padName} has a non-exact identity`);
      for (const writtenRoadName of entry.writtenRoadNames) {
        assert.ok(exactSteps.some((step) => step.rawText === writtenRoadName), `${specification.padName} lost written road ${writtenRoadName}`);
      }
    }

    const destination = {
      latitude: sourceRecord.destination[1],
      longitude: sourceRecord.destination[0],
    };
    const waypoints = specification.roads.map(({ control }) => control);
    const namedRoads = specification.roads.map(routeLabel);
    const namedRoadsAfterAnchor = namedRoads[0]?.toLocaleUpperCase() === specification.anchor.toLocaleUpperCase()
      ? namedRoads.slice(1)
      : namedRoads;
    const namedRoadCore = [specification.anchor, ...namedRoadsAfterAnchor].join(" → ");
    const leaseRoadName = `${sourceRecord.padName} lease road`;
    const finalTail = specification.unapprovedTail
      ? `${specification.unapprovedTail} The final saved-pin connector is displayed as ${leaseRoadName}.`
      : `The final saved-pin connector is displayed as ${leaseRoadName}.`;

    return {
      padId: sourceRecord.padId,
      canonicalId: sourceRecord.canonicalId,
      legacyId: sourceRecord.legacyId,
      recordRevision: sourceRecord.recordRevision,
      company: sourceRecord.company,
      padName: sourceRecord.padName,
      state: sourceRecord.state,
      county: sourceRecord.county,
      structuredRoadSequence: sourceRecord.structuredRoadSequence,
      title: "Navigate named-road handoff",
      detail: `${namedRoadCore} → ${leaseRoadName} → saved GPS`,
      routeUrl: buildUrl(destination, waypoints),
      reviewedRoadSequence: `${namedRoadCore} → ${leaseRoadName} → saved ${sourceRecord.padName} GPS`,
      roadIdentityHook: uniqueIdentities(specification.roads, sourceRecord.county),
      identitySequence: specification.roads.flatMap((entry) => entry.writtenRoadNames.map((writtenRoadName) => ({
        writtenRoadName,
        roadId: entry.roadId,
      }))),
      finalLegNotice: `This handoff binds only the existing exact ${sourceRecord.county} Road Manager identities in the written/reviewed order to ${sourceRecord.padName}'s exact saved GPS. ${finalTail} That pad-specific lease label is not a public-road identity and cannot be shared with another pad. This creates no new Road Manager identity, State 1 stamp, graph release, production write, or public Google route.`,
      trustedDestination: { ...destination, source: "saved_pad_gps" },
      directoryDestination: {
        gpsSource: "saved",
        coordinateRole: sourceRecord.directoryCoordinateRole,
        ...destination,
      },
      routeDestination: destination,
      waypoints,
    };
  });

  const holds = [...heldPadNames].map((padName) => {
    const sourceRecord = sourceByName.get(padName);
    assert.ok(sourceRecord, `Missing held source record for ${padName}`);
    return {
      padId: sourceRecord.padId,
      legacyId: sourceRecord.legacyId,
      recordRevision: sourceRecord.recordRevision,
      company: sourceRecord.company,
      padName: sourceRecord.padName,
      state: sourceRecord.state,
      county: sourceRecord.county,
      structuredRoadSequence: sourceRecord.structuredRoadSequence,
      directoryDestination: {
        gpsSource: "saved",
        coordinateRole: sourceRecord.directoryCoordinateRole,
        latitude: sourceRecord.destination[1],
        longitude: sourceRecord.destination[0],
      },
      disposition: "GPS_ONLY",
      reason: "Documented Shepherdstown control made Google enter Shepherdstown Road briefly, return to OH-9, and then reach the saved pin. No different ordered control is proved, so the named-road hook remains fail-closed.",
      evidenceSource: "docs/issue97-ascent-reviewed-handoff-batch8-20260828.md",
    };
  });

  return `${JSON.stringify({
    schemaVersion: 1,
    scope: "ascent-existing-road-manager-identity-hooks-batch2",
    authority: "Driver handoff only. Existing exact identities to saved GPS; no road creation, geometry, teal authority, graph build, owner approval, State 1, cutover, or public Google release.",
    sourceFixture: path.basename(sourcePath),
    productionWrites: 0,
    records,
    holds,
  }, null, 2)}\n`;
}

const rendered = await render();
if (process.argv.includes("--write")) {
  await writeFile(outputPath, rendered, "utf8");
} else {
  const current = await readFile(outputPath, "utf8");
  assert.equal(current.replaceAll("\r\n", "\n"), rendered);
}

console.log(JSON.stringify({ records: specifications.length, holds: heldPadNames.size, output: path.relative(path.join(scriptDirectory, ".."), outputPath) }));
