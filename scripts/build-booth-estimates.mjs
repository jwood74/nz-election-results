import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { sha256 } from '../lib/history.mjs';
import { buildBoothEstimates } from '../lib/booth-estimates.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const [auditBytes, indexBytes, reviewBytes] = await Promise.all([
  read('data/booth-matching/report.json'), read('public/data/2023/index.json'), read('data/booth-matching/venue-label-reviews.json'),
]);
const audit = JSON.parse(auditBytes), index = JSON.parse(indexBytes), reviews = JSON.parse(reviewBytes);
if (reviews.scope !== 'venue-label-only-not-production-approval' || reviews.currentMetadataSha256 !== audit.sources.current.sha256 || reviews.historicalManifestSha256 !== audit.sources.historicalManifestSha256) throw new Error('Review source mismatch');
if (sha256(await read('data/booth-matching/source/current-votingplaces.xml')) !== audit.sources.current.sha256 || sha256(await read('data/2023/source/csv-manifest.json')) !== audit.sources.historicalManifestSha256) throw new Error('Audit source changed');
const electorates = await Promise.all(audit.sources.historicalDatasets.map(async source => {
  if (!/^public\/data\/2023\/electorates\/\d+\.json$/.test(source.path)) throw new Error('Unexpected historical path');
  const bytes = await read(source.path);
  if (sha256(bytes) !== source.sha256) throw new Error(`Historical source changed: ${source.path}`);
  return JSON.parse(bytes);
}));
if (electorates.length !== 72) throw new Error('Expected all 72 historical electorates');
const outputs = buildBoothEstimates(audit, electorates, index, reviews.matches);
const directory = new URL('public/data/2023/booth-estimates/', root);
if (!process.argv.includes('--check')) await mkdir(directory, { recursive: true });
for (const output of outputs) {
  output.sources = { auditSha256: sha256(auditBytes), boundaryIndexSha256: sha256(indexBytes), venueLabelReviewsSha256: sha256(reviewBytes) };
  const path = new URL(`${output.electorateId}.json`, directory), content = `${JSON.stringify(output, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error(`Outdated booth estimates: ${output.electorateId}`);
  } else await writeFile(path, content);
}
console.log(`${outputs.length} estimated electorate baselines ${process.argv.includes('--check') ? 'verified' : 'built'}; original 2023 results unchanged.`);
