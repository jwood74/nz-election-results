import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const ARCHIVE = 'https://archive.electionresults.govt.nz/electionresults_2023/';

export function buildNationalHistory(source, mappings, hashes) {
  if (source.year !== 2023 || source.contest !== 'party' || source.coverage !== 'official-final-including-special-votes' || !source.source?.url || !source.source.method) throw new Error('Unexpected historical source or coverage');
  const total = source.totalValidVotes;
  if (!Number.isSafeInteger(total) || total <= 0 || !Array.isArray(source.parties) || !source.parties.length) throw new Error('Missing historical total');
  const names = new Set();
  let sum = 0;
  for (const party of source.parties) {
    if (typeof party.name !== 'string' || !party.name.trim() || names.has(party.name) || !Number.isSafeInteger(party.votes) || party.votes < 0) throw new Error('Invalid or duplicate historical party');
    names.add(party.name); sum += party.votes;
  }
  if (sum !== total) throw new Error(`Historical party votes do not reconcile: ${sum} != ${total}`);
  const used = new Set();
  const parties = Object.entries(mappings.partyMappings).map(([currentId, mapping]) => {
    const party = source.parties.find(p => p.name === mapping.name2023);
    if (!/^\d+$/.test(currentId) || !party || !mapping.basis || used.has(party.name)) throw new Error('Invalid or ambiguous historical party mapping');
    used.add(party.name);
    return { currentId, name2023: party.name, votes: party.votes, percent: party.votes / total * 100, mappingBasis: mapping.basis };
  });
  return { schemaVersion: 1, year: 2023, contest: 'party', coverage: source.coverage, source: source.source, hashes,
    totalValidVotes: total, allParties: source.parties, parties, unmappedCurrentParties: mappings.unmappedCurrentParties,
    localComparisonStatus: mappings.localComparisonStatus };
}

export function historicalDownloads() {
  return [
    { filename: 'overall-results-summary.csv', url: `${ARCHIVE}statistics/csv/overall-results-summary.csv` },
    ...Array.from({ length: 72 }, (_,i) => ({ filename: `party-votes-by-voting-place-${i+1}.csv`, url: `${ARCHIVE}statistics/csv/party-votes-by-voting-place-${i+1}.csv` })),
  ];
}

export async function fetchHistoricalCsv(url, fetcher = fetch) {
  const response = await fetcher(url, { headers: { Accept: 'text/csv' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}. Download this CSV manually in your browser if permitted: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateHistoricalCsv(bytes);
  return bytes;
}

export function validateHistoricalCsv(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!doctype|<html|<script/i.test(text) || !/party/i.test(text) || !text.includes(',') || !text.includes('\n')) throw new Error('Source did not return a recognised CSV; refusing to save it');
}
