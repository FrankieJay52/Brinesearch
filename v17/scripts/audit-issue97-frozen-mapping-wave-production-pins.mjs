import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pinPath = path.join(
  root,
  'ops/issue97-computer-rollout/sql/37-frozen-mapping-wave-production-pins.sql',
);
const routeManifestPath = path.join(
  root,
  'ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql',
);
const rehearsalPath = path.join(root, 'supabase/tests/issue97_frozen_exact_mapping_wave.sql');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
);
const packagePath = path.join(root, 'package.json');

const readBytes = (filePath) => fs.readFileSync(filePath);
const read = (filePath) => readBytes(filePath).toString('utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
const normalizeLf = (value) => value.replace(/\r\n?/g, '\n');
const strictUuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidLiteralPattern = new RegExp(`'(${strictUuid})'\\s*::\\s*uuid`, 'g');

const pinSql = read(pinPath);
const routeManifestBytes = readBytes(routeManifestPath);
const routeManifest = routeManifestBytes.toString('utf8');
const rehearsalBytes = readBytes(rehearsalPath);
const rehearsal = rehearsalBytes.toString('utf8');
const migrationBytes = readBytes(migrationPath);
const packageRaw = read(packagePath);
const packageJson = JSON.parse(packageRaw);

assert.equal(
  sha256(routeManifestBytes),
  '6fcee70c9f8b8daafcedaaeeb25239120b8a522653495aebcdb08443201a65c9',
  'Issue #97 route-manifest source bytes drifted',
);
assert.equal(
  sha256(rehearsalBytes),
  '0108179b55595e189f0c466ab6f51353bd694eea1b466c88221035c310c3e65f',
  'Issue #97 passing rehearsal source bytes drifted',
);
assert.equal(
  sha256(migrationBytes),
  '6dfbe9983e5f1ba840c32a5f06b2203ee46c9e3eebc3d475bf9370341d806b7a',
  'Issue #97 permanent migration source bytes drifted',
);

const occurrences = (source, needle) => source.split(needle).length - 1;
const requireText = (source, needle, label = needle) => {
  assert.ok(source.includes(needle), `Issue #97 production-pin audit missing ${label}`);
};
const forbidText = (source, needle, label = needle) => {
  assert.ok(!source.includes(needle), `Issue #97 production-pin audit forbids ${label}`);
};
const marked = (source, begin, end, label) => {
  assert.equal(occurrences(source, begin), 1, `${label} must have one begin marker`);
  assert.equal(occurrences(source, end), 1, `${label} must have one end marker`);
  const start = source.indexOf(begin) + begin.length;
  const finish = source.indexOf(end, start);
  assert.ok(finish > start, `${label} markers are reversed or empty`);
  return source.slice(start, finish);
};

// Strip comments while preserving quoted values for strict pin parsing.
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
        result += source[index] === '\r' || source[index] === '\n' ? source[index] : ' ';
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
    if (source[index] === "'") singleQuoted = true;
    else if (source[index] === '"') doubleQuoted = true;
    result += source[index];
    index += 1;
  }
  assert.equal(blockCommentDepth, 0, 'unterminated SQL block comment');
  assert.equal(lineComment, false, 'unterminated SQL line comment');
  assert.equal(singleQuoted, false, 'unterminated SQL string literal');
  assert.equal(doubleQuoted, false, 'unterminated SQL quoted identifier');
  return result;
};

// Mask every comment and quoted body before executable-operation checks. A DO
// or dynamic-execution introducer remains visible even though its body is masked.
const maskSql = (source) => {
  const output = [...source];
  const blank = (at) => {
    if (output[at] !== '\r' && output[at] !== '\n') output[at] = ' ';
  };
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      while (index < source.length && source[index] !== '\r' && source[index] !== '\n') {
        blank(index);
        index += 1;
      }
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 0;
      do {
        if (source.startsWith('/*', index)) {
          depth += 1;
          blank(index);
          blank(index + 1);
          index += 2;
        } else if (source.startsWith('*/', index)) {
          depth -= 1;
          blank(index);
          blank(index + 1);
          index += 2;
        } else {
          blank(index);
          index += 1;
        }
      } while (index < source.length && depth > 0);
      assert.equal(depth, 0, 'unterminated SQL block comment');
      continue;
    }
    if (source[index] === "'" || source[index] === '"') {
      const quote = source[index];
      blank(index);
      index += 1;
      let closed = false;
      while (index < source.length) {
        blank(index);
        if (source[index] === quote) {
          if (source[index + 1] === quote) {
            blank(index + 1);
            index += 2;
          } else {
            index += 1;
            closed = true;
            break;
          }
        } else index += 1;
      }
      assert.ok(closed, 'unterminated SQL quoted value');
      continue;
    }
    if (source[index] === '$') {
      const tag = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const close = source.indexOf(tag, index + tag.length);
        assert.notEqual(close, -1, `unterminated SQL dollar quote ${tag}`);
        for (let at = index; at < close + tag.length; at += 1) blank(at);
        index = close + tag.length;
        continue;
      }
    }
    index += 1;
  }
  return output.join('');
};

const pinWithoutComments = stripSqlComments(pinSql);
const executable = maskSql(pinSql);
const normalizedExecutable = executable.replace(/\s+/g, ' ').trim().toLowerCase();
const executableLower = executable.toLowerCase();
const executableCalls = (name) => [...executableLower.matchAll(new RegExp(
  `${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`,
  'g',
))].length;

assert.equal(executableCalls(
  'private_verification.brinesearch_issue97_graph_build_sources_current',
), 1, 'file37 must use exactly one decisive pinned-matrix sources-current call site');
assert.equal(executableCalls(
  'private_verification.brinesearch_issue97_graph_build_release_current',
), 2, 'file37 must use exactly one pinned-matrix and one conditional historical release-current call site');
assert.equal(executableCalls(
  'private_verification.brinesearch_issue97_dataset_scope_current',
), 1, 'file37 must evaluate dataset-scope currentness at exactly one executable call site');
assert.equal(executableCalls(
  'private_verification.brinesearch_issue97_current_state_candidate_members',
), 0, 'file37 must not re-enter the row-by-row state candidate helper');
assert.equal(executableCalls(
  'private_verification.brinesearch_issue97_state_candidate_manifest_current',
), 0, 'file37 must not re-enter the row-by-row manifest currentness helper');

