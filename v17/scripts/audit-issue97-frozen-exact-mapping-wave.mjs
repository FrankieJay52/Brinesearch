import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  'supabase/migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
  'utf8',
);
const routeManifest = fs.readFileSync(
  'ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql',
  'utf8',
);
const rehearsal = fs.readFileSync(
  'supabase/tests/issue97_frozen_exact_mapping_wave.sql',
  'utf8',
);
const syntheticRegression = fs.readFileSync(
  'supabase/tests/issue97_road_junction_graph_synthetic.sql',
  'utf8',
);
const stripSqlComments = (source) => {
  let result = '';
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  while (index < source.length) {
    if (lineComment) {
      if (source[index] === '\r' || source[index] === '\n') {
        lineComment = false;
        result += source[index];
      } else result += ' ';
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (source.startsWith('/*', index)) {
        blockCommentDepth += 1;
        result += '  ';
        index += 2;
      } else if (source.startsWith('*/', index)) {
        blockCommentDepth -= 1;
        result += '  ';
        index += 2;
      } else {
        result += source[index] === '\r' || source[index] === '\n'
          ? source[index] : ' ';
        index += 1;
      }
      continue;
    }
    if (singleQuoted || doubleQuoted) {
      const quote = singleQuoted ? "'" : '"';
      result += source[index];
      if (source[index] === quote) {
        if (source[index + 1] === quote) {
          result += source[index + 1];
          index += 2;
        } else {
          singleQuoted = false;
          doubleQuoted = false;
          index += 1;
        }
      } else index += 1;
      continue;
    }
    if (source.startsWith('--', index)) {
      lineComment = true;
      result += '  ';
      index += 2;
      continue;
    }
    if (source.startsWith('/*', index)) {
      blockCommentDepth = 1;
      result += '  ';
      index += 2;
      continue;
    }
    if (source[index] === "'") {
      singleQuoted = true;
      result += source[index];
      index += 1;
      continue;
    }
    if (source[index] === '"') {
      doubleQuoted = true;
      result += source[index];
      index += 1;
      continue;
    }
    if (source[index] === '$') {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const dollarTag = match[0];
        const bodyStart = index + dollarTag.length;
        const bodyEnd = source.indexOf(dollarTag, bodyStart);
        if (bodyEnd >= 0) {
          result += dollarTag;
          result += stripSqlComments(source.slice(bodyStart, bodyEnd));
          result += dollarTag;
          index = bodyEnd + dollarTag.length;
          continue;
        }
      }
    }
    result += source[index];
    index += 1;
  }
  return result;
};
const splitTopLevelSqlStatements = (source) => {
  const statements = [];
  let start = 0;
  let index = 0;
  let singleQuoted = false;
  let dollarTag = null;
  while (index < source.length) {
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = null;
      } else {
        index += 1;
      }
      continue;
    }
    if (singleQuoted) {
      if (source[index] === "'") {
        if (source[index + 1] === "'") index += 2;
        else {
          singleQuoted = false;
          index += 1;
        }
      } else index += 1;
      continue;
    }
    if (source[index] === "'") {
      singleQuoted = true;
      index += 1;
      continue;
    }
    if (source[index] === '$') {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        index += dollarTag.length;
        continue;
      }
    }
    if (source[index] === ';') {
      statements.push(source.slice(start, index + 1));
      start = index + 1;
    }
    index += 1;
  }
  if (source.slice(start).trim()) statements.push(source.slice(start));
  return statements;
};
const normalizeTopLevelStatement = (statement) => statement
  .replace(/^\s*(?:\\[^\r\n]*[\r\n]+\s*)*/, '')
  .replace(/\s+/g, ' ')
  .trim();
const executableRehearsal = stripSqlComments(rehearsal);
const executableSyntheticRegression = stripSqlComments(syntheticRegression);

const requireText = (source, token, label = token) => {
  if (!source.includes(token)) throw new Error(`Missing Issue #97 mapping-wave contract: ${label}`);
};
const forbid = (source, pattern, label) => {
  if (pattern.test(source)) throw new Error(`Forbidden Issue #97 mapping-wave behavior: ${label}`);
};
const forbidFailClosedNeutralizers = (source, label) => {
  forbid(
    source,
    /\b(?:if|where|having|on)\s+(?:false\b|true\s+or\b|1\s*=\s*0\b)|\(\s*false\s+and\b|\band\s+(?:false|1\s*=\s*0)\s*(?:then|\)|;)|\band\s*\(\s*false\s*\)|\bor\s+true\s*(?:then|\)|;)|\bor\s*\(\s*true\s*\)|\bor\s+false\s+or\b|\b1\s*=\s*1\b|\bif\s+(?:case\b|coalesce\s*\(\s*true\b)/i,
    `${label} contains a fail-closed predicate neutralizer`,
  );
};
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

const targetBlock = migration.match(
  /insert into tmp_issue97_frozen_mapping_targets values([\s\S]*?);\s*select pg_catalog\.pg_advisory_xact_lock/,
)?.[1];
if (!targetBlock) throw new Error('Could not parse the frozen mapping target block');

const targetPattern = /\('([0-9a-f-]{36})','([0-9a-f-]{36})','(exact_route_designation|exact_base_nlf_source_street_core)','([0-9a-f]{32})','([0-9a-f]{32})'\)/g;
const targets = [...targetBlock.matchAll(targetPattern)].map((match) => ({
  identity: match[1], road: match[2], basis: match[3],
}));
const identities = [...new Set(targets.map(({ identity }) => identity))].sort();
const roads = [...new Set(targets.map(({ road }) => road))].sort();
if (targets.length !== 46 || identities.length !== 46 || roads.length !== 37) {
  throw new Error(`Frozen mapping cardinality drifted: ${targets.length}/${identities.length}/${roads.length}`);
}
if (targets.filter(({ basis }) => basis === 'exact_route_designation').length !== 28
    || targets.filter(({ basis }) => basis === 'exact_base_nlf_source_street_core').length !== 18) {
  throw new Error('Frozen mapping evidence-basis split drifted');
}
if (md5(identities.join('|')) !== '492ff9967d8a822d10c8d5003cd018a6'
    || md5(roads.join('|')) !== 'e512c45fa202ccf48df1ac272246ce94'
    || md5(targets.sort((a, b) => a.identity.localeCompare(b.identity))
      .map(({ identity, road }) => `${identity}:${road}`).join('|')) !== '0a0f29f2c40f1d1265b498f77ab56dd7') {
  throw new Error('Frozen mapping allowlist digest drifted');
}

const refreshContractJson = migration.match(
  /\$issue97_frozen_mapping_refresh_contract_rows\$\s*([\s\S]*?)\s*\$issue97_frozen_mapping_refresh_contract_rows\$::jsonb/,
)?.[1];
if (!refreshContractJson) {
  throw new Error('Could not parse the complete Ohio mapping-refresh contract rows');
}
const normalizedMigrationForContract = migration.replace(/\s+/g, ' ');
const refreshContractTableStart = normalizedMigrationForContract.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_refresh_contract(',
);
const refreshContractTableEnd = normalizedMigrationForContract.indexOf(
  ') on commit drop;',
  refreshContractTableStart,
) + ') on commit drop;'.length;
const exactRefreshContractTable = "create temporary table tmp_issue97_frozen_mapping_refresh_contract( county_code text not null, identity_id uuid primary key, source_identity_key text not null unique, prior_road_id uuid, road_id uuid not null, prior_mapping_status text, final_mapping_status text not null, prior_mapping_method text, final_mapping_method text not null, exact_candidate_count integer not null, ambiguity_flag boolean not null, refresh_scope text not null, evidence_source jsonb not null, reviewed_identity_46 boolean not null, prior_road_reviewed_37 boolean not null, final_road_reviewed_37 boolean not null, old_active_membership_occurrence_count bigint not null, raw_transition_class text not null check( raw_transition_class in ('NULL_TO_NONNULL','UNCHANGED_OR_INVALID') ) ) on commit drop;";
if (refreshContractTableStart < 0 || refreshContractTableEnd < 0
    || normalizedMigrationForContract.slice(
      refreshContractTableStart,
      refreshContractTableEnd,
    ) !== exactRefreshContractTable) {
  throw new Error('Complete Ohio mapping-refresh relational schema drifted');
}
const refreshContract = JSON.parse(refreshContractJson);
const refreshContractKeys = [
  'county_code',
  'identity_id',
  'source_identity_key',
  'prior_road_id',
  'road_id',
  'prior_mapping_status',
  'final_mapping_status',
  'prior_mapping_method',
  'final_mapping_method',
  'exact_candidate_count',
  'ambiguity_flag',
  'refresh_scope',
  'evidence_source',
  'reviewed_identity_46',
  'prior_road_reviewed_37',
  'final_road_reviewed_37',
  'old_active_membership_occurrence_count',
  'raw_transition_class',
];
const byteCompare = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const compareNullable = (left, right) => {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return byteCompare(left, right);
};
const sortRefreshContract = (rows) => [...rows].sort((left, right) => (
  byteCompare(left.county_code, right.county_code)
  || byteCompare(left.identity_id, right.identity_id)
  || byteCompare(left.road_id, right.road_id)
));
if (!Array.isArray(refreshContract)
    || refreshContract.some((row) => (
      JSON.stringify(Object.keys(row)) !== JSON.stringify(refreshContractKeys)
    ))
    || JSON.stringify(refreshContract) !== JSON.stringify(sortRefreshContract(refreshContract))) {
  throw new Error('Complete Ohio mapping-refresh row schema or ordering drifted');
}

const routeIdentityPattern = /^OH:ODOT:NLF:[SCT]([A-Z]{3})(SR|US|CR|TR)([0-9]{5})\*\*[A-Z](?::COMP:.+)?$/;
const routeClassBySystem = new Map([
  ['SR', 'state_route'],
  ['US', 'us_route'],
  ['CR', 'county'],
  ['TR', 'township'],
]);
const rawTransitionForContract = (row) => {
  const route = row.source_identity_key.match(routeIdentityPattern);
  if (!route || route[1] !== row.county_code) {
    throw new Error(`Complete mapping-refresh source identity key drifted: ${row.identity_id}`);
  }
  const routeNumber = String(Number(route[3]));
  return {
    road_class: routeClassBySystem.get(route[2]),
    county_code: row.county_code,
    identity_id: row.identity_id,
    new_road_id: row.road_id,
    route_number: routeNumber,
    route_suffix: null,
    route_system: route[2],
    prior_road_id: row.prior_road_id,
    refresh_scope: row.refresh_scope,
    ambiguity_flag: row.ambiguity_flag,
    route_fraction: null,
    route_extension: null,
    transition_class: row.raw_transition_class,
    new_mapping_method: row.final_mapping_method,
    new_mapping_status: row.final_mapping_status,
    source_identity_key: row.source_identity_key,
    prior_mapping_method: row.prior_mapping_method,
    prior_mapping_status: row.prior_mapping_status,
    exact_candidate_count: row.exact_candidate_count,
    new_road_source_method: row.final_road_reviewed_37
      ? 'issue97_frozen_exact_mapping_wave'
      : 'issue97_harrison_exact_authoritative_identity_repair',
    active_machine_mapping_rows: 1,
    designation_evidence_source: row.evidence_source,
    new_road_verification_status: 'verified',
    post_machine_mapping_methods: [row.final_mapping_method],
    frozen_target_evidence_family: row.final_road_reviewed_37
      ? 'exact_route_designation'
      : 'not_in_frozen_37',
    identity_is_among_reviewed_46: row.reviewed_identity_46,
    new_road_is_among_reviewed_37: row.final_road_reviewed_37,
    post_machine_mapping_statuses: [row.final_mapping_status],
    prior_road_is_among_reviewed_37: row.prior_road_reviewed_37,
    verified_road_resolution_changed: row.prior_road_id !== row.road_id,
    old_active_graph_membership_occurrence_count:
      row.old_active_membership_occurrence_count,
  };
};
const jsonbKeyCompare = (left, right) => (
  Buffer.byteLength(left) - Buffer.byteLength(right) || byteCompare(left, right)
);
const jsonbText = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  return `{${Object.keys(value).sort(jsonbKeyCompare)
    .map((key) => `${JSON.stringify(key)}: ${jsonbText(value[key])}`).join(', ')}}`;
};

