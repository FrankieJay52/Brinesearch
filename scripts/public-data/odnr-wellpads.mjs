#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOG_Services/WellPads/MapServer/1/query';
const OUT_FIELDS = [
  'OBJECTID','PADAUTO','NewPadID','PadName','PadNumber','PadStatus','PadStatus_desc','PAD_TYPE',
  'Source','Date_Dig','LAT','LONG','CNTY','County','Operator','Permit','Comment','create_date','update_date'
].join(',');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function norm(v) { return String(v ?? '').trim(); }
function operatorNorm(v) { return norm(v).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function stableId(a) { return norm(a.NewPadID) || (a.OBJECTID != null ? `OBJECTID:${a.OBJECTID}` : ''); }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

const offset = Number(arg('offset', '0'));
const limit = Math.min(Math.max(Number(arg('limit', '25')), 1), 250);
const operator = arg('operator');
const status = arg('status');
const out = arg('out');
const timeoutMs = Number(arg('timeout-ms', '20000'));

const where = [];
if (operator) where.push(`upper(Operator) like '%${operator.toUpperCase().replaceAll("'", "''")}%'`);
if (status) where.push(`upper(PadStatus_desc) = '${status.toUpperCase().replaceAll("'", "''")}'`);
const params = new URLSearchParams({
  where: where.length ? where.join(' and ') : '1=1',
  outFields: OUT_FIELDS,
  returnGeometry: 'false',
  resultOffset: String(offset),
  resultRecordCount: String(limit),
  orderByFields: 'OBJECTID',
  f: 'json'
});
const url = `${ENDPOINT}?${params}`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
let response;
try {
  response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'BrineSearch-public-data/1.0' } });
} finally {
  clearTimeout(timer);
}
if (!response.ok) throw new Error(`ODNR HTTP ${response.status} ${response.statusText}`);
const payload = await response.json();
if (payload.error) throw new Error(`ODNR ArcGIS error: ${JSON.stringify(payload.error)}`);

const fetchedAt = new Date().toISOString();
const records = (payload.features ?? []).map(({ attributes: a }) => {
  const normalized = {
    source_record_id: stableId(a),
    entity_type: 'pad',
    state: 'Ohio',
    official_name: norm(a.PadName),
    official_status: norm(a.PadStatus_desc || a.PadStatus),
    operator_raw: norm(a.Operator),
    operator_normalized: operatorNorm(a.Operator),
    county: norm(a.County),
    latitude: a.LAT ?? null,
    longitude: a.LONG ?? null,
    official_pad_id: norm(a.NewPadID),
    pad_number: a.PadNumber ?? null,
    permit_number: a.Permit ?? null,
    pad_type: norm(a.PAD_TYPE),
    source_method: norm(a.Source),
    digitized_date: a.Date_Dig ?? null,
    source_update_date: a.update_date ?? null
  };
  return { source_record_id: normalized.source_record_id, raw_facts: a, normalized_facts: normalized, source_content_hash: hash(normalized) };
}).filter(r => r.source_record_id);

const result = {
  adapter: 'oh_odnr_wellpads',
  agency: 'Ohio Department of Natural Resources - DOGRM',
  endpoint: ENDPOINT,
  query: Object.fromEntries(params),
  fetched_at: fetchedAt,
  offset,
  requested_limit: limit,
  returned: records.length,
  exceeded_transfer_limit: Boolean(payload.exceededTransferLimit),
  next_offset: records.length === limit ? offset + records.length : null,
  records
};
const text = JSON.stringify(result, null, 2);
if (out) await writeFile(out, `${text}\n`, 'utf8');
else process.stdout.write(`${text}\n`);
