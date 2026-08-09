import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const required = (source, token, label) => { if (!source.includes(token)) throw new Error(`${label} is missing ${token}`); };

const [packageText, partText, styleText, o, p, q, r, s, t, css, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22o-direction-mileage-badges-double-name.js')),
  read(path.join(v17Root, 'src/parts/22p-direction-concise-driver-cards.js')),
  read(path.join(v17Root, 'src/parts/22q-direction-road-pair-safety.js')),
  read(path.join(v17Root, 'src/parts/22r-direction-final-card-contract.js')),
  read(path.join(v17Root, 'src/parts/22s-direction-range-mileage-final-scrub.js')),
  read(path.join(v17Root, 'src/parts/22t-known-source-cleanups.js')),
  read(path.join(v17Root, 'public/styles/app.css')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);
const pkg=JSON.parse(packageText), parts=JSON.parse(partText), styles=JSON.parse(styleText);
if(pkg.version!=='17.3.17'||parts.version!=='17.3.17'||styles.version!=='17.3.17') throw new Error('V17.3.17 version markers are not synchronized.');
const names=['22o-direction-mileage-badges-double-name.js','22p-direction-concise-driver-cards.js','22q-direction-road-pair-safety.js','22r-direction-final-card-contract.js','22s-direction-range-mileage-final-scrub.js','22t-known-source-cleanups.js'];
let last=-1; for(const name of names){const idx=parts.parts.indexOf(name); if(idx<=last)throw new Error(`${name} is out of order.`); last=idx;}
if(parts.parts.indexOf('18-account-theme-startup.js')<=last) throw new Error('Final direction layers must load before startup.');
required(t,'directionLeadingContextActionFixV17317','Final prefix fix');
required(t,'directionKnownClearTextCleanupV17317','Known-source cleanup');
required(s,'directionIntersectionReferenceV17317','Intersection safety');
required(r,'directionFinalCardsFromEntriesV17317','Final card contract');
required(css,'.direction-written-distance-v17317','Mileage CSS');
required(sw,'brinesearch-v17-3-17-concise-mileage-cards','V17.3.17 cache');
for(const token of ['directionLeadingContextActionFixV17317','directionKnownClearTextCleanupV17317','directionFinalMetaV17317']) required(app,token,'Assembled app');
if([o,p,q,r,s,t].some(source=>source.includes('>DOUBLE NAME<'))) throw new Error('Visible DOUBLE NAME badges are not allowed.');
if([p,r,s,t].some(source=>source.includes('street-sign-board')||source.includes('direction-highway-badge'))) throw new Error('Final driver cards must not create sign graphics.');
new vm.Script(app,{filename:'brinesearch-app.js'}); new vm.Script(sw,{filename:'sw.js'});

const clean=value=>String(value||'').replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').trim();
const compact=value=>String(value||'').replace(/\bonto\b/gi,'on').replace(/\.\s*Continue\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(miles?|mile|mi)\b/ig,(_,qualifier,amount)=>` for ${qualifier?'about ':''}${amount} mi`).replace(/\s{2,}/g,' ').trim();
const canonicalRoute=value=>{let text=clean(value),m=text.match(/^County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d+)/i);if(m)return`CR-${m[1]}`;m=text.match(/^Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d+)/i);if(m)return`TR-${m[1]}`;return text.replace(/^(I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*/i,(_,f)=>`${f.toUpperCase()}-`);};
function dual(value){const text=String(value||''),route='((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?|(?:State|County|Township)\\s+(?:Route|Road|Rd|Hwy)\\s*[- ]?\\s*\\d{1,4}[A-Z]?)',local="([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))";let m=text.match(new RegExp(`\\b${route}\\s*\\/\\s*${local}\\b`,'i'));if(m)return{kind:'route',text:canonicalRoute(m[1]),alias:clean(m[2])};m=text.match(new RegExp(`\\b${local}\\s*\\/\\s*${route}\\b`,'i'));if(m)return{kind:'route',text:canonicalRoute(m[2]),alias:clean(m[1])};return null;}
function view(value){const text=String(value||'').replace(/\bonto\b/gi,'on'),d=dual(text);if(d)return{road:d,note:''};let m=text.match(/\bExit\s*([0-9A-Z-]+)/i);if(m)return{road:{kind:'exit',text:`Exit ${m[1]}`},note:''};m=text.match(/\b(?:on|along|take|follow)\s+(?:the\s+)?(.+?)(?=\s+(?:for|in|and|then|until|toward|towards|continue|past|through|to|at)\b|[.;,]|$)/i);if(m?.[1])return{road:{kind:'road',text:clean(m[1])},note:''};m=text.match(/\b((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}[A-Z]?)\b/i);return{road:m?{kind:'route',text:canonicalRoute(m[1])}:{kind:'',text:''},note:''};}
const context={console:{log(){},warn(){}},window:{},esc:v=>String(v??''),directionWrittenCleanV17315:clean,directionStepCleanV17316:clean,directionWrittenSentenceV17315:compact,directionGlobalWrittenEntriesV17315:v=>v,directionGlobalWrittenPrimaryHtmlV17315:()=>'',directionInlineDualRoadV17312:dual,directionClearStepViewV1733:view,directionSplitDriverStepV17312:value=>[clean(value)]};
vm.createContext(context); for(const [name,source] of [['22o',o],['22p',p],['22q',q],['22r',r],['22s',s],['22t',t]]) vm.runInContext(source,context,{filename:name});
const pad=rows=>({directionRoadIntelligence:rows});
const intel=(step_order,maneuver_class,primary_road,local_road_name,distance_label,instruction,extra={})=>({step_order,maneuver_class,primary_road,local_road_name,distance_label:distance_label||null,distance_source:distance_label?'saved_direction':null,distance_confidence:distance_label?1:null,suspicious_distance:false,evidence:{instruction,...extra}});
const entry=(sourceStepOrder,instruction,notes=[])=>({sourceStepOrder,instruction,notes});