const currentnessBlock = stripSqlComments(marked(
  pinSql,
  '-- ISSUE97_CURRENTNESS_MATRIX_BEGIN',
  '-- ISSUE97_CURRENTNESS_MATRIX_END',
  'single-evaluation currentness matrix',
));
assert.match(
  currentnessBlock,
  /currentness_expected\s*\([^)]*\)\s+as\s*\(\s*select\s+'candidate'[\s\S]*?'validated'[\s\S]*?from\s+candidate_expected\s+union\s+all\s+select\s+'old_active'[\s\S]*?'active'[\s\S]*?from\s+old_expected\s+union\s+all\s+select\s+'unaffected_active'[\s\S]*?'active'[\s\S]*?from\s+unaffected_expected\s*\)/i,
  'currentness matrix must be driven by the exact 8/8/11 pinned sets and states',
);
assert.match(
  currentnessBlock,
  /currentness_decision\s+as\s+materialized\s*\([\s\S]*?case\s+when\s+expected\.kind\s*=\s*'old_active'[\s\S]*?graph_build_sources_current\s*\(\s*expected\.build_id\s*\)[\s\S]*?else\s+private_verification\.brinesearch_issue97_graph_build_release_current\s*\(\s*expected\.build_id\s*\)[\s\S]*?end\s+as\s+decisive_current[\s\S]*?from\s+currentness_expected\s+expected\s*\)[\s\S]*?build_currentness\s+as\s+materialized\s*\([\s\S]*?decision\.decisive_current\s+as\s+sources_current[\s\S]*?case\s+when\s+decision\.kind\s*=\s*'old_active'\s+then\s+false\s+else\s+decision\.decisive_current\s+end\s+as\s+release_current[\s\S]*?from\s+currentness_decision\s+decision\s*\)/i,
  'currentness must evaluate one decisive predicate per pinned build and derive only implications guaranteed by the pinned release function',
);
assert.match(
  currentnessBlock,
  /currentness_universe_actual\s+as\s+materialized\s*\([\s\S]*?from\s+currentness_expected\s+expected\s+join\s+public\.brinesearch_road_graph_builds\s+build\s+on\s+build\.id\s*=\s*expected\.build_id[\s\S]*?join\s+public\.brinesearch_road_graph_counties\s+county[\s\S]*?county\.active[\s\S]*?county\.state_code\s*=\s*'OH'[\s\S]*?build\.state_code\s*=\s*'OH'[\s\S]*?\)/i,
  'currentness universe must be scoped to the exact pinned 27 builds while retaining the active Ohio registry check',
);
assert.match(
  currentnessBlock,
  /retained_ohio_builds\s+as\s+materialized\s*\([\s\S]*?county\.active[\s\S]*?county\.state_code\s*=\s*'OH'[\s\S]*?build\.status\s+in\s*\(\s*'validated'\s*,\s*'active'\s*\)[\s\S]*?\)[\s\S]*?unexpected_validated_currentness\s+as\s+materialized\s*\([\s\S]*?private_verification\.brinesearch_issue97_graph_build_release_current\s*\(\s*retained\.build_id\s*\)\s+as\s+release_current[\s\S]*?retained\.status\s*=\s*'validated'[\s\S]*?not\s+exists\s*\([\s\S]*?expected\.build_id\s*=\s*retained\.build_id[\s\S]*?\)/i,
  'retained historical validated builds must remain bounded and unable to become an unpinned release-current candidate',
);
assert.match(
  currentnessBlock,
  /select\s+county_code\s*,\s*build_id\s*,\s*graph_digest\s*,\s*expected_status\s*,\s*expected_activated_at\s+from\s+currentness_expected[\s\S]*?except[\s\S]*?select\s+county_code\s*,\s*build_id\s*,\s*graph_digest\s*,\s*status\s*,\s*activated_at\s+from\s+currentness_universe_actual[\s\S]*?union\s+all[\s\S]*?select\s+county_code\s*,\s*build_id\s*,\s*graph_digest\s*,\s*status\s*,\s*activated_at\s+from\s+currentness_universe_actual[\s\S]*?except[\s\S]*?select\s+county_code\s*,\s*build_id\s*,\s*graph_digest\s*,\s*expected_status\s*,\s*expected_activated_at\s+from\s+currentness_expected/i,
  'currentness universe must reject a missing, duplicate, wrong-digest, wrong-state, or activated pinned build',
);
assert.match(
  currentnessBlock,
  /currentness_counties_expected[\s\S]*?select\s+county_code\s+from\s+candidate_expected\s+union\s+select\s+county_code\s+from\s+unaffected_expected[\s\S]*?currentness_counties_actual\s+as\s+materialized[\s\S]*?county\.active[\s\S]*?county\.state_code\s*=\s*'OH'[\s\S]*?currentness_counties_expected[\s\S]*?except[\s\S]*?currentness_counties_actual[\s\S]*?union\s+all[\s\S]*?currentness_counties_actual[\s\S]*?except[\s\S]*?currentness_counties_expected/i,
  'currentness universe must pin the exact 19 active Ohio counties bidirectionally',
);
assert.match(
  pinWithoutComments,
  /active_release_generation_state\s+as\s+materialized\s*\([\s\S]*?count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+generation\.active\s*\)[\s\S]*?generation\.generation_key\s*=\s*provenance\.release_generation[\s\S]*?\)/i,
  'file37 must prove exactly one active release generation matches the pin',
);
for (const [pattern, label] of [
  [/candidate_rows\s+as\s+materialized\s*\([\s\S]*?from\s+candidate_expected\s+expected[\s\S]*?left\s+join\s+build_currentness\s+currentness[\s\S]*?currentness\.kind\s*=\s*'candidate'[\s\S]*?\)\s*,\s*candidate_state/i,
    'candidate rows consume the single currentness matrix'],
  [/old_rows\s+as\s+materialized\s*\([\s\S]*?from\s+old_expected\s+expected[\s\S]*?left\s+join\s+build_currentness\s+currentness[\s\S]*?currentness\.kind\s*=\s*'old_active'[\s\S]*?\)\s*,\s*old_state/i,
    'old rows consume the single currentness matrix'],
  [/unaffected_rows\s+as\s+materialized\s*\([\s\S]*?from\s+unaffected_expected\s+expected[\s\S]*?left\s+join\s+build_currentness\s+currentness[\s\S]*?currentness\.kind\s*=\s*'unaffected_active'[\s\S]*?\)\s*,\s*unaffected_integrity/i,
    'unaffected rows consume the single currentness matrix'],
  [/active_actual\s+as\s+materialized\s*\([\s\S]*?left\s+join\s+build_currentness\s+currentness\s+on\s+currentness\.build_id\s*=\s*build\.id[\s\S]*?\)\s*,\s*active_state/i,
    'active rows consume the single currentness matrix'],
  [/affected_eligible\s+as\s+materialized\s*\([\s\S]*?from\s+build_currentness\s+currentness[\s\S]*?currentness\.sources_current\s+and\s+currentness\.release_current[\s\S]*?\)\s*,\s*eligible_members/i,
    'affected eligibility consumes both cached currentness predicates'],
  [/eligible_members\s+as\s+materialized\s*\([\s\S]*?from\s+build_currentness\s+currentness[\s\S]*?join\s+public\.brinesearch_road_graph_counties\s+county[\s\S]*?build\.status\s+in\s*\(\s*'validated'\s*,\s*'active'\s*\)[\s\S]*?currentness\.release_current[\s\S]*?\)\s*,\s*eligible_state/i,
    'eligible member JSON consumes the cached release predicate and active county registry'],
]) assert.match(pinWithoutComments, pattern, `file37 missing ${label}`);

for (const [pattern, label] of [
  [/candidate_state\s+as\s+materialized\s*\([\s\S]*?bool_and\s*\(\s*coalesce\s*\([\s\S]*?false\s*\)\s*\)\s*,\s*false\s*\)[\s\S]*?from\s+candidate_rows/i,
    'candidate NULL-to-false aggregate'],
  [/old_state\s+as\s+materialized\s*\([\s\S]*?bool_and\s*\(\s*coalesce\s*\([\s\S]*?false\s*\)\s*\)\s*,\s*false\s*\)[\s\S]*?from\s+old_rows/i,
    'old-build NULL-to-false aggregate'],
  [/unaffected_state\s+as\s+materialized\s*\([\s\S]*?bool_and\s*\(\s*coalesce\s*\([\s\S]*?false\s*\)\s*\)\s*,\s*false\s*\)[\s\S]*?from\s+unaffected_rows/i,
    'unaffected-build NULL-to-false aggregate'],
]) assert.match(pinWithoutComments, pattern, `file37 missing ${label}`);

assert.match(
  pinWithoutComments,
  /source_scope_currentness\s+as\s+materialized\s*\([\s\S]*?dataset_scope_current\s*\([\s\S]*?\)\s+as\s+current[\s\S]*?\)\s*,\s*source_scopes\s+as\s+materialized\s*\([\s\S]*?from\s+source_scope_currentness\s*\)/i,
  'all 38 source-scope predicates must be evaluated once and consumed from one materialized CTE',
);
assert.match(
  pinWithoutComments,
  /currentness\.expected_rows\s*=\s*27[\s\S]*?currentness\.expected_distinct_builds\s*=\s*27[\s\S]*?currentness\.actual_rows\s*=\s*27[\s\S]*?currentness\.actual_distinct_builds\s*=\s*27[\s\S]*?currentness\.expected_counties\s*=\s*19[\s\S]*?currentness\.actual_counties\s*=\s*19[\s\S]*?currentness\.retained_rows\s*=\s*35[\s\S]*?currentness\.retained_active_rows\s*=\s*19[\s\S]*?currentness\.retained_validated_rows\s*=\s*16[\s\S]*?currentness\.unexpected_validated_rows\s*=\s*8[\s\S]*?currentness\.unexpected_release_current_rows\s*=\s*0[\s\S]*?currentness\.exact[\s\S]*?currentness\.counties_exact[\s\S]*?as\s+currentness_universe_ok/i,
  'gate must require the exact pinned 27-build scope, 19-county active registry, and bounded 8-row stale validated Ohio history',
);
assert.match(
  pinWithoutComments,
  /left\s+join\s+historical_manifest\s+manifest_header\s+on\s+true/i,
  'missing historical manifest must flow into the fail-closed assertion gate',
);
assert.doesNotMatch(
  pinWithoutComments,
  /cross\s+join\s+historical_manifest\s+manifest_header/i,
  'missing historical manifest must not suppress the receipt row before the gate',
);

