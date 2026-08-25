import fs from "node:fs";
import path from "node:path";
import { expectedReferenceSha256, expectedSnapshotId } from "./exact-api-pad-reference-release-lib.mjs";

const repositoryRoot=process.argv[2]??".";
const clientSource=fs.readFileSync(
  path.join(repositoryRoot,"v18","src","data","padReferences.ts"),"utf8",
);
const supabaseUrl=/VITE_SUPABASE_URL \|\| "([^"]+)"/u.exec(clientSource)?.[1];
const publishableKey=/VITE_SUPABASE_PUBLISHABLE_KEY \|\| "([^"]+)"/u.exec(clientSource)?.[1];
if (!supabaseUrl || !publishableKey) {
  throw new Error("V18 public API configuration is unavailable");
}

const expectedCandidateIds=new Set([
  "cf86addd-cbea-4036-ad84-7ab9c6ef8ead",
  "a2a09410-ebe7-41d0-8270-8f627070a58e",
  "51c477b2-d4b0-44c4-8363-ba4b31f4b01e",
  "54268967-e9d8-44f8-93c6-32e19727cad6",
  "864157a4-2d97-4af3-b10b-7022737b53a0",
  "0e01bbf2-0bdb-44d8-bd12-baae1da226f6",
  "c1b95a10-c9ec-499f-ae6c-84430175b9b3",
  "254d4d73-5795-49b6-b89c-333809aac154",
  "133d1688-e886-4d50-a60f-75d71da41487",
  "2f4e6e6e-869b-515a-8259-69ddb5bf70c8",
]);
const response=await fetch(
  `${supabaseUrl}/rest/v1/rpc/brinesearch_v18_pad_reference_coordinates`,
  {
    method:"POST",
    headers:{
      apikey:publishableKey,
      Accept:"application/json",
      "Content-Type":"application/json",
    },
    body:JSON.stringify({p_snapshot_id:expectedSnapshotId}),
    cache:"no-store",
    signal:AbortSignal.timeout(8_000),
  },
);
const payload=await response.json();
const candidateRows=Array.isArray(payload?.rows)
  ? payload.rows.filter((row)=>expectedCandidateIds.has(row?.padId))
  : [];
const evidence={
  httpStatus:response.status,
  topLevelKeys:Object.keys(payload??{}).sort(),
  rowCount:payload?.rowCount??null,
  kindCounts:payload?.kindCounts??null,
  contentSha256:payload?.contentSha256??null,
  candidateCount:candidateRows.length,
  candidateRowKeys:[...new Set(
    candidateRows.flatMap((row)=>Object.keys(row??{})),
  )].sort(),
  candidateKinds:[...new Set(
    candidateRows.map((row)=>row?.referenceKind),
  )].sort(),
  allCoordinatesFinite:candidateRows.every(
    (row)=>Number.isFinite(row?.latitude)&&Number.isFinite(row?.longitude),
  ),
};
console.log(JSON.stringify(evidence));
if (response.status!==200
  || payload?.snapshotId!==expectedSnapshotId
  || payload?.rowCount!==741
  || payload?.kindCounts?.officialPadReference!==64
  || payload?.kindCounts?.officialWellheadReference!==95
  || payload?.kindCounts?.savedPadReference!==582
  || payload?.contentSha256!==expectedReferenceSha256
  || candidateRows.length!==10
  || evidence.candidateRowKeys.join(",")
    !=="latitude,longitude,padId,referenceKind"
  || evidence.candidateKinds.join(",")!=="official_wellhead_reference"
  || !evidence.allCoordinatesFinite) {
  process.exitCode=1;
}
