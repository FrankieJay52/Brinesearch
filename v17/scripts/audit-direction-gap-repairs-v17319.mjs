import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const [cleanup,migration]=await Promise.all([
  fs.readFile(path.join(v17Root,'src/runtime/direction-source-cleanup.js'),'utf8'),
  fs.readFile(path.join(projectRoot,'supabase/migrations/20260809223000_v17319_esther_weeks_clear_directions.sql'),'utf8')
]);
for(const token of [
  'ESTHER_WEEKS_CLEAR_V17319',
  'expand--esther-weeks',
  'Take Exit 5 to US-40.',
  'Turn left on Kruger St.',
  'Turn left on Lounez Ave.',
  'Veer right on CR-23 / Stone Church Rd. Continue approximately 6 miles.',
  'Turn left on Oklahoma Rd.'
]) if(!cleanup.includes(token)) throw new Error(`Offline Esther repair missing ${token}`);
for(const token of [
  "legacy_id='expand--esther-weeks'",
  'CR-23 / Stone Church Rd',
  'Source-grounded from existing saved written directions',
  "legacy_id='ascent--durr'",
  'held_source_pad_name_mismatch',
  'Sidwell Well Pad'
]) if(!migration.includes(token)) throw new Error(`Direction-gap migration missing ${token}`);
if(/select\s+public\.brinesearch_refresh_all_direction_intelligence\s*\(\s*\)/i.test(migration)) throw new Error('One-pad direction-gap migration must not trigger a full-directory intelligence refresh.');
console.log('Verified V17.3.19 direction-gap repair: Esther Weeks is source-grounded online and offline; Durr remains held because its saved source names a different destination pad; no global refresh is triggered by the one-pad repair.');
