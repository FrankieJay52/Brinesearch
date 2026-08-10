import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.join(scriptDir, '../src/parts/21d-road-manager-backtrace-responsive-v17326.js'), 'utf8');

for (const token of [
  'ROUTE_BACKTRACE_EXTERNAL_TIMEOUT_MS_V17326 = 6500',
  'AbortController',
  'Promise.any',
  'Checking Road Manager…',
  'Checking map for missing roads…',
  'routeBacktraceMissingRoadTokensV17326',
  'routeBacktraceRenderV17325(result)',
  'finally',
  'button.textContent = "Highlight route backward"'
]) {
  if (!source.includes(token)) throw new Error(`Responsive backtrace source missing ${token}.`);
}

const firstPaint = source.indexOf('routeBacktraceRenderV17325(result)');
const externalLookup = source.indexOf('await routeBacktraceOverpassV17325(missingTokens, coords)');
if (firstPaint < 0 || externalLookup < 0 || firstPaint > externalLookup) {
  throw new Error('Road Manager geometry is not rendered before the external map lookup.');
}

if (!/const missingTokens\s*=\s*routeBacktraceMissingRoadTokensV17326/.test(source)) {
  throw new Error('External fallback is not limited to roads still missing after Road Manager matching.');
}

console.log(JSON.stringify({
  version: '17.3.26',
  firstPaint: 'Road Manager geometry before external lookup',
  externalLookup: 'missing roads only',
  externalTimeoutMs: 6500,
  parallelFallback: true,
  stuckButtonGuard: 'finally restores Highlight route backward'
}, null, 2));
console.log('V17.3.26 responsive backward-route audit passed.');
