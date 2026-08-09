const SUPABASE_URL = 'https://wvxzqtoiwhrgovzddtvz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd';

const url = new URL(`${SUPABASE_URL}/rest/v1/pads`);
url.searchParams.set('select', 'id,legacy_id,company,state,county,township,pad_name,address,latitude,longitude,well_name,api,property_number,well_entries,extra_data,verification_status,directions_clear_method,updated_at');
url.searchParams.set('company', 'ilike.*expand*');
url.searchParams.set('order', 'state.asc,pad_name.asc');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
let response;
try {
  response = await fetch(url, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}
if (!response.ok) throw new Error(`Expand live audit failed: Supabase returned ${response.status}`);
const rows = await response.json();
if (!Array.isArray(rows) || !rows.length) throw new Error('Expand live audit returned no pads');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const geoLooksCorrupt = (value, maxLength = 80) => {
  const raw = clean(value);
  return Boolean(raw) && (
    raw.length > maxLength ||
    (raw.match(/-/g) || []).length > 6 ||
    (raw.match(/[|;]/g) || []).length > 2 ||
    raw.split(/\s+/).filter(Boolean).length > 10
  );
};
const stateKey = value => clean(value).toLowerCase();
const countBy = values => Object.fromEntries([...values.reduce((m, value) => m.set(value || '(blank)', (m.get(value || '(blank)') || 0) + 1), new Map())].sort((a,b) => String(a[0]).localeCompare(String(b[0]))));

const normalized = rows.map(row => {
  const extra = row.extra_data && typeof row.extra_data === 'object' ? row.extra_data : {};
  const official = extra.official_pad_record && typeof extra.official_pad_record === 'object' ? extra.official_pad_record : {};
  const officialWells = Array.isArray(extra.official_well_records) ? extra.official_well_records : [];
  const apiSummary = extra.api_verification_summary && typeof extra.api_verification_summary === 'object' ? extra.api_verification_summary : {};
  const wellEntries = Array.isArray(row.well_entries) ? row.well_entries : [];
  const countyCorrupt = geoLooksCorrupt(row.county, 60);
  const townshipCorrupt = geoLooksCorrupt(row.township, 80);
  return {
    row,
    official,
    officialWells,
    apiSummary,
    wellEntries,
    countyCorrupt,
    townshipCorrupt,
    officialCounty: clean(official.county),
    officialTownship: clean(official.township),
    officialPadName: clean(official.pad_name),
    officialOperator: clean(official.operator)
  };
});

const summary = {
  total: rows.length,
  states: countBy(rows.map(row => clean(row.state))),
  corrupted_county: normalized.filter(x => x.countyCorrupt).length,
  corrupted_township: normalized.filter(x => x.townshipCorrupt).length,
  missing_county: rows.filter(row => !clean(row.county)).length,
  missing_township: rows.filter(row => !clean(row.township)).length,
  official_pad_record: normalized.filter(x => Object.keys(x.official).length).length,
  official_county_available: normalized.filter(x => x.officialCounty).length,
  official_township_available: normalized.filter(x => x.officialTownship).length,
  official_wells_attached: normalized.filter(x => x.officialWells.length).length,
  no_saved_coordinates: rows.filter(row => row.latitude == null || row.longitude == null).length,
  no_saved_wells: rows.filter(row => !clean(row.well_name) && !(Array.isArray(row.well_entries) && row.well_entries.length)).length,
  no_saved_api: rows.filter(row => !clean(row.api)).length,
  no_property: rows.filter(row => !clean(row.property_number)).length,
  clear_direction_records: rows.filter(row => clean(row.directions_clear_method)).length
};
console.log(`EXPAND_AUDIT_SUMMARY ${JSON.stringify(summary)}`);

for (const x of normalized) {
  const r = x.row;
  const mismatch = clean(r.county) && x.officialCounty && clean(r.county).toLowerCase() !== x.officialCounty.toLowerCase();
  const needs = x.countyCorrupt || x.townshipCorrupt || !clean(r.county) || mismatch || !Object.keys(x.official).length || !x.officialWells.length || !clean(r.api);
  if (!needs) continue;
  console.log(`EXPAND_AUDIT_ROW ${JSON.stringify({
    legacy_id: r.legacy_id,
    pad_name: r.pad_name,
    state: r.state,
    county: r.county,
    county_corrupt: x.countyCorrupt,
    township: r.township,
    township_corrupt: x.townshipCorrupt,
    latitude: r.latitude,
    longitude: r.longitude,
    official_pad_name: x.officialPadName || null,
    official_county: x.officialCounty || null,
    official_township: x.officialTownship || null,
    official_operator: x.officialOperator || null,
    official_well_count: x.officialWells.length,
    saved_well_count: x.wellEntries.length,
    saved_api: clean(r.api) || null,
    api_summary: x.apiSummary,
    verification_status: r.verification_status,
    updated_at: r.updated_at
  })}`);
}
