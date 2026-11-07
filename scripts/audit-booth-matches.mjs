import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseXml, list } from '../lib/feed.mjs';
import { sha256 } from '../lib/history.mjs';
import { auditBoothMatches } from '../lib/booth-matching.mjs';

const root=new URL('../',import.meta.url), read=path=>readFile(new URL(path,root));
const bytes=await read('data/booth-matching/source/current-votingplaces.xml');
const provenance=JSON.parse(await read('data/booth-matching/source/provenance.json'));
if(sha256(bytes)!==provenance.sha256)throw new Error('Current metadata snapshot checksum differs from provenance');
const datasets=await Promise.all(Array.from({length:72},async(_,i)=>{
  const path=`public/data/2023/electorates/${i+1}.json`, bytes=await read(path);
  return {data:JSON.parse(bytes),source:{path,sha256:sha256(bytes)}};
}));
const electorates=datasets.map(item=>item.data);
const report=auditBoothMatches(list(parseXml(bytes.toString('utf8')).votingplaces.votingplace),electorates);
report.sources={current:provenance,historicalManifestSha256:sha256(await read('data/2023/source/csv-manifest.json')),historicalDatasets:datasets.map(item=>item.source)};
const names=new Map(list(parseXml((await read('data/2023/source/current-electorates.xml')).toString('utf8')).electorates.electorate).map(e=>[String(e.e_no),e.electorate_name]));
for(const row of report.hostElectorates)row.name=names.get(row.id)||row.id;
const s=report.summary;
const text=[
  '# Booth matching — first audit','',
  '**Candidate audit, not production validation. The separate `booths:build` pipeline derives explicitly labelled estimates from these candidates and documented label reviews.**','',
  'The current site checkpoint was already committed/pushed before starting this audit. This report uses one saved current metadata snapshot and the checked-in original-derived 2023 datasets.','',
  '| Status | Current physical polling places |','| --- | ---: |',
  ...['exact-label-candidate','ambiguous-exact-label','current-split-or-duplicate','possible-label-candidates','unmatched','mobile-or-pooled-excluded'].map(key=>`| ${key} | ${s[key]} |`),
  `| **Total** | **${s.currentPlaces}** |`,'',
  `Historical venue groups: ${s.historicalVenueGroups}. Approved/reconstruction-ready matches: **0**. These are place counts, **not** vote-weighted coverage or coverage of each current electorate's result files.`,
  '', '## Interpretation','',...report.limitations.map(line=>`- ${line}`),'',
  '## By current booth-host electorate','',
  '| Host electorate | Places | Unique exact-label candidates | Other review/unmatched | Mobile excluded |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...report.hostElectorates.map(e=>`| ${e.name} | ${e.places} | ${e.exactLabelCandidates} | ${e.needsReview} | ${e.mobileExcluded} |`),'',
  '## Next steps','',
  '1. Review a sample of exact-label candidates and then the ambiguous/duplicate and token-similarity suggestions in `report.json`.',
  '2. Verify current count coverage (advance, election day, or combined) before choosing or combining any historic categories.',
  '3. Distinguish historic votes belonging to different electorates at the same venue, and confirm how voter populations moved across the new boundaries.',
  '4. Record reviewed one-to-one / split / merged mappings with source evidence and prevent reusing historical records.',
  '5. Prototype explicitly labelled estimated baselines with unmatched coverage and methodology visible; validate against the 19 unchanged electorates first.','',
  'To reproduce offline: `npm run booths:audit`. To obtain the initial metadata snapshot: `npm run booths:capture` (one normal XML request; existing snapshots are preserved).','',
].join('\n');
await mkdir(new URL('data/booth-matching/',root),{recursive:true});
await writeFile(new URL('data/booth-matching/report.json',root),`${JSON.stringify(report,null,2)}\n`);
await writeFile(new URL('data/booth-matching/REPORT.md',root),text);
console.log(JSON.stringify(s,null,2));