const refreshIdentities = refreshContract.map((row) => row.identity_id).sort(byteCompare);
const refreshRoads = [...new Set(refreshContract.map((row) => row.road_id))].sort(byteCompare);
const roadResolutions = refreshContract.filter(
  (row) => row.raw_transition_class === 'NULL_TO_NONNULL',
);
const sameRoadUpgrades = refreshContract.filter(
  (row) => row.raw_transition_class === 'UNCHANGED_OR_INVALID',
);
const expectedCountyContract = new Map([
  ['BEL', [5, 5, 0, 263, 263, 0]],
  ['CAR', [2, 2, 0, 4, 4, 0]],
  ['COL', [9, 9, 0, 199, 199, 0]],
  ['GUE', [4, 4, 0, 48, 48, 0]],
  ['HAS', [8, 1, 7, 63, 3, 60]],
  ['JEF', [5, 5, 0, 240, 240, 0]],
  ['MOE', [3, 3, 0, 86, 86, 0]],
  ['NOB', [6, 6, 0, 223, 223, 0]],
]);
for (const [county, expected] of expectedCountyContract) {
  const rows = refreshContract.filter((row) => row.county_code === county);
  const resolutions = rows.filter((row) => row.raw_transition_class === 'NULL_TO_NONNULL');
  const upgrades = rows.filter((row) => row.raw_transition_class === 'UNCHANGED_OR_INVALID');
  const actual = [
    rows.length,
    resolutions.length,
    upgrades.length,
    rows.reduce((sum, row) => sum + row.old_active_membership_occurrence_count, 0),
    resolutions.reduce((sum, row) => sum + row.old_active_membership_occurrence_count, 0),
    upgrades.reduce((sum, row) => sum + row.old_active_membership_occurrence_count, 0),
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Complete mapping-refresh ${county} contract drifted`);
  }
}
if (refreshContract.length !== 42
    || refreshIdentities.length !== new Set(refreshIdentities).size
    || refreshRoads.length !== 23
    || roadResolutions.length !== 35
    || sameRoadUpgrades.length !== 7
    || refreshContract.filter((row) => row.final_mapping_method === 'exact_route_designation').length !== 34
    || refreshContract.filter((row) => row.final_mapping_method === 'exact_source_record_id').length !== 8
    || refreshContract.reduce(
      (sum, row) => sum + row.old_active_membership_occurrence_count,
      0,
    ) !== 1126
    || roadResolutions.reduce(
      (sum, row) => sum + row.old_active_membership_occurrence_count,
      0,
    ) !== 1066
    || sameRoadUpgrades.reduce(
      (sum, row) => sum + row.old_active_membership_occurrence_count,
      0,
    ) !== 60
    || refreshContract.some((row) => row.reviewed_identity_46)
    || refreshContract.filter((row) => row.final_road_reviewed_37).length !== 34
    || refreshContract.filter((row) => !row.final_road_reviewed_37).length !== 8
    || roadResolutions.filter((row) => row.final_road_reviewed_37).length !== 34
    || roadResolutions.filter((row) => !row.final_road_reviewed_37).length !== 1
    || refreshContract.some((row) => row.prior_road_reviewed_37)
    || refreshContract.some((row) => row.final_mapping_status !== 'verified'
    || row.exact_candidate_count !== 1 || row.ambiguity_flag
    || row.refresh_scope !== `OH:${row.county_code}`)
    || roadResolutions.some((row) => row.prior_road_id !== null
      || row.prior_mapping_status !== null || row.prior_mapping_method !== null)
    || sameRoadUpgrades.some((row) => row.prior_road_id !== row.road_id
      || row.prior_mapping_status !== 'verified'
      || row.prior_mapping_method !== 'exact_route_designation'
      || row.final_mapping_method !== 'exact_source_record_id')
    || refreshContract.some((row) => (
      row.final_mapping_method === 'exact_route_designation'
        ? JSON.stringify(row.evidence_source)
          !== JSON.stringify({ designation_source: 'identity_exact_components' })
        : JSON.stringify(Object.keys(row.evidence_source))
          !== JSON.stringify(['road_source_record_id'])
    ))) {
  throw new Error('Complete Ohio mapping-refresh semantic contract drifted');
}
const harrisonTransition = refreshContract.filter((row) => (
  row.county_code === 'HAS'
  && row.identity_id === 'dbcc9da8-07cb-f054-68ca-debe2f8640fc'
  && row.road_id === 'c1eefe49-fe29-44fa-84b7-2cfe29180761'
  && row.source_identity_key === 'OH:ODOT:NLF:THASTR00225**C'
  && row.final_mapping_method === 'exact_source_record_id'
  && row.evidence_source.road_source_record_id === 'THASTR00225**C|route:TR:225'
  && row.old_active_membership_occurrence_count === 3
  && row.raw_transition_class === 'NULL_TO_NONNULL'
  && !row.final_road_reviewed_37
));
if (harrisonTransition.length !== 1) {
  throw new Error('Harrison outside-37 exact-source-record transition drifted');
}
const rawTransitions = refreshContract.map(rawTransitionForContract).sort((left, right) => (
  byteCompare(left.county_code, right.county_code)
  || byteCompare(left.identity_id, right.identity_id)
  || compareNullable(left.prior_road_id, right.prior_road_id)
  || compareNullable(left.new_road_id, right.new_road_id)
));
if (md5(refreshIdentities.join(',')) !== '043d969160dded7b9ff3526b6b09b752'
    || md5(refreshRoads.join(',')) !== 'fd835556c06d4b067ca01ff8329a5d1c'
    || md5([...refreshContract].sort((left, right) => (
      byteCompare(left.identity_id, right.identity_id)
      || byteCompare(left.road_id, right.road_id)
    ))
      .map((row) => `${row.identity_id}|${row.road_id}`).join(','))
      !== 'cf20cef7b1f18ea57afbfee9a6f5202e'
    || md5(rawTransitions.map(jsonbText).join('|'))
      !== '0b89d8b7f7969a95b6d94f270cd81ccc') {
  throw new Error('Complete Ohio mapping-refresh digest drifted');
}

const refreshContractGuard = migration.match(
  /if \(select count\(\*\) from tmp_issue97_frozen_mapping_refresh_contract\)<>42[\s\S]*?raise exception\s*'Issue #97 complete Ohio mapping-refresh contract drifted';\s*end if;/,
)?.[0];
if (!refreshContractGuard) {
  throw new Error('Could not parse the complete Ohio mapping-refresh guard');
}
const normalizedRefreshContractGuard = refreshContractGuard.replace(/\s+/g, ' ');
for (const token of [
  '(select count(*) from tmp_issue97_frozen_mapping_refresh_contract)<>42',
  '(select count(distinct identity_id) from tmp_issue97_frozen_mapping_refresh_contract)<>42',
  '(select count(distinct road_id) from tmp_issue97_frozen_mapping_refresh_contract)<>23',
  "where raw_transition_class='NULL_TO_NONNULL')<>35",
  "where raw_transition_class='UNCHANGED_OR_INVALID')<>7",
  "then 'SAME_ROAD_METHOD_UPGRADE' else contract.raw_transition_class end='SAME_ROAD_METHOD_UPGRADE')<>7",
  "where final_mapping_method='exact_route_designation')<>34",
  "where final_mapping_method='exact_source_record_id')<>8",
  'from tmp_issue97_frozen_mapping_refresh_contract)<>1126',
  "where raw_transition_class='NULL_TO_NONNULL')<>1066",
  "where raw_transition_class='UNCHANGED_OR_INVALID')<>60",
  "contract.prior_mapping_method='exact_route_designation'",
  "contract.final_mapping_method='exact_source_record_id'",
  "contract.final_mapping_method='exact_route_designation'",
  "'designation_source','identity_exact_components'",
  "'road_source_record_id'",
  "('BEL',5,5,0,263,263,0)",
  "('CAR',2,2,0,4,4,0)",
  "('COL',9,9,0,199,199,0)",
  "('GUE',4,4,0,48,48,0)",
  "('HAS',8,1,7,63,3,60)",
  "('JEF',5,5,0,240,240,0)",
  "('MOE',3,3,0,86,86,0)",
  "('NOB',6,6,0,223,223,0)",
  "<>'043d969160dded7b9ff3526b6b09b752'",
  "<>'fd835556c06d4b067ca01ff8329a5d1c'",
  "<>'cf20cef7b1f18ea57afbfee9a6f5202e'",
  "<>'0b89d8b7f7969a95b6d94f270cd81ccc'",
]) {
  requireText(
    normalizedRefreshContractGuard,
    token,
    `complete mapping-refresh guard: ${token}`,
  );
}

const refreshPrestateGuard = migration.match(
  /if exists\(\s*select 1\s*from tmp_issue97_frozen_mapping_refresh_contract contract[\s\S]*?raise exception\s*'Issue #97 complete Ohio mapping-refresh prestate drifted';\s*end if;/,
)?.[0];
if (!refreshPrestateGuard) {
  throw new Error('Could not parse the complete mapping-refresh prestate guard');
}
const normalizedRefreshPrestateGuard = refreshPrestateGuard.replace(/\s+/g, ' ');
for (const token of [
  "mapping.mapping_status in ('verified','candidate')",
  'mapping_state.active_mapping_count<>0',
  'mapping_state.active_mapping_count<>1',
  'mapping_state.exact_prior_mapping_count<>1',
  "contract.raw_transition_class='NULL_TO_NONNULL'",
  "contract.raw_transition_class='UNCHANGED_OR_INVALID'",
  'old_memberships.nonnull_road_count<>0',
  'old_memberships.exact_road_count is distinct from contract.old_active_membership_occurrence_count',
  'contract.prior_road_id is distinct from contract.road_id',
  "contract.prior_mapping_status is distinct from 'verified'",
  "contract.prior_mapping_method is distinct from 'exact_route_designation'",
]) {
  requireText(
    normalizedRefreshPrestateGuard,
    token,
    `complete mapping-refresh prestate guard: ${token}`,
  );
}

const exactCandidateContract = migration.match(
  /create temporary table\s+tmp_issue97_frozen_mapping_refresh_exact_candidates[\s\S]*?raise exception\s*'Issue #97 complete Ohio exact candidate contract drifted';\s*end if;/,
)?.[0];
if (!exactCandidateContract) {
  throw new Error('Could not parse the complete exact-candidate contract');
}
const normalizedExactCandidateContract = exactCandidateContract.replace(/\s+/g, ' ');
for (const token of [
  "'exact_source_record_id'::text as mapping_method",
  'road.source_record_id=identity.source_identity_key',
  "pg_catalog.split_part( coalesce(road.source_record_id,''), '|', 1 )=identity.nlf_base",
  'and base.identity_count=1',
  "road.verification_status='verified'",
  "road.state='OH'",
  "road.road_type in ('interstate','us_route','state_route')",
  "pg_catalog.lower(coalesce(road.county,''))= pg_catalog.lower(identity.county_name)",
  "'state_and_jurisdiction_checked',true",
  "'no_name_matching',true",
  "'exact_route_designation'",
  "'designation_source','identity_exact_components'",
  "'designation_not_name',true",
  "'no_fuzzy_or_spatial_matching',true",
  "designation.road_class='township'",
  'count(*) over(partition by candidate.identity_id)::integer as candidate_count',
  'candidate.candidate_count<>1',
  "candidate.mapping_method is distinct from contract.final_mapping_method",
  "candidate.evidence->>'road_source_record_id' is distinct from contract.evidence_source->>'road_source_record_id'",
  "candidate.evidence->>'road_source_record_id' is distinct from road.source_record_id",
  "'dbcc9da8-07cb-f054-68ca-debe2f8640fc'",
  "'c1eefe49-fe29-44fa-84b7-2cfe29180761'",
  "'THASTR00225**C|route:TR:225'",
  'contract.old_active_membership_occurrence_count=3',
  'and not contract.final_road_reviewed_37',
]) {
  requireText(
    normalizedExactCandidateContract,
    token,
    `exact candidate contract: ${token}`,
  );
}
forbid(
  exactCandidateContract,
  /\bsimilarity\s*\(|<->|st_distance\s*\(|nearest[_ -]?road|fuzzy[_ -]?name/i,
  'name, fuzzy, spatial, or nearest-road candidate evidence',
);
for (const [label, block] of [
  ['migration prestate', normalizedRefreshPrestateGuard],
  ['migration exact candidate', normalizedExactCandidateContract],
]) {
  forbid(
    block,
    /\b(?:or true|true or|and false|false and|1=1)\b/i,
    `${label} contract contains a fail-open neutralizer`,
  );
}

const manifestTargetBlock = routeManifest.match(
  /target_pairs\(identity_id,road_id\) as \(\s*values([\s\S]*?)\),\s*-- EXACT_REPLACED_GRAPHS_BEGIN/,
)?.[1];
if (!manifestTargetBlock) throw new Error('Could not parse route-manifest mapping pairs');
const manifestPairs = [...manifestTargetBlock.matchAll(
  /\('([0-9a-f-]{36})'::uuid,'([0-9a-f-]{36})'::uuid\)/g,
)].map((match) => `${match[1]}:${match[2]}`).sort();
const migrationPairs = targets.map(({ identity, road }) => `${identity}:${road}`).sort();
if (manifestPairs.length !== 46
    || JSON.stringify(manifestPairs) !== JSON.stringify(migrationPairs)) {
  throw new Error('Migration and exact route manifest use different identity/road pairs');
}

const normalizedMigration = migration.replace(/\s+/g, ' ');
const frozenTargetMappingInsert = migration.match(
  /insert into public\.brinesearch_road_identity_mappings\(\s*id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at,created_at,updated_at\s*\)\s*select[\s\S]*?from tmp_issue97_frozen_mapping_targets target\s*join public\.brinesearch_authoritative_road_identities identity on identity\.id=target\.identity_id;/,
)?.[0];
if (!frozenTargetMappingInsert) {
  throw new Error('Could not parse the exact frozen target mapping INSERT');
}
const normalizedFrozenTargetMappingInsert = frozenTargetMappingInsert.replace(/\s+/g, ' ');
const reviewedEvidenceDigestExpression = "pg_catalog.md5( pg_catalog.concat_ws( '|', target.identity_id::text, target.road_id::text, target.evidence_basis, target.expected_source_digest, target.expected_road_row_md5 ) )";
if (!/target\.identity_id,target\.road_id,'verified',\s*'manual_reviewed_source_evidence',/.test(
  normalizedFrozenTargetMappingInsert,
)) {
  throw new Error('Frozen target mapping INSERT must select the reviewed mapping method');
}
if ((frozenTargetMappingInsert.match(/'manual_reviewed_source_evidence'/g) ?? []).length !== 1) {
  throw new Error('Frozen target mapping INSERT must select exactly one reviewed mapping method');
}
for (const token of [
  "'reviewed_by','issue97_repository_frozen_wave'",
  "'reviewed_at','2026-08-17T19:32:12Z'",
  "'repository_reviewed',true",
  "'machine_owned',false",
  "'exact_method',case target.evidence_basis when 'exact_route_designation' then 'official_source_id' else 'manual_source_conflation' end",
  `'evidence_digest',${reviewedEvidenceDigestExpression}`,
]) {
  requireText(
    normalizedFrozenTargetMappingInsert,
    token,
    `frozen reviewed mapping INSERT contract: ${token}`,
  );
}

const frozenTargetMappingReceipt = migration.match(
  /if \(select count\(\*\) from public\.brinesearch_road_identity_mappings mapping[\s\S]*?raise exception 'Issue #97 exact frozen 46 mapping insert failed';\s*end if;/,
)?.[0];
if (!frozenTargetMappingReceipt) {
  throw new Error('Could not parse the exact frozen 46-row mapping receipt assertion');
}
const normalizedFrozenTargetMappingReceipt = frozenTargetMappingReceipt.replace(/\s+/g, ' ');
for (const token of [
  "mapping.mapping_method='manual_reviewed_source_evidence'",
  "mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave'",
  "mapping.evidence->>'reviewed_by'='issue97_repository_frozen_wave'",
  "mapping.evidence->>'reviewed_at'='2026-08-17T19:32:12Z'",
  "(mapping.evidence->>'repository_reviewed')::boolean=true",
  "(mapping.evidence->>'machine_owned')::boolean=false",
  "mapping.evidence->>'exact_method'=case target.evidence_basis when 'exact_route_designation' then 'official_source_id' else 'manual_source_conflation' end",
  `mapping.evidence->>'evidence_digest'=${reviewedEvidenceDigestExpression}`,
  ')<>46',
]) {
  requireText(
    normalizedFrozenTargetMappingReceipt,
    token,
    `frozen reviewed mapping receipt assertion: ${token}`,
  );
}
forbid(
  frozenTargetMappingInsert,
  /case\s+target\.evidence_basis\s+when\s+'exact_route_designation'\s+then\s+'exact_route_designation'\s+else\s+'exact_source_record_id'\s+end/i,
  'machine-owned mapping method restored in frozen target INSERT',
);

const machineOwnedMappingMethods = new Set([
  'exact_source_record_id',
  'exact_route_designation',
]);

const refreshMayRetire = (method) => machineOwnedMappingMethods.has(method);

assert.equal(refreshMayRetire('exact_source_record_id'), true);
assert.equal(refreshMayRetire('exact_route_designation'), true);
assert.equal(refreshMayRetire('manual_reviewed_source_evidence'), false);

const refreshOwnershipGuard = migration.match(
  /select pg_catalog\.regexp_replace\(\s*pg_catalog\.pg_get_functiondef\(proc\.oid\),[\s\S]*?raise exception\s*'Issue #97 exact mapping refresh ownership contract drifted';\s*end if;/,
)?.[0];
if (!refreshOwnershipGuard) {
  throw new Error('Could not parse the refresh ownership inspection and fail-closed guard');
}
const normalizedRefreshOwnershipGuard = refreshOwnershipGuard.replace(/\s+/g, ' ');
for (const token of [
  'pg_catalog.pg_get_functiondef(proc.oid)',
  'into strict v_refresh_exact_mappings_definition',
  'join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace',
  "namespace.nspname='public'",
  "proc.proname='brinesearch_issue97_refresh_exact_mappings'",
  'proc.pronargs=0',
  'v_refresh_exact_mappings_definition is null',
  "pg_catalog.strpos( v_refresh_exact_mappings_definition, 'where mapping_method in (''exact_source_record_id'',''exact_route_designation'') and mapping_status in (''verified'',''candidate'')' )=0",
  "pg_catalog.strpos( v_refresh_exact_mappings_definition, 'manual.mapping_method not in (''exact_source_record_id'',''exact_route_designation'')' )=0",
  "raise exception 'Issue #97 exact mapping refresh ownership contract drifted'",
]) {
  requireText(
    normalizedRefreshOwnershipGuard,
    token,
    `scoped refresh ownership guard: ${token}`,
  );
}

for (const token of [
  "array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]",
  "'affected_membership_count',1565",
  "'graph_action','rebuild_required'",
  "'route_refresh_performed',false",
  "private_verification.brinesearch_issue97_dataset_scope_current(",
  "identity.source_digest=target.expected_source_digest",
  "identity.source_identity_key not like 'OH:ODOT:NLF:'",
  "source.street_match_key=pg_catalog.split_part(road.source_record_id,'|street:',2)",
  "mapping_status='verified'",
  "'name_matching_used',false",
  "'fuzzy_matching_used',false",
  "'nearest_road_used',false",
  "where membership.road_id is not null",
  'A metadata restamp would',
  "'mapping_dependent_routes',379",
  "'transition_only_routes',33",
  "'final_route_count',412",
  "'final_primary_count',340",
  "'final_alternate_count',72",
  "'final_route_set_digest','711b1ddd3ba6c47e7642fc700197432f'",
  "'old_active_graphs_release_current',false",
  "'replacement_build_ids_must_be_repository_pinned',true",
  'v_refresh_exact_mappings_definition text',
  'pg_catalog.pg_get_functiondef(proc.oid)',
  "proc.proname='brinesearch_issue97_refresh_exact_mappings'",
  'proc.pronargs=0',
  "'where mapping_method in (''exact_source_record_id'',''exact_route_designation'') and mapping_status in (''verified'',''candidate'')'",
  "'manual.mapping_method not in (''exact_source_record_id'',''exact_route_designation'')'",
  'Issue #97 exact mapping refresh ownership contract drifted',
  'manual_reviewed_source_evidence',
  'issue97_repository_frozen_wave',
  '2026-08-17T19:32:12Z',
  'repository_reviewed',
  'machine_owned',
  'official_source_id',
  'manual_source_conflation',
  'evidence_digest',
  "'mapping_ownership','manual_reviewed_source_evidence'",
  "'machine_refresh_may_retire_target_mappings',false",
  'tmp_issue97_frozen_mapping_refresh_contract',
  'Issue #97 complete Ohio mapping-refresh contract drifted',
  'Issue #97 complete Ohio mapping-refresh prestate drifted',
  'tmp_issue97_frozen_mapping_refresh_exact_candidates',
  'Issue #97 complete Ohio exact candidate contract drifted',
  "'reviewed_machine_refresh_transition_count',42",
  "'reviewed_machine_refresh_final_road_count',23",
  "'reviewed_machine_refresh_road_resolution_count',35",
  "'reviewed_machine_refresh_same_road_method_upgrade_count',7",
  "'reviewed_machine_refresh_same_road_semantic_class'",
  "'SAME_ROAD_METHOD_UPGRADE'",
  "'reviewed_machine_refresh_membership_occurrences',1126",
  "'reviewed_machine_refresh_road_resolution_occurrences',1066",
  "'reviewed_machine_refresh_same_road_upgrade_occurrences',60",
  "'reviewed_machine_refresh_identity_digest','043d969160dded7b9ff3526b6b09b752'",
  "'reviewed_machine_refresh_final_road_digest','fd835556c06d4b067ca01ff8329a5d1c'",
  "'reviewed_machine_refresh_identity_road_pair_digest','cf20cef7b1f18ea57afbfee9a6f5202e'",
  "'reviewed_machine_refresh_raw_typed_digest','0b89d8b7f7969a95b6d94f270cd81ccc'",
  'old affected graph escaped the mapping-currentness quarantine',
  'target.road_id=mapping.road_id',
  "mapping.id=private_verification.brinesearch_issue97_uuid(",
  'tmp_issue97_frozen_mapping_expected_google_pads',
  'with path_a as (',
  '), path_b as (',
  'select pad_id from path_a',
  'select pad_id from path_b',
  "pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb))",
  "'5cd68da6e31fa7bf5b59bca9935f96f2'",
  'road_update_hit',
  'expected_route_revision',
  "expected.structured_route_revision<>0",
  "expected.road_sequence_status is not distinct from 'owner_verified'",
  'non_target_private_google',
  'non_target_pad_google',
  'non_target_google_queue',
  "receipt.hold_reason is distinct from 'road_identity_mapping_changed'",
  "receipt.manifest->>'route_ready' is distinct from 'false'",
  'receipt.manifest_digest is not null',
  'receipt.dependency_digest is not null',
  "target.identity_id::text=receipt.evidence->>'identity_id'",
  "target.road_id::text=receipt.evidence->>'road_id'",
  "pad.brinesearch_google_route_status_issue97 is distinct from 'stale'",
  'pad.structured_route_revision is distinct from expected.structured_route_revision',
  'pad.road_sequence_status is distinct from expected.road_sequence_status',
  "queue.reason<>'road_identity_mapping_changed'",
  'tmp_issue97_frozen_mapping_google_immediate_receipts',
  'tmp_issue97_frozen_mapping_google_immediate_pads',
  '(select count(*) from tmp_issue97_frozen_mapping_google_immediate_receipts)<>3',
  '(select count(*) from tmp_issue97_frozen_mapping_google_immediate_pads)<>3',
  'Issue #97 frozen mapping wave immediate Google snapshot count drifted',
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
  'where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;',
  "trigger.tgenabled<>'O'",
  'Issue #97 frozen mapping wave broke target road/mapping contract',
  'Issue #97 frozen mapping wave changed non-target roads or mappings',
  'Issue #97 frozen mapping wave changed route occurrence or reconciliation receipts',
  'Issue #97 frozen mapping wave Google invalidation pad set drifted',
  'Issue #97 frozen mapping wave changed non-target Google state',
  'Issue #97 frozen mapping wave target immediate Google hold is invalid',
  'Issue #97 frozen mapping wave target pad Google state is invalid',
  'Issue #97 frozen mapping wave immediate Google refresh queue is invalid',
  'Issue #97 frozen mapping wave deferred processor changed target stale state',
  'Issue #97 frozen mapping wave deferred processor did not drain safely',
  'Issue #97 frozen mapping wave changed release source graph or reconciliation protected state',
  'Issue #97 frozen mapping wave public Google routes are not zero',
]) requireText(migration, token);

const expectedPadsIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_expected_google_pads',
);
const refreshOwnershipInspectionIndex = migration.indexOf(
  'into strict v_refresh_exact_mappings_definition',
);
const refreshOwnershipGuardIndex = migration.indexOf(refreshOwnershipGuard);
const refreshOwnershipGuardEndIndex = refreshOwnershipGuardIndex
  + refreshOwnershipGuard.length;
const refreshContractGuardIndex = migration.indexOf(refreshContractGuard);
const refreshContractGuardEndIndex = refreshContractGuardIndex
  + refreshContractGuard.length;
const refreshPrestateGuardIndex = migration.indexOf(refreshPrestateGuard);
const refreshPrestateGuardEndIndex = refreshPrestateGuardIndex
  + refreshPrestateGuard.length;
const exactCandidateContractIndex = migration.indexOf(exactCandidateContract);
const roadWriteIndex = migration.indexOf('update public.brinesearch_roads road set');
const mappingWriteIndex = migration.indexOf(
  'insert into public.brinesearch_road_identity_mappings(',
);
const immediateQueueAssertionIndex = migration.indexOf(
  'Issue #97 frozen mapping wave immediate Google refresh queue is invalid',
);
const forceDeferredEventsIndex = migration.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
);
const restoreDeferredIndex = migration.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;',
);
const immediateReceiptSnapshotIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_google_immediate_receipts',
);
const immediatePadSnapshotIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_google_immediate_pads',
);
const staleStateEqualityIndex = migration.indexOf(
  'Issue #97 frozen mapping wave deferred processor changed target stale state',
);
const drainedSafelyIndex = migration.indexOf(
  'Issue #97 frozen mapping wave deferred processor did not drain safely',
);
if (expectedPadsIndex < 0 || roadWriteIndex < 0 || mappingWriteIndex < 0
    || !(expectedPadsIndex < roadWriteIndex && expectedPadsIndex < mappingWriteIndex)) {
  throw new Error('Google invalidation dependency set must be frozen before road/mapping writes');
}
if (refreshOwnershipInspectionIndex < 0 || refreshOwnershipGuardIndex < 0
    || !(refreshOwnershipInspectionIndex < refreshOwnershipGuardEndIndex
      && refreshOwnershipGuardEndIndex < roadWriteIndex
      && refreshOwnershipGuardEndIndex < mappingWriteIndex)) {
  throw new Error('Completed refresh ownership guard must precede target road and mapping writes');
}
if (refreshContractGuardIndex < 0
    || !(refreshContractGuardEndIndex < roadWriteIndex
      && refreshContractGuardEndIndex < mappingWriteIndex)) {
  throw new Error('Completed mapping-refresh contract guard must precede target road and mapping writes');
}
if (refreshPrestateGuardIndex < 0
    || !(refreshPrestateGuardEndIndex < roadWriteIndex
      && refreshPrestateGuardEndIndex < mappingWriteIndex)) {
  throw new Error('Complete mapping-refresh prestate guard must precede target writes');
}
if (exactCandidateContractIndex < 0
    || !(roadWriteIndex < exactCandidateContractIndex
      && mappingWriteIndex < exactCandidateContractIndex)) {
  throw new Error('Exact candidate contract must inspect the adopted road state');
}
if (!(immediateQueueAssertionIndex < immediateReceiptSnapshotIndex
    && immediateQueueAssertionIndex < immediatePadSnapshotIndex
    && immediateReceiptSnapshotIndex < forceDeferredEventsIndex
    && immediatePadSnapshotIndex < forceDeferredEventsIndex
    && forceDeferredEventsIndex < staleStateEqualityIndex
    && staleStateEqualityIndex < drainedSafelyIndex
    && drainedSafelyIndex < restoreDeferredIndex)) {
  throw new Error('Deferred Google processor ordering drifted');
}
if ((migration.match(/where pg_catalog\.to_jsonb\(live\) is distinct from pg_catalog\.to_jsonb\(snapshot\)/g) ?? []).length < 2
    || (migration.match(/receipt\.status is distinct from 'stale'/g) ?? []).length < 2
    || (migration.match(/receipt\.hold_reason is distinct from 'road_identity_mapping_changed'/g) ?? []).length < 2) {
  throw new Error('Deferred Google processor must preserve the exact immediate stale receipt and pad state');
}

forbid(migration, /brinesearch_oh_county_code\s*\(/i, 'stale Ohio county helper');
forbid(migration, /update\s+public\.brinesearch_road_graph_builds\b/i, 'mapping receipt restamp');
forbid(migration, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or graph activation');
forbid(migration, /(?:name_only|fuzzy_name|nearest_road)\s*['"]?\s*[:,=]\s*(?:true|1)/i,
  'guess resolution evidence');
forbid(migration, /\bdisable\s+trigger\b/i, 'disabled Google safety trigger');
forbid(
  migration,
  /tmp_issue97_frozen_mapping_refresh_expansion\b/i,
  'obsolete seven-row mapping-refresh table',
);
forbid(
  migration,
  /reviewed_machine_refresh_(?:expansion_count|expansion_road_count|contract_digest|proof_digest)/i,
  'obsolete partial mapping-refresh receipt',
);
forbid(
  migration,
  /(?:tmp_issue97_frozen_mapping_refresh_contract|reviewed_machine_refresh)[\s\S]{0,120}<>267/i,
  'old 267 occurrences treated as the complete expansion',
);
forbid(migration, /issue97_cutover_not_active/i,
  'stored held state substituted for the unchanged immediate stale state');
forbid(migration,
  /delete\s+from\s+private_verification\.brinesearch_google_route_refresh_queue_issue97/i,
  'manual deletion of pending deferred Google refresh events');

const finalBlock = routeManifest.match(
  /-- EXACT_FINAL_412_BEGIN([\s\S]*?)-- EXACT_FINAL_412_END/,
)?.[1];
if (!finalBlock) throw new Error('Could not parse exact final 412-route block');
const routeIds = [...finalBlock.matchAll(/\('([0-9a-f-]{36})'::uuid\)/g)].map((match) => match[1]);
if (routeIds.length !== 412 || new Set(routeIds).size !== 412
    || md5([...routeIds].sort().join('|')) !== '711b1ddd3ba6c47e7642fc700197432f') {
  throw new Error(`Frozen route manifest drifted: ${routeIds.length}`);
}
for (const token of [
  '-- EXACT_FINAL_412_BEGIN',
  '-- EXACT_FINAL_412_END',
  '(select count(*) from frozen_routes) final_count',
  "metrics.final_digest='711b1ddd3ba6c47e7642fc700197432f'",
  'metrics.former_379_omission_count=33 as former_379_rejected',
  'metrics.leg_a_count=379',
  "metrics.leg_a_digest='836c1f57210e4d18c0f60d4c1ea77d7d'",
  'metrics.transition_only_count=33',
  'metrics.final_count=412',
  "metrics.final_digest='711b1ddd3ba6c47e7642fc700197432f'",
  'metrics.former_379_omission_count=33',
  'except select route_prep_id',
]) requireText(routeManifest, token);
forbid(routeManifest, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route manifest execution');

for (const fixture of [
  '86d86ac5-199c-4715-be36-785a13c1cf30',
  'dfb3f204-190c-4d65-85b3-16bcd1715825',
  'f03e1196-9843-4a62-af08-b4c7eb681e38',
]) {
  if (!routeIds.includes(fixture)) throw new Error(`Frozen closure lost fixture ${fixture}`);
}

const replacedGraphs = [...routeManifest.matchAll(
  /\('([A-Z]{3})','([0-9a-f-]{36})'::uuid,'([0-9a-f]{32})'\)/g,
)].map((match) => match[1]);
if (replacedGraphs.join(',') !== 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB') {
  throw new Error(`Replaced active graph pins drifted: ${replacedGraphs.join(',')}`);
}

const builds = [...executableRehearsal.matchAll(
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','([A-Z]{3})'\)/g,
)].map((match) => match[1]);
if (builds.join(',') !== 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB') {
  throw new Error(`Exact serial rebuild plan drifted: ${builds.join(',')}`);
}

// Repeated-call temp-table guard. The pinned builder creates
// tmp_issue97_point_corroboration with ON COMMIT DROP and omits it from its own
// repeated-call cleanup block. ON COMMIT DROP does not run when a builder call
// returns, so any caller invoking the builder more than once inside a single
// transaction must clear that session-local table between calls or the next
// call fails with SQLSTATE 42P07. These assertions keep the guards paired with
// their calls, and the rationale token keeps them from being removed later as
// apparently unnecessary.
const guardStatement = 'drop table if exists pg_temp.tmp_issue97_point_corroboration;';
const guardToken = 'issue97-point-corroboration-repeated-call-guard';

const offsetsOf = (source, needle) => {
  const found = [];
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
    found.push(at);
  }
  return found;
};

// guardedFrom is the 1-based index of the first builder call that requires a
// preceding guard; earlier calls run against a clean pg_temp and need none.
const assertGuardedCalls = (
  source,
  label,
  callPattern,
  expectedCalls,
  guardedFrom,
  rationaleSource = source,
) => {
  const calls = [...source.matchAll(callPattern)].map((match) => match.index);
  if (calls.length !== expectedCalls) {
    throw new Error(`${label}: expected ${expectedCalls} builder calls, found ${calls.length}`);
  }
  const guards = offsetsOf(source, guardStatement);
  const expectedGuards = expectedCalls - guardedFrom + 1;
  if (guards.length !== expectedGuards) {
    throw new Error(`${label}: expected ${expectedGuards} repeated-call guards, found ${guards.length}`);
  }
  for (let index = 0; index < guards.length; index += 1) {
    const call = calls[guardedFrom - 1 + index];
    const previousCall = index === 0 && guardedFrom === 1 ? -1 : calls[guardedFrom - 2 + index];
    if (guards[index] <= previousCall || guards[index] >= call) {
      throw new Error(`${label}: guard ${index + 1} is not between builder call ${guardedFrom - 1 + index} and call ${guardedFrom + index}`);
    }
  }
  requireText(rationaleSource, guardToken, `${label}: repeated-call guard rationale token`);
  return guards.length;
};

const rehearsalGuards = assertGuardedCalls(
  executableRehearsal,
  'Frozen mapping rehearsal',
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','[A-Z]{3}'\)/g,
  8,
  1,
  rehearsal,
);
const syntheticGuards = assertGuardedCalls(
  executableSyntheticRegression,
  'Synthetic topology regression',
  /public\.brinesearch_issue97_rebuild_county_graph\('WV','DOD'\)/g,
  3,
  2,
  syntheticRegression,
);
for (const token of [
  "set local statement_timeout='90min'", "set local lock_timeout='2min'",
  "'06705f5b35a6d37151bb2c0dc5ade9bd'",
  "where version='20260817193212'", "build.status is distinct from 'validated'",
  "build.activated_at is not null",
  "where target.identity_id=membership.identity_id",
  'brinesearch_issue97_graph_build_release_current(build.id)',
  "build.id=(result.result->>'build_id')::uuid",
  'source_revision_digest,immediate_release_current,final_release_current',
  'candidate build lane activated or replaced a graph',
  "where evidence->>'migration'='issue97_frozen_exact_mapping_wave')<>0",
  'insert into supabase_migrations.schema_migrations(version,statements,name)',
  "'issue97_frozen_exact_mapping_wave'",
  'tmp_issue97_frozen_mapping_expected_google_pads',
  "'5cd68da6e31fa7bf5b59bca9935f96f2'",
  'tmp_issue97_frozen_mapping_google_immediate_receipts',
  'tmp_issue97_frozen_mapping_google_immediate_pads',
  'tmp_issue97_mapping_wave_post_migration_target_receipts',
  'tmp_issue97_mapping_wave_post_migration_target_pads',
  'tmp_issue97_mapping_wave_reviewed_mappings_before_build',
  'Issue #97 reviewed frozen mapping snapshot count drifted',
  'Issue #97 reviewed frozen mappings changed during graph rebuilds',
  'tmp_issue97_mapping_wave_machine_scope_before_build',
  'tmp_issue97_mapping_wave_machine_mappings_before_build',
  'tmp_issue97_mapping_wave_refresh_contract_before_build',
  'Issue #97 complete mapping-refresh contract pre-build snapshot drifted',
  'tmp_issue97_mapping_wave_county_order',
  'tmp_issue97_mapping_wave_stabilization_results',
  'Issue #97 all-eight pre-build mapping stabilization drifted',
  'tmp_issue97_mapping_wave_machine_scope_after_stabilization',
  'tmp_issue97_mapping_wave_machine_mappings_after_stabilization',
  'tmp_issue97_mapping_wave_changed_machine_mappings',
  'tmp_issue97_mapping_wave_post_machine_candidates',
  'tmp_issue97_mapping_wave_machine_mapping_transitions',
  'tmp_issue97_mapping_wave_expected_machine_mapping_transitions',
  'tmp_issue97_mapping_wave_refresh_contract_after_build',
  'Issue #97 complete Ohio machine mapping-refresh contract changed during graph rebuilds',
  'old_active_membership_occurrence_count',
  'observed_old_membership_occurrence_count',
  'old_nonnull_road_id_count',
  'old_exact_road_id_count',
  'prior_mapping_state',
  'final_mapping_state',
  'full join tmp_issue97_mapping_wave_machine_mappings_after_stabilization live',
  'full join tmp_issue97_frozen_mapping_refresh_contract contract',
  'tmp_issue97_mapping_wave_expected_machine_mapping_transitions expected',
  'pg_catalog.to_jsonb(actual)',
  'pg_catalog.to_jsonb(expected)',
  'transition.transition_class in (',
  "'NONNULL_TO_NULL','NONNULL_TO_DIFFERENT_NONNULL'",
  "transition.new_mapping_status is distinct from 'verified'",
  'transition.exact_candidate_count is distinct from 1',
  'or transition.ambiguity_flag',
  'snapshot.active_mapping_count<>1',
  'from tmp_issue97_mapping_wave_refresh_contract_after_build)<>1126',
  "mapping.evidence->>'exact_candidate_count'",
  "mapping.evidence->>'ambiguity_held'",
  "snapshot.observed_mapping_evidence->>'refresh_scope'",
  "mapping.evidence->>'designation_source'",
  'Issue #97 all-eight mapping stabilization contract drifted',
  'tmp_issue97_mapping_wave_post_stabilization_pre_build_semantic_baseline',
  'issue97_mapping_wave_current_machine_semantic_state',
  'issue97_mapping_wave_release_current_diagnostic',
  'issue97_mapping_wave_release_diagnostic_passes',
  'issue97_mapping_wave_assert_builder_stable',
  'Issue #97 builder-internal county refresh changed stabilized machine mapping state',
  'Issue #97 candidate was not immediately release-current after mapping stabilization',
  'tmp_issue97_mapping_wave_final_machine_mapping_differences',
  'Issue #97 final all-eight stabilized candidate contract drifted',
  'tmp_issue97_mapping_wave_candidate_temporal_evidence',
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts)<>3',
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)<>3',
  "receipt.status is distinct from 'stale'",
  "receipt.hold_reason is distinct from 'road_identity_mapping_changed'",
  'where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
  'non_target_private_google',
  'non_target_pad_google',
  'brinesearch_google_route_refresh_queue_issue97',
  'v_google_diff_count',
  'v_google_diff_sample',
  'google_refresh_queue_count',
  'google_refresh_queue_sample',
  'target_google_receipt_contract_diff_count',
  'target_google_receipt_contract_diff_sample',
  'target_google_pad_diff_count',
  'target_google_pad_diff_sample',
  'target_google_stale_state_diff_count',
  'target_google_stale_state_diff_sample',
  'expected_non_target_receipt_digest',
  'observed_non_target_receipt_digest',
  'expected_non_target_pad_digest',
  'observed_non_target_pad_digest',
  'matching_deferred_trigger_count',
  'tmp_issue97_mapping_wave_refresh_expansion_google_before_build',
  'expected_evidence_identity_id',
  'expected_evidence_road_id',
  'expected_receipt_route_revision',
  'tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before',
  '450948793c57a9a1535139fac4974792',
  '5a75e5c4c34805b7dc2fdf8d0534a4f6',
  'Issue #97 reviewed mapping-refresh Google dependency set drifted',
  'Issue #97 reviewed mapping-refresh Google queue contract drifted',
  'Issue #97 reviewed mapping-refresh Google postprocessor contract drifted',
  'expected_queue_count',
  'observed_queue_count',
  'expected_queue_pad_digest',
  'observed_queue_pad_digest',
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_QUEUE|9|450948793c57a9a1535139fac4974792',
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS_PASS|9|5a75e5c4c34805b7dc2fdf8d0534a4f6',
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|',
  'Issue #97 rollback rehearsal post-processor Google contract failed',
  'Issue #97 rollback rehearsal Google target snapshot cardinality changed',
  'Issue #97 rollback rehearsal Google refresh queue is not empty after dark builds',
  'Issue #97 rollback rehearsal public Google or cutover state changed',
  'Issue #97 rollback rehearsal target Google receipt postprocessor contract changed',
  'Issue #97 rollback rehearsal target Google pad state changed during dark builds',
  'Issue #97 rollback rehearsal target Google stale-state contract changed',
  'Issue #97 rollback rehearsal non-target Google receipts changed',
  'Issue #97 rollback rehearsal non-target Google pad state changed',
  'Issue #97 rollback rehearsal deferred Google trigger contract changed',
]) requireText(rehearsal, token);
const reviewedRefreshGooglePadIds = [
  '69c63442-de05-4d15-95da-07da587bc070',
  '6ef0746f-341a-4d29-9399-a81cfbec11e8',
  '75600d0c-17b8-488b-96c9-4b7b8ffc8b1b',
  'b6dae008-74d4-4976-9c72-fba7ae349c50',
  'b7526e45-0b33-4988-ae1c-0a4140971f8e',
  'd7898e8c-1bb6-48f8-b5e0-87bc1898420e',
  'e2b32e85-9e93-4388-8215-9d8167cbbeb8',
  'f896d00c-da26-41b6-bf5b-e9d91afbdbc6',
  'fcbf5085-4ba2-496d-9c20-516e8b52f9bd',
];
for (const padId of reviewedRefreshGooglePadIds) {
  if ((rehearsal.match(new RegExp(padId, 'g')) ?? []).length !== 1) {
    throw new Error(`Reviewed mapping-refresh Google pad ${padId} must occur exactly once`);
  }
}
const reviewedRefreshGoogleSnapshotStart = rehearsal.indexOf(
  'create temporary table\ntmp_issue97_mapping_wave_refresh_expansion_google_before_build',
);
const reviewedRefreshGoogleSnapshotClose =
  '$issue97_frozen_mapping_refresh_expansion_google_snapshot_assertion$;';
const reviewedRefreshGoogleSnapshotEnd = rehearsal.indexOf(
  reviewedRefreshGoogleSnapshotClose,
  reviewedRefreshGoogleSnapshotStart,
);
if (reviewedRefreshGoogleSnapshotStart < 0 || reviewedRefreshGoogleSnapshotEnd < 0) {
  throw new Error('Could not parse the reviewed mapping-refresh Google snapshot');
}
const reviewedRefreshGoogleSnapshotBlock = rehearsal.slice(
  reviewedRefreshGoogleSnapshotStart,
  reviewedRefreshGoogleSnapshotEnd + reviewedRefreshGoogleSnapshotClose.length,
);
const reviewedRefreshGoogleContractPattern = new RegExp(
  "\\('([0-9a-f-]{36})'::uuid,\\s*"
    + "'([0-9a-f-]{36})'::uuid,\\s*"
    + "'([0-9a-f-]{36})'::uuid,([0-9]+)::bigint\\)",
  'g',
);
const reviewedRefreshGoogleContract = [
  ...reviewedRefreshGoogleSnapshotBlock.matchAll(reviewedRefreshGoogleContractPattern),
].map((match) => ({
  padId: match[1],
  evidenceIdentityId: match[2],
  evidenceRoadId: match[3],
  receiptRouteRevision: Number(match[4]),
}));
const expectedReviewedRefreshGoogleContract = [
  ['69c63442-de05-4d15-95da-07da587bc070', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['6ef0746f-341a-4d29-9399-a81cfbec11e8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['75600d0c-17b8-488b-96c9-4b7b8ffc8b1b', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['b6dae008-74d4-4976-9c72-fba7ae349c50', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['b7526e45-0b33-4988-ae1c-0a4140971f8e', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['d7898e8c-1bb6-48f8-b5e0-87bc1898420e', '9acadc48-c230-5e7b-6f2a-0a77f86f625c', 'bbfacbaf-86be-4818-8541-61a697c71199', 1],
  ['e2b32e85-9e93-4388-8215-9d8167cbbeb8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['f896d00c-da26-41b6-bf5b-e9d91afbdbc6', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['fcbf5085-4ba2-496d-9c20-516e8b52f9bd', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
].map(([padId, evidenceIdentityId, evidenceRoadId, receiptRouteRevision]) => ({
  padId,
  evidenceIdentityId,
  evidenceRoadId,
  receiptRouteRevision,
}));
if (JSON.stringify(reviewedRefreshGoogleContract)
    !== JSON.stringify(expectedReviewedRefreshGoogleContract)) {
  throw new Error('Reviewed mapping-refresh Google postprocessor rows drifted');
}
forbid(
  rehearsal,
  /Issue #97 rollback rehearsal Google state changed during dark builds/,
  'old combined Google dark-build assertion returned',
);
forbid(
  rehearsal,
  /Issue #97 rollback rehearsal target Google receipts changed during dark builds/,
  'old byte-identical target Google receipt assertion returned',
);
// The deferred processor records ONE invalidating mapping row per pad as
// evidence. Which row wins shifts with how many counties the wave rebuilds,
// so pinning the pair fails closed for the wrong reason. Both Google receipt
// contracts must assert the witness invariant instead, and must not go back
// to comparing a pinned pair.
forbid(
  rehearsal,
  /'evidence',pg_catalog\.jsonb_build_object\(\s*'identity_id',expected\.expected_evidence_identity_id/,
  'pinned Google receipt evidence pair returned',
);
{
  const witnessMarkers = (rehearsal.match(
    /issue97-google-evidence-witness-invariant/g,
  ) ?? []).length;
  if (witnessMarkers !== 2) {
    throw new Error(
      `Google evidence witness invariant must guard both receipt contracts: found ${witnessMarkers}`,
    );
  }
  const evidenceExcluded = (rehearsal.match(
    /pg_catalog\.to_jsonb\(receipt\)-'generated_at'-'updated_at'-'evidence'/g,
  ) ?? []).length;
  if (evidenceExcluded !== 2) {
    throw new Error(
      `Both Google receipt comparisons must exclude the evidence witness: found ${evidenceExcluded}`,
    );
  }
  const witnessMappingChecks = (rehearsal.match(
    /mapping\.identity_id::text=receipt\.evidence->>'identity_id'/g,
  ) ?? []).length;
  const witnessBindChecks = (rehearsal.match(
    /step\.road_id::text=receipt\.evidence->>'road_id'/g,
  ) ?? []).length;
  // Three pad-binding checks are expected: the pre-existing post-migration
  // Google assertion already used this structural form, plus the two receipt
  // contracts corrected here. Only the latter two resolve the witness against
  // the live mapping table.
  if (witnessMappingChecks !== 2 || witnessBindChecks !== 3) {
    throw new Error(
      `Witness invariant must verify a live verified mapping twice and a real pad binding three times: `
        + `${witnessMappingChecks}/${witnessBindChecks}`,
    );
  }
}
if ((rehearsal.match(/where pg_catalog\.to_jsonb\(live\) is distinct from pg_catalog\.to_jsonb\(snapshot\)/g) ?? []).length < 3) {
  throw new Error('Rollback rehearsal must byte-compare mapping, pad, and unaffected receipt state');
}
const normalizedRehearsal = rehearsal.replace(/\s+/g, ' ');
const normalizedExecutableRehearsal = executableRehearsal.replace(/\s+/g, ' ');
const normalizedReviewedRefreshGoogleSnapshotBlock =
  reviewedRefreshGoogleSnapshotBlock.replace(/\s+/g, ' ');
for (const token of [
  'expected_evidence_identity_id',
  'expected_evidence_road_id',
  'expected_receipt_route_revision',
  'from public.brinesearch_pad_roads step',
  "expected.pre_receipt_row->'manifest'->'points'",
  'tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before',
]) {
  requireText(
    normalizedReviewedRefreshGoogleSnapshotBlock,
    token,
    `reviewed mapping-refresh Google snapshot contract: ${token}`,
  );
}

// The complete eight-county machine mapping wave must converge before the
// first graph build. These are the only explicit mapping refresher calls in the
// rehearsal; each builder's own fixed refresh remains inside the pinned builder
// definition and is checked for semantic idempotence immediately on return.
const stabilizationCounties = ['BEL', 'CAR', 'COL', 'GUE', 'HAS', 'JEF', 'MOE', 'NOB'];
const explicitStabilizers = [...normalizedRehearsal.matchAll(
  /private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\('([A-Z]{3})'\)/g,
)];
const executableStabilizers = [...normalizedExecutableRehearsal.matchAll(
  /private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\('([A-Z]{3})'\)/g,
)];
if (explicitStabilizers.map((match) => match[1]).join(',')
      !== stabilizationCounties.join(',')
    || executableStabilizers.map((match) => match[1]).join(',')
      !== stabilizationCounties.join(',')) {
  throw new Error(
    `Pre-build mapping stabilization order/count drifted: raw=${explicitStabilizers.map((match) => match[1]).join(',')} executable=${executableStabilizers.map((match) => match[1]).join(',')}`,
  );
}
const firstBuilderOffset = normalizedRehearsal.indexOf(
  "public.brinesearch_issue97_rebuild_county_graph('OH','BEL')",
);
const googleDependencySnapshotOffset = normalizedRehearsal.indexOf(
  '$issue97_frozen_mapping_refresh_expansion_google_snapshot_assertion$;',
);
if (firstBuilderOffset < 0 || googleDependencySnapshotOffset < 0
    || explicitStabilizers.some((match) => (
      match.index <= googleDependencySnapshotOffset || match.index >= firstBuilderOffset
    ))) {
  throw new Error('All eight exact county stabilizers must follow the Google dependency snapshot and precede BEL');
}
for (const [index, county] of stabilizationCounties.entries()) {
  requireText(
    normalizedRehearsal,
    `insert into tmp_issue97_mapping_wave_stabilization_results values (${index + 1},'${county}',private_verification.brinesearch_issue97_refresh_exact_mappings_oh('${county}'));`,
    `literal pre-build mapper ${index + 1}/${county}`,
  );
}
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_county_order( ordinal integer primary key, county_code text not null unique ) on commit drop;',
  "(1,'BEL'),(2,'CAR'),(3,'COL'),(4,'GUE'), (5,'HAS'),(6,'JEF'),(7,'MOE'),(8,'NOB')",
  'create temporary table tmp_issue97_mapping_wave_stabilization_results( ordinal integer primary key, county_code text not null unique, mapping_refresh jsonb not null ) on commit drop;',
  '(select count(*) from tmp_issue97_mapping_wave_stabilization_results)<>8',
  "array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]",
  "result.mapping_refresh->>'scope' is distinct from 'OH:'||result.county_code",
  "result.mapping_refresh->>'all_route_components_must_match' is distinct from 'true'",
  "result.mapping_refresh->>'name_matching_used' is distinct from 'false'",
  "result.mapping_refresh->>'fuzzy_matching_used' is distinct from 'false'",
  "result.mapping_refresh->>'nearest_road_used' is distinct from 'false'",
  "result.mapping_refresh->>'ambiguous_exact_candidates_held' is distinct from '0'",
  "message='Issue #97 all-eight pre-build mapping stabilization drifted'",
]) {
  requireText(normalizedRehearsal, token, `pre-build stabilization contract: ${token}`);
}
forbid(
  rehearsal,
  /private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\s*\(\s*\)/i,
  'broad Ohio mapping refresh in rehearsal',
);
forbid(
  rehearsal,
  /(?:private_verification|public)\.brinesearch_issue97_refresh_oh_identities\s*\(/i,
  'extra identity refresh outside the pinned builder',
);

const stabilizationAssertionClose =
  '$issue97_mapping_wave_all_eight_stabilization_assertions$;';
const stabilizationAssertionEnd = normalizedRehearsal.indexOf(stabilizationAssertionClose);
const stabilizationTransitionStart = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_scope_after_stabilization',
);
const stabilizedBaselineIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_post_stabilization_pre_build_semantic_baseline',
);
if (stabilizationTransitionStart < 0 || stabilizationAssertionEnd < 0
    || stabilizedBaselineIndex < 0
    || !(explicitStabilizers.at(-1).index < stabilizationTransitionStart
      && stabilizationTransitionStart < stabilizationAssertionEnd
      && stabilizationAssertionEnd < stabilizedBaselineIndex
      && stabilizedBaselineIndex < firstBuilderOffset)) {
  throw new Error('Pre-build 42-transition proof/baseline ordering drifted');
}
const stabilizationTransitionBlock = normalizedRehearsal.slice(
  stabilizationTransitionStart,
  stabilizationAssertionEnd + stabilizationAssertionClose.length,
);
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_changed_machine_mappings',
  'full join tmp_issue97_mapping_wave_machine_mappings_after_stabilization live using(identity_id)',
  'create temporary table tmp_issue97_mapping_wave_stabilization_transition_differences',
  'from tmp_issue97_mapping_wave_machine_mapping_transitions actual full join tmp_issue97_mapping_wave_expected_machine_mapping_transitions expected using(identity_id)',
  'where pg_catalog.to_jsonb(actual) is distinct from pg_catalog.to_jsonb(expected)',
  'create temporary table tmp_issue97_mapping_wave_stabilization_live_differences',
  'live.observed_mapping_evidence is distinct from live.expected_mapping_evidence',
  '(select count(*) from tmp_issue97_mapping_wave_changed_machine_mappings)<>42',
  '(select count(*) from tmp_issue97_mapping_wave_machine_mapping_transitions)<>42',
  'full join tmp_issue97_frozen_mapping_refresh_contract contract using(identity_id)',
  "transition.transition_class in ( 'NONNULL_TO_NULL','NONNULL_TO_DIFFERENT_NONNULL' )",
  "transition.transition_class='UNCHANGED_OR_INVALID'",
  "transition.prior_mapping_method='exact_route_designation'",
  "transition.new_mapping_method='exact_source_record_id'",
  '<>42', '<>23', '<>35', '<>7', '<>34', '<>8', '<>1126', '<>1066', '<>60',
  "<>'043d969160dded7b9ff3526b6b09b752'",
  "<>'fd835556c06d4b067ca01ff8329a5d1c'",
  "<>'cf20cef7b1f18ea57afbfee9a6f5202e'",
  "<>'0b89d8b7f7969a95b6d94f270cd81ccc'",
  "message='Issue #97 all-eight mapping stabilization contract drifted'",
]) {
  requireText(stabilizationTransitionBlock, token,
    `authoritative pre-build 42-transition contract: ${token}`);
}
forbid(
  stabilizationTransitionBlock,
  /public\.brinesearch_issue97_rebuild_county_graph\s*\(/i,
  'transition proof depends on a graph build',
);
forbidFailClosedNeutralizers(
  stabilizationTransitionBlock,
  'authoritative pre-build 42-transition contract',
);

const stabilizedBaselineExecutableIndex = normalizedExecutableRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_post_stabilization_pre_build_semantic_baseline',
);
const buildResultsExecutableIndex = normalizedExecutableRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_build_results(',
  stabilizedBaselineExecutableIndex,
);
const exactStabilizedBaseline = 'create temporary table tmp_issue97_mapping_wave_post_stabilization_pre_build_semantic_baseline on commit drop as select * from tmp_issue97_mapping_wave_machine_mappings_after_stabilization order by county_code,source_identity_key,identity_id;';
if (stabilizedBaselineExecutableIndex < 0 || buildResultsExecutableIndex < 0
    || normalizedExecutableRehearsal.slice(
      stabilizedBaselineExecutableIndex,
      buildResultsExecutableIndex,
    ).trim() !== exactStabilizedBaseline) {
  throw new Error('Post-stabilization/pre-build semantic baseline query drifted or narrowed');
}

const currentMachineHelperStart = normalizedRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_current_machine_semantic_state()',
);
const currentMappingDigestHelperStart = normalizedRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_current_mapping_digest(',
  currentMachineHelperStart,
);
if (currentMachineHelperStart < 0 || currentMappingDigestHelperStart < 0) {
  throw new Error('Could not parse post-stabilization complete machine-state helper');
}
const currentMachineHelperBlock = normalizedRehearsal.slice(
  currentMachineHelperStart,
  currentMappingDigestHelperStart,
);
const executableCurrentMachineHelperStart = normalizedExecutableRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_current_machine_semantic_state()',
);
const executableCurrentMappingDigestHelperStart = normalizedExecutableRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_current_mapping_digest(',
  executableCurrentMachineHelperStart,
);
const executableCurrentMachineHelperBlock = normalizedExecutableRehearsal.slice(
  executableCurrentMachineHelperStart,
  executableCurrentMappingDigestHelperStart,
).trim();
const exactCurrentMachineHelperBlock = "create or replace function pg_temp.issue97_mapping_wave_current_machine_semantic_state() returns table( identity_id uuid, county_code text, source_identity_key text, graph_mapping_fingerprint text, mapping_state jsonb ) language sql stable set search_path='' as $$ select identity.id,identity.county_code,identity.source_identity_key, private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2( identity.id ), coalesce(machine.mapping_state,'[]'::jsonb) from public.brinesearch_authoritative_road_identities identity join pg_temp.tmp_issue97_mapping_wave_county_order county on county.county_code=identity.county_code left join lateral ( select pg_catalog.jsonb_agg( pg_catalog.to_jsonb(mapping) -array['created_at','updated_at','verified_at']::text[] order by mapping.id,mapping.road_id, mapping.mapping_status,mapping.mapping_method ) as mapping_state from public.brinesearch_road_identity_mappings mapping where mapping.identity_id=identity.id and mapping.mapping_method in ( 'exact_source_record_id','exact_route_designation' ) and mapping.mapping_status in ('verified','candidate') ) machine on true where identity.active and identity.state_code='OH' order by county.ordinal,identity.source_identity_key,identity.id $$;";
if (executableCurrentMachineHelperStart < 0
    || executableCurrentMappingDigestHelperStart < 0
    || executableCurrentMachineHelperBlock !== exactCurrentMachineHelperBlock) {
  throw new Error('Complete stabilized machine-state helper query drifted or narrowed');
}
for (const token of [
  'from public.brinesearch_authoritative_road_identities identity',
  'join pg_temp.tmp_issue97_mapping_wave_county_order county on county.county_code=identity.county_code',
  "where identity.active and identity.state_code='OH'",
  "mapping.mapping_method in ( 'exact_source_record_id','exact_route_designation' )",
  "mapping.mapping_status in ('verified','candidate')",
  "pg_catalog.to_jsonb(mapping) -array['created_at','updated_at','verified_at']::text[]",
  'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2( identity.id )',
  "coalesce(machine.mapping_state,'[]'::jsonb)",
]) {
  requireText(currentMachineHelperBlock, token, `complete stabilized machine-state helper: ${token}`);
}
forbid(
  currentMachineHelperBlock,
  /tmp_issue97_frozen_mapping_(?:refresh_contract|targets)|\blimit\b/i,
  'post-stabilization machine-state helper narrowed to the expected rows',
);
forbid(
  currentMachineHelperBlock,
  /-array\[[^\]]*'(?:id|identity_id|road_id|mapping_status|mapping_method|evidence|verified_by)'/i,
  'post-stabilization machine-state helper removes release-semantic fields',
);
forbidFailClosedNeutralizers(
  currentMachineHelperBlock,
  'complete stabilized machine-state helper',
);

const builderCheckerStart = normalizedRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_assert_builder_stable(',
);
const builderCallsStart = normalizedRehearsal.indexOf(
  'drop table if exists pg_temp.tmp_issue97_point_corroboration;',
  builderCheckerStart,
);
if (builderCheckerStart < 0 || builderCallsStart < 0
    || !(stabilizedBaselineIndex < builderCheckerStart
      && builderCheckerStart < builderCallsStart
      && builderCallsStart < firstBuilderOffset)) {
  throw new Error('Builder-idempotence helper is not fixed before the first builder');
}
const builderCheckerBlock = normalizedRehearsal.slice(builderCheckerStart, builderCallsStart);
for (const token of [
  'full join pg_temp.issue97_mapping_wave_current_machine_semantic_state() current using(identity_id)',
  'where pg_catalog.to_jsonb(prior) is distinct from pg_catalog.to_jsonb(current)',
  'full join pg_temp.issue97_mapping_wave_current_machine_semantic_state() current using(identity_id) where pg_catalog.to_jsonb(prior) is distinct from pg_catalog.to_jsonb(current) ), sample as (',
  'count(*) over() as total_count',
  'limit 50',
  'if v_mapping_diff_count<>0 then',
  "message= 'Issue #97 builder-internal county refresh changed stabilized machine mapping state'",
  'issue97_mapping_wave_release_current_diagnostic(p_build_id)',
  'issue97_mapping_wave_release_diagnostic_passes(v_diagnostic) is distinct from true',
  "message= 'Issue #97 candidate was not immediately release-current after mapping stabilization'",
  "'triggering_build_order',p_build_order",
  "'triggering_county_code',p_county_code",
  "'build_id',p_build_id",
]) {
  requireText(builderCheckerBlock, token, `per-builder fail-closed check: ${token}`);
}
forbid(
  builderCheckerBlock,
  /\bexception\s+when\b|\b(?:return|exit|continue|perform|execute)\b|\bselect\s+\d+\s*\/|:=\s*\d+\s*\//i,
  'per-builder helper can swallow or bypass a failed invariant',
);
forbidFailClosedNeutralizers(builderCheckerBlock, 'per-builder mapping/currentness helper');
if (offsetsOf(builderCheckerBlock, 'raise exception using').length !== 3) {
  throw new Error('Per-builder helper must expose exactly three deterministic failure diagnostics');
}
if ((builderCheckerBlock.match(/\bselect\b/g) ?? []).length !== 4
    || (builderCheckerBlock.match(/:=/g) ?? []).length !== 3) {
  throw new Error('Per-builder helper contains an unreviewed statement or assignment');
}
if (md5(builderCheckerBlock) !== '174fee537721e7f00fbfbbaab47dc0d2') {
  throw new Error('Complete per-builder mapping/currentness helper block drifted');
}

const diagnosticStart = normalizedRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_release_current_diagnostic(',
);
const diagnosticPassStart = normalizedRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_release_diagnostic_passes(',
  diagnosticStart,
);
const diagnosticPassEnd = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_candidate_currentness_checks(',
  diagnosticPassStart,
);
const executableDiagnosticStart = normalizedExecutableRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_release_current_diagnostic(',
);
const executableDiagnosticPassStart = normalizedExecutableRehearsal.indexOf(
  'create or replace function pg_temp.issue97_mapping_wave_release_diagnostic_passes(',
  executableDiagnosticStart,
);
if (
  diagnosticStart < 0 || diagnosticPassStart < 0 || diagnosticPassEnd < 0
  || executableDiagnosticStart < 0 || executableDiagnosticPassStart < 0
) {
  throw new Error('Could not parse complete release-current diagnostic/pass helpers');
}
const releaseDiagnosticBlock = normalizedRehearsal.slice(diagnosticStart, diagnosticPassEnd);
const releaseDiagnosticProducerBlock = normalizedExecutableRehearsal.slice(
  executableDiagnosticStart,
  executableDiagnosticPassStart,
);
const releaseDiagnosticPassBlock = normalizedRehearsal.slice(
  diagnosticPassStart,
  diagnosticPassEnd,
);
const releaseDiagnosticPassBody = releaseDiagnosticPassBlock.slice(
  releaseDiagnosticPassBlock.indexOf('as $$'),
);
for (const token of [
  "'status',build.status", "'activated_at',build.activated_at",
  "'graph_build_sources_current',inputs.graph_build_sources_current",
  "'graph_build_release_current',inputs.graph_build_release_current",
  "'stored_mapping_snapshot_digest'", "'recomputed_current_mapping_snapshot_digest'",
  "'mapping_snapshot_equality'", "'mapping_snapshot_version'",
  "'stored_release_generation_key'", "'active_release_generation_key'",
  "'stored_release_builder_md5'", "'active_release_builder_md5'",
  "'current_builder_md5'", "'stored_supplemental_mapper_md5'",
  "'active_release_supplemental_mapper_md5'", "'current_supplemental_mapper_md5'",
  "'stored_source_content_digest'", "'current_source_content_digest'",
  "'stored_authoritative_name_digest'", "'current_authoritative_name_digest'",
  "'stored_supplemental_input_digest'", "'current_supplemental_input_digest'",
  "'stored_source_content_contract'", "'active_source_content_contract'",
  "'build_algorithm_version'", "'active_release_algorithm_version'",
  "'source_vector_current'", "'release_receipt_presence'",
  "'release_receipt_key_completeness'", "'release_receipt_stamped_at'",
  "'direct_release_receipt_current'", "'stored_graph_digest'",
  "'recomputed_graph_digest'", "'graph_digest_equality'",
  "'enabled_release_receipt_trigger_count'", "'release_receipt_trigger_function_md5'",
  "trigger.tgname='brinesearch_issue97_stamp_graph_release_receipt'",
  "'qualification_count'", "'current_qualification_count'",
  "'raw_uncached_predicate_used',true",
  "'release_current_cache_table'", "'source_current_cache_table'",
  "'issue97-release-20260815-r2'", "'06705f5b35a6d37151bb2c0dc5ade9bd'",
  "'4dd8a572b153d795163cf38a41ea9d1f'",
  "'captured-run-content+authoritative-name+supplemental-map-v2'",
  "'issue97-authoritative-topology-v2'", "'issue97-graph-mapping-v2'",
  "'e3c8fa406c6b4631b25e95a7ebb6d2d2'",
  "build_result.result->>'build_id'=build.id::text",
  "build_result.result->>'graph_digest'=build.graph_digest",
  "build.details->>'mapping_snapshot_digest' is not distinct from inputs.current_mapping_snapshot_digest",
  "build.details->>'release_generation_key'=generation.generation_key",
  "build.details->>'release_builder_md5'= generation.builder_definition_md5",
  "build.details->>'release_supplemental_mapper_md5'= generation.supplemental_mapper_md5",
  "build.details->>'release_source_content_digest'= inputs.current_source_content_digest",
  "build.details->>'release_authoritative_name_digest'= inputs.current_authoritative_name_digest",
  "build.details->>'release_supplemental_input_digest'= inputs.current_supplemental_input_digest",
  "build.details->>'release_source_content_contract'= generation.source_content_contract",
  'build.algorithm_version=generation.algorithm_version',
  'build.graph_digest is not distinct from topology.recomputed_graph_digest',
  'build.point_junction_count is not distinct from topology.recomputed_point_junction_count',
  'build.shared_segment_count is not distinct from topology.recomputed_shared_segment_count',
  'build.membership_count is not distinct from topology.recomputed_membership_count',
]) {
  requireText(releaseDiagnosticBlock, token, `release-current diagnostic component: ${token}`);
}
const releaseDiagnosticSectionNames = [
  'core', 'source_currentness', 'mapping_snapshot', 'release_generation',
  'derived_inputs', 'release_receipt', 'topology', 'release_trigger',
  'qualification', 'predicate',
];
const splitTopLevelSqlArguments = (expression, openingParenthesis) => {
  const argumentsFound = [];
  let argumentStart = openingParenthesis + 1;
  let parenthesisDepth = 1;
  let bracketDepth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = openingParenthesis + 1; index < expression.length; index += 1) {
    const character = expression[index];
    if (singleQuoted || doubleQuoted) {
      const quote = singleQuoted ? "'" : '"';
      if (character === quote) {
        if (expression[index + 1] === quote) index += 1;
        else {
          singleQuoted = false;
          doubleQuoted = false;
        }
      }
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (character === '(') parenthesisDepth += 1;
    else if (character === ')') {
      parenthesisDepth -= 1;
      if (parenthesisDepth === 0) {
        argumentsFound.push(expression.slice(argumentStart, index).trim());
        return { argumentsFound, closingParenthesis: index };
      }
    } else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === ',' && parenthesisDepth === 1 && bracketDepth === 0) {
      argumentsFound.push(expression.slice(argumentStart, index).trim());
      argumentStart = index + 1;
    }
  }
  throw new Error('Unbalanced release-current jsonb_build_object expression');
};
const findTopLevelSqlKeywordOffsets = (expression, keyword) => {
  const offsets = [];
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (singleQuoted || doubleQuoted) {
      const quote = singleQuoted ? "'" : '"';
      if (character === quote) {
        if (expression[index + 1] === quote) index += 1;
        else {
          singleQuoted = false;
          doubleQuoted = false;
        }
      }
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (character === '(') parenthesisDepth += 1;
    else if (character === ')') parenthesisDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    if (
      parenthesisDepth === 0 && bracketDepth === 0
      && expression.slice(index, index + keyword.length).toLowerCase() === keyword
      && !/[a-z0-9_]/i.test(expression[index - 1] ?? '')
      && !/[a-z0-9_]/i.test(expression[index + keyword.length] ?? '')
    ) offsets.push(index);
  }
  return offsets;
};
const diagnosticBodyMarker = 'as $$';
const diagnosticBodyStart = releaseDiagnosticProducerBlock.indexOf(diagnosticBodyMarker);
const diagnosticBodyEnd = releaseDiagnosticProducerBlock.lastIndexOf('$$;');
if (diagnosticBodyStart < 0 || diagnosticBodyEnd <= diagnosticBodyStart) {
  throw new Error('Could not isolate executable release-current diagnostic body');
}
const releaseDiagnosticSqlBody = releaseDiagnosticProducerBlock.slice(
  diagnosticBodyStart + diagnosticBodyMarker.length,
  diagnosticBodyEnd,
).trim();
const releaseDiagnosticTopLevelSelects = findTopLevelSqlKeywordOffsets(
  releaseDiagnosticSqlBody,
  'select',
);
if (releaseDiagnosticTopLevelSelects.length !== 1) {
  throw new Error('Release-current diagnostic must have one top-level returned SELECT');
}
const releaseDiagnosticOuterStart = releaseDiagnosticTopLevelSelects[0];
const releaseDiagnosticOuterPrefix = 'select pg_catalog.jsonb_build_object(';
if (!releaseDiagnosticSqlBody.startsWith(
  releaseDiagnosticOuterPrefix,
  releaseDiagnosticOuterStart,
)) {
  throw new Error('Release-current diagnostic does not directly return its outer object');
}
const releaseDiagnosticOuter = splitTopLevelSqlArguments(
  releaseDiagnosticSqlBody,
  releaseDiagnosticOuterStart + 'select pg_catalog.jsonb_build_object'.length,
);
const releaseDiagnosticOuterSuffix = releaseDiagnosticSqlBody.slice(
  releaseDiagnosticOuter.closingParenthesis + 1,
).trim();
const expectedReleaseDiagnosticOuterSuffix = [
  'from generation_summary',
  'cross join trigger_state',
  'left join build on true',
  'left join generation on true',
  'left join current_inputs inputs on true',
  'left join topology on true',
  'left join build_result on true',
  'left join qualification on true',
].join(' ');
if (releaseDiagnosticOuterSuffix !== expectedReleaseDiagnosticOuterSuffix) {
  throw new Error('Release-current diagnostic returned-object FROM/JOIN contract drifted');
}
if (releaseDiagnosticOuter.argumentsFound.length % 2 !== 0) {
  throw new Error('Outer release-current diagnostic has an odd argument count');
}
const releaseDiagnosticSections = new Map();
const actualReleaseDiagnosticSectionNames = [];
for (
  let index = 0;
  index < releaseDiagnosticOuter.argumentsFound.length;
  index += 2
) {
  const keyArgument = releaseDiagnosticOuter.argumentsFound[index];
  const valueArgument = releaseDiagnosticOuter.argumentsFound[index + 1];
  const keyMatch = keyArgument.match(/^'([a-z0-9_]+)'$/);
  if (!keyMatch) {
    throw new Error('Outer release-current diagnostic has a computed section key');
  }
  if (!valueArgument.startsWith('pg_catalog.jsonb_build_object(')) {
    throw new Error(`Release-current diagnostic section ${keyMatch[1]} is not an object`);
  }
  const parsedValue = splitTopLevelSqlArguments(
    valueArgument,
    'pg_catalog.jsonb_build_object'.length,
  );
  if (valueArgument.slice(parsedValue.closingParenthesis + 1).trim() !== '') {
    throw new Error(`Release-current diagnostic section ${keyMatch[1]} has a wrapper`);
  }
  actualReleaseDiagnosticSectionNames.push(keyMatch[1]);
  releaseDiagnosticSections.set(keyMatch[1], parsedValue.argumentsFound);
}
assert.deepEqual(
  actualReleaseDiagnosticSectionNames,
  releaseDiagnosticSectionNames,
  'Outer release-current diagnostic section set/order drifted',
);
const expectedReleaseDiagnosticKeys = new Map([
  ['core', [
    'build_present', 'build_order', 'county_code', 'build_id', 'status',
    'activated_at', 'started_at', 'algorithm_version', 'source_revision_digest',
    'graph_digest', 'result_status', 'result_active', 'result_build_id',
    'result_graph_digest', 'result_build_matches', 'result_graph_digest_matches',
  ]],
  ['source_currentness', [
    'source_vector_current', 'graph_build_sources_current', 'source_run_vector',
    'source_vector_version',
  ]],
  ['mapping_snapshot', [
    'stored_mapping_snapshot_digest', 'recomputed_current_mapping_snapshot_digest',
    'mapping_snapshot_equality', 'mapping_snapshot_version', 'mapping_snapshot_present',
  ]],
  ['release_generation', [
    'active_release_generation_count', 'active_generations',
    'stored_release_generation_key', 'active_release_generation_key',
    'stored_release_builder_md5', 'active_release_builder_md5', 'current_builder_md5',
    'stored_supplemental_mapper_md5', 'active_release_supplemental_mapper_md5',
    'current_supplemental_mapper_md5', 'stored_source_content_contract',
    'active_source_content_contract', 'build_algorithm_version',
    'active_release_algorithm_version', 'generation_activated_at',
  ]],
  ['derived_inputs', [
    'stored_source_content_digest', 'current_source_content_digest',
    'source_content_equality', 'stored_authoritative_name_digest',
    'current_authoritative_name_digest', 'authoritative_name_equality',
    'stored_supplemental_input_digest', 'current_supplemental_input_digest',
    'supplemental_input_equality', 'current_source_content_digest_valid',
    'current_authoritative_name_digest_valid', 'current_supplemental_input_digest_valid',
  ]],
  ['release_receipt', [
    'release_receipt_presence', 'release_receipt_key_completeness',
    'release_receipt_stamped_at', 'build_started_after_generation_activation',
    'direct_release_receipt_current',
  ]],
  ['topology', [
    'stored_graph_digest', 'recomputed_graph_digest', 'graph_digest_equality',
    'stored_point_junction_count', 'recomputed_point_junction_count',
    'point_junction_count_equality', 'stored_shared_segment_count',
    'recomputed_shared_segment_count', 'shared_segment_count_equality',
    'stored_membership_count', 'recomputed_membership_count', 'membership_count_equality',
  ]],
  ['release_trigger', [
    'enabled_release_receipt_trigger_count', 'release_receipt_trigger_function_md5',
    'release_receipt_trigger_definitions',
  ]],
  ['qualification', [
    'qualification_count', 'current_qualification_count', 'qualification_rows',
  ]],
  ['predicate', [
    'graph_build_release_current', 'raw_uncached_predicate_used',
    'release_current_cache_table', 'source_current_cache_table',
  ]],
]);
const releaseDiagnosticValues = new Map();
for (const sectionName of releaseDiagnosticSectionNames) {
  const argumentsFound = releaseDiagnosticSections.get(sectionName);
  if (argumentsFound.length % 2 !== 0) {
    throw new Error(`Release-current diagnostic section ${sectionName} has an odd argument count`);
  }
  const actualKeys = argumentsFound
    .filter((_, index) => index % 2 === 0)
    .map((argument) => {
      const match = argument.match(/^'([a-z0-9_]+)'$/);
      if (!match) {
        throw new Error(`Release-current diagnostic section ${sectionName} has a computed key`);
      }
      return match[1];
    });
  assert.deepEqual(
    actualKeys,
    expectedReleaseDiagnosticKeys.get(sectionName),
    `Release-current diagnostic section ${sectionName} key set/order drifted`,
  );
  releaseDiagnosticValues.set(sectionName, new Map(actualKeys.map(
    (key, index) => [key, argumentsFound[(index * 2) + 1]],
  )));
}
const releaseDiagnosticBindings = [
  ['core', 'build_present', 'build.id is not null', 'build presence'],
  ['core', 'status', 'build.status', 'candidate status'],
  ['core', 'activated_at', 'build.activated_at', 'candidate activation'],
  ['core', 'result_status', "build_result.result->>'status'", 'builder result status'],
  ['core', 'result_active', "build_result.result->>'active'", 'builder result activation'],
  ['core', 'result_build_matches', "build_result.result->>'build_id'=build.id::text", 'builder result/build identity'],
  ['core', 'result_graph_digest_matches', "build_result.result->>'graph_digest'=build.graph_digest", 'builder result/graph digest'],
  ['source_currentness', 'source_vector_current', 'inputs.source_vector_current', 'source-vector currentness'],
  ['source_currentness', 'graph_build_sources_current', 'inputs.graph_build_sources_current', 'raw source currentness'],
  ['mapping_snapshot', 'mapping_snapshot_equality', "build.details->>'mapping_snapshot_digest' is not distinct from inputs.current_mapping_snapshot_digest", 'mapping snapshot equality'],
  ['mapping_snapshot', 'mapping_snapshot_present', "nullif(build.details->>'mapping_snapshot_digest','') is not null", 'mapping snapshot presence'],
  ['mapping_snapshot', 'mapping_snapshot_version', "build.details->>'mapping_snapshot_version'", 'mapping snapshot version'],
  ['release_generation', 'active_release_generation_count', 'generation_summary.active_generation_count', 'active generation count'],
  ['release_generation', 'stored_release_generation_key', "build.details->>'release_generation_key'", 'stored generation key'],
  ['release_generation', 'active_release_generation_key', 'generation.generation_key', 'active generation key'],
  ['release_generation', 'stored_release_builder_md5', "build.details->>'release_builder_md5'", 'stored builder MD5'],
  ['release_generation', 'active_release_builder_md5', 'generation.builder_definition_md5', 'active builder MD5'],
  ['release_generation', 'current_builder_md5', 'inputs.current_builder_md5', 'live builder MD5'],
  ['release_generation', 'stored_supplemental_mapper_md5', "build.details->>'release_supplemental_mapper_md5'", 'stored supplemental mapper MD5'],
  ['release_generation', 'active_release_supplemental_mapper_md5', 'generation.supplemental_mapper_md5', 'active supplemental mapper MD5'],
  ['release_generation', 'current_supplemental_mapper_md5', 'inputs.current_supplemental_mapper_md5', 'live supplemental mapper MD5'],
  ['release_generation', 'stored_source_content_contract', "build.details->>'release_source_content_contract'", 'stored source-content contract'],
  ['release_generation', 'active_source_content_contract', 'generation.source_content_contract', 'active source-content contract'],
  ['release_generation', 'build_algorithm_version', 'build.algorithm_version', 'build algorithm version'],
  ['release_generation', 'active_release_algorithm_version', 'generation.algorithm_version', 'active algorithm version'],
  ['derived_inputs', 'source_content_equality', "build.details->>'release_source_content_digest' is not distinct from inputs.current_source_content_digest", 'source-content equality'],
  ['derived_inputs', 'authoritative_name_equality', "build.details->>'release_authoritative_name_digest' is not distinct from inputs.current_authoritative_name_digest", 'authoritative-name equality'],
  ['derived_inputs', 'supplemental_input_equality', "build.details->>'release_supplemental_input_digest' is not distinct from inputs.current_supplemental_input_digest", 'supplemental-input equality'],
  ['derived_inputs', 'current_source_content_digest_valid', "coalesce(inputs.current_source_content_digest,'')~'^[0-9a-f]{32}$'", 'source-content digest format'],
  ['derived_inputs', 'current_authoritative_name_digest_valid', "coalesce(inputs.current_authoritative_name_digest,'')~'^[0-9a-f]{32}$'", 'authoritative-name digest format'],
  ['derived_inputs', 'current_supplemental_input_digest_valid', "coalesce(inputs.current_supplemental_input_digest,'')~'^[0-9a-f]{32}$'", 'supplemental-input digest format'],
  ['release_receipt', 'release_receipt_presence', "build.details ? 'release_generation_key'", 'release receipt presence'],
  ['release_receipt', 'release_receipt_key_completeness', "build.details ?& array[ 'release_generation_key','release_builder_md5', 'release_supplemental_mapper_md5','release_source_content_digest', 'release_authoritative_name_digest', 'release_supplemental_input_digest', 'release_source_content_contract','release_receipt_stamped_at' ]", 'complete release receipt key set'],
  ['release_receipt', 'release_receipt_stamped_at', "build.details->>'release_receipt_stamped_at'", 'release receipt stamp'],
  ['release_receipt', 'build_started_after_generation_activation', 'build.started_at>=generation.activated_at', 'build/generation temporal order'],
  ['release_receipt', 'direct_release_receipt_current', "generation.generation_key is not null and build.details->>'release_generation_key'=generation.generation_key and build.details->>'release_builder_md5'= generation.builder_definition_md5 and build.details->>'release_supplemental_mapper_md5'= generation.supplemental_mapper_md5 and build.details->>'release_source_content_digest'= inputs.current_source_content_digest and build.details->>'release_authoritative_name_digest'= inputs.current_authoritative_name_digest and build.details->>'release_supplemental_input_digest'= inputs.current_supplemental_input_digest and build.details->>'release_source_content_contract'= generation.source_content_contract and build.algorithm_version=generation.algorithm_version", 'complete direct release receipt predicate'],
  ['topology', 'graph_digest_equality', 'build.graph_digest is not distinct from topology.recomputed_graph_digest', 'topology graph digest equality'],
  ['topology', 'point_junction_count_equality', 'build.point_junction_count is not distinct from topology.recomputed_point_junction_count', 'topology point-junction count equality'],
  ['topology', 'shared_segment_count_equality', 'build.shared_segment_count is not distinct from topology.recomputed_shared_segment_count', 'topology shared-segment count equality'],
  ['topology', 'membership_count_equality', 'build.membership_count is not distinct from topology.recomputed_membership_count', 'topology membership count equality'],
  ['release_trigger', 'enabled_release_receipt_trigger_count', 'trigger_state.enabled_trigger_count', 'enabled release trigger count'],
  ['release_trigger', 'release_receipt_trigger_function_md5', 'trigger_state.trigger_function_md5', 'release trigger function MD5'],
  ['predicate', 'raw_uncached_predicate_used', 'true', 'raw predicate selection'],
  ['predicate', 'graph_build_release_current', 'inputs.graph_build_release_current', 'raw release currentness'],
];
for (const [sectionName, key, expectedValue, label] of releaseDiagnosticBindings) {
  const actualValue = releaseDiagnosticValues.get(sectionName).get(key);
  if (actualValue !== expectedValue) {
    throw new Error(`Release-current diagnostic is not exactly bound to live ${label}`);
  }
}
forbid(
  releaseDiagnosticBlock,
  /brinesearch_issue97_graph_build_release_current_(?:cached|contextual)|brinesearch_issue97_(?:ensure|prepare)[a-z0-9_]*cache/i,
  'cached/contextual/restamped release-current substitute',
);
forbid(
  releaseDiagnosticBlock,
  /direct_release_receipt_current[^;]{0,300}\bor\b[^;]{0,300}(?:qualification|current_qualification)/i,
  'qualification fallback can make a failed direct candidate receipt pass',
);
forbid(
  releaseDiagnosticBlock,
  /\btrue\s+or\b|\bor\s+true\b|\b1\s*=\s*1\b|\bexception\s+when\b/i,
  'release-current diagnostic contains a neutralised/swallowed predicate',
);
const releaseDiagnosticPassPredicates = [
  "p_diagnostic->'core'->>'build_present'='true'",
  "p_diagnostic->'core'->>'status'='validated'",
  "p_diagnostic->'core'->>'activated_at' is null",
  "p_diagnostic->'core'->>'result_status'='validated'",
  "p_diagnostic->'core'->>'result_active'='false'",
  "p_diagnostic->'core'->>'result_build_matches'='true'",
  "p_diagnostic->'core'->>'result_graph_digest_matches'='true'",
  "p_diagnostic->'source_currentness'->>'source_vector_current'='true'",
  "p_diagnostic->'source_currentness'->>'graph_build_sources_current'='true'",
  "p_diagnostic->'mapping_snapshot'->>'mapping_snapshot_present'='true'",
  "p_diagnostic->'mapping_snapshot'->>'mapping_snapshot_equality'='true'",
  "p_diagnostic->'mapping_snapshot'->>'mapping_snapshot_version'= 'issue97-graph-mapping-v2'",
  "p_diagnostic->'release_generation'->>'active_release_generation_count'='1'",
  "p_diagnostic->'release_generation'->>'stored_release_generation_key'= 'issue97-release-20260815-r2'",
  "p_diagnostic->'release_generation'->>'active_release_generation_key'= 'issue97-release-20260815-r2'",
  "p_diagnostic->'release_generation'->>'stored_release_builder_md5'= '06705f5b35a6d37151bb2c0dc5ade9bd'",
  "p_diagnostic->'release_generation'->>'active_release_builder_md5'= '06705f5b35a6d37151bb2c0dc5ade9bd'",
  "p_diagnostic->'release_generation'->>'current_builder_md5'= '06705f5b35a6d37151bb2c0dc5ade9bd'",
  "p_diagnostic->'release_generation'->>'stored_supplemental_mapper_md5'= '4dd8a572b153d795163cf38a41ea9d1f'",
  "p_diagnostic->'release_generation'->>'active_release_supplemental_mapper_md5'= '4dd8a572b153d795163cf38a41ea9d1f'",
  "p_diagnostic->'release_generation'->>'current_supplemental_mapper_md5'= '4dd8a572b153d795163cf38a41ea9d1f'",
  "p_diagnostic->'release_generation'->>'stored_source_content_contract'= 'captured-run-content+authoritative-name+supplemental-map-v2'",
  "p_diagnostic->'release_generation'->>'active_source_content_contract'= 'captured-run-content+authoritative-name+supplemental-map-v2'",
  "p_diagnostic->'release_generation'->>'build_algorithm_version'= 'issue97-authoritative-topology-v2'",
  "p_diagnostic->'release_generation'->>'active_release_algorithm_version'= 'issue97-authoritative-topology-v2'",
  "p_diagnostic->'derived_inputs'->>'source_content_equality'='true'",
  "p_diagnostic->'derived_inputs'->>'authoritative_name_equality'='true'",
  "p_diagnostic->'derived_inputs'->>'supplemental_input_equality'='true'",
  "p_diagnostic->'derived_inputs'->>'current_source_content_digest_valid'='true'",
  "p_diagnostic->'derived_inputs'->>'current_authoritative_name_digest_valid'='true'",
  "p_diagnostic->'derived_inputs'->>'current_supplemental_input_digest_valid'='true'",
  "p_diagnostic->'release_receipt'->>'release_receipt_presence'='true'",
  "p_diagnostic->'release_receipt'->>'release_receipt_key_completeness'='true'",
  "nullif(p_diagnostic->'release_receipt'->>'release_receipt_stamped_at','') is not null",
  "p_diagnostic->'release_receipt'->>'build_started_after_generation_activation'='true'",
  "p_diagnostic->'release_receipt'->>'direct_release_receipt_current'='true'",
  "p_diagnostic->'topology'->>'graph_digest_equality'='true'",
  "p_diagnostic->'topology'->>'point_junction_count_equality'='true'",
  "p_diagnostic->'topology'->>'shared_segment_count_equality'='true'",
  "p_diagnostic->'topology'->>'membership_count_equality'='true'",
  "p_diagnostic->'release_trigger'->>'enabled_release_receipt_trigger_count'='1'",
  "p_diagnostic->'release_trigger'->>'release_receipt_trigger_function_md5'= 'e3c8fa406c6b4631b25e95a7ebb6d2d2'",
  "p_diagnostic->'predicate'->>'raw_uncached_predicate_used'='true'",
  "p_diagnostic->'predicate'->>'graph_build_release_current'='true'",
];
for (const token of releaseDiagnosticPassPredicates) {
  requireText(releaseDiagnosticPassBlock, token,
    `release-current NULL-fail-closed pass predicate: ${token}`);
}
const releaseDiagnosticPassMatch = releaseDiagnosticPassBlock.match(
  /as \$\$ select coalesce\( (.*), false \) \$\$;\s*$/,
);
if (!releaseDiagnosticPassMatch
    || !releaseDiagnosticPassMatch[1].split(' and ').every(
      (predicate, index) => predicate === releaseDiagnosticPassPredicates[index],
    )
    || releaseDiagnosticPassMatch[1].split(' and ').length
      !== releaseDiagnosticPassPredicates.length) {
  throw new Error('Release-current pass helper must be exactly one NULL-fail-closed AND chain');
}
forbid(
  releaseDiagnosticPassBody,
  /\bor\b|\bqualification\b|\bcached\b|\bcontextual\b|\bcase\b|\bcoalesce\s*\(\s*true\b/i,
  'release-current pass predicate permits a fallback/disjunction',
);

const checkCalls = [...normalizedRehearsal.matchAll(
  /select pg_temp\.issue97_mapping_wave_assert_builder_stable\(\s*([1-8]),'([A-Z]{3})',\s*\(select \(result->>'build_id'\)::uuid from tmp_issue97_mapping_wave_build_results where build_order=\1\)\s*\);/g,
)];
const executableCheckCalls = [...normalizedExecutableRehearsal.matchAll(
  /select pg_temp\.issue97_mapping_wave_assert_builder_stable\(\s*([1-8]),'([A-Z]{3})',\s*\(select \(result->>'build_id'\)::uuid from tmp_issue97_mapping_wave_build_results where build_order=\1\)\s*\);/g,
)];
if (checkCalls.length !== 8
    || checkCalls.map((match) => match[2]).join(',') !== stabilizationCounties.join(',')
    || executableCheckCalls.length !== 8
    || executableCheckCalls.map((match) => match[2]).join(',')
      !== stabilizationCounties.join(',')) {
  throw new Error(`Per-builder immediate checks drifted: ${checkCalls.map((match) => `${match[1]}:${match[2]}`).join(',')}`);
}
const builderOffsets = [...normalizedRehearsal.matchAll(
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','([A-Z]{3})'\)/g,
)];
const executableBuilderOffsets = [...normalizedExecutableRehearsal.matchAll(
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','([A-Z]{3})'\)/g,
)];
if (executableBuilderOffsets.length !== 8
    || executableBuilderOffsets.map((match) => match[1]).join(',')
      !== stabilizationCounties.join(',')) {
  throw new Error('Executable builder order/count drifted');
}
for (let index = 0; index < 8; index += 1) {
  const nextBuilder = index === 7 ? Number.POSITIVE_INFINITY : builderOffsets[index + 1].index;
  if (!(builderOffsets[index].index < checkCalls[index].index
        && checkCalls[index].index < nextBuilder)) {
    throw new Error(`Immediate mapping/currentness check is not directly after builder ${index + 1}`);
  }
  const buildOrder = index + 1;
  const county = stabilizationCounties[index];
  const exactAdjacentPair = `insert into tmp_issue97_mapping_wave_build_results( build_order,county_code,result ) values (${buildOrder},'${county}',public.brinesearch_issue97_rebuild_county_graph('OH','${county}')); select pg_temp.issue97_mapping_wave_assert_builder_stable( ${buildOrder},'${county}',(select (result->>'build_id')::uuid from tmp_issue97_mapping_wave_build_results where build_order=${buildOrder}) );`;
  requireText(
    normalizedExecutableRehearsal,
    exactAdjacentPair,
    `builder ${buildOrder}/${county} must be immediately followed by its checker`,
  );
}

const finalStabilityMessage = 'Issue #97 final all-eight stabilized candidate contract drifted';
const finalMachineDifferenceStart = normalizedExecutableRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_final_machine_mapping_differences',
);
const finalCurrentnessInsertStart = normalizedExecutableRehearsal.indexOf(
  'insert into tmp_issue97_mapping_wave_candidate_currentness_checks(',
  finalMachineDifferenceStart,
);
const exactFinalMachineDifferenceQuery = "create temporary table tmp_issue97_mapping_wave_final_machine_mapping_differences on commit drop as select coalesce(prior.identity_id,current.identity_id) as identity_id, coalesce(current.county_code,prior.county_code) as owning_county_code, coalesce(current.source_identity_key,prior.source_identity_key) as source_identity_key, case when prior.identity_id is null then 'IDENTITY_ADDED' when current.identity_id is null then 'IDENTITY_REMOVED' when prior.graph_mapping_fingerprint is distinct from current.graph_mapping_fingerprint then 'GRAPH_MAPPING_FINGERPRINT_CHANGED' else 'NORMALIZED_MACHINE_MAPPING_CHANGED' end as transition_classification, pg_catalog.to_jsonb(prior) as stabilized_mapping, pg_catalog.to_jsonb(current) as final_mapping from tmp_issue97_mapping_wave_post_stabilization_pre_build_semantic_baseline prior full join tmp_issue97_mapping_wave_machine_mappings_after_all_builds current using(identity_id) where pg_catalog.to_jsonb(prior) is distinct from pg_catalog.to_jsonb(current) order by owning_county_code,source_identity_key,identity_id;";
if (finalMachineDifferenceStart < 0 || finalCurrentnessInsertStart < 0
    || normalizedExecutableRehearsal.slice(
      finalMachineDifferenceStart,
      finalCurrentnessInsertStart,
    ).trim() !== exactFinalMachineDifferenceQuery) {
  throw new Error('Final all-eight machine-state FULL JOIN query drifted or narrowed');
}
const finalStabilityExecutableStart = normalizedExecutableRehearsal.indexOf(
  'do $issue97_mapping_wave_final_all_eight_stability_assertion$',
  finalCurrentnessInsertStart,
);
const exactFinalCurrentnessInsert = "insert into tmp_issue97_mapping_wave_candidate_currentness_checks( check_phase,triggering_build_order,triggering_county_code, build_order,county_code,build_id,diagnostic ) select 'final',8,'NOB',result.build_order,result.county_code,build.id, pg_temp.issue97_mapping_wave_release_current_diagnostic(build.id) from tmp_issue97_mapping_wave_build_results result join tmp_issue97_mapping_wave_new_builds build on build.id=(result.result->>'build_id')::uuid order by result.build_order;";
if (finalStabilityExecutableStart < 0
    || normalizedExecutableRehearsal.slice(
      finalCurrentnessInsertStart,
      finalStabilityExecutableStart,
    ).trim() !== exactFinalCurrentnessInsert) {
  throw new Error('Final all-eight currentness checks must recompute live candidate diagnostics');
}
const finalStabilityIndex = normalizedRehearsal.indexOf(finalStabilityMessage);
const candidateEvidenceIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_candidate_temporal_evidence',
);
const executableCandidateEvidenceIndex = normalizedExecutableRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_candidate_temporal_evidence',
);
const finalCandidateOutput = 'select build_order,county_code,build_id,graph_digest,mapping_snapshot_digest, source_revision_digest,immediate_release_current,final_release_current, status,activated_at from tmp_issue97_mapping_wave_candidate_temporal_evidence order by build_order;';
const finalCandidateOutputIndex = normalizedRehearsal.indexOf(finalCandidateOutput);
if (finalStabilityIndex < 0 || candidateEvidenceIndex < 0 || finalCandidateOutputIndex < 0
    || !(builderOffsets[7].index < finalStabilityIndex
      && finalStabilityIndex < candidateEvidenceIndex
      && candidateEvidenceIndex < finalCandidateOutputIndex)) {
  throw new Error('Final all-eight currentness assertion/evidence/output ordering drifted');
}
if (offsetsOf(normalizedRehearsal, finalCandidateOutput).length !== 1) {
  throw new Error('Final ten-column candidate evidence output must occur exactly once');
}
if (offsetsOf(normalizedExecutableRehearsal, finalCandidateOutput).length !== 1) {
  throw new Error('Final ten-column candidate evidence output is not executable exactly once');
}
const topLevelCandidateSelects = splitTopLevelSqlStatements(executableRehearsal)
  .map(normalizeTopLevelStatement)
  .filter((statement) => /^select\b/i.test(statement)
    && /tmp_issue97_mapping_wave_(?:build_results|new_builds|candidate_temporal_evidence)/i
      .test(statement));
const expectedTopLevelCandidateSelects = stabilizationCounties.map((county, index) => {
  const buildOrder = index + 1;
  return `select pg_temp.issue97_mapping_wave_assert_builder_stable( ${buildOrder},'${county}',(select (result->>'build_id')::uuid from tmp_issue97_mapping_wave_build_results where build_order=${buildOrder}) );`;
}).concat(finalCandidateOutput);
assert.deepEqual(
  topLevelCandidateSelects,
  expectedTopLevelCandidateSelects,
  'Only the eight immediate checker calls and terminal evidence SELECT may expose candidate tables',
);
forbid(
  normalizedExecutableRehearsal.slice(0, executableCandidateEvidenceIndex),
  /\bselect\s+(?:result\.)?build_order\s*,\s*(?:build\.)?county_code\s*,\s*(?:build\.)?(?:id\s+as\s+)?build_id\b/i,
  'candidate rows can be emitted before the final all-eight assertions',
);
const candidateEvidenceAssertionOpen =
  'do $issue97_mapping_wave_candidate_temporal_evidence_assertion$';
const candidateEvidenceEnd = normalizedRehearsal.indexOf(
  candidateEvidenceAssertionOpen,
  candidateEvidenceIndex,
);
const candidateEvidenceBlock = normalizedRehearsal.slice(
  candidateEvidenceIndex,
  candidateEvidenceEnd,
);
for (const token of [
  'select result.build_order,build.county_code,build.id as build_id, build.graph_digest, build.details->>\'mapping_snapshot_digest\' as mapping_snapshot_digest, build.source_revision_digest, result.immediate_release_current, (final_check.diagnostic->\'predicate\'->>\'graph_build_release_current\')::boolean as final_release_current, build.status,build.activated_at',
  'from tmp_issue97_mapping_wave_build_results result',
  'join tmp_issue97_mapping_wave_new_builds build on build.id=(result.result->>\'build_id\')::uuid',
  "join tmp_issue97_mapping_wave_candidate_currentness_checks final_check on final_check.check_phase='final' and final_check.build_id=build.id",
  'order by result.build_order;',
]) {
  requireText(candidateEvidenceBlock, token, `candidate temporal evidence row shape: ${token}`);
}
forbid(
  candidateEvidenceBlock,
  /\bwhere\b|\blimit\b|\bcross\s+join\b|\b(?:union|intersect|except)\b/i,
  'candidate evidence table can omit one of the eight checked builds',
);
const candidateEvidenceAssertionClose =
  '$issue97_mapping_wave_candidate_temporal_evidence_assertion$;';
const candidateEvidenceAssertionEnd = normalizedRehearsal.indexOf(
  candidateEvidenceAssertionClose,
  candidateEvidenceEnd,
);
if (candidateEvidenceEnd < 0 || candidateEvidenceAssertionEnd < 0) {
  throw new Error('Could not parse final candidate evidence-table assertion');
}
const candidateEvidenceAssertionBlock = normalizedRehearsal.slice(
  candidateEvidenceEnd,
  candidateEvidenceAssertionEnd + candidateEvidenceAssertionClose.length,
);
for (const token of [
  '(select count(*) from tmp_issue97_mapping_wave_candidate_temporal_evidence)<>8',
  'array[1,2,3,4,5,6,7,8]::integer[]',
  "array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]",
  'candidate.build_id is null',
  "coalesce(candidate.graph_digest,'') !~ '^[0-9a-f]{32}$'",
  "coalesce(candidate.mapping_snapshot_digest,'') !~ '^[0-9a-f]{32}$'",
  "coalesce(candidate.source_revision_digest,'') !~ '^[0-9a-f]{32}$'",
  'candidate.immediate_release_current is distinct from true',
  'candidate.final_release_current is distinct from true',
  "candidate.status is distinct from 'validated'",
  'candidate.activated_at is not null',
  "'candidate_count',count(*)",
  "'candidate_rows',coalesce(pg_catalog.jsonb_agg( pg_catalog.to_jsonb(candidate) order by candidate.build_order ),'[]'::jsonb)",
  "message='Issue #97 final candidate evidence table drifted'",
  'detail=v_detail::text',
]) {
  requireText(
    candidateEvidenceAssertionBlock,
    token,
    `final candidate evidence-table assertion: ${token}`,
  );
}
forbidFailClosedNeutralizers(
  candidateEvidenceAssertionBlock,
  'final candidate evidence-table assertion',
);
const finalStabilityStart = normalizedRehearsal.lastIndexOf(
  'do $issue97_mapping_wave_final_all_eight_stability_assertion$',
  finalStabilityIndex,
);
const finalStabilityClose = '$issue97_mapping_wave_final_all_eight_stability_assertion$;';
const finalStabilityEnd = normalizedRehearsal.indexOf(finalStabilityClose, finalStabilityIndex);
const finalStabilityBlock = normalizedRehearsal.slice(
  finalStabilityStart,
  finalStabilityEnd + finalStabilityClose.length,
);
for (const token of [
  'from tmp_issue97_mapping_wave_final_machine_mapping_differences',
  "where check_phase='immediate')<>8",
  "where check_phase='final')<>8",
  'issue97_mapping_wave_release_diagnostic_passes( check_result.diagnostic ) is distinct from true',
  'result.immediate_release_current is distinct from true',
  "build.status is distinct from 'validated'",
  'build.activated_at is not null',
  "'final_mapping_semantic_difference_count'",
  "'candidate_currentness_checks'",
  `message='${finalStabilityMessage}'`,
]) {
  requireText(finalStabilityBlock, token, `final all-eight stability contract: ${token}`);
}
forbidFailClosedNeutralizers(finalStabilityBlock, 'final all-eight stability contract');
forbid(
  normalizedRehearsal.slice(candidateEvidenceIndex, finalCandidateOutputIndex),
  /\btrue\s+as\s+(?:immediate_release_current|final_release_current)\b/i,
  'candidate output hard-codes release currentness',
);
forbid(
  normalizedExecutableRehearsal.slice(
    normalizedExecutableRehearsal.indexOf(
      candidateEvidenceAssertionClose,
      normalizedExecutableRehearsal.indexOf(candidateEvidenceAssertionOpen),
    ) + candidateEvidenceAssertionClose.length,
    normalizedExecutableRehearsal.indexOf(finalCandidateOutput),
  ),
  /tmp_issue97_mapping_wave_candidate_temporal_evidence/i,
  'candidate evidence is emitted before every later safety assertion passes',
);

const releaseDiagnosticModelPasses = ({
  status = 'validated',
  activatedAt = null,
  resultStatus = 'validated',
  resultActive = false,
  resultBuildMatches = true,
  resultGraphMatches = true,
  sourceVectorCurrent = true,
  sourcesCurrent = true,
  mappingPresent = true,
  mappingEqual = true,
  mappingVersion = 'issue97-graph-mapping-v2',
  activeGenerationCount = 1,
  generationKey = 'issue97-release-20260815-r2',
  builderMd5 = '06705f5b35a6d37151bb2c0dc5ade9bd',
  mapperMd5 = '4dd8a572b153d795163cf38a41ea9d1f',
  sourceContract = 'captured-run-content+authoritative-name+supplemental-map-v2',
  algorithm = 'issue97-authoritative-topology-v2',
  inputDigestsEqual = true,
  inputDigestsValid = true,
  receiptPresent = true,
  receiptComplete = true,
  receiptStampedAt = '2026-08-21T00:00:00Z',
  startedAfterGeneration = true,
  directReceiptCurrent = true,
  topologyEqual = true,
  triggerCount = 1,
  triggerMd5 = 'e3c8fa406c6b4631b25e95a7ebb6d2d2',
  rawPredicate = true,
}) => status === 'validated' && activatedAt === null
  && resultStatus === 'validated' && resultActive === false
  && resultBuildMatches === true && resultGraphMatches === true
  && sourceVectorCurrent === true && sourcesCurrent === true
  && mappingPresent === true && mappingEqual === true
  && mappingVersion === 'issue97-graph-mapping-v2'
  && activeGenerationCount === 1 && generationKey === 'issue97-release-20260815-r2'
  && builderMd5 === '06705f5b35a6d37151bb2c0dc5ade9bd'
  && mapperMd5 === '4dd8a572b153d795163cf38a41ea9d1f'
  && sourceContract === 'captured-run-content+authoritative-name+supplemental-map-v2'
  && algorithm === 'issue97-authoritative-topology-v2'
  && inputDigestsEqual === true && inputDigestsValid === true
  && receiptPresent === true && receiptComplete === true
  && typeof receiptStampedAt === 'string' && receiptStampedAt.length > 0
  && startedAfterGeneration === true && directReceiptCurrent === true
  && topologyEqual === true && triggerCount === 1
  && triggerMd5 === 'e3c8fa406c6b4631b25e95a7ebb6d2d2'
  && rawPredicate === true;
assert.equal(releaseDiagnosticModelPasses({}), true);
for (const mutation of [
  { status: null }, { activatedAt: '2026-08-21T00:00:00Z' },
  { resultStatus: null }, { resultActive: null }, { resultActive: true },
  { resultBuildMatches: false }, { resultBuildMatches: null },
  { resultGraphMatches: false }, { sourceVectorCurrent: null },
  { sourcesCurrent: false }, { mappingPresent: null }, { mappingEqual: false },
  { mappingVersion: null }, { activeGenerationCount: 0 }, { activeGenerationCount: 2 },
  { generationKey: null }, { builderMd5: null }, { mapperMd5: null },
  { sourceContract: null }, { algorithm: null }, { inputDigestsEqual: null },
  { inputDigestsValid: false }, { receiptPresent: null }, { receiptComplete: false },
  { receiptStampedAt: null }, { startedAfterGeneration: null },
  { directReceiptCurrent: false }, { topologyEqual: null },
  { triggerCount: 0 }, { triggerCount: 2 }, { triggerMd5: null },
  { rawPredicate: false }, { rawPredicate: null },
]) {
  assert.equal(
    releaseDiagnosticModelPasses(mutation),
    false,
    `release-current diagnostic mutation escaped: ${JSON.stringify(mutation)}`,
  );
}
if (md5(normalizedRehearsal) !== '4fd6d1486a214fdbb91aa77b9767a00d') {
  throw new Error('Complete frozen mapping-wave rehearsal drifted');
}
const rebuildAssertionsOpen = 'do $issue97_frozen_mapping_rebuild_assertions$';
const rebuildAssertionsClose = '$issue97_frozen_mapping_rebuild_assertions$;';
const rebuildAssertionsStart = normalizedRehearsal.indexOf(rebuildAssertionsOpen);
const rebuildAssertionsEnd = normalizedRehearsal.indexOf(
  rebuildAssertionsClose,
  rebuildAssertionsStart,
);
if (rebuildAssertionsStart < 0 || rebuildAssertionsEnd < 0) {
  throw new Error('Could not parse the mapping-wave rebuild assertion block');
}
const rebuildAssertionsBlock = normalizedRehearsal.slice(
  rebuildAssertionsStart,
  rebuildAssertionsEnd + rebuildAssertionsClose.length,
);
if (md5(rebuildAssertionsBlock) !== 'c00fd82468b032b86ba561cd1188626a') {
  throw new Error('Complete mapping-wave rebuild assertion block drifted');
}
const googlePostprocessOpen =
  'do $issue97_frozen_mapping_refresh_expansion_google_postprocess_assertion$';
const googlePostprocessClose =
  '$issue97_frozen_mapping_refresh_expansion_google_postprocess_assertion$;';
const googlePostprocessStart = normalizedRehearsal.indexOf(googlePostprocessOpen);
const googlePostprocessEnd = normalizedRehearsal.indexOf(
  googlePostprocessClose,
  googlePostprocessStart,
);
if (googlePostprocessStart < 0 || googlePostprocessEnd < 0) {
  throw new Error('Could not parse reviewed mapping-refresh Google postprocessor assertion');
}
const googlePostprocessBlock = normalizedRehearsal.slice(
  googlePostprocessStart,
  googlePostprocessEnd + googlePostprocessClose.length,
);
for (const token of [
  'from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected',
  "pg_catalog.to_jsonb(receipt)-'generated_at'-'updated_at'-'evidence'",
  "'status','stale'",
  "'hold_reason','road_identity_mapping_changed'",
  "'manifest_version','issue97-google-v1'",
  "'route_ready',false",
  "'manifest_digest',null",
  "'dependency_digest',null",
  'issue97-google-evidence-witness-invariant',
  'pg_catalog.jsonb_object_keys(receipt.evidence)',
  "receipt.evidence->>'identity_id' is null",
  "receipt.evidence->>'road_id' is null",
  'receipt.generated_at is distinct from pg_catalog.transaction_timestamp()',
  'receipt.updated_at is distinct from pg_catalog.transaction_timestamp()',
  'from public.brinesearch_road_identity_mappings mapping',
  "mapping.identity_id::text=receipt.evidence->>'identity_id'",
  "mapping.road_id::text=receipt.evidence->>'road_id'",
  'from public.brinesearch_pad_roads step',
  'step.pad_id=expected.pad_id',
  "step.road_id::text=receipt.evidence->>'road_id'",
  "expected.pre_receipt_row->'manifest'->'points'",
  "mapping.mapping_status='verified'",
  "mapping.mapping_method in ( 'exact_source_record_id','exact_route_designation' )",
  "expected.pre_pad_state||pg_catalog.jsonb_build_object( 'status','stale', 'revision',expected.expected_receipt_route_revision )",
  'limit 50',
  'v_postprocess_diff_count<>0',
  'from private_verification.brinesearch_google_route_refresh_queue_issue97',
  'from public.brinesearch_driver_google_routes_public',
  'public.brinesearch_issue97_cutover_active()',
  "message= 'Issue #97 reviewed mapping-refresh Google postprocessor contract drifted'",
  "'postprocess_diff_count',v_postprocess_diff_count",
  "'postprocess_diff_sample',v_postprocess_diff_sample",
]) {
  requireText(
    googlePostprocessBlock,
    token,
    `reviewed mapping-refresh Google postprocessor contract: ${token}`,
  );
}
if (offsetsOf(
  rehearsal,
  'Issue #97 reviewed mapping-refresh Google postprocessor contract drifted',
).length !== 1
    || offsetsOf(
      rehearsal,
      'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS_PASS|9|5a75e5c4c34805b7dc2fdf8d0534a4f6',
    ).length !== 1
    || offsetsOf(
      rehearsal,
      'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|',
    ).length !== 1) {
  throw new Error('Reviewed mapping-refresh Google postprocessor evidence markers drifted');
}
if ((rehearsal.match(/^\\set ON_ERROR_STOP on\s*$/gm) ?? []).length !== 1) {
  throw new Error('Mapping-wave rehearsal must enable ON_ERROR_STOP exactly once');
}
forbid(
  rehearsal,
  /^\s*\\set\s+ON_ERROR_STOP\s+(?:off|false|0)\b/im,
  'mapping-wave rehearsal disables ON_ERROR_STOP',
);
forbid(
  rehearsal,
  /^\s*\\(?:if|elif|else|endif|quit|q)\b/im,
  'psql conditional or early-exit metacommand can bypass a fail-closed contract',
);
forbid(
  rebuildAssertionsBlock,
  /\bexception\s+when\b/i,
  'rebuild assertion exception handler can swallow a fail-closed contract',
);
forbid(
  rebuildAssertionsBlock,
  /\b(?:return|exit|continue)\b/i,
  'rebuild assertion block can bypass a fail-closed contract',
);
if ((normalizedRehearsal.match(
  /from tmp_issue97_mapping_wave_reviewed_mappings_before_build\s*\)<>46/g,
) ?? []).length !== 2) {
  throw new Error('Reviewed frozen mapping snapshot count must be checked before and after builds');
}
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_reviewed_mappings_before_build on commit drop as select mapping.*',
  "mapping.mapping_method='manual_reviewed_source_evidence'",
  '( select count(*) from public.brinesearch_road_identity_mappings mapping join tmp_issue97_frozen_mapping_targets target on target.identity_id=mapping.identity_id and target.road_id=mapping.road_id )<>46',
  'from tmp_issue97_mapping_wave_reviewed_mappings_before_build snapshot full join ( select mapping.*',
  ') live using(id) where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `reviewed frozen mapping survival contract: ${token}`,
  );
}
if (offsetsOf(
  rehearsal,
  'Issue #97 reviewed frozen mapping snapshot count drifted',
).length !== 1) {
  throw new Error('Reviewed frozen mapping snapshot-count RAISE must occur exactly once');
}
if (offsetsOf(
  rehearsal,
  'Issue #97 reviewed frozen mappings changed during graph rebuilds',
).length !== 1) {
  throw new Error('Reviewed frozen mapping survival RAISE must occur exactly once');
}

const refreshContractSnapshotRaise =
  'Issue #97 complete mapping-refresh contract pre-build snapshot drifted';
const refreshContractSurvivalRaise =
  'Issue #97 complete Ohio machine mapping-refresh contract changed during graph rebuilds';
if (offsetsOf(rehearsal, refreshContractSnapshotRaise).length !== 1
    || offsetsOf(rehearsal, refreshContractSurvivalRaise).length !== 1) {
  throw new Error('Complete mapping-refresh assertions must each occur exactly once');
}

const machineBeforeStart = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mappings_before_build',
);
const machineBeforeEnd = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_contract_before_build',
  machineBeforeStart,
);
const machineAfterStart = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mappings_after_stabilization',
);
const machineAfterEnd = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_changed_machine_mappings',
  machineAfterStart,
);
if (machineBeforeStart < 0 || machineBeforeEnd < 0
    || machineAfterStart < 0 || machineAfterEnd < 0) {
  throw new Error('Could not parse complete before/after machine-mapping snapshots');
}
const machineScopeTail = "from public.brinesearch_authoritative_road_identities identity join tmp_issue97_mapping_wave_county_order county on county.county_code=identity.county_code left join public.brinesearch_road_identity_mappings verified on verified.identity_id=identity.id and verified.mapping_status='verified' where identity.active and identity.state_code='OH' order by identity.id;";
const completeMachinePhases = [
  { label: 'before', suffix: 'before_build' },
  { label: 'after stabilization', suffix: 'after_stabilization' },
];
for (const { label, suffix } of completeMachinePhases) {
  const start = normalizedRehearsal.indexOf(
    `create temporary table tmp_issue97_mapping_wave_machine_scope_${suffix}`,
  );
  const end = normalizedRehearsal.indexOf(
    `create temporary table tmp_issue97_mapping_wave_machine_mappings_${suffix}`,
    start,
  );
  if (start < 0 || end < 0) {
    throw new Error(`Could not parse complete ${label} machine-mapping scope`);
  }
  const block = normalizedRehearsal.slice(start, end).trim();
  for (const token of [
    'identity.id as identity_id',
    'identity.county_code',
    'identity.source_identity_key',
    'identity.road_class',
    'identity.route_system',
    'identity.route_number',
    'identity.route_suffix',
    'identity.route_fraction',
    'identity.route_extension',
    'verified.road_id as effective_road_id',
    'verified.mapping_status',
    'verified.mapping_method',
    'verified.evidence as mapping_evidence',
    "verified.evidence->>'exact_candidate_count'",
    "verified.evidence->>'ambiguity_held'",
    "verified.evidence->>'refresh_scope' as refresh_scope",
    'end as evidence_source',
  ]) {
    requireText(block, token, `complete ${label} machine scope: ${token}`);
  }
  if (!block.endsWith(machineScopeTail)) {
    throw new Error(`Complete ${label} machine scope source/filter contract drifted`);
  }
  forbid(
    block,
    /tmp_issue97_frozen_mapping_(?:refresh_contract|targets)|\blimit\b/i,
    `${label} machine scope restricted to a reviewed allowlist`,
  );
}
for (const [label, block] of [
  ['before', normalizedRehearsal.slice(machineBeforeStart, machineBeforeEnd)],
  ['after stabilization', normalizedRehearsal.slice(machineAfterStart, machineAfterEnd)],
]) {
  for (const token of [
    "mapping.mapping_method in ( 'exact_source_record_id','exact_route_designation' )",
    "mapping.mapping_status in ('verified','candidate')",
    'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2( scope.identity_id ) as graph_mapping_fingerprint',
    "pg_catalog.to_jsonb(mapping) -array['created_at','updated_at','verified_at']::text[]",
    'order by mapping.id,mapping.road_id, mapping.mapping_status,mapping.mapping_method',
    "coalesce(machine.mapping_state,'[]'::jsonb) as mapping_state",
  ]) {
    requireText(block, token, `complete ${label} machine snapshot: ${token}`);
  }
  forbid(
    block,
    /tmp_issue97_frozen_mapping_(?:refresh_contract|targets)|\blimit\b/i,
    `${label} machine snapshot restricted to the expected 42`,
  );
  forbid(
    block,
    /-array\[[^\]]*'(?:id|identity_id|road_id|mapping_status|mapping_method|evidence|verified_by)'/i,
    `${label} machine snapshot removes release-semantic fields`,
  );
}
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_refresh_contract_before_build on commit drop as select contract.*',
  "snapshot.raw_transition_class='NULL_TO_NONNULL'",
  "snapshot.raw_transition_class='UNCHANGED_OR_INVALID'",
  'snapshot.active_mapping_count<>0',
  'snapshot.active_mapping_count<>1',
  'snapshot.exact_prior_mapping_count<>1',
  'snapshot.old_nonnull_road_id_count<>0',
  'snapshot.old_exact_road_id_count is distinct from snapshot.old_active_membership_occurrence_count',
  'from tmp_issue97_mapping_wave_refresh_contract_before_build )<>1126',
  "where raw_transition_class='NULL_TO_NONNULL' )<>1066",
  "where raw_transition_class='UNCHANGED_OR_INVALID' )<>60",
]) {
  requireText(
    normalizedRehearsal,
    token,
    `complete mapping-refresh pre-build contract: ${token}`,
  );
}
const changedMachineMappingBlock = normalizedRehearsal.slice(
  normalizedRehearsal.indexOf(
    'create temporary table tmp_issue97_mapping_wave_changed_machine_mappings',
  ),
  normalizedRehearsal.indexOf(
    'create temporary table tmp_issue97_mapping_wave_post_machine_candidates',
  ),
);
for (const token of [
  'from tmp_issue97_mapping_wave_machine_mappings_before_build prior',
  'full join tmp_issue97_mapping_wave_machine_mappings_after_stabilization live using(identity_id)',
  "where coalesce(prior.mapping_state,'[]'::jsonb) is distinct from coalesce(live.mapping_state,'[]'::jsonb)",
]) {
  requireText(
    changedMachineMappingBlock,
    token,
    `complete changed machine-mapping set: ${token}`,
  );
}
forbid(
  changedMachineMappingBlock,
  /tmp_issue97_frozen_mapping_(?:refresh_contract|targets)|\blimit\b|\b(?:with|union|intersect|except)\b/i,
  'complete changed machine-mapping set narrowed before comparison',
);
if ((changedMachineMappingBlock.match(/\bfrom\b/g) ?? []).length !== 2
    || (changedMachineMappingBlock.match(/\bfull join\b/g) ?? []).length !== 1
    || (changedMachineMappingBlock.match(/\bwhere\b/g) ?? []).length !== 1
    || (changedMachineMappingBlock.match(/\b(?:and|or)\b/g) ?? []).length !== 0) {
  throw new Error('Complete changed machine-mapping set query shape drifted');
}

const refreshContractSurvivalIndex = normalizedRehearsal.indexOf(
  `raise exception '${refreshContractSurvivalRaise}'`,
);
const refreshContractSurvivalStart = normalizedRehearsal.lastIndexOf(
  'if (',
  refreshContractSurvivalIndex,
);
const refreshContractSurvivalEnd = normalizedRehearsal.indexOf(
  'end if;',
  refreshContractSurvivalIndex,
);
if (refreshContractSurvivalIndex < 0
    || refreshContractSurvivalStart < 0
    || refreshContractSurvivalEnd < 0) {
  throw new Error('Could not parse complete mapping-refresh survival assertion');
}
const refreshContractSurvivalBlock = normalizedRehearsal.slice(
  refreshContractSurvivalStart,
  refreshContractSurvivalEnd + 'end if;'.length,
);
for (const token of [
  '(select count(*) from tmp_issue97_frozen_mapping_refresh_contract)<>42',
  '(select count(*) from tmp_issue97_mapping_wave_changed_machine_mappings)<>42',
  'full join tmp_issue97_frozen_mapping_refresh_contract contract using(identity_id)',
  'changed.identity_id is null or contract.identity_id is null',
  '(select count(*) from tmp_issue97_mapping_wave_machine_mapping_transitions)<>42',
  'full join tmp_issue97_mapping_wave_expected_machine_mapping_transitions expected using(identity_id)',
  'where pg_catalog.to_jsonb(actual) is distinct from pg_catalog.to_jsonb(expected)',
  "transition.transition_class in ( 'NONNULL_TO_NULL','NONNULL_TO_DIFFERENT_NONNULL' )",
  "transition.new_mapping_status is distinct from 'verified'",
  'transition.exact_candidate_count is distinct from 1',
  'or transition.ambiguity_flag',
  'transition.active_machine_mapping_rows is distinct from 1',
  "transition.transition_class='UNCHANGED_OR_INVALID'",
  "transition.prior_mapping_method= 'exact_route_designation'",
  "transition.new_mapping_method='exact_source_record_id'",
  "<>'043d969160dded7b9ff3526b6b09b752'",
  "<>'fd835556c06d4b067ca01ff8329a5d1c'",
  "<>'cf20cef7b1f18ea57afbfee9a6f5202e'",
  "<>'0b89d8b7f7969a95b6d94f270cd81ccc'",
  'snapshot.active_mapping_count<>1',
  'snapshot.observed_mapping_road_id is distinct from snapshot.road_id',
  'snapshot.observed_mapping_status is distinct from snapshot.final_mapping_status',
  'snapshot.observed_mapping_method is distinct from snapshot.final_mapping_method',
  "snapshot.observed_mapping_evidence->>'exact_candidate_count'",
  "snapshot.observed_mapping_evidence->>'ambiguity_held'",
  "snapshot.observed_mapping_evidence->>'designation_source'",
  "snapshot.observed_mapping_evidence->>'road_source_record_id'",
  'snapshot.membership_count is distinct from snapshot.old_active_membership_occurrence_count',
  'snapshot.exact_road_membership_count is distinct from snapshot.old_active_membership_occurrence_count',
  'from tmp_issue97_mapping_wave_refresh_contract_after_build)<>1126',
  "where raw_transition_class='NULL_TO_NONNULL')<>1066",
  "where raw_transition_class='UNCHANGED_OR_INVALID')<>60",
]) {
  requireText(
    refreshContractSurvivalBlock,
    token,
    `complete mapping-refresh survival contract: ${token}`,
  );
}

const completeRefreshContractPasses = ({
  transitions = 42,
  identities: transitionIdentities = 42,
  roads: transitionRoads = 23,
  roadResolutionCount = 35,
  sameRoadUpgradeCount = 7,
  allOccurrences = 1126,
  roadResolutionOccurrences = 1066,
  sameRoadUpgradeOccurrences = 60,
  candidateCountExact = true,
  ambiguityAbsent = true,
  fullChangedSetExact = true,
  sourceEvidenceExact = true,
  removalAbsent = true,
  substitutionAbsent = true,
}) => transitions === 42
  && transitionIdentities === 42
  && transitionRoads === 23
  && roadResolutionCount === 35
  && sameRoadUpgradeCount === 7
  && allOccurrences === 1126
  && roadResolutionOccurrences === 1066
  && sameRoadUpgradeOccurrences === 60
  && candidateCountExact
  && ambiguityAbsent
  && fullChangedSetExact
  && sourceEvidenceExact
  && removalAbsent
  && substitutionAbsent;
assert.equal(completeRefreshContractPasses({}), true);
for (const mutation of [
  { transitions: 41 },
  { identities: 43 },
  { roads: 22 },
  { roadResolutionCount: 34 },
  { sameRoadUpgradeCount: 8 },
  { allOccurrences: 1125 },
  { roadResolutionOccurrences: 1065 },
  { sameRoadUpgradeOccurrences: 59 },
  { candidateCountExact: false },
  { ambiguityAbsent: false },
  { fullChangedSetExact: false },
  { sourceEvidenceExact: false },
  { removalAbsent: false },
  { substitutionAbsent: false },
]) {
  assert.equal(completeRefreshContractPasses(mutation), false);
}
requireText(
  normalizedRehearsal,
  'build.graph_digest is not distinct from prior.graph_digest',
  'candidate graph digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->>'mapping_snapshot_digest' is not distinct from prior.details->>'mapping_snapshot_digest'",
  'candidate mapping snapshot digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->>'registry_digest' is not distinct from prior.details->>'registry_digest'",
  'candidate registry digest must change',
);
requireText(
  normalizedRehearsal,
  'build.source_revision_digest is not distinct from prior.source_revision_digest',
  'candidate source revision digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->'source_run_vector' is distinct from prior.details->'source_run_vector'",
  'candidate source-run vector must remain unchanged',
);
requireText(
  normalizedRehearsal,
  "build.details->>'source_vector_version' is distinct from prior.details->>'source_vector_version'",
  'candidate source-vector version must remain unchanged',
);
for (const token of [
  'build.source_segment_count is distinct from prior.source_segment_count',
  'build.identity_count is distinct from prior.identity_count',
  'build.point_junction_count is distinct from prior.point_junction_count',
  'build.shared_segment_count is distinct from prior.shared_segment_count',
  'build.membership_count is distinct from prior.membership_count',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `candidate source/topology count must remain unchanged: ${token}`,
  );
}

const validateCandidateDigestTransition = ({
  graphChanged,
  mappingSnapshotChanged,
  registryChanged,
  sourceRevisionChanged,
  sourceRunVectorUnchanged,
  sourceVectorVersionUnchanged,
  countsUnchanged,
}) => graphChanged
  && mappingSnapshotChanged
  && registryChanged
  && sourceRevisionChanged
  && sourceRunVectorUnchanged
  && sourceVectorVersionUnchanged
  && countsUnchanged;

const reviewedCandidateDigestTransition = {
  graphChanged: true,
  mappingSnapshotChanged: true,
  registryChanged: true,
  sourceRevisionChanged: true,
  sourceRunVectorUnchanged: true,
  sourceVectorVersionUnchanged: true,
  countsUnchanged: true,
};

assert.equal(validateCandidateDigestTransition(reviewedCandidateDigestTransition), true);
for (const property of Object.keys(reviewedCandidateDigestTransition)) {
  assert.equal(
    validateCandidateDigestTransition({
      ...reviewedCandidateDigestTransition,
      [property]: false,
    }),
    false,
    `candidate digest transition mutation escaped: ${property}`,
  );
}

for (const token of [
  'v_expected_target_membership_count constant bigint := 1565',
  'v_observed_target_membership_count bigint',
  'v_road_id_mismatch_count bigint',
  "v_count_diff_sample jsonb := '[]'::jsonb",
  "v_road_id_mismatch_sample jsonb := '[]'::jsonb",
  "'expected_target_membership_count'",
  "'observed_target_membership_count'",
  "'count_diff_sample'",
  "'road_id_mismatch_count'",
  "'road_id_mismatch_sample'",
  'junction.stable_junction_key',
  'Issue #97 rebuilt graph target-membership count drifted',
  'Issue #97 rebuilt graph target-membership road IDs mismatched',
  'into v_observed_target_membership_count',
  'into v_road_id_mismatch_count',
  'into v_count_diff_sample',
  'into v_road_id_mismatch_sample',
  'full join observed using(county_code,identity_id)',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `target-membership diagnostic contract: ${token}`,
  );
}

const countDriftRaise = "raise exception using message= 'Issue #97 rebuilt graph target-membership count drifted'";
const roadIdMismatchRaise = "raise exception using message= 'Issue #97 rebuilt graph target-membership road IDs mismatched'";
if (offsetsOf(normalizedRehearsal, countDriftRaise).length !== 1) {
  throw new Error('Target-membership count-drift RAISE must occur exactly once');
}
if (offsetsOf(normalizedRehearsal, roadIdMismatchRaise).length !== 1) {
  throw new Error('Target-membership road-ID mismatch RAISE must occur exactly once');
}

for (const token of [
  'v_junction_semantic_diff_count bigint := 0',
  'v_membership_semantic_diff_count bigint := 0',
  'v_anchor_semantic_diff_count bigint := 0',
  'v_non_target_membership_diff_count bigint := 0',
  "v_junction_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_membership_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_anchor_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_non_target_membership_diff_sample jsonb := '[]'::jsonb",
]) {
  requireText(
    normalizedRehearsal,
    token,
    `semantic-topology diagnostic variable: ${token}`,
  );
}

const semanticTopologyMessages = {
  junction: 'Issue #97 rebuilt graph junction semantics changed',
  membership: 'Issue #97 rebuilt graph membership semantics changed beyond reviewed road IDs',
  anchor: 'Issue #97 rebuilt graph anchor semantics changed',
  nonTargetMembership: 'Issue #97 rebuilt graph non-target membership semantics changed',
};
for (const [name, message] of Object.entries(semanticTopologyMessages)) {
  if (offsetsOf(rehearsal, message).length !== 1) {
    throw new Error(`${name} semantic-topology RAISE must occur exactly once`);
  }
}
forbid(
  rehearsal,
  /Issue #97 rebuilt graph changed source topology beyond exact mapping road IDs/i,
  'combined semantic-topology assertion without predicate-specific diagnostics',
);

const semanticTopologyRaiseTokens = {
  junction: `message='${semanticTopologyMessages.junction}'`,
  membership: `message= '${semanticTopologyMessages.membership}'`,
  anchor: `message='${semanticTopologyMessages.anchor}'`,
  nonTargetMembership: `message= '${semanticTopologyMessages.nonTargetMembership}'`,
};
const semanticTopologyRaiseIndexes = Object.fromEntries(
  Object.entries(semanticTopologyRaiseTokens).map(([name, token]) => {
    const index = normalizedRehearsal.indexOf(token);
    if (index < 0) throw new Error(`Could not locate ${name} semantic-topology RAISE`);
    return [name, index];
  }),
);
const semanticTopologyBlockStarts = Object.fromEntries(
  Object.entries(semanticTopologyRaiseIndexes).map(([name, index]) => {
    const start = normalizedRehearsal.lastIndexOf('if exists(', index);
    if (start < 0) throw new Error(`Could not locate ${name} semantic-topology IF`);
    return [name, start];
  }),
);
const releaseCurrentnessAssertionIndex = normalizedRehearsal.indexOf(
  "message='Issue #97 rebuilt dark graph is not fully release-current'",
);
if (releaseCurrentnessAssertionIndex < 0) {
  throw new Error('Could not locate release-currentness assertion');
}
for (const token of [
  "'release_current_failure_count'",
  "'candidate_diagnostics'",
  'issue97_mapping_wave_release_current_diagnostic(build.id)',
  'issue97_mapping_wave_release_diagnostic_passes( observed.diagnostic ) is distinct from true',
  'detail=v_release_current_detail::text',
]) {
  requireText(
    normalizedRehearsal.slice(
      normalizedRehearsal.lastIndexOf('if exists(', releaseCurrentnessAssertionIndex),
      normalizedRehearsal.indexOf('end if;', releaseCurrentnessAssertionIndex)
        + 'end if;'.length,
    ),
    token,
    `final release-current diagnostic: ${token}`,
  );
}
const releaseCurrentnessBlockStart = normalizedRehearsal.lastIndexOf(
  'if exists(',
  releaseCurrentnessAssertionIndex,
);
const semanticTopologyBlocks = {
  junction: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.junction,
    semanticTopologyBlockStarts.membership,
  ),
  membership: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.membership,
    semanticTopologyBlockStarts.anchor,
  ),
  anchor: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.anchor,
    semanticTopologyBlockStarts.nonTargetMembership,
  ),
  nonTargetMembership: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.nonTargetMembership,
    releaseCurrentnessBlockStart,
  ),
};

const semanticDiagnosticContracts = {
  junction: {
    block: semanticTopologyBlocks.junction,
    countVariable: 'v_junction_semantic_diff_count',
    sampleVariable: 'v_junction_semantic_diff_sample',
    detailCount: "'junction_semantic_diff_count'",
    detailSample: "'junction_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, difference_kind, prior_semantic, new_semantic from differences order by county_code,stable_junction_key limit 50',
    semanticRow: "pg_catalog.to_jsonb(junction) -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(junction) -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key",
    fullJoinKey: 'full join new_rows using(county_code,stable_junction_key)',
    hashSource: 'from public.brinesearch_road_junctions junction',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code,sample.stable_junction_key )',
    blockMd5: 'd811f2d958525db8e5d686440e196146',
  },
  membership: {
    block: semanticTopologyBlocks.membership,
    countVariable: 'v_membership_semantic_diff_count',
    sampleVariable: 'v_membership_semantic_diff_sample',
    detailCount: "'membership_semantic_diff_count'",
    detailSample: "'membership_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, identity_id, membership_role, is_frozen_target, difference_kind, prior_semantic, new_semantic from differences order by county_code, stable_junction_key, identity_id, membership_role limit 50',
    semanticRow: "pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'road_id'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key, (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text",
    fullJoinKey: 'full join new_rows using( county_code, stable_junction_key, identity_id, membership_role )',
    hashSource: 'from public.brinesearch_road_junction_memberships membership join public.brinesearch_road_junctions junction on junction.id=membership.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.identity_id, sample.membership_role )',
    blockMd5: 'f925905b791400576f593f953c584fd2',
  },
  anchor: {
    block: semanticTopologyBlocks.anchor,
    countVariable: 'v_anchor_semantic_diff_count',
    sampleVariable: 'v_anchor_semantic_diff_sample',
    detailCount: "'anchor_semantic_diff_count'",
    detailSample: "'anchor_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, anchor_key, difference_kind, prior_semantic, new_semantic from differences order by county_code,stable_junction_key,anchor_key limit 50',
    semanticRow: "pg_catalog.to_jsonb(anchor) -'id'-'junction_id'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(anchor) -'id'-'junction_id'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key,anchor.anchor_key",
    fullJoinKey: 'full join new_rows using(county_code,stable_junction_key,anchor_key)',
    hashSource: 'from public.brinesearch_road_junction_anchors anchor join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.anchor_key )',
    blockMd5: '21da1c402a1b98a1570f78c862e09f99',
  },
  nonTargetMembership: {
    block: semanticTopologyBlocks.nonTargetMembership,
    countVariable: 'v_non_target_membership_diff_count',
    sampleVariable: 'v_non_target_membership_diff_sample',
    detailCount: "'non_target_membership_diff_count'",
    detailSample: "'non_target_membership_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, identity_id, membership_role, difference_kind, prior_road_id, new_road_id, prior_semantic, new_semantic from differences order by county_code, stable_junction_key, identity_id, membership_role limit 50',
    semanticRow: "( pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at' )||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_contract contract where contract.identity_id=membership.identity_id and contract.road_id=membership.road_id and contract.raw_transition_class='NULL_TO_NONNULL' and contract.prior_road_id is null ) then null else membership.road_id end ) as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||( (pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at') ||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_contract contract where contract.identity_id=membership.identity_id and contract.road_id=membership.road_id and contract.raw_transition_class='NULL_TO_NONNULL' and contract.prior_road_id is null ) then null else membership.road_id end ) )::text, '|' order by junction.stable_junction_key, ( (pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at') ||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_contract contract where contract.identity_id=membership.identity_id and contract.road_id=membership.road_id and contract.raw_transition_class='NULL_TO_NONNULL' and contract.prior_road_id is null ) then null else membership.road_id end ) )::text",
    fullJoinKey: 'full join new_rows using( county_code, stable_junction_key, identity_id, membership_role )',
    hashSource: 'from public.brinesearch_road_junction_memberships membership join public.brinesearch_road_junctions junction on junction.id=membership.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id and not exists(select 1 from tmp_issue97_frozen_mapping_targets target where target.identity_id=membership.identity_id)',
    newHashFilter: 'where junction.build_id=build.id and not exists(select 1 from tmp_issue97_frozen_mapping_targets target where target.identity_id=membership.identity_id)',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.identity_id, sample.membership_role )',
    blockMd5: '16256909085ba9501ec8d019972e66ef',
  },
};

for (const [name, contract] of Object.entries(semanticDiagnosticContracts)) {
  if (md5(contract.block) !== contract.blockMd5) {
    throw new Error(`${name} complete semantic assertion block drifted`);
  }
  for (const token of [
    'difference_kind',
    'prior_semantic',
    'new_semantic',
    'stable_junction_key',
    contract.countVariable,
    contract.sampleVariable,
    contract.detailCount,
    contract.detailSample,
    contract.sampleProjection,
    contract.aggregateOrder,
  ]) {
    requireText(contract.block, token, `${name} semantic diagnostic: ${token}`);
  }
  if ((contract.block.match(/limit 50/g) ?? []).length !== 1) {
    throw new Error(`${name} semantic diagnostic must have exactly one 50-row sample limit`);
  }
  if (offsetsOf(contract.block, contract.semanticRow).length !== 2) {
    throw new Error(`${name} diagnostic semantic-row normalization drifted`);
  }
  if (offsetsOf(contract.block, contract.semanticHash).length !== 2) {
    throw new Error(`${name} original semantic hash comparison drifted`);
  }
  const expectedHashGuard = [
    'if exists( select 1 from tmp_issue97_mapping_wave_active_before prior',
    'join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)',
    `where (select pg_catalog.md5(coalesce(pg_catalog.string_agg( ${contract.semanticHash}),''))`,
    `${contract.hashSource} ${contract.priorHashFilter})`,
    `<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg( ${contract.semanticHash}),''))`,
    `${contract.hashSource} ${contract.newHashFilter}) )`,
  ].join(' ');
  const actualHashGuard = contract.block.slice(
    0,
    contract.block.indexOf(' then with pairs as ('),
  );
  if (actualHashGuard !== expectedHashGuard) {
    throw new Error(`${name} complete old-versus-candidate hash predicate drifted`);
  }
  if (offsetsOf(
    contract.block,
    'select 1 from tmp_issue97_mapping_wave_active_before prior join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code) where (',
  ).length !== 1) {
    throw new Error(`${name} original active-to-candidate build pairing drifted`);
  }
  if ((contract.block.match(
    /\(select pg_catalog\.md5\(coalesce\(pg_catalog\.string_agg\(/g,
  ) ?? []).length !== 2) {
    throw new Error(`${name} original semantic hash wrappers drifted`);
  }
  const priorBuildSelectorIndex = contract.block.indexOf(
    'where junction.build_id=prior.id',
  );
  const hashComparatorIndex = contract.block.indexOf(
    ') <>(select pg_catalog.md5(',
  );
  const newBuildSelectorIndex = contract.block.indexOf(
    'where junction.build_id=build.id',
  );
  if (priorBuildSelectorIndex < 0 || hashComparatorIndex < 0
      || newBuildSelectorIndex < 0
      || !(priorBuildSelectorIndex < hashComparatorIndex
        && hashComparatorIndex < newBuildSelectorIndex)
      || offsetsOf(contract.block, ') <>(select pg_catalog.md5(').length !== 1) {
    throw new Error(`${name} original old-versus-candidate hash comparator drifted`);
  }
  if (offsetsOf(
    contract.block,
    'where prior_rows.semantic_row is distinct from new_rows.semantic_row',
  ).length !== 1) {
    throw new Error(`${name} row-difference predicate drifted`);
  }
  if (contract.fullJoinKey
      && offsetsOf(contract.block, contract.fullJoinKey).length !== 1) {
    throw new Error(`${name} row-difference full-join key drifted`);
  }
  if (offsetsOf(
    contract.block,
    "case when prior_rows.row_present is null then 'added' when new_rows.row_present is null then 'missing' else 'changed' end as difference_kind",
  ).length !== 1) {
    throw new Error(`${name} row-difference classification drifted`);
  }
}

for (const block of [
  semanticTopologyBlocks.membership,
  semanticTopologyBlocks.nonTargetMembership,
]) {
  if (offsetsOf(
    block,
    'coalesce(prior_rows.membership_role,new_rows.membership_role) as membership_role',
  ).length !== 1) {
    throw new Error('Membership diagnostic stable-role projection drifted');
  }
}

for (const token of [
  'identity_id',
  'membership_role',
  'is_frozen_target',
]) {
  requireText(semanticTopologyBlocks.membership, token, `membership sample field: ${token}`);
}
requireText(
  semanticTopologyBlocks.anchor,
  'anchor_key',
  'anchor semantic diagnostic key',
);
for (const token of [
  'identity_id',
  'membership_role',
  'prior_road_id',
  'new_road_id',
]) {
  requireText(
    semanticTopologyBlocks.nonTargetMembership,
    token,
    `non-target membership sample field: ${token}`,
  );
}
if ((semanticTopologyBlocks.nonTargetMembership.match(
  /not exists\(select 1 from tmp_issue97_frozen_mapping_targets target/g,
) ?? []).length !== 2
    || (semanticTopologyBlocks.nonTargetMembership.match(
      /from tmp_issue97_frozen_mapping_targets target where target\.identity_id=membership\.identity_id/g,
    ) ?? []).length !== 4) {
  throw new Error('Non-target membership hashes and diagnostics must exclude every frozen target identity');
}
forbid(
  semanticTopologyBlocks.nonTargetMembership,
  /to_jsonb\(membership\)\s*-'id'-'junction_id'-'road_id'/i,
  'non-target membership semantic row excludes road_id',
);
const exactRefreshContractRoadNormalization =
  "pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_contract contract where contract.identity_id=membership.identity_id and contract.road_id=membership.road_id and contract.raw_transition_class='NULL_TO_NONNULL' and contract.prior_road_id is null ) then null else membership.road_id end )";
if (offsetsOf(
  semanticTopologyBlocks.nonTargetMembership,
  exactRefreshContractRoadNormalization,
).length !== 6) {
  throw new Error('Non-target membership must normalize only the exact 35 road-resolution pairs');
}
if ((semanticTopologyBlocks.nonTargetMembership.match(
  /raw_transition_class='NULL_TO_NONNULL'/g,
) ?? []).length !== 6
    || (semanticTopologyBlocks.nonTargetMembership.match(
      /contract\.prior_road_id is null/g,
    ) ?? []).length !== 6) {
  throw new Error('Non-target normalization must exclude all seven same-road method upgrades');
}
forbid(
  semanticTopologyBlocks.nonTargetMembership,
  /then null else null end/i,
  'non-target membership road normalization widened to every identity',
);

const candidateDigestContractIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 exact eight-county dark rebuild contract failed'",
);
const migrationApplicationIndex = normalizedRehearsal.indexOf(
  '\\ir ../migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
);
const reviewedSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_reviewed_mappings_before_build',
);
const machineBeforeSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mappings_before_build',
);
const refreshContractSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_contract_before_build',
);
const refreshExpansionGoogleSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_expansion_google_before_build',
);
const buildResultsCreationIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_build_results(',
);
const firstGraphBuildIndex = normalizedRehearsal.indexOf(
  "public.brinesearch_issue97_rebuild_county_graph('OH','BEL')",
);
const lastGraphBuildIndex = normalizedRehearsal.indexOf(
  "public.brinesearch_issue97_rebuild_county_graph('OH','NOB')",
);
const newBuildMaterializationIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_new_builds on commit drop as',
);
const machineAfterSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mappings_after_stabilization',
);
const changedMachineMappingsIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_changed_machine_mappings',
);
const actualMachineTransitionsIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mapping_transitions',
);
const expectedMachineTransitionsIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_expected_machine_mapping_transitions',
);
const stabilizationContractAssertionIndex = normalizedRehearsal.indexOf(
  'Issue #97 all-eight mapping stabilization contract drifted',
);
const finalMachineSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_machine_mappings_after_all_builds',
);
const afterBuildRefreshContractIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_contract_after_build',
);
const refreshExpansionGoogleQueueAssertionIndex = normalizedRehearsal.indexOf(
  "message= 'Issue #97 reviewed mapping-refresh Google queue contract drifted'",
);
const refreshExpansionGoogleProcessorIndex = normalizedRehearsal.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
  refreshExpansionGoogleQueueAssertionIndex,
);
const refreshExpansionGooglePostprocessAssertionIndex = normalizedRehearsal.indexOf(
  "message= 'Issue #97 reviewed mapping-refresh Google postprocessor contract drifted'",
  refreshExpansionGoogleProcessorIndex,
);
const refreshExpansionGooglePostprocessPassIndex = normalizedRehearsal.indexOf(
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS_PASS|9|5a75e5c4c34805b7dc2fdf8d0534a4f6',
  refreshExpansionGooglePostprocessAssertionIndex,
);
const refreshExpansionGooglePostprocessIndex = normalizedRehearsal.indexOf(
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|',
  refreshExpansionGooglePostprocessPassIndex,
);
const reviewedMappingSurvivalAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 reviewed frozen mappings changed during graph rebuilds'",
);
const refreshContractSurvivalAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 complete Ohio machine mapping-refresh contract changed during graph rebuilds'",
);
const countDriftAssertionIndex = normalizedRehearsal.indexOf(countDriftRaise);
const roadIdMismatchAssertionIndex = normalizedRehearsal.indexOf(roadIdMismatchRaise);
const activationProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 candidate build lane activated or replaced a graph'",
);
const routeProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state'",
);
const targetGoogleReceiptContractMessage =
  'Issue #97 rollback rehearsal target Google receipt postprocessor contract changed';
const targetGoogleReceiptContractIndex = normalizedRehearsal.indexOf(
  targetGoogleReceiptContractMessage,
);
const targetGoogleReceiptContractStart = normalizedRehearsal.lastIndexOf(
  'with differences as (',
  targetGoogleReceiptContractIndex,
);
const targetGoogleReceiptContractEnd = normalizedRehearsal.indexOf(
  'end if;',
  targetGoogleReceiptContractIndex,
);
if (targetGoogleReceiptContractIndex < 0
    || targetGoogleReceiptContractStart < 0
    || targetGoogleReceiptContractEnd < 0) {
  throw new Error('Could not parse target Google postprocessor subset contract');
}
const targetGoogleReceiptContractBlock = normalizedRehearsal.slice(
  targetGoogleReceiptContractStart,
  targetGoogleReceiptContractEnd + 'end if;'.length,
);
for (const token of [
  'from tmp_issue97_frozen_mapping_expected_google_pads target',
  'left join tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected',
  "pg_catalog.to_jsonb(receipt)-'generated_at'-'updated_at'-'evidence'",
  "'status','stale'",
  "'hold_reason','road_identity_mapping_changed'",
  'issue97-google-evidence-witness-invariant',
  'pg_catalog.jsonb_object_keys(receipt.evidence)',
  "mapping.identity_id::text=receipt.evidence->>'identity_id'",
  "mapping.road_id::text=receipt.evidence->>'road_id'",
  'from public.brinesearch_pad_roads step',
  'step.pad_id=target.pad_id',
  "step.road_id::text=receipt.evidence->>'road_id'",
  "expected.pre_receipt_row->'manifest'->'points'",
  'receipt.generated_at is distinct from pg_catalog.transaction_timestamp()',
  'receipt.updated_at is distinct from pg_catalog.transaction_timestamp()',
  "message='Issue #97 rollback rehearsal target Google receipt postprocessor contract changed'",
  "'target_google_receipt_contract_diff_count',v_google_diff_count",
  "'target_google_receipt_contract_diff_sample',v_google_diff_sample",
]) {
  requireText(
    targetGoogleReceiptContractBlock,
    token,
    `target Google postprocessor subset contract: ${token}`,
  );
}
// Both Google receipt contracts may reference the historical pinned evidence
// columns exactly once each, in the diagnostic sample projection. A second
// reference means the witness is being compared against a pinned pair again,
// in whatever syntax — which is the defect this correction removed.
for (const [label, block] of [
  ['reviewed mapping-refresh Google postprocessor', googlePostprocessBlock],
  ['target Google postprocessor subset', targetGoogleReceiptContractBlock],
]) {
  for (const column of [
    'expected_evidence_identity_id',
    'expected_evidence_road_id',
  ]) {
    const uses = (block.match(new RegExp(column, 'g')) ?? []).length;
    if (uses !== 1) {
      throw new Error(
        `${label} contract must reference ${column} only in its diagnostic sample: found ${uses}`,
      );
    }
  }
  // Guard against a predicate being neutralised while leaving its tokens in
  // place, which a token-presence check alone cannot see.
  for (const neutraliser of [/\btrue or\b/, /\bor true\b/, /\bfalse or\b/, /\b1=1\b/]) {
    if (neutraliser.test(block)) {
      throw new Error(
        `${label} contract contains a neutralised predicate: ${neutraliser}`,
      );
    }
  }
}
const nonTargetGoogleReceiptRaise =
  'Issue #97 rollback rehearsal non-target Google receipts changed';
const nonTargetGoogleReceiptIndex = normalizedRehearsal.indexOf(nonTargetGoogleReceiptRaise);
const nonTargetGoogleReceiptStart = normalizedRehearsal.lastIndexOf(
  'if (select pg_catalog.md5',
  nonTargetGoogleReceiptIndex,
);
const nonTargetGoogleReceiptEnd = normalizedRehearsal.indexOf(
  'end if;',
  nonTargetGoogleReceiptIndex,
);
const nonTargetGoogleReceiptBlock = normalizedRehearsal.slice(
  nonTargetGoogleReceiptStart,
  nonTargetGoogleReceiptEnd + 'end if;'.length,
);
for (const token of [
  'tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected',
  'tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before',
  'receipt_digest',
]) {
  requireText(
    nonTargetGoogleReceiptBlock,
    token,
    `unchanged Google receipt complement contract: ${token}`,
  );
}
const nonTargetGooglePadRaise =
  'Issue #97 rollback rehearsal non-target Google pad state changed';
const nonTargetGooglePadIndex = normalizedRehearsal.indexOf(nonTargetGooglePadRaise);
const nonTargetGooglePadStart = normalizedRehearsal.lastIndexOf(
  'if (select pg_catalog.md5',
  nonTargetGooglePadIndex,
);
const nonTargetGooglePadEnd = normalizedRehearsal.indexOf(
  'end if;',
  nonTargetGooglePadIndex,
);
const nonTargetGooglePadBlock = normalizedRehearsal.slice(
  nonTargetGooglePadStart,
  nonTargetGooglePadEnd + 'end if;'.length,
);
for (const token of [
  'tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected',
  'tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before',
  'pad_digest',
]) {
  requireText(
    nonTargetGooglePadBlock,
    token,
    `unchanged Google pad complement contract: ${token}`,
  );
}
const googleProtectionRaises = [
  'Issue #97 rollback rehearsal Google target snapshot cardinality changed',
  'Issue #97 rollback rehearsal Google refresh queue is not empty after dark builds',
  'Issue #97 rollback rehearsal public Google or cutover state changed',
  'Issue #97 rollback rehearsal target Google receipt postprocessor contract changed',
  'Issue #97 rollback rehearsal target Google pad state changed during dark builds',
  'Issue #97 rollback rehearsal target Google stale-state contract changed',
  'Issue #97 rollback rehearsal non-target Google receipts changed',
  'Issue #97 rollback rehearsal non-target Google pad state changed',
  'Issue #97 rollback rehearsal deferred Google trigger contract changed',
];
const googleProtectionRaiseIndexes = googleProtectionRaises.map((message) => {
  const indexes = offsetsOf(rehearsal, message);
  if (indexes.length !== 1) {
    throw new Error(`Google dark-build diagnostic must occur exactly once: ${message}`);
  }
  return normalizedRehearsal.indexOf(message);
});
const googleProtectionAssertionIndex = googleProtectionRaiseIndexes[0];
if (!googleProtectionRaiseIndexes.every((index, position) => (
  position === 0 || googleProtectionRaiseIndexes[position - 1] < index
))) {
  throw new Error('Google dark-build diagnostics are not in fail-closed contract order');
}
const googleProtectionBlock = normalizedRehearsal.slice(
  googleProtectionRaiseIndexes[0],
  rebuildAssertionsEnd,
);
if ((googleProtectionBlock.match(/limit 50/g) ?? []).length !== 3) {
  throw new Error('Google dark-build diagnostic samples must retain three 50-row bounds');
}
if (migrationApplicationIndex < 0 || reviewedSnapshotIndex < 0
    || machineBeforeSnapshotIndex < 0 || refreshContractSnapshotIndex < 0
    || refreshExpansionGoogleSnapshotIndex < 0
    || buildResultsCreationIndex < 0
    || firstGraphBuildIndex < 0 || lastGraphBuildIndex < 0
    || newBuildMaterializationIndex < 0
    || machineAfterSnapshotIndex < 0 || changedMachineMappingsIndex < 0
    || actualMachineTransitionsIndex < 0 || expectedMachineTransitionsIndex < 0
    || stabilizationContractAssertionIndex < 0 || stabilizedBaselineIndex < 0
    || builderCheckerStart < 0 || finalMachineSnapshotIndex < 0
    || finalStabilityIndex < 0 || candidateEvidenceIndex < 0
    || afterBuildRefreshContractIndex < 0
    || refreshExpansionGoogleQueueAssertionIndex < 0
    || refreshExpansionGoogleProcessorIndex < 0
    || refreshExpansionGooglePostprocessAssertionIndex < 0
    || refreshExpansionGooglePostprocessPassIndex < 0
    || refreshExpansionGooglePostprocessIndex < 0
    || reviewedMappingSurvivalAssertionIndex < 0
    || refreshContractSurvivalAssertionIndex < 0
    || candidateDigestContractIndex < 0 || countDriftAssertionIndex < 0
    || roadIdMismatchAssertionIndex < 0
    || semanticTopologyRaiseIndexes.junction < 0
    || semanticTopologyRaiseIndexes.membership < 0
    || semanticTopologyRaiseIndexes.anchor < 0
    || semanticTopologyRaiseIndexes.nonTargetMembership < 0
    || releaseCurrentnessAssertionIndex < 0 || activationProtectionAssertionIndex < 0
    || routeProtectionAssertionIndex < 0 || googleProtectionAssertionIndex < 0
    || !(migrationApplicationIndex < reviewedSnapshotIndex
      && reviewedSnapshotIndex < machineBeforeSnapshotIndex
      && machineBeforeSnapshotIndex < refreshContractSnapshotIndex
      && refreshContractSnapshotIndex < refreshExpansionGoogleSnapshotIndex
      && refreshExpansionGoogleSnapshotIndex < explicitStabilizers[0].index
      && explicitStabilizers.at(-1).index < machineAfterSnapshotIndex
      && machineAfterSnapshotIndex < changedMachineMappingsIndex
      && changedMachineMappingsIndex < actualMachineTransitionsIndex
      && actualMachineTransitionsIndex < expectedMachineTransitionsIndex
      && expectedMachineTransitionsIndex < stabilizationContractAssertionIndex
      && stabilizationContractAssertionIndex < stabilizedBaselineIndex
      && stabilizedBaselineIndex < buildResultsCreationIndex
      && buildResultsCreationIndex < builderCheckerStart
      && builderCheckerStart < firstGraphBuildIndex
      && firstGraphBuildIndex < lastGraphBuildIndex
      && lastGraphBuildIndex < newBuildMaterializationIndex
      && newBuildMaterializationIndex < finalMachineSnapshotIndex
      && finalMachineSnapshotIndex < finalStabilityIndex
      && finalStabilityIndex < candidateEvidenceIndex
      && candidateEvidenceIndex < afterBuildRefreshContractIndex
      && afterBuildRefreshContractIndex < refreshExpansionGoogleQueueAssertionIndex
      && refreshExpansionGoogleQueueAssertionIndex < refreshExpansionGoogleProcessorIndex
      && refreshExpansionGoogleProcessorIndex < refreshExpansionGooglePostprocessAssertionIndex
      && refreshExpansionGooglePostprocessAssertionIndex < refreshExpansionGooglePostprocessPassIndex
      && refreshExpansionGooglePostprocessPassIndex < refreshExpansionGooglePostprocessIndex
      && refreshExpansionGooglePostprocessIndex < reviewedMappingSurvivalAssertionIndex
      && reviewedMappingSurvivalAssertionIndex < refreshContractSurvivalAssertionIndex
      && refreshContractSurvivalAssertionIndex < candidateDigestContractIndex
      && candidateDigestContractIndex < countDriftAssertionIndex
      && countDriftAssertionIndex < roadIdMismatchAssertionIndex
      && roadIdMismatchAssertionIndex < semanticTopologyRaiseIndexes.junction
      && semanticTopologyRaiseIndexes.junction < semanticTopologyRaiseIndexes.membership
      && semanticTopologyRaiseIndexes.membership < semanticTopologyRaiseIndexes.anchor
      && semanticTopologyRaiseIndexes.anchor < semanticTopologyRaiseIndexes.nonTargetMembership
      && semanticTopologyRaiseIndexes.nonTargetMembership < releaseCurrentnessAssertionIndex
      && releaseCurrentnessAssertionIndex < activationProtectionAssertionIndex
      && activationProtectionAssertionIndex < routeProtectionAssertionIndex
      && routeProtectionAssertionIndex < googleProtectionAssertionIndex)) {
  throw new Error('Reviewed-mapping survival and later rehearsal safety ordering drifted');
}
const rollbackIndex = normalizedRehearsal.lastIndexOf('rollback;');
if (rollbackIndex < 0
    || !(rebuildAssertionsEnd < finalCandidateOutputIndex
      && finalCandidateOutputIndex < rollbackIndex)
    || normalizedRehearsal.slice(
      finalCandidateOutputIndex + finalCandidateOutput.length,
      rollbackIndex,
    ).trim() !== '') {
  throw new Error('Final candidate evidence must print once after all assertions and immediately before rollback');
}

const targetMembershipDiagnosticBlock = normalizedRehearsal.slice(
  candidateDigestContractIndex,
  semanticTopologyBlockStarts.junction,
);
if ((targetMembershipDiagnosticBlock.match(/where membership\.road_id is distinct from target\.road_id/g) ?? []).length !== 2) {
  throw new Error('Target-membership diagnostics must fail closed on exactly two road-ID mismatch checks');
}
if ((targetMembershipDiagnosticBlock.match(/limit 50/g) ?? []).length !== 2) {
  throw new Error('Target-membership diagnostic samples must each remain bounded to 50 rows');
}
forbid(
  rehearsal,
  /Issue #97 rebuilt graph memberships did not capture the exact 46 mappings/i,
  'combined target-membership assertion without predicate-specific diagnostics',
);
forbid(
  rehearsal,
  /membership\.road_id\s*=\s*target\.road_id/i,
  'target-membership road-ID mismatch check changed to equality',
);

const targetMembershipContractPasses = ({
  expectedCount,
  observedCount,
  roadIdMismatchCount,
}) => observedCount === expectedCount
  && roadIdMismatchCount === 0;

assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1565,
  roadIdMismatchCount: 0,
}), true);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1564,
  roadIdMismatchCount: 0,
}), false);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1566,
  roadIdMismatchCount: 0,
}), false);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1565,
  roadIdMismatchCount: 1,
}), false);

requireText(normalizedRehearsal,
  "from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.brinesearch_route_prep route on route.id=receipt.route_prep_id join public.pads pad on pad.id=route.pad_id where route.active and route.route_group in ('primary','alternate') and pad.state='Ohio' and not coalesce(pad.list_only,false))<>806",
  'Ohio-only 806 route-reconciliation receipt preflight');
if ((executableRehearsal.match(/^begin;/gmi) ?? []).length !== 1
    || (executableRehearsal.match(/^rollback;/gmi) ?? []).length !== 1
    || (executableRehearsal.match(/insert into supabase_migrations\.schema_migrations/gi) ?? []).length !== 1
    || /^commit;/mi.test(executableRehearsal)) {
  throw new Error('Rollback rehearsal must have one BEGIN, one ROLLBACK, and zero COMMIT');
}
const rehearsalWithoutExactStabilizers = executableRehearsal.replace(
  /private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\('[A-Z]{3}'\)/g,
  '',
).replace(
  /'public\.brinesearch_issue97_refresh_supplemental_aliases_issue97_core\(uuid\)'\s*::pg_catalog\.regprocedure/g,
  '',
);
forbid(rehearsalWithoutExactStabilizers,
  /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or activation in rehearsal');
forbidFailClosedNeutralizers(
  normalizedExecutableRehearsal,
  'complete executable rollback rehearsal',
);
forbid(
  normalizedExecutableRehearsal,
  /\b(?:create(?:\s+temporary)?\s+table|insert\s+into|update|delete\s+from|truncate(?:\s+table)?|drop\s+table)\s+(?:pg_temp\.)?tmp_issue97_(?:graph_release_current_cache|graph_current_cache)\b/i,
  'rehearsal creates or mutates a transaction-local currentness cache',
);
for (const cacheTable of [
  'tmp_issue97_graph_release_current_cache',
  'tmp_issue97_graph_current_cache',
]) {
  const exactObservation = `pg_catalog.to_regclass('pg_temp.${cacheTable}')`;
  if (offsetsOf(normalizedExecutableRehearsal, cacheTable).length !== 1
      || offsetsOf(normalizedExecutableRehearsal, exactObservation).length !== 1) {
    throw new Error(`${cacheTable} may appear only in its read-only diagnostic observation`);
  }
}
forbid(rehearsal, /order\s+by[\s\S]{0,120}(?:completed_at|created_at)[\s\S]{0,80}limit\s+1/i,
  'latest/newest graph selection');
forbid(rehearsal, /where\s+build\.status='validated'[\s\S]{0,120}(?:select|into)\s+[^;]*build\.id/i,
  'validated-status-only graph selection');
forbid(rehearsal, /\bdisable\s+trigger\b/i, 'disabled Google safety trigger');
forbid(rehearsal, /issue97_cutover_not_active/i,
  'stored held state substituted for the unchanged immediate stale state');
forbid(
  rehearsal,
  /build\.source_revision_digest\s*<>\s*prior\.source_revision_digest/i,
  'source revision incorrectly required to remain unchanged after mapping install',
);
forbid(rehearsal,
  /delete\s+from\s+private_verification\.brinesearch_google_route_refresh_queue_issue97/i,
  'manual deletion of pending deferred Google refresh events');

// Static mutation checks: the package must fail its model if any frozen
// cardinality, digest, graph footprint, or final reconciliation set drifts.
const validateModel = ({
  identities: identityCount = 46,
  roads: roadCount = 37,
  memberships = 1565,
  counties = replacedGraphs,
  mappingRoutes = 379,
  transitionRoutes = 33,
  totalRoutes = 412,
  primary = 340,
  alternate = 72,
  digest = '711b1ddd3ba6c47e7642fc700197432f',
}) => identityCount === 46 && roadCount === 37 && memberships === 1565
  && counties.join(',') === 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB'
  && mappingRoutes === 379 && transitionRoutes === 33
  && totalRoutes === 412 && primary === 340 && alternate === 72
  && digest === '711b1ddd3ba6c47e7642fc700197432f';
if (!validateModel({})) throw new Error('Exact mapping package model rejected its reviewed state');
for (const mutation of [
  { identities: 45 }, { roads: 38 }, { memberships: 1564 },
  { counties: replacedGraphs.slice(1) }, { mappingRoutes: 412 },
  { transitionRoutes: 32 }, { totalRoutes: 379 }, { primary: 339 },
  { alternate: 73 }, { digest: '836c1f57210e4d18c0f60d4c1ea77d7d' },
]) {
  if (validateModel(mutation)) throw new Error(`Mutation escaped mapping package model: ${JSON.stringify(mutation)}`);
}

console.log('Issue #97 frozen exact mapping-wave audit passed.');
console.log(`  frozen identities/roads: ${identities.length}/${roads.length}`);
console.log(`  evidence split: 28 designation / 18 base-NLF street-core`);
console.log('  machine refresh: 42 transitions / 23 final roads');
console.log('  transition semantics: 35 road resolutions / 7 same-road method upgrades');
console.log('  old membership occurrences: 1126 (1066 resolutions / 60 upgrades)');
console.log('  machine digests: 043d969160dded7b9ff3526b6b09b752 / fd835556c06d4b067ca01ff8329a5d1c / cf20cef7b1f18ea57afbfee9a6f5202e / 0b89d8b7f7969a95b6d94f270cd81ccc');
console.log(`  graph rebuild footprint: ${builds.join(',')}`);
console.log(`  repeated-call temp guards: ${rehearsalGuards} rehearsal / ${syntheticGuards} synthetic`);
console.log(`  exact final route closure: ${routeIds.length} (340 primary / 72 alternate)`);
console.log('  closure legs: 379 mapping-dependent + 33 transition-only');
console.log(`  route digest: ${md5([...routeIds].sort().join('|'))}`);