const provenanceBlock = pinSql.match(
  /provenance\s+as\s+materialized\s*\(([\s\S]*?)\)\s*,\s*function_expected/i,
)?.[1];
assert.ok(provenanceBlock, 'file37 exact provenance CTE is missing');
const provenanceEntries = [...provenanceBlock.matchAll(
  /'([^']*)'\s*::\s*text\s+as\s+([a-z_][a-z0-9_]*)/gi,
)].map((match) => [match[2], match[1]]);
assert.deepEqual(provenanceEntries, [
  ['branch', 'data/issue-97-authoritative-road-junction-graph'],
  ['git_head', '8ee6c615d97f99df0ae850d05745b8750414c81c'],
  ['git_tree', '8498e76645549fcfccfc735ef29357784020f594'],
  ['permanent_attempt_id', 'issue97-frozen-wave-permanent-install-20260822T005303499Z'],
  ['permanent_sql_sha256', '2EF87642C61E858D0CB90E8E80807423EC7213F569F882EE0CE6ED1E6CEA0E70'],
  ['rehearsal_sha256', '0108179B55595E189F0C466AB6F51353BD694EEA1B466C88221035C310C3E65F'],
  ['rehearsal_blob', 'f9737e813f18f2e9c6a35e2280dc1f1e93b823c9'],
  ['migration_sha256', '6DFBE9983E5F1BA840C32A5F06B2203EE46C9E3EEBC3D475BF9370341D806B7A'],
  ['migration_blob', 'eb8839fdc4eccd0c6ad2dceb2e680c60afab466b'],
  ['migration_md5', '317b2b649059f3f41bc510e3ac63a439'],
  ['route_manifest_sha256', '6FCEE70C9F8B8DAAFCEDAAEEB25239120B8A522653495AEBCDB08443201A65C9'],
  ['route_manifest_blob', '298ea15bfd7f8d388f819db07841e2ba2d54c905'],
  ['permanent_stdout_sha256', 'C0FD1808A0A8AC54537668518DC580B7643A878FFAF0EB29CBB9E2E9EF42A6A1'],
  ['permanent_stderr_sha256', '1A006B2100AE2B89E420689B530D414047E3427B8CFEBEAAC9613DD0A1659DE8'],
  ['frozen_route_block_sha256', 'C01B6B0181849ED4381DB411504D91A64AF5BCE57C26C46BBEA179F3815CD838'],
  ['release_generation', 'issue97-release-20260815-r2'],
  ['candidate_set_digest', 'c3f925954d41cb6fbd5939eca5de3288'],
  ['transition_identity_digest', '043d969160dded7b9ff3526b6b09b752'],
  ['transition_road_digest', 'fd835556c06d4b067ca01ff8329a5d1c'],
  ['transition_pair_digest', 'cf20cef7b1f18ea57afbfee9a6f5202e'],
  ['typed_transition_digest', '0b89d8b7f7969a95b6d94f270cd81ccc'],
  ['route_digest', '711b1ddd3ba6c47e7642fc700197432f'],
  ['google_pad_digest', '450948793c57a9a1535139fac4974792'],
  ['google_tuple_digest', '5a75e5c4c34805b7dc2fdf8d0534a4f6'],
], 'file37 exact provenance fields or values drifted');

const functionBlock = pinSql.match(
  /function_expected\s*\([^)]*\)\s+as\s*\(([\s\S]*?)\)\s*,\s*function_state/i,
)?.[1];
assert.ok(functionBlock, 'file37 exact function-pin block is missing');
const functionRows = [...functionBlock.matchAll(
  /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([0-9a-f]{32})'\s*\)/gi,
)].map((match) => match.slice(1, 4));
assert.deepEqual(functionRows, [
  ['builder', 'public.brinesearch_issue97_rebuild_county_graph(text,text)', '06705f5b35a6d37151bb2c0dc5ade9bd'],
  ['county_exact_mapper', 'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)', '3ee125bc5e6e3d65e7ea290ef1dc908e'],
  ['sources_current', 'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)', '5653fb3e85b9a9962dbcc9f5af0329e7'],
  ['release_current', 'private_verification.brinesearch_issue97_graph_build_release_current(uuid)', '6471a34ccf42d058b846776d23cb0216'],
  ['state_manifest_integrity', 'private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)', '75d25d5298c59869b656bb9db3cc3fe2'],
  ['release_receipt_trigger', 'private_verification.brinesearch_issue97_stamp_graph_release_receipt()', 'e3c8fa406c6b4631b25e95a7ebb6d2d2'],
  ['mapping_evidence', 'private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)', '4e2dd7caa6e3b654c96d50872ae4d1e8'],
  ['mapping_fingerprint_v2', 'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)', 'e1b8a34d2cf86bac69877dea283b93aa'],
  ['activation', 'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)', '73eb9adbfd16ea671873da7b4e495f73'],
], 'file37 production function pins drifted');
assert.match(
  pinWithoutComments,
  /function_state\.expected_count\s*=\s*9\s+and\s+function_state\.exact_count\s*=\s*9\s+as\s+functions_ok/i,
  'gate must require all nine function definitions used by the pinned contract',
);

const targetPattern = /\(\s*'([0-9a-f-]{36})'\s*,\s*'([0-9a-f-]{36})'\s*,\s*'(exact_route_designation|exact_base_nlf_source_street_core)'\s*,\s*'([0-9a-f]{32})'\s*,\s*'([0-9a-f]{32})'\s*\)/g;
const migrationTargetBlock = migrationBytes.toString('utf8').match(
  /insert\s+into\s+tmp_issue97_frozen_mapping_targets\s+values([\s\S]*?);\s*--\s*The reviewed migration/i,
)?.[1];
const pinTargetBlock = pinSql.match(
  /target_source\s*\([^)]*\)\s+as\s*\(\s*values([\s\S]*?)\)\s*,\s*target_pairs/i,
)?.[1];
assert.ok(migrationTargetBlock && pinTargetBlock,
  'could not isolate exact reviewed-mapping blocks');
const migrationTargets = [...migrationTargetBlock.matchAll(targetPattern)]
  .map((match) => match.slice(1, 6));
const pinTargets = [...pinTargetBlock.matchAll(targetPattern)]
  .map((match) => match.slice(1, 6));
assert.equal(migrationTargets.length, 46, 'migration reviewed-mapping target count drifted');
assert.deepEqual(pinTargets, migrationTargets,
  'file37 reviewed-mapping targets are not exact migration rows');

const migrationMachineJson = migrationBytes.toString('utf8').match(
  /\$issue97_frozen_mapping_refresh_contract_rows\$\s*([\s\S]*?)\s*\$issue97_frozen_mapping_refresh_contract_rows\$\s*::\s*jsonb/i,
)?.[1];
const pinMachineJson = pinSql.match(
  /\$issue97_file37_machine_contract\$\s*([\s\S]*?)\s*\$issue97_file37_machine_contract\$\s*::\s*jsonb/i,
)?.[1];
assert.ok(migrationMachineJson && pinMachineJson,
  'could not isolate exact machine-transition JSON contracts');
const migrationMachineRows = JSON.parse(migrationMachineJson);
const pinMachineRows = JSON.parse(pinMachineJson);
assert.equal(migrationMachineRows.length, 42, 'migration machine-transition count drifted');
assert.deepEqual(pinMachineRows, migrationMachineRows,
  'file37 machine-transition contract is not exact migration JSON');

