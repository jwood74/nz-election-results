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
function createLoader(parse, accept, fetcher = fetch, now = Date.now) {
  const cache = new Map();
  const pending = new Map();
  return async function load(path, ttl = 55_000) {
    const cached = cache.get(path);
    if (cached && now() - cached.at < ttl) return cached.data;
    if (pending.has(path)) return pending.get(path);
    const promise = (async () => {
      const response = await fetcher(new URL(path, SOURCE), {
        signal: AbortSignal.timeout(8_000), headers: { Accept: accept },
      });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      const data = parse(await response.text());
      cache.set(path, { at: now(), data });
      return data;
    })();
    pending.set(path, promise);
    try { return await promise; } finally { pending.delete(path); }
  };
}

export const createXmlLoader = (fetcher, now) => createLoader(parseXml, 'application/xml', fetcher, now);
const createDirectoryLoader = () => createLoader(text => text, 'text/html');
export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function electorateId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d?$/.test(value)) throw new RequestError('A valid electorate id is required.');
  return value;
}
export const BOOTH_PAGE_SIZE = 40;

export function boothFiles(html, id) {
  const prefix = id.padStart(2, '0');
  const files = [...html.matchAll(/href=["'](\d{2}-\d{5}\.xml)["']/g)].map(match => match[1]);
  const result = [...new Set(files.filter(file => file.startsWith(`${prefix}-`)))].sort();
  if (!result.length) throw new Error('No booth result files found in source listing');
  return result;
}

export function normalizeParties(root, metadata) {
  if (!root?.party) throw new Error('Missing party results');
  const parties = list(root.party).map(item => {
    const party = metadata.parties.find(p => p.id === String(item.p_no));
    return { id: String(item.p_no), name: party?.name || `Party ${item.p_no}`, abbreviation: party?.abbreviation || String(item.p_no), votes: number(item.votes) };
  }).sort((a,b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const votes = parties.reduce((sum, p) => sum + p.votes, 0);
  return { parties, partyVotes: votes };
}

export function normalizeBooth(root, file, id, metadata, places) {
  const expected = `${id.padStart(2, '0')}-${String(root?.vp_e_no).padStart(2, '0')}${String(root?.vp_no).padStart(3, '0')}.xml`;
  if (!root?.updated || !root.statistics || String(root.e_no) !== id || expected !== file) throw new Error('Unexpected booth feed structure');
  const place = places.find(p => String(p.vp_id) === String(root.vp_id));
  if (!place || String(place.vp_e_no) !== String(root.vp_e_no)) throw new Error('Booth metadata mismatch');
  const summary = normalizeElectorate({ ...root, statistics: { total_voting_places: '0', total_voting_places_counted: '0', percent_voting_places_counted: '0' } }, { id }, metadata);
  const parties = normalizeParties(root.partyvotes, metadata);
  const issued = number(root.statistics.total_issued_ballot_papers);
  const candidateInformals = number(root.statistics.total_candidate_informals);
  const partyInformals = number(root.statistics.total_party_informals);
  return {
    file, id: String(root.vp_id), name: place.vp_address || `Voting place ${root.vp_id}`, hostElectorateId: String(root.vp_e_no),
    updated: root.updated, received: root.time_received || null,
    reported: Boolean(root.time_received || issued || summary.candidateVotes || parties.partyVotes || candidateInformals || partyInformals),
    candidates: summary.candidates, candidateVotes: summary.candidateVotes, ...parties,
    issued, candidateInformals, partyInformals,
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

export function createService(load = createXmlLoader(), directory = createDirectoryLoader()) {
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
  async function context(id) {
    electorateId(id);
    const meta = await metadata();
    const electorate = meta.electorates.find(e => e.id === id);
    if (!electorate) throw new RequestError('Electorate not found.', 404);
    return { meta, electorate, code: `e${id.padStart(2, '0')}` };
  }
  return {
    async electorate(id) {
      const { meta, electorate, code } = await context(id);
      const data = await load(`${code}/${code}.xml`);
      return { source: SOURCE, fetchedAt: new Date().toISOString(), ...normalizeElectorate(data.electorate, electorate, meta), ...normalizeParties(data.electorate.partyvotes, meta),
        candidateInformals: number(data.electorate.statistics.total_candidate_informals), partyInformals: number(data.electorate.statistics.total_party_informals) };
    },
    async booths(id, page = '0') {
      electorateId(id);
      if (!/^\d{1,3}$/.test(page)) throw new RequestError('A valid booth page is required.');
      const { meta, electorate, code } = await context(id);
      const [html, data] = await Promise.all([directory(`${code}/votingplaces/`, 300_000), load('votingplaces.xml', 3_600_000)]);
      if (!data.votingplaces?.votingplace) throw new Error('Missing voting place metadata');
      const files = boothFiles(html, id);
      const offset = Number(page) * BOOTH_PAGE_SIZE;
      if (offset >= files.length) throw new RequestError('Booth page not found.', 404);
      const warnings = [];
      const places = list(data.votingplaces.votingplace);
      const booths = await mapLimit(files.slice(offset, offset + BOOTH_PAGE_SIZE), 12, async file => {
        try {
          const data = await load(`${code}/votingplaces/${file}`);
          return normalizeBooth(data.votingplace, file, id, meta, places);
        } catch { warnings.push(file); return { file, name: file, unavailable: true }; }
      });
      if (warnings.length === booths.length) throw new Error('All booth feeds in this batch unavailable');
      return { source: SOURCE, fetchedAt: new Date().toISOString(), electorate, page: Number(page), pageCount: Math.ceil(files.length / BOOTH_PAGE_SIZE), total: files.length, booths, warnings };
    },
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
