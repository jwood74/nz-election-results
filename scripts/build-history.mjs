import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildNationalHistory, sha256 } from '../lib/history.mjs';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('data/2023/source/national-indexed-table.json', root));
const mappings = await readFile(new URL('data/2023/mappings.json', root));
const result = buildNationalHistory(JSON.parse(source), JSON.parse(mappings), { sourceSha256: sha256(source), mappingsSha256: sha256(mappings) });
const output = `${JSON.stringify(result, null, 2)}\n`;
const target = new URL('public/data/2023/national.json', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Historical JSON is out of date. Run npm run history:build.');
  console.log('Historical JSON matches the checked-in source and mappings.');
} else {
  await mkdir(new URL('public/data/2023/', root), { recursive: true });
  await writeFile(target, output);
  console.log(`Built national 2023 baseline: ${result.allParties.length} historical parties, ${result.parties.length} mapped current parties, ${result.totalValidVotes} valid votes.`);
}