const replacementBlock = stripSqlComments(marked(
  pinSql,
  '-- ISSUE97_REPLACEMENT_CANDIDATES_BEGIN',
  '-- ISSUE97_REPLACEMENT_CANDIDATES_END',
  'replacement candidates',
));
const oldBlock = stripSqlComments(marked(
  pinSql,
  '-- ISSUE97_REPLACED_ACTIVE_BUILDS_BEGIN',
  '-- ISSUE97_REPLACED_ACTIVE_BUILDS_END',
  'replaced active builds',
));
const unaffectedBlock = stripSqlComments(marked(
  pinSql,
  '-- ISSUE97_UNAFFECTED_ACTIVE_BUILDS_BEGIN',
  '-- ISSUE97_UNAFFECTED_ACTIVE_BUILDS_END',
  'unaffected active builds',
));
const googleBlock = stripSqlComments(marked(
  pinSql,
  '-- ISSUE97_GOOGLE_DEPENDENCY_TUPLES_BEGIN',
  '-- ISSUE97_GOOGLE_DEPENDENCY_TUPLES_END',
  'Google dependency tuples',
));

const replacementPattern = new RegExp(
  `\\(\\s*([1-8])\\s*,\\s*'([A-Z]{3})'\\s*,\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,`
    + `\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*,`
    + '\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)(?=\\s*[,\\)])',
  'g',
);
const replacementRows = [...replacementBlock.matchAll(replacementPattern)].map((match) => [
  Number(match[1]), match[2], match[3], match[4], match[5], match[6],
  ...match.slice(7, 12).map(Number),
]);
const expectedReplacementRows = [
  [1, 'BEL', '1c1320b3-4257-4239-9c55-b18a801aa97e', '269e903e991f1790bf5d1428e4c2bb43', '59e4d0079a9114a622ca6021d557cc07', 'b20843ddf3d2a648b8d53a0b3eb1a1c2', 5687, 3001, 4878, 112, 9912],
  [2, 'CAR', '8e565c14-33a4-4862-9bf8-be9b5557b293', '2943504592861b83abce581f29a1cacb', '07dd91d21b7e757d3bf5f20db54ea579', '8405344f91e795398ab261a51f2a03bf', 2640, 1553, 2522, 90, 5251],
  [3, 'COL', 'b86d14c7-5c8a-4cb9-8a3b-903965340678', '6bd88992a7a63c9643d1a6f1535ca2af', '89fbad6cfcc8e62c6e600a406f243d08', '44b4e720a523face3149d7dbdc8a298b', 5754, 3006, 5091, 126, 10812],
  [4, 'GUE', '44245144-3e39-45fe-907b-95e2b01b9c32', 'd7a43bacbf54794d4e92d9e8ceca2e28', '02cc95bbbacaaa969a8e8420ae4987e1', 'b0cc4e8e3aaa7121cc39cc7935189664', 3648, 2079, 2995, 101, 6433],
  [5, 'HAS', '0870470a-11f8-4f33-8af3-08d6849d5f34', 'fc53a1492a3eecab78a524dbadcddfe8', 'd814298cc86b83ea2cb5938dd8e978dd', 'ece929162c9063ea35a6a276de59a940', 2336, 1013, 1746, 57, 3550],
  [6, 'JEF', 'c9bac3a2-82d4-4b76-813c-6a29c1bf062a', 'ce2de7721f56a145b21ddded270f07fd', '6c95c0985714405f2af340e9d7c7c924', '0d40dc262b0097cf48783f7271531153', 4135, 2187, 3498, 69, 7116],
  [7, 'MOE', '8493f66b-b3d2-4673-be8a-07b024b9723d', 'fafd62f37b76e57859164010d1be967b', '2e2fc9e336115c9fd5fced5a69f5a9ad', '5a82a31c86fdd78804bf113f73e49694', 2264, 1250, 1715, 32, 3504],
  [8, 'NOB', '200d56dc-5b13-4f84-82cb-946b8ebeada2', '576c5e1b1012fcb8020fa637fb272082', '821c52a3c9090067a8496847ee1b1172', '795f812c7a9042318196195cccccf3a4', 1959, 1030, 1381, 40, 2841],
];
assert.deepEqual(replacementRows, expectedReplacementRows, 'replacement candidate pins drifted');
assert.equal([...replacementBlock.matchAll(uuidLiteralPattern)].length, 8, 'replacement block has extra UUID pins');

const oldPattern = new RegExp(
  `\\(\\s*'([A-Z]{3})'\\s*,\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,`
    + `\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*,`
    + '\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*,\\s*([0-9]+)(?=\\s*[,\\)])',
  'g',
);
const oldRows = [...oldBlock.matchAll(oldPattern)].map((match) => [
  ...match.slice(1, 6), ...match.slice(6, 11).map(Number),
]);
const expectedOldRows = [
  ['BEL', '24ffa531-0e69-4625-a137-da52020e6fd0', 'fc6dcbc8482b2e5c89f4069941c557de', 'd7565e078c0dda3d248555600522649b', '81355d7958b89ffccd08a5f521730f8e', 5687, 3001, 4878, 112, 9912],
  ['CAR', '5ee5f97b-447f-41d3-946a-68a8b28d8367', 'e9f4ed56bb2b1308b8b9913a751c78f5', 'e50ef5799abf04d16c2ecb79d4db0651', '853c139290afee94e391fc0395d40fed', 2640, 1553, 2522, 90, 5251],
  ['COL', 'c9f50b03-4328-4d8b-9995-4dc8bc85dd01', 'c13278c74933205f5c55cdf85f23f27e', '2d0b4ff159b673d214e3661feecd9088', '7f54d4a6e143c4006cb90b4b4fa0b67e', 5754, 3006, 5091, 126, 10812],
  ['GUE', '84568854-3257-46b7-8581-374dc620ef16', 'b11b2f5ac3c1c5d492c2233494706f4c', '30c17bd7c09c6093cfc3dc35a9adc5f8', 'b2bee82327b4ce24833fee33c4873238', 3648, 2079, 2995, 101, 6433],
  ['HAS', '542c35d5-a9ba-4b43-8a64-63a66f6b29e2', '1d8f6a52d2541e313932906f944b2f92', '7d0561a0f32e7432880d4ad39e5e7109', '610d4d5fe3a19cd1d07e9fc3049b2785', 2336, 1013, 1746, 57, 3550],
  ['JEF', 'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4', '06e8bd25f7fb46fe750214dd77e2b67d', '1b43430facf325e7ae1840f593f6e1ce', '03efea8f142bb29e5f27cb12bf84c49f', 4135, 2187, 3498, 69, 7116],
  ['MOE', 'ab9f4083-d572-4d9d-8e0a-28ebb77517e7', '69010044273a611876c3a8ace7c198a2', '7d794bd9b703b10c9579f97a325bb23a', '0921c5ea8751f20f079ba1a776bc7c1e', 2264, 1250, 1715, 32, 3504],
  ['NOB', '70f30495-860a-4199-9360-8e880f3b515b', 'eefc679ed36e6aba3a590c7ba2c9e541', 'ee7692fde47360caa2203b3436ca099b', '89af7128d56bbc4ef3733436d0813823', 1959, 1030, 1381, 40, 2841],
];
assert.deepEqual(oldRows, expectedOldRows, 'replaced active-build pins drifted');
assert.equal([...oldBlock.matchAll(uuidLiteralPattern)].length, 8, 'old-build block has extra UUID pins');

const unaffectedPattern = new RegExp(
  `\\(\\s*'([A-Z]{3})'\\s*,\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,\\s*'([0-9a-f]{32})'(?=\\s*[,\\)])`,
  'g',
);
const unaffectedRows = [...unaffectedBlock.matchAll(unaffectedPattern)]
  .map((match) => match.slice(1, 4));
