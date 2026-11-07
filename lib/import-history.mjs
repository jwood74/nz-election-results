import { parse } from 'csv-parse/sync';
import { ARCHIVE, buildNationalHistory, applySeatBaseline, sha256, validateHistoricalCsv } from './history.mjs';

const count = value => {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`Invalid vote count: ${value}`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Vote count exceeds safe integer range');
  return result;
};
const pooledCategory = label => {
  if (label.startsWith('Overseas Special Votes for Party Only - ')) return 'overseas-party-only';
  if (label.startsWith('Overseas Special Votes Including Defence Force - ')) return 'overseas-special';
  if (label.startsWith('Special Votes BEFORE Polling Day - ')) return 'special-before';
  if (label.startsWith('Special Votes ON Polling Day - ')) return 'special-on';
  if (label.startsWith('Votes Allowed for Party Only - ')) return 'party-only-unspecified';
  if (label === 'Voting places where less than 6 votes were taken') return 'suppressed-ordinary';
  return null;
};
const emptyTotals = length => ({ votes: Array(length).fill(0), validVotes: 0, informalVotes: 0 });
function addTotals(total, row) {
  row.votes.forEach((votes, i) => { total.votes[i] += votes; });
  total.validVotes += row.validVotes; total.informalVotes += row.informalVotes;
}

export function parseVotingPlaceCsv(bytes, expectedId, contest) {
  validateHistoricalCsv(bytes);
  const records = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { bom: true, trim: true, skip_empty_lines: true, relax_column_count: true });
  const title = records[1]?.[0]?.match(/^(.+?) (\d+)(?:\s*\(Poll Cancelled\))?$/u);
  const type = contest === 'party' ? 'Party' : 'Candidate';
  if (!title || title[2] !== expectedId || records[1][1] !== `${type} Vote Details`) throw new Error(`CSV title/id/contest mismatch for ${contest} ${expectedId}`);
  const name = title[1], header = records[2];
  if (!header || header[0] !== '' || header[1] !== '' || header.at(-2) !== `Total Valid ${type} Votes` || header.at(-1) !== `Informal ${type} Votes`) throw new Error('Unexpected CSV columns');
  const choices = header.slice(2, -2).map(name => ({ name }));
  if (!choices.length || choices.some(c => !c.name) || new Set(choices.map(c => c.name)).size !== choices.length) throw new Error('Missing or duplicate choices');
  const rows = [], categories = {}, footers = new Map();
  let section, hostElectorateName = null, locality = '', totals, combinedTotal, footer = false;
  for (let index = 3; index < records.length; index++) {
    const row = records[index];
    if (row.every(value => value === '')) continue;
    if (row[0] === `Electorate ${type} Valid Votes`) { footer = true; continue; }
    if (footer) {
      const choice = choices.find(c => c.name === row[0]);
      if (!choice || footers.has(choice.name)) throw new Error('Unexpected or duplicate CSV footer choice');
      footers.set(choice.name, count(row[contest === 'party' ? 1 : 2]));
      if (contest === 'candidate') {
        if (!row[1]) throw new Error('Missing candidate party affiliation');
        choice.party = row[1];
      }
      continue;
    }
    if (row.length === 1) {
      if (row[0] === 'Advance Voting Places' || row[0] === 'Voting Places') {
        section = row[0] === 'Advance Voting Places' ? 'advance' : 'election-day';
        hostElectorateName = null;
      } else {
        if (!section || totals) throw new Error('Unexpected CSV subheading');
        // Māori CSVs group venues under their host general-electorate names.
        hostElectorateName = row[0];
      }
      locality = ''; continue;
    }
    if (row[1] === `Valid ${type} Votes plus Informal ${type} Votes`) {
      if (combinedTotal != null) throw new Error('Duplicate combined total');
      combinedTotal = count(row[3]); continue;
    }
    if (row.length !== header.length || !row[1] || totals) throw new Error('Unexpected CSV data row or duplicate total');
    const votes = row.slice(2, -2).map(count), validVotes = count(row.at(-2)), informalVotes = count(row.at(-1));
    if (votes.reduce((a,b) => a+b, 0) !== validVotes) throw new Error(`Choice counts do not reconcile in ${name}, record ${index+1}`);
    const result = { votes, validVotes, informalVotes };
    if (row[1] === `${name} Total`) { totals = result; continue; }
    const pooled = pooledCategory(row[1]);
    if (!pooled && (!section || !row[0] && /Special Votes|Party Only|less than 6/.test(row[1]))) throw new Error('Unknown vote category');
    if (row[0]) locality = row[0];
    const category = pooled || section;
    const item = { key: `${expectedId}:${contest}:${index+1}`, category, locality: pooled ? null : locality, venue: row[1], hostElectorateName: pooled ? null : hostElectorateName, ...result };
    rows.push(item);
    categories[category] ||= emptyTotals(choices.length);
    addTotals(categories[category], item);
  }
  if (!totals || !footer || footers.size !== choices.length || combinedTotal !== totals.validVotes + totals.informalVotes) throw new Error('Missing or inconsistent CSV totals/footer');
  choices.forEach((c,i) => { if (footers.get(c.name) !== totals.votes[i]) throw new Error('CSV footer votes disagree with totals'); });
  const sum = emptyTotals(choices.length);
  rows.forEach(row => addTotals(sum, row));
  if (JSON.stringify(sum) !== JSON.stringify(totals)) throw new Error(`Booth/category counts do not reconcile with ${name} totals`);
  return { id: expectedId, name, contest, pollCancelled: records[1][0].includes('(Poll Cancelled)'), choices, rows, categories, totals };
}

