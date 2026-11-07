import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { sha256 } from '../lib/history.mjs';
import { compileCsvHistory } from '../lib/import-history.mjs';
import { parseXml, list } from '../lib/feed.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const [mappingBytes, reviewBytes, currentBytes, seatBytes] = await Promise.all([
  read('data/2023/mappings.json'), read('data/2023/source/boundary-review.json'), read('data/2023/source/current-electorates.xml'), read('data/2023/source/seat-baseline.json'),
]);
const files = new Map();
for (let i=1; i<=72; i++) for (const contest of ['party','candidate']) {
  const filename = `${contest}-votes-by-voting-place-${i}.csv`;
  files.set(filename, await read(`data/2023/raw/${filename}`));
}
const current = list(parseXml(currentBytes.toString('utf8')).electorates.electorate).map(e => ({ id: String(e.e_no), name: e.electorate_name }));
const { national, index, historical, manifestText } = compileCsvHistory(files, JSON.parse(mappingBytes), current, JSON.parse(reviewBytes), {
  mappingsSha256: sha256(mappingBytes), boundaryReviewSha256: sha256(reviewBytes), currentElectoratesSha256: sha256(currentBytes), seatBaselineSha256: sha256(seatBytes),
}, JSON.parse(seatBytes));
const outputs = new Map([
  ['data/2023/source/csv-manifest.json', manifestText],
  ['public/data/2023/national.json', `${JSON.stringify(national, null, 2)}\n`],
  ['public/data/2023/index.json', `${JSON.stringify(index, null, 2)}\n`],
  ...historical.map(e => [`public/data/2023/electorates/${e.id}.json`, `${JSON.stringify(e)}\n`]),
]);
for (const [path, text] of outputs) {
  const target = new URL(path, root);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== text) throw new Error(`Historical output out of date: ${path}. Run npm run history:build.`);
  } else {
    await mkdir(new URL('.', target), { recursive:true }); await writeFile(target, text);
  }
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Built'} 144 original CSVs, 72 historical electorates, ${national.totalValidVotes} valid party votes, ${Object.values(index.currentElectorates).filter(e=>e.canCompare).length} unchanged-boundary comparisons.`);