const cologiePad=pad([intel(1,'continue','US-250',null,null,'From Cadiz, take US-250 south.'),intel(2,'turn_left',null,null,'2.4 mi','Turn left onto Foxes Bottom Rd. Continue 2.4 miles.'),intel(3,'turn_left',null,null,'0.9 mi','Turn left onto Springdale Hill Rd. Continue 0.9 miles.'),intel(4,'turn_right',null,null,'0.2 mi','Turn right onto Lamborn Rd. Continue 0.2 miles.'),intel(5,'turn_left',null,null,'0.5 mi','Turn left onto Springdale Hill Rd. Continue 0.5 miles.'),intel(6,'turn_left',null,null,'0.3 mi','Turn left onto Unionvale-Kenwood Rd. Continue 0.3 miles; the pad is on the right.')]);
const cologie=[entry(1,'From Cadiz, take US-250 south.'),entry(2,'Turn left onto Foxes Bottom Rd. Continue 2.4 miles.'),entry(3,'Turn left onto Springdale Hill Rd. Continue 0.9 miles.'),entry(4,'Turn right onto Lamborn Rd. Continue 0.2 miles.'),entry(5,'Turn left onto Springdale Hill Rd. Continue 0.5 miles.'),entry(6,'Turn left onto Unionvale-Kenwood Rd. Continue 0.3 miles; the pad is on the right.')].map(row=>context.directionFinalMetaV17317(row,cologiePad));
const expectedMain=['Take US-250 South','Turn left on Foxes Bottom Rd','Turn left on Springdale Hill Rd','Turn right on Lamborn Rd','Turn left on Springdale Hill Rd','Turn left on Unionvale-Kenwood Rd'];
const expectedDistance=['','2.4 mi','0.9 mi','0.2 mi','0.5 mi','0.3 mi'];
if(JSON.stringify(cologie.map(x=>x.instruction))!==JSON.stringify(expectedMain)) throw new Error(`COLOGIE main mismatch: ${JSON.stringify(cologie)}`);
if(JSON.stringify(cologie.map(x=>x.distance))!==JSON.stringify(expectedDistance)) throw new Error(`COLOGIE mileage mismatch: ${JSON.stringify(cologie)}`);
if(!cologie[0].notes.some(n=>/Start: Cadiz/i.test(n))) throw new Error('COLOGIE start must be a note.');
if(!cologie[5].notes.some(n=>/Pad on right/i.test(n))) throw new Error('COLOGIE arrival side must be a note.');

const noellePad=pad([intel(2,'turn_left','CR-23','High St',null,'Turn left onto CR-23 / High St.'),intel(3,'turn_left','CR-26','Lincoln Ave',null,'Turn left onto CR-26.',{dual_name_source:'ODOT official road catalog'})]);
const noelle=context.directionFinalMetaV17317(entry(2,'Turn left onto CR-23 / High St.'),noellePad);if(noelle.instruction!=='Turn left on CR-23 / High St'||!noelle.doubleName)throw new Error(`Noelle double name failed: ${JSON.stringify(noelle)}`);
const catalog=context.directionFinalMetaV17317(entry(3,'Turn left onto CR-26.'),noellePad);if(catalog.instruction!=='Turn left on CR-26'||/Lincoln Ave/i.test(catalog.instruction))throw new Error(`Catalog-only alias leaked: ${JSON.stringify(catalog)}`);
const concurrency=context.directionFinalMetaV17317(entry(1,'Turn right onto OH-147 / OH-149.'),pad([]));if(concurrency.instruction!=='Turn right on OH-147 / OH-149'||concurrency.doubleName)throw new Error(`Concurrency failed: ${JSON.stringify(concurrency)}`);
const fraction=context.directionFinalMetaV17317(entry(1,'Turn right onto Deersville Road. Continue 1 1/2 miles.'),pad([]));if(fraction.instruction!=='Turn right on Deersville Road'||fraction.distance!=='1.5 mi')throw new Error(`Fraction mileage failed: ${JSON.stringify(fraction)}`);
const arrival=context.directionFinalMetaV17317(entry(1,'Pad will be on the right in 2.8 miles.'),pad([]));if(arrival.instruction!=='Pad on right'||arrival.distance!=='2.8 mi')throw new Error(`Arrival mileage failed: ${JSON.stringify(arrival)}`);
const dirtyVan=`Road sequence reference:\nWV-250 → CR-17 → Access Road → OR → Brushy Run → CR-17\n\nStep-by-step directions:\n1. Head south on WV-250.\n2. Turn right on CR-17.\n3. Turn left Well pad access road begins approximately 0.65 miles from Brushy Run/County Road 17 intersection.`;
const cleanedVan=context.directionKnownClearTextCleanupV17317(dirtyVan);if(!/CR-17 \/ Fork Ridge Rd/.test(cleanedVan)||!/Turn left on Brushy Run Rd\. Continue approximately 0\.65 miles/.test(cleanedVan))throw new Error('Van Aston known-source cleanup failed.');

console.log('Verified BrineSearch V17.3.17 final runtime stack: concise maneuver+road main lines, right-side saved mileage, notes underneath, inline same-road aliases, intersection-vs-double-name safety, corrected From-prefix actions, and no sign graphics.');