export function buildCurrentElectorateMappings(current, historical, review) {
  if (!current.length || current.some(e => !/^[1-9]\d?$/.test(e.id) || !e.name) || new Set(current.map(e=>e.id)).size !== current.length || new Set(current.map(e=>e.name)).size !== current.length) throw new Error('Invalid current electorate metadata');
  const unchanged = new Set(review.unchangedCurrentNames);
  if (unchanged.size !== review.unchangedCurrentNames.length || [...unchanged].some(name => !current.some(e => e.name === name))) throw new Error('Invalid unchanged-boundary list');
  return Object.fromEntries(current.map(electorate => {
    const names = review.related2023NamesForRenamedSeats[electorate.name] || [electorate.name];
    const related = names.map(name => {
      const old = historical.find(e => e.name === name);
      if (!old) throw new Error(`Unknown historical electorate ${name}`);
      return { id: old.id, name: old.name, path: `/data/2023/electorates/${old.id}.json` };
    });
    const canCompare = unchanged.has(electorate.name) && related.length === 1;
    return [electorate.id, { ...electorate, canCompare, boundaryStatus: canCompare ? 'unchanged' : 'changed-or-reconfigured', related2023: related }];
  }));
}

export function compileCsvHistory(files, mappings, current, review, hashes, seatBaseline) {
  const historical = [], manifest = [];
  for (let i = 1; i <= 72; i++) {
    const pair = {}, sources = {};
    for (const contest of ['party','candidate']) {
      const filename = `${contest}-votes-by-voting-place-${i}.csv`, bytes = files.get(filename);
      if (!bytes) throw new Error(`Missing original: ${filename}`);
      pair[contest] = parseVotingPlaceCsv(bytes, String(i), contest);
      const entry = { filename, url: `${ARCHIVE}statistics/csv/${filename}`, bytes: bytes.length, sha256: sha256(bytes), method: 'user-provided-original-csv' };
      manifest.push(entry); sources[contest] = entry;
    }
    if (pair.party.name !== pair.candidate.name) throw new Error('Party/candidate electorate mismatch');
    historical.push({ schemaVersion: 1, year: 2023, id: String(i), name: pair.party.name, sources, party: pair.party, candidate: pair.candidate });
  }
  if (new Set(historical.map(e => e.name)).size !== 72) throw new Error('Duplicate historical electorate names');
  const votes = new Map(); let totalValidVotes = 0;
  for (const { party } of historical) {
    totalValidVotes += party.totals.validVotes;
    party.choices.forEach((choice,i) => votes.set(choice.name, (votes.get(choice.name) || 0) + party.totals.votes[i]));
  }
  const source = { year: 2023, contest: 'party', coverage: 'official-final-including-special-votes', totalValidVotes,
    source: { url: `${ARCHIVE}statistics/votes-by-voting-place-electorate-index.html`, title: '2023 official party votes aggregated across all 72 electorate CSVs', method: 'aggregate-of-user-downloaded-official-csvs', note: 'Exact integer totals from the party CSVs, including separately preserved special-vote categories. Original files, checksums and URLs are in the saved source manifest; no search-index transcription is used.' },
    parties: [...votes].map(([name,votes]) => ({ name, votes })).sort((a,b) => b.votes - a.votes || a.name.localeCompare(b.name)) };
  const manifestText = `${JSON.stringify({ schemaVersion: 1, files: manifest }, null, 2)}\n`;
  let national = buildNationalHistory(source, mappings, { ...hashes, sourceSha256: sha256(manifestText) });
  if (seatBaseline) national = applySeatBaseline(national, seatBaseline);
  national.categoryTotals = {};
  for (const { party } of historical) for (const [category,total] of Object.entries(party.categories)) {
    national.categoryTotals[category] ||= { validVotes: 0, informalVotes: 0 };
    national.categoryTotals[category].validVotes += total.validVotes;
    national.categoryTotals[category].informalVotes += total.informalVotes;
  }
  const index = { schemaVersion: 1, year: 2023, source: source.source, boundarySource: review.source, hashes: national.hashes,
    currentElectoratesSource: 'https://media.election.net.nz/xml/electorates.xml',
    partyMappings: national.parties.map(({currentId,name2023}) => ({currentId,name2023})),
    currentElectorates: buildCurrentElectorateMappings(current, historical, review),
    boothComparisonStatus: review.boothComparisonStatus,
    electorates: historical.map(e => ({ id:e.id, name:e.name, path:`/data/2023/electorates/${e.id}.json` })) };
  return { national, index, historical, manifestText };
}
