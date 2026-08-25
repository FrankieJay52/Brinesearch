import fs from "node:fs";
import path from "node:path";
import {
  expectedReferenceSha256,
  expectedSnapshotId,
} from "./verified-official-pad-reference-release-lib.mjs";

const repositoryRoot=process.argv[2]??".";
const clientSource=fs.readFileSync(
  path.join(repositoryRoot,"v18","src","data","padReferences.ts"),"utf8",
);
const supabaseUrl=/VITE_SUPABASE_URL \|\| "([^"]+)"/u.exec(clientSource)?.[1];
const publishableKey=/VITE_SUPABASE_PUBLISHABLE_KEY \|\| "([^"]+)"/u.exec(clientSource)?.[1];
if (!supabaseUrl || !publishableKey) {
  throw new Error("V18 public API configuration is unavailable");
}

const expectedRows=new Map([
  ["0dc102c5-1640-47bf-9975-736cf684c227",[40.182389,-81.413411]],
  ["4166a215-45bb-4662-82e2-80bb0184703b",[40.099352,-80.984043]],
  ["07b566cd-393e-49f6-9547-676438aefc1a",[40.080894,-80.842001]],
  ["54bbef2d-fc87-4a33-b999-1fec24fc3c62",[40.167109,-80.821194]],
  ["c4ef4511-c391-48af-9e1a-7b70b90e9294",[40.021181,-81.239429]],
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
const targetRows=Array.isArray(payload?.rows)
  ? payload.rows.filter((row)=>expectedRows.has(row?.padId))
  : [];
const rowValuesCorrect=targetRows.every((row)=>{
  const expected=expectedRows.get(row.padId);
  return row.referenceKind==="official_pad_reference"
    && row.latitude===expected[0]
    && row.longitude===expected[1];
});
const evidence={
  httpStatus:response.status,
  topLevelKeys:Object.keys(payload??{}).sort(),
  rowCount:payload?.rowCount??null,
  kindCounts:payload?.kindCounts??null,
  contentSha256:payload?.contentSha256??null,
  targetCount:targetRows.length,
  targetRowKeys:[...new Set(
    targetRows.flatMap((row)=>Object.keys(row??{})),
  )].sort(),
  targetKinds:[...new Set(targetRows.map((row)=>row?.referenceKind))].sort(),
  rowValuesCorrect,
};
console.log(JSON.stringify(evidence));
if (response.status!==200
  || payload?.snapshotId!==expectedSnapshotId
  || payload?.rowCount!==746
  || payload?.kindCounts?.officialPadReference!==69
  || payload?.kindCounts?.officialWellheadReference!==95
  || payload?.kindCounts?.savedPadReference!==582
  || payload?.contentSha256!==expectedReferenceSha256
  || targetRows.length!==5
  || evidence.targetRowKeys.join(",")
    !=="latitude,longitude,padId,referenceKind"
  || evidence.targetKinds.join(",")!=="official_pad_reference"
  || !rowValuesCorrect) {
  process.exitCode=1;
}