const expectedUnaffectedRows = [
  ['ATH', '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb', '2080a5a06944f3d4842e31937748267f'],
  ['COS', '7c979743-72e4-42a2-a6a9-006a369168c0', '7791b63c7bcb5848200b5bc4cc970fb4'],
  ['MAH', '360472bf-cb96-4ba7-b2fe-efa04e230f69', '4a80abcc01932b7a169189ec5f706cc4'],
  ['MEG', 'e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048', '2fcf1a69c13907789a2f902574a35674'],
  ['MUS', '98ae1835-1064-4c18-a8a7-9a9e570e212d', '04a4c9d7a4274ac638cad78a406f76fa'],
  ['POR', 'c645a8bf-a920-432a-a341-a7b60d9cfd49', '89513e609f359ad9064814ebbf074810'],
  ['STA', '67541fad-5cf2-4483-b0f6-f4060197fda9', '67be9ebece47e78c4c7ccf29ea92786e'],
  ['TRU', '3c94b14c-9d9e-41ec-a897-b754dab6d8dd', '2ff743a4c7f223a6821d3eaff7416d1d'],
  ['TUS', 'fd6fdfff-f23f-42cc-a633-64448bd9d044', 'b5d73c4e9a397596bbdc1dd0697a0b6d'],
  ['VIN', '785f5277-369c-4ae3-ba80-31411745e46d', '551be5443af26c64d5ed5e92a58ee71b'],
  ['WAS', '90982f30-8a06-4a53-8b4b-9efd5d9042bf', '6ccff50666a085a4387c20fb49f90a59'],
];
assert.deepEqual(unaffectedRows, expectedUnaffectedRows, 'unaffected active-build pins drifted');
assert.equal([...unaffectedBlock.matchAll(uuidLiteralPattern)].length, 11, 'unaffected block has extra UUID pins');

const replacementIds = replacementRows.map((row) => row[2]);
const oldIds = oldRows.map((row) => row[1]);
const unaffectedIds = unaffectedRows.map((row) => row[1]);
assert.equal(new Set(replacementIds).size, 8, 'replacement IDs must be unique');
assert.equal(new Set(oldIds).size, 8, 'old IDs must be unique');
assert.equal(new Set(unaffectedIds).size, 11, 'unaffected IDs must be unique');
assert.equal(new Set([...replacementIds, ...oldIds, ...unaffectedIds]).size, 27,
  'old, replacement, and unaffected IDs must be disjoint');
assert.deepEqual(
  [...new Set([...replacementRows.map((row) => row[1]), ...unaffectedRows.map((row) => row[0])])].sort(),
  ['ATH', 'BEL', 'CAR', 'COL', 'COS', 'GUE', 'HAS', 'JEF', 'MAH', 'MEG', 'MOE', 'MUS', 'NOB', 'POR', 'STA', 'TRU', 'TUS', 'VIN', 'WAS'],
  'exact 19-county Ohio pin set drifted',
);

const activeTimestamp = '2026-08-16T11:08:18.355674Z';
const currentnessModelRows = [
  ...replacementRows.map((row) => ({
    kind: 'candidate', county: row[1], id: row[2], digest: row[3],
    status: 'validated', activatedAt: null, sources: true, release: true,
  })),
  ...oldRows.map((row) => ({
    kind: 'old_active', county: row[0], id: row[1], digest: row[2],
    status: 'active', activatedAt: activeTimestamp, sources: false, release: false,
  })),
  ...unaffectedRows.map((row) => ({
    kind: 'unaffected_active', county: row[0], id: row[1], digest: row[2],
    status: 'active', activatedAt: activeTimestamp, sources: true, release: true,
  })),
];
const canonicalCurrentnessById = new Map(currentnessModelRows.map((row) => [row.id, row]));
const currentnessModelPasses = (rows) => rows.length === 27
  && new Set(rows.map((row) => row.id)).size === 27
  && new Set(rows.map((row) => row.county)).size === 19
  && rows.filter((row) => row.kind === 'candidate').length === 8
  && rows.filter((row) => row.kind === 'old_active').length === 8
  && rows.filter((row) => row.kind === 'unaffected_active').length === 11
  && rows.every((row) => {
    const expected = canonicalCurrentnessById.get(row.id);
    return expected !== undefined
      && Object.keys(expected).every((key) => row[key] === expected[key]);
  });
const mutateCurrentness = (index, patch) => currentnessModelRows.map((row, at) => (
  at === index ? { ...row, ...patch } : { ...row }
));
assert.equal(currentnessModelPasses(currentnessModelRows), true);
assert.equal(currentnessModelPasses(currentnessModelRows.slice(1)), false);
assert.equal(currentnessModelPasses([...currentnessModelRows, currentnessModelRows[0]]), false);
assert.equal(currentnessModelPasses([
  currentnessModelRows[0], ...currentnessModelRows.slice(0, -1),
]), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, {
  id: '00000000-0000-0000-0000-000000000000',
})), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { county: 'ATH' })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { kind: 'old_active' })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, {
  digest: '00000000000000000000000000000000',
})), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { status: 'active' })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, {
  activatedAt: activeTimestamp,
})), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { sources: false })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { sources: null })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(0, { release: false })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(8, { sources: true })), false);
assert.equal(currentnessModelPasses(mutateCurrentness(8, { release: true })), false);

const historicalValidatedModelPasses = (rows) => rows.length === 8
  && rows.every((row) => row.release === false);
const historicalValidatedRows = Array.from({ length: 8 }, (_, index) => ({
  id: `historical-validated-${index + 1}`,
  release: false,
}));
assert.equal(historicalValidatedModelPasses(historicalValidatedRows), true);
assert.equal(historicalValidatedModelPasses(historicalValidatedRows.slice(1)), false);
assert.equal(historicalValidatedModelPasses([
  ...historicalValidatedRows,
  { id: 'historical-validated-9', release: false },
]), false);
assert.equal(historicalValidatedModelPasses(historicalValidatedRows.map((row, index) => (
  index === 0 ? { ...row, release: true } : row
))), false);
assert.equal(historicalValidatedModelPasses(historicalValidatedRows.map((row, index) => (
  index === 0 ? { ...row, release: null } : row
))), false);

const candidateDigestInput = [...replacementRows]
  .sort((left, right) => left[1].localeCompare(right[1]))
  .map((row) => `${row[1]}:${row[2]}:${row[3]}:${row[4]}:${row[5]}`)
  .join('|');
assert.equal(md5(candidateDigestInput), 'c3f925954d41cb6fbd5939eca5de3288',
  'candidate-set digest drifted');
assert.equal(sha256(candidateDigestInput), 'dd4b195363ae4d729d0d3a34fedf5ed76a681d3da7be84b12f81dac79dbc0111',
  'candidate-set SHA-256 drifted');
