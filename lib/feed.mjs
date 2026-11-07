import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const SOURCE = 'https://media.election.net.nz/xml/';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false });
export const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const number = value => {
  const result = Number(value);
  if (value == null || value === '' || !Number.isFinite(result) || result < 0) throw new Error('Missing or invalid numeric field');
  return result;
};

export function parseXml(xml) {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid upstream XML');
  return parser.parse(xml);
}

// Warm-instance cache is opportunistic; the Netlify CDN shares successful responses.
export function createXmlLoader(fetcher = fetch, now = Date.now) {
  const cache = new Map();
  const pending = new Map();
  return async function load(path, ttl = 55_000) {
    const cached = cache.get(path);
    if (cached && now() - cached.at < ttl) return cached.data;
    if (pending.has(path)) return pending.get(path);
    const promise = (async () => {
      const response = await fetcher(new URL(path, SOURCE), {
        signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/xml' },
      });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      const data = parseXml(await response.text());
      cache.set(path, { at: now(), data });
      return data;
    })();
    pending.set(path, promise);
    try { return await promise; } finally { pending.delete(path); }
  };
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

export function normalizeNational(root, metadata) {
  if (!root?.statistics || !root.partystatus || !root.updated) throw new Error('Unexpected national feed structure');
  const parties = list(root.partystatus.party).map(party => {
    const details = metadata.parties.find(item => item.id === String(party.p_no));
    return {
      id: String(party.p_no), name: details?.name || `Party ${party.p_no}`,
      abbreviation: details?.abbreviation || String(party.p_no),
      votes: number(party.votes), percent: number(party.percent_votes),
      listSeats: number(party.party_seats), electorateSeats: number(party.candidate_seats), seats: number(party.total_seats),
    };
  }).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const seats = parties.reduce((total, party) => total + party.seats, 0);
  return {
    source: SOURCE, updated: root.updated, fetchedAt: new Date().toISOString(),
    votes: number(root.statistics.total_votes_cast),
    placesCounted: number(root.statistics.total_voting_places_counted),
    percentPlacesCounted: number(root.statistics.percent_voting_places_counted),
    seats, majority: seats > 0 ? Math.floor(Math.max(120, seats) / 2) + 1 : null, parties,
  };
}

export function normalizeElectorate(root, electorate, metadata) {
  if (!root?.statistics || !root.candidatevotes || !root.updated || String(root.e_no) !== electorate.id) throw new Error('Unexpected electorate feed structure');
  const candidates = list(root.candidatevotes.candidate).map(item => {
    const candidate = metadata.candidates.find(c => c.id === String(item.c_no));
    const party = metadata.parties.find(p => p.id === candidate?.partyId);
    return { id: String(item.c_no), name: candidate?.name || `Candidate ${item.c_no}`, party: party?.name || 'Independent', partyId: candidate?.partyId || null, votes: number(item.votes) };
  }).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const votes = candidates.reduce((sum, c) => sum + c.votes, 0);
  const tied = votes > 0 && candidates.length > 1 && candidates[0].votes === candidates[1].votes;
  return {
    ...electorate, updated: root.updated, candidates, candidateVotes: votes,
    leader: votes > 0 && !tied ? candidates[0] : null, tied,
    margin: votes > 0 && candidates.length > 1 ? candidates[0].votes - candidates[1].votes : null,
    marginPercent: votes > 0 && candidates.length > 1 ? (candidates[0].votes - candidates[1].votes) / votes * 100 : null,
    placesCounted: number(root.statistics.total_voting_places_counted),
    placesTotal: number(root.statistics.total_voting_places),
    percentPlacesCounted: number(root.statistics.percent_voting_places_counted),
    // Do not interpret the source's final flag as an election call.
  };
}

export function createService(load = createXmlLoader()) {
  async function metadata() {
    const [parties, candidates, electorates] = await Promise.all([
      load('parties.xml', 3_600_000), load('candidates.xml', 3_600_000), load('electorates.xml', 3_600_000),
    ]);
    if (!parties.parties?.party || !candidates.candidates?.candidate || !electorates.electorates?.electorate) throw new Error('Unexpected metadata structure');
    return {
      parties: list(parties.parties.party).map(p => ({ id: String(p.p_no), name: p.short_name, abbreviation: p.abbrev })),
      candidates: list(candidates.candidates.candidate).map(c => ({ id: String(c.c_no), name: c.candidate_name, partyId: String(c.party) })),
      electorates: list(electorates.electorates.electorate).map(e => ({ id: String(e.e_no), name: e.electorate_name })),
    };
  }
  return {
    async national() {
      const [data, meta] = await Promise.all([load('election.xml'), metadata()]);
      return normalizeNational(data.election, meta);
    },
    async electorates() {
      const meta = await metadata();
      const warnings = [];
      const rows = await mapLimit(meta.electorates, 12, async electorate => {
        const code = `e${electorate.id.padStart(2, '0')}`;
        try {
          const data = await load(`${code}/${code}.xml`);
          return normalizeElectorate(data.electorate, electorate, meta);
        } catch {
          warnings.push(electorate.name);
          return { ...electorate, unavailable: true };
        }
      });
      if (warnings.length === rows.length) throw new Error('All electorate feeds unavailable');
      return { source: SOURCE, fetchedAt: new Date().toISOString(), electorates: rows, warnings };
    },
  };
}
