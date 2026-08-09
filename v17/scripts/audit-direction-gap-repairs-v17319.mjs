import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const [cleanup,estherMigration,rubelMigration,rubelShard,indexText]=await Promise.all([
  fs.readFile(path.join(v17Root,'src/runtime/direction-source-cleanup.js'),'utf8'),
  fs.readFile(path.join(projectRoot,'supabase/migrations/20260809223000_v17319_esther_weeks_clear_directions.sql'),'utf8'),
  fs.readFile(path.join(projectRoot,'supabase/migrations/20260809223500_v17319_rubel_clear_directions.sql'),'utf8'),
  fs.readFile(path.join(v17Root,'src/data/directions/infinity-v17319.json'),'utf8'),
  fs.readFile(path.join(v17Root,'src/data/directions/index.json'),'utf8')
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
]) if(!estherMigration.includes(token)) throw new Error(`Esther/Durr migration missing ${token}`);
if(/select\s+public\.brinesearch_refresh_all_direction_intelligence\s*\(\s*\)/i.test(estherMigration)) throw new Error('One-pad Esther repair must not trigger a full-directory intelligence refresh.');
for(const token of [
  "legacy_id='infinity--rubel'",
  'Old Washington/Senecaville Exit',
  'Turn right on OH-331.',
  'Take the lease road on the left before the Dollar Store.',
  'excluded_ambiguous_landmark_text'
]) if(!rubelMigration.includes(token)) throw new Error(`Rubel migration missing ${token}`);
const rubel=JSON.parse(rubelShard)['infinity--rubel'];
if(!rubel||!/Turn right on OH-331\./.test(rubel.r)||/Clearwater five/i.test(rubel.r)) throw new Error('Rubel offline rewrite is missing or retained the excluded ambiguous landmark.');
const index=JSON.parse(indexText);
if(!index.files.includes('infinity-v17319.json')||index.recordCount<1161) throw new Error('Rubel V17.3.19 direction shard is not wired into the packaged direction manifest.');
console.log('Verified V17.3.19 direction-gap repairs: Esther Weeks is source-grounded online/offline; Rubel is source-grounded online/offline without the ambiguous landmark; Durr remains held because its saved source names a different destination pad; and one-pad repairs do not trigger a global refresh.');