requireText(pinSql, 'c3f925954d41cb6fbd5939eca5de3288', 'candidate-set digest literal');
assert.match(
  normalizedExecutable,
  /pg_catalog\.md5\s*\(\s*pg_catalog\.string_agg\s*\([\s\S]{0,800}county_code[\s\S]{0,200}build_id[\s\S]{0,200}graph_digest[\s\S]{0,200}mapping_snapshot_digest[\s\S]{0,200}source_revision_digest[\s\S]{0,200}order by[\s\S]{0,80}county_code/,
  'candidate-set digest must be computed from the five exact fields ordered by county',
);

const manifestRouteBlock = marked(
  routeManifest,
  '-- EXACT_FINAL_412_BEGIN',
  '-- EXACT_FINAL_412_END',
  'file34 exact route block',
);
const pinRouteBlock = marked(
  pinSql,
  '-- EXACT_FINAL_412_BEGIN',
  '-- EXACT_FINAL_412_END',
  'file37 exact route block',
);
assert.equal(normalizeLf(pinRouteBlock), normalizeLf(manifestRouteBlock),
  'file37 route block is not byte-semantic-equal to file34');
assert.equal(
  sha256(normalizeLf(pinRouteBlock)),
  'f66b3ac168ce27d13b8b4c0a46c44f058f15d445c308108d576d05d38f175120',
  'exact 412-route block bytes drifted',
);
const routeIds = [...pinRouteBlock.matchAll(uuidLiteralPattern)].map((match) => match[1]);
assert.equal(routeIds.length, 412, 'route pin count must be 412');
assert.equal(new Set(routeIds).size, 412, 'route pins must be unique');
assert.deepEqual(routeIds, [...routeIds].sort(), 'route pins must retain file34 sorted order');
assert.equal(md5(routeIds.join('|')), '711b1ddd3ba6c47e7642fc700197432f',
  'route pin digest drifted');
assert.equal(sha256(routeIds.join('|')), '9c76b9be6ffb5ef38df181ab76c89a2088aa46b19d7a13c99370d88860365ad2',
  'route pin SHA-256 drifted');
for (const token of ['379', '33', '412', '340', '72', '711b1ddd3ba6c47e7642fc700197432f']) {
  requireText(pinSql, token, `route contract token ${token}`);
}

const googlePattern = new RegExp(
  `\\(\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,`
    + `\\s*'(${strictUuid})'\\s*::\\s*uuid\\s*,\\s*([0-9]+)\\s*::\\s*bigint(?=\\s*[,\\)])`,
  'g',
);
const googleRows = [...googleBlock.matchAll(googlePattern)].map((match) => [
  match[1], match[2], match[3], Number(match[4]),
]);
assert.equal([...googleBlock.matchAll(uuidLiteralPattern)].length, 27,
  'Google dependency block must contain exactly nine three-UUID tuples');

const snapshotStartToken = 'create temporary table\ntmp_issue97_mapping_wave_refresh_expansion_google_before_build';
const snapshotStart = normalizeLf(rehearsal).indexOf(snapshotStartToken);
const snapshotEndToken = '$issue97_frozen_mapping_refresh_expansion_google_snapshot_assertion$;';
const snapshotEnd = normalizeLf(rehearsal).indexOf(snapshotEndToken, snapshotStart);
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart,
  'could not isolate tracked rehearsal Google dependency contract');
const rehearsalGoogleBlock = normalizeLf(rehearsal).slice(snapshotStart, snapshotEnd);
const rehearsalGoogleRows = [...rehearsalGoogleBlock.matchAll(googlePattern)].map((match) => [
  match[1], match[2], match[3], Number(match[4]),
]);
const expectedGoogleRows = [
  ['69c63442-de05-4d15-95da-07da587bc070', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['6ef0746f-341a-4d29-9399-a81cfbec11e8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['75600d0c-17b8-488b-96c9-4b7b8ffc8b1b', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['b6dae008-74d4-4976-9c72-fba7ae349c50', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['b7526e45-0b33-4988-ae1c-0a4140971f8e', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['d7898e8c-1bb6-48f8-b5e0-87bc1898420e', '9acadc48-c230-5e7b-6f2a-0a77f86f625c', 'bbfacbaf-86be-4818-8541-61a697c71199', 1],
  ['e2b32e85-9e93-4388-8215-9d8167cbbeb8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['f896d00c-da26-41b6-bf5b-e9d91afbdbc6', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['fcbf5085-4ba2-496d-9c20-516e8b52f9bd', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
];
assert.deepEqual(rehearsalGoogleRows, expectedGoogleRows,
  'tracked rehearsal Google dependency tuples drifted');
assert.deepEqual(googleRows, rehearsalGoogleRows,
  'file37 Google dependency tuples are not the tracked rehearsal tuples');
assert.equal(new Set(googleRows.map((row) => row[0])).size, 9,
  'Google dependency pads must be unique');
const googlePadDigestInput = [...googleRows].sort((a, b) => a[0].localeCompare(b[0]))
  .map((row) => row[0]).join('|');
const googleTupleDigestInput = [...googleRows].sort((a, b) => a[0].localeCompare(b[0]))
  .map((row) => row.join(':')).join('|');
assert.equal(md5(googlePadDigestInput), '450948793c57a9a1535139fac4974792',
  'Google pad digest drifted');
assert.equal(md5(googleTupleDigestInput), '5a75e5c4c34805b7dc2fdf8d0534a4f6',
  'Google dependency-tuple digest drifted');
for (const token of [
  '450948793c57a9a1535139fac4974792',
  '5a75e5c4c34805b7dc2fdf8d0534a4f6',
  'road_identity_mapping_changed',
  'issue97-google-v1',
  'route_ready',
  'manifest_digest',
  'dependency_digest',
]) requireText(pinSql, token, `Google stale-boundary token ${token}`);
requireText(
  pinSql,
  'issue97-google-evidence-witness-invariant',
  'tracked variable Google evidence-witness invariant marker',
);
assert.match(
  pinWithoutComments,
  /google_state\s+as\s+materialized\s*\([\s\S]*?jsonb_object_keys\s*\(\s*evidence\s*\)[\s\S]*?=\s*2[\s\S]*?exists\s*\(\s*select\s+1\s+from\s+public\.brinesearch_road_identity_mappings\s+witness[\s\S]*?witness\.identity_id::text\s*=\s*google\.evidence->>'identity_id'[\s\S]*?witness\.road_id::text\s*=\s*google\.evidence->>'road_id'[\s\S]*?witness\.mapping_status\s*=\s*'verified'[\s\S]*?and\s*\(\s*\(\s*google\.evidence->>'identity_id'\s*=\s*google\.identity_id::text[\s\S]*?google\.evidence->>'road_id'\s*=\s*google\.road_id::text\s*\)\s*or\s+exists\s*\(\s*select\s+1\s+from\s+public\.brinesearch_pad_roads\s+step[\s\S]*?step\.pad_id\s*=\s*google\.pad_id[\s\S]*?step\.road_id::text\s*=\s*google\.evidence->>'road_id'[\s\S]*?\)\s*\)[\s\S]*?from\s+google_rows\s+google/i,
  'Google receipt evidence must be a verified variable witness bound by the frozen tuple or that pad current road',
);

const promptConflictGoogleIds = [
  '0924d44d-15b3-4eb0-921c-8418a0d810e9',
  '1da39654-c270-4c57-9c78-8a3828ff0372',
  '777b1e20-6680-49e6-b480-f15e8c5693fd',
  '8ff90c54-ee18-4fdc-8608-903c343365ef',
  'a1973e07-a467-444b-9a82-3ca30b19443a',
  'a7cc0aad-7d7e-4549-835f-18cf30112440',
  'c8a2fc24-6166-42fd-a75f-0b22a7fb984e',
  'e0c8ccfe-372d-4de4-ad37-617ef9fae370',
  'f139ae10-548d-4e99-a03a-676b0f944b4b',
];
for (const id of promptConflictGoogleIds) forbidText(pinSql.toLowerCase(), id,
  `prompt-conflict Google pad ${id}`);

const exactProvenance = [
  'issue97-frozen-wave-permanent-install-20260822T005303499Z',
  '2EF87642C61E858D0CB90E8E80807423EC7213F569F882EE0CE6ED1E6CEA0E70',
  'C0FD1808A0A8AC54537668518DC580B7643A878FFAF0EB29CBB9E2E9EF42A6A1',
  '1A006B2100AE2B89E420689B530D414047E3427B8CFEBEAAC9613DD0A1659DE8',
  '0108179B55595E189F0C466AB6F51353BD694EEA1B466C88221035C310C3E65F',
  'f9737e813f18f2e9c6a35e2280dc1f1e93b823c9',
  '6DFBE9983E5F1BA840C32A5F06B2203EE46C9E3EEBC3D475BF9370341D806B7A',
  '317B2B649059F3F41BC510E3AC63A439',
  'eb8839fdc4eccd0c6ad2dceb2e680c60afab466b',
  '6FCEE70C9F8B8DAAFCEDAAEEB25239120B8A522653495AEBCDB08443201A65C9',
  '298ea15bfd7f8d388f819db07841e2ba2d54c905',
  '20260817193212',
  'issue97_frozen_exact_mapping_wave',
  'issue97-release-20260815-r2',
];
for (const token of exactProvenance) requireText(pinSql.toLowerCase(), token.toLowerCase(),
  `exact provenance ${token}`);

const staleProvenance = [
  'issue97-frozen-wave-permanent-install-20260822T024633101Z',
  '7BA7CA623D7313EE6DD203EFABDDE559898921114751518ED0B37C78DE5A28F',
  '68439DBE0E4ED71851829D90CD8D2E2465850744537D9E2D601DFFFA22C62A34',
  '5E40654D114C97C8CC13D1717C3B7938',
  '9C1EB7245A367A28614082F2F764B5B1BBA520EFFA33ECD963B345DCAAEC95EA',
];
const staleCandidatePrefixes = [
  '72af99f3', '6453ddbd', '149f9fb5', 'e0b71436',
  'be18f289', 'ed787e25', 'f5b62cae', '479547c1',
];
for (const stale of [...staleProvenance, ...staleCandidatePrefixes]) {
  forbidText(pinSql.toLowerCase(), stale.toLowerCase(), `stale production provenance ${stale}`);
}

// The repository pin file is an include-safe literal/read-only contract. It
// may prepare ON COMMIT DROP pg_temp data, but may not control a transaction,
// accept operator input, discover a latest candidate, or mutate durable state.
assert.equal((executable.match(/;/g) ?? []).length, 1,
  'file37 must contain exactly one top-level SQL statement');
assert.match(normalizedExecutable, /^with\b[\s\S]*\bselect\b[\s\S]*;$/,
  'file37 must be one WITH/SELECT observational statement');
for (const [pattern, label] of [
  [/\b(?:begin|commit|rollback|savepoint|release\s+savepoint)\b/i, 'transaction control'],
  [/\b(?:merge|truncate|alter|grant|revoke|comment\s+on|vacuum|analyze|cluster|reindex)\b/i, 'persistent or maintenance command'],
  [/\b(?:refresh\s+materialized\s+view|security\s+label|lock\s+table|discard|checkpoint|load)\b/i, 'non-observational SQL command'],
  [/\bdrop\s+(?!table\b)/i, 'non-table DROP'],
  [/\b(?:call|do|execute|prepare|deallocate|listen|notify)\b/i, 'procedural or dynamic execution'],
  [/\bcopy\b/i, 'COPY'],
  [/\bselect\b[\s\S]{0,400}\binto\b/i, 'SELECT INTO'],
  [/\bpg_sleep\s*\(/i, 'sleep/retry delay'],
  [/\b(?:dblink|lo_import|pg_read_file|pg_write_file)\s*\(/i, 'external or filesystem function'],
  [/\b(?:nextval|setval|pg_terminate_backend|pg_cancel_backend|pg_advisory_lock|pg_advisory_xact_lock)\s*\(/i, 'state-changing or locking function'],
  [/\bcurrent_setting\s*\(/i, 'runtime setting input'],
  [/\bset_config\s*\(/i, 'runtime setting mutation'],
  [/\border\s+by[\s\S]{0,160}\b(?:created_at|started_at|completed_at)\b[\s\S]{0,80}\blimit\s+1\b/i, 'latest/newest candidate selection'],
  [/\b(?:retry|reconnect)\b/i, 'retry behavior'],
]) assert.doesNotMatch(executable, pattern, `file37 forbids ${label}`);

const creates = [...executable.matchAll(/\bcreate\s+(temporary|temp)\s+table\s+([a-z0-9_.]+)/gi)];
assert.equal((executable.match(/\bcreate\b/gi) ?? []).length, creates.length,
  'file37 may create only temporary tables');
for (const create of creates) {
  assert.match(create[2], /^(?:pg_temp\.)?tmp_issue97_[a-z0-9_]+$/i,
    'temporary table must remain in the fixed Issue #97 pg_temp namespace');
}
assert.ok((executable.match(/\bon\s+commit\s+drop\b/gi) ?? []).length >= creates.length,
  'every temporary table must be transaction-scoped ON COMMIT DROP');
for (const [pattern, label] of [
  [/\binsert\s+into\s+([a-z0-9_.]+)/gi, 'INSERT'],
  [/\bupdate\s+([a-z0-9_.]+)/gi, 'UPDATE'],
  [/\bdelete\s+from\s+([a-z0-9_.]+)/gi, 'DELETE'],
  [/\bdrop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_.]+)/gi, 'DROP TABLE'],
]) {
  for (const match of executable.matchAll(pattern)) {
    assert.match(match[1], /^(?:pg_temp\.)?tmp_issue97_[a-z0-9_]+$/i,
      `file37 ${label} target must be an Issue #97 temporary table`);
  }
}

for (const [pattern, label] of [
  [/brinesearch_issue97_refresh_exact_mappings_oh\s*\(/i, 'mapper refresh'],
  [/brinesearch_issue97_rebuild_county_graph\s*\(/i, 'graph build'],
  [/brinesearch_issue97_activate_graph_build\s*\(/i, 'graph activation'],
  [/brinesearch_issue97_(?:persist|activate)_state_candidate_manifest\s*\(/i, 'manifest mutation'],
  [/brinesearch_issue97_(?:reconcile|refresh_saved_road|run_all_pad|run_route|refresh_google)[a-z0-9_]*\s*\(/i, 'route or Google mutation'],
  [/brinesearch_issue97_activate_cutover\s*\(/i, 'global cutover'],
]) assert.doesNotMatch(executable, pattern, `file37 forbids ${label}`);

assert.doesNotMatch(pinWithoutComments, /\\gset\b|\\prompt\b|\\if\b|\\elif\b|\\else\b|\\endif\b|\\ir?\b|\\!|\\copy\b/i,
  'file37 accepts no psql/operator input or meta execution');
const quotedPsqlVariableAt = [...pinSql].findIndex((_, index) =>
  executable[index] === ':'
  && executable[index - 1] !== ':'
  && (pinSql[index + 1] === "'" || pinSql[index + 1] === '"'));
assert.equal(quotedPsqlVariableAt, -1,
  'file37 accepts no quoted psql variable input');
const allowedMetaLines = new Set([
  '\\set ON_ERROR_STOP on',
  '\\pset pager off',
  '\\pset tuples_only on',
  '\\pset format unaligned',
]);
for (const line of normalizeLf(pinWithoutComments).split('\n').map((value) => value.trim())) {
  if (line.startsWith('\\')) {
    assert.ok(allowedMetaLines.has(line), `file37 contains forbidden psql meta-command: ${line}`);
  }
}
assert.doesNotMatch(executable, /(?<!:):[A-Za-z_][A-Za-z0-9_]*/,
  'file37 accepts no unquoted psql variable input');
assert.doesNotMatch(pinWithoutComments, /(?:postgres(?:ql)?:\/\/|PGPASSWORD|DATABASE_URL|SUPABASE_DB_URL|SUPABASE_DATABASE_URL)/i,
  'file37 contains no connection or credential input');

for (const [pattern, label] of [
  [/\b(?:name_only|fuzzy_name|nearest_road|nearest_point|shortest_path|fastest_path|shortcut)\b[\s\S]{0,40}\btrue\b/i, 'guess/shortcut authorization'],
  [/coalesce\s*\(\s*(?:private_verification\.)?brinesearch_issue97_graph_build_(?:sources|release)_current\s*\([^)]*\)\s*,\s*true\s*\)/i, 'currentness COALESCE-to-true'],
  [/brinesearch_issue97_graph_build_(?:sources|release)_current\s*\([^)]*\)\s+is\s+not\s+false/i, 'nullable currentness weakening'],
  [/\bstatus\s*=\s*'validated'[\s\S]{0,180}\border\s+by/i, 'status-only candidate discovery'],
  [/\b(?:806|940)\b[\s\S]{0,100}\b(?:run|refresh|reconcile|pipeline)\b/i, 'broad route/pad execution'],
]) assert.doesNotMatch(pinWithoutComments, pattern, `file37 forbids ${label}`);
for (const token of [
  'private_verification.brinesearch_issue97_graph_build_sources_current(',
  'private_verification.brinesearch_issue97_graph_build_release_current(',
  'build.id=',
  'graph_digest',
  'mapping_snapshot_digest',
  'source_revision_digest',
]) requireText(pinWithoutComments.toLowerCase(), token, `exact currentness/pin check ${token}`);

// Exact post-install, pre-activation boundary must be asserted against live
// rows and folded into the fail-closed gate, rather than merely restated in a
// receipt label.
for (const [pattern, label] of [
  [/candidate_state\s+as\s+materialized\s*\([\s\S]*?status\s*=\s*'validated'\s+and\s+activated_at\s+is\s+null[\s\S]*?and\s+sources_current\s+and\s+release_current[\s\S]*?\)\s*,\s*old_rows/i,
    'validated, unactivated, sources-current and release-current candidates'],
  [/old_state\s+as\s+materialized\s*\([\s\S]*?status\s*=\s*'active'[\s\S]*?and\s+not\s+sources_current\s+and\s+not\s+release_current[\s\S]*?\)\s*,\s*historical_manifest/i,
    'exact old active builds stale on both currentness predicates'],
  [/unaffected_state\s+as\s+materialized\s*\([\s\S]*?actual\.status\s*=\s*'active'[\s\S]*?actual\.sources_current\s+and\s+actual\.release_current[\s\S]*?\)\s*,\s*active_expected/i,
    'exact unaffected active builds current on both predicates'],
  [/manifest_membership_state\s+as\s+materialized\s*\([\s\S]*?historical_members[\s\S]*?except[\s\S]*?eligible_members[\s\S]*?union\s+all[\s\S]*?eligible_members[\s\S]*?except[\s\S]*?historical_members[\s\S]*?as\s+current[\s\S]*?manifest_state\s+as\s+materialized\s*\([\s\S]*?state_candidate_manifest_integrity\s*\(\s*id\s*\)[\s\S]*?and\s+not\s+membership\.current[\s\S]*?\)\s*,\s*dependency_layer_state/i,
    'historical manifest exact and directly proven no longer current'],
  [/google_state\s+as\s+materialized\s*\([\s\S]*?status\s*=\s*'stale'\s+and\s+hold_reason\s*=\s*'road_identity_mapping_changed'[\s\S]*?manifest_digest\s+is\s+null\s+and\s+dependency_digest\s+is\s+null[\s\S]*?'route_ready'\s*,\s*false[\s\S]*?\),\s*false\)\s+as\s+exact/i,
    'exact nine-pad private stale/null Google boundary'],
  [/old\.rows\s*=\s*8\s+and\s+old\.sources_current\s*=\s*0\s+and\s+old\.release_current\s*=\s*0\s+and\s+old\.exact/i,
    'old stale boundary included in gate'],
  [/unaffected\.rows\s*=\s*11\s+and\s+unaffected\.exact/i,
    'unaffected boundary included in gate'],
  [/isolation\.google_queue\s*=\s*0\s+and\s+isolation\.public_google\s*=\s*0\s+and\s+not\s+isolation\.cutover/i,
    'queue zero, public Google zero and cutover off included in gate'],
  [/release_generation_ok[\s\S]*?currentness_universe_ok[\s\S]*?candidates_ok[\s\S]*?manifest_boundary_ok/i,
    'active release generation and currentness universe included in gate'],
]) assert.match(pinWithoutComments, pattern, `file37 missing ${label}`);

const failureBlock = pinWithoutComments.match(
  /check_failures\s+as\s+materialized\s*\(([\s\S]*?)\)\s*,\s*gate\s+as\s+materialized/i,
)?.[1];
assert.ok(failureBlock, 'file37 deterministic labeled fail-closed check list is missing');
const failureLabels = [...failureBlock.matchAll(
  /case\s+when\s+not\s+coalesce\s*\(\s*([a-z_]+_ok)\s*,\s*false\s*\)\s+then\s+'\1'\s+end/gi,
)].map((match) => match[1]);
assert.deepEqual(failureLabels, [
  'functions_ok',
  'release_generation_ok',
  'migration_ok',
  'manual_mappings_ok',
  'machine_mappings_ok',
  'currentness_universe_ok',
  'candidates_ok',
  'old_builds_ok',
  'unaffected_ok',
  'active_boundary_ok',
  'eligibility_ok',
  'manifest_boundary_ok',
  'sources_ok',
  'routes_ok',
  'google_ok',
  'isolation_ok',
  'boundary_literals_ok',
  'non_ohio_ok',
], 'file37 labeled fail-closed gate must cover every contract predicate exactly once');
assert.match(
  pinWithoutComments,
  /gate\s+as\s+materialized\s*\([\s\S]*?case\s+when\s+failures\.labels\s*=\s*''\s+then\s+1\s+else\s+\(\s*'ISSUE97_PIN_FAILURE\|'\s*\|\|\s*failures\.labels\s*\)\s*::\s*integer\s+end\s+as\s+contract_pass[\s\S]*?from\s+checks\s+cross\s+join\s+check_failures\s+failures\s*\)/i,
  'file37 must fail closed before receipt while exposing deterministic failed-check labels',
);

const packageScriptName = 'verify:issue97-frozen-wave-production-pins';
const packageScriptCommand = 'node v17/scripts/audit-issue97-frozen-mapping-wave-production-pins.mjs';
assert.equal(packageJson.scripts?.[packageScriptName], packageScriptCommand,
  'package production-pin verification script is missing or drifted');
assert.equal((packageRaw.match(/"verify:issue97-frozen-wave-production-pins"\s*:/g) ?? []).length, 1,
  'package production-pin script key must occur exactly once');
const buildSteps = packageJson.scripts.build.split(' && ');
const closureStep = 'npm run verify:issue97-frozen-route-closure';
const pinStep = `npm run ${packageScriptName}`;
assert.equal(buildSteps.filter((step) => step === closureStep).length, 1,
  'build must contain frozen-route-closure exactly once');
assert.equal(buildSteps.filter((step) => step === pinStep).length, 1,
  'build must contain production-pin audit exactly once');
assert.equal(buildSteps.indexOf(pinStep), buildSteps.indexOf(closureStep) + 1,
  'production-pin audit must run immediately after frozen-route-closure');

// Mutation sentinels prove the audit model rejects the dangerous drift classes.
const candidateModelPasses = (rows) => rows.length === 8
  && new Set(rows.map((row) => row[2])).size === 8
  && md5([...rows].sort((a, b) => a[1].localeCompare(b[1]))
    .map((row) => `${row[1]}:${row[2]}:${row[3]}:${row[4]}:${row[5]}`).join('|'))
    === 'c3f925954d41cb6fbd5939eca5de3288';
assert.equal(candidateModelPasses(replacementRows), true);
assert.equal(candidateModelPasses(replacementRows.slice(1)), false);
assert.equal(candidateModelPasses([...replacementRows, replacementRows[0]]), false);
assert.equal(candidateModelPasses(replacementRows.map((row, index) => (
  index === 0 ? [...row.slice(0, 3), '00000000000000000000000000000000', ...row.slice(4)] : row
))), false);
const googleModelPasses = (rows) => rows.length === 9
  && md5([...rows].sort((a, b) => a[0].localeCompare(b[0])).map((row) => row[0]).join('|'))
    === '450948793c57a9a1535139fac4974792'
  && md5([...rows].sort((a, b) => a[0].localeCompare(b[0])).map((row) => row.join(':')).join('|'))
    === '5a75e5c4c34805b7dc2fdf8d0534a4f6';
assert.equal(googleModelPasses(googleRows), true);
assert.equal(googleModelPasses(googleRows.slice(1)), false);
assert.equal(googleModelPasses(googleRows.map((row, index) => (
  index === 0 ? [row[0], row[1], row[2], row[3] + 1] : row
))), false);

const googleWitnessModelPasses = ({
  keyCount, mappingCurrent, equalsFrozenTuple, currentPadRoad,
}) => keyCount === 2
  && mappingCurrent === true
  && (equalsFrozenTuple === true || currentPadRoad === true);
assert.equal(googleWitnessModelPasses({
  keyCount: 2, mappingCurrent: true, equalsFrozenTuple: false, currentPadRoad: true,
}), true, 'a verified alternate invalidating witness on the pad must pass');
assert.equal(googleWitnessModelPasses({
  keyCount: 2, mappingCurrent: true, equalsFrozenTuple: true, currentPadRoad: false,
}), true, 'the frozen pre-receipt-manifest witness must pass');
assert.equal(googleWitnessModelPasses({
  keyCount: 1, mappingCurrent: true, equalsFrozenTuple: true, currentPadRoad: true,
}), false, 'missing Google evidence key must fail');
assert.equal(googleWitnessModelPasses({
  keyCount: 3, mappingCurrent: true, equalsFrozenTuple: true, currentPadRoad: true,
}), false, 'extra Google evidence key must fail');
assert.equal(googleWitnessModelPasses({
  keyCount: 2, mappingCurrent: false, equalsFrozenTuple: true, currentPadRoad: true,
}), false, 'unverified Google evidence mapping must fail');
assert.equal(googleWitnessModelPasses({
  keyCount: 2, mappingCurrent: true, equalsFrozenTuple: false, currentPadRoad: false,
}), false, 'unbound Google evidence witness must fail');

console.log('Issue #97 frozen mapping-wave production-pin audit passed: 8 replacements, 8 retired pins, 11 unaffected pins, exact 412 routes, and tracked nine-pad dependency contract.');
