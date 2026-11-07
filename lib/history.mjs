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

export function applySeatBaseline(national, baseline) {
  if (baseline?.year !== 2023 || baseline.coverage !== 'completed-2023-parliament-including-port-waikato' || !baseline.source?.url || !baseline.label || !Number.isSafeInteger(baseline.totalSeats) || baseline.totalSeats <= 0 || !Array.isArray(baseline.parties) || !baseline.parties.length) throw new Error('Invalid seat baseline');
  const names = new Set(); let total = 0;
  for (const party of baseline.parties) {
    if (!national.allParties.some(p=>p.name===party.name) || names.has(party.name) || !Number.isSafeInteger(party.seats) || party.seats < 0) throw new Error('Invalid or duplicate seat-baseline party');
    names.add(party.name); total += party.seats;
  }
  if (total !== baseline.totalSeats) throw new Error('Historical seats do not reconcile');
  return { ...national,
    seatComparison: { year: baseline.year, coverage: baseline.coverage, label: baseline.label, totalSeats: baseline.totalSeats, source: baseline.source },
    parties: national.parties.map(party => ({ ...party, seats2023: baseline.parties.find(p=>p.name===party.name2023)?.seats ?? 0 })),
  };
}

export function historicalDownloads({ includeSummary = false } = {}) {
  return [
    ...(includeSummary ? [{ filename: 'overall-results-summary.csv', url: `${ARCHIVE}statistics/csv/overall-results-summary.csv` }] : []),
    ...['party','candidate'].flatMap(contest => Array.from({ length: 72 }, (_,i) => ({ filename: `${contest}-votes-by-voting-place-${i+1}.csv`, url: `${ARCHIVE}statistics/csv/${contest}-votes-by-voting-place-${i+1}.csv` }))),
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
