import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');
const fallback = JSON.parse(await fs.readFile(path.join(publicRoot, 'pad-fallback-data.json'), 'utf8'));
const pads = Array.isArray(fallback?.pads) ? fallback.pads : [];
const app = await fs.readFile(path.join(publicRoot, 'app/brinesearch-app.js'), 'utf8');

const normalize = value => String(value ?? '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
const isJeffersonOhio = pad => {
  const state = normalize(pad?.state).toLowerCase();
  const county = normalize(pad?.county).replace(/\s+county$/i, '').toLowerCase();
  return (state === 'ohio' || state === 'oh') && county === 'jefferson';
};

const specs = [
  {
    route:'CR-22',
    alias:'Steubenville Street',
    match:/\b(?:East\s+|E\s+)?Steubenville\s+(?:St|Street)\b/i,
    appEvidence:['directionOfficialRoadIdentityV17312','text:"CR-22"','Steubenville St']
  },
  {
    route:'CR-23',
    alias:'Bloomingdale-Smithfield-Chandler Road',
    match:/\bBloomingdale[\s-]*Smithfield[\s-]*(?:Chandl(?:er)?|Chandler)\b/i,
    appEvidence:['directionOfficialRoadIdentityV17312','text:"CR-23"','Bloomingdale-Smithfield-Chandler Rd']
  },
  {
    route:'CR-26',
    alias:'Fernwood-Bloomingdale Road',
    match:/\bFernwood[\s-]*Bloomingdale\s+(?:Rd|Road)\b/i,
    appEvidence:['directionOfficialRoadIdentityV17312','text:"CR-26"','Fernwood-Bloomingdale Rd']
  }
];

const coverage = [];
for (const spec of specs) {
  const matchingPads = pads
    .filter(isJeffersonOhio)
    .filter(pad => spec.match.test(normalize(pad?.writtenDirections)))
    .map(pad => String(pad?._id || ''))
    .filter(Boolean)
    .sort();

  if (!matchingPads.length) {
    throw new Error(`Official road identity audit expected saved Jefferson County evidence for ${spec.route} / ${spec.alias}.`);
  }
  for (const token of spec.appEvidence) {
    if (!app.includes(token)) {
      throw new Error(`Official road identity audit is missing runtime protection for ${spec.route} / ${spec.alias}: ${token}`);
    }
  }
  coverage.push({ route:spec.route, alias:spec.alias, matchingPads:matchingPads.length, examples:matchingPads.slice(0,12) });
}

const dickson = pads.find(pad => pad?._id === 'ascent--dickson');
if (!dickson) throw new Error('Official road identity audit could not find ascent--dickson.');
const dicksonSource = normalize(dickson.writtenDirections);
for (const required of ['Steubenville','Bloomingdale- Smithfield- Chandl/High','Fernwood Bloomingdale']) {
  if (!dicksonSource.toLowerCase().includes(normalize(required).toLowerCase())) {
    throw new Error(`Dickson regression fixture is missing expected saved-road evidence: ${required}`);
  }
}

const noelle = pads.find(pad => pad?._id === 'ascent--noelle');
if (!noelle) throw new Error('Official road identity audit could not find ascent--noelle.');
const noelleSource = normalize(noelle.writtenDirections);
if (!/county\s+rd\s+23\s*\/\s*high\s+street/i.test(noelleSource)) {
  throw new Error('Noelle regression fixture no longer contains the saved CR-23 / High Street evidence.');
}
if (!/county\s+rd\s+26/i.test(noelleSource)) {
  throw new Error('Noelle regression fixture no longer contains the saved CR-26 evidence.');
}

if (!app.includes('directionReferencePartOfficialV17312')) {
  throw new Error('Official road identities must also be applied to the route summary/reference line.');
}

console.log(JSON.stringify({
  version:'17.3.12',
  audit:'official shared-road identity',
  county:'Jefferson, Ohio',
  coverage,
  regressionPads:['ascent--dickson','ascent--noelle'],
  result:'pass'
}, null, 2));
