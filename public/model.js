export function coalition(parties, selected, majority) {
  const seats = parties.filter(p => selected.has(p.id)).reduce((sum, p) => sum + p.seats, 0);
  return { seats, needed: majority == null ? null : Math.max(0, majority - seats) };
}

export function filterRaces(rows, { view, search, watchlist, sortKey, direction }) {
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return rows.filter(row => (view !== 'closest' || row.margin != null) &&
    (view !== 'watchlist' || watchlist.has(row.id)) && fold(row.name).includes(fold(search.trim())))
    .sort((a, b) => {
      const value = row => sortKey === 'updated' ? validSourceTime(row.updated) : row[sortKey];
      const av = value(a), bv = value(b);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * direction || a.name.localeCompare(b.name);
    });
}

const validSourceTime = value => {
  const time = sourceTime(value);
  return Number.isFinite(time) ? time : null;
};

export const voteSignature = items => (items || []).map(item => [item.id, item.votes]).sort((a,b) => a[0].localeCompare(b[0]));
export const nationalSignature = row => [row.votes, row.seats, row.listSeats, row.electorateSeats];
export const electorateSignature = row => [voteSignature(row.candidates), row.placesCounted, row.placesTotal, row.percentPlacesCounted];
export const boothSignature = row => [voteSignature(row.candidates), voteSignature(row.parties), row.reported, row.issued, row.candidateInformals, row.partyInformals];

// Baselines survive failed/missing rows. New rows establish a baseline, never a change.
// Keep only one last-good snapshot per row, not a growing count history.
export function createChangeTracker(signature, key = 'id') {
  const baseline = new Map();
  return rows => {
    const changes = new Map();
    for (const row of rows) {
      if (row.unavailable || row.stale) continue;
      const previous = baseline.get(row[key]);
      const value = JSON.stringify(signature(row));
      if (previous && previous.value !== value) changes.set(row[key], previous.row);
      baseline.set(row[key], { row, value });
    }
    return changes;
  };
}

// XML timestamps omit an offset. Interpret them in Auckland, not the viewer's timezone.
export function sourceTime(value) {
  if (!value) return NaN;
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return Date.parse(value);
  const utc = Date.parse(`${value}Z`);
  if (!Number.isFinite(utc)) return NaN;
  const formatter = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' });
  const zone = formatter.formatToParts(new Date(utc)).find(p => p.type === 'timeZoneName').value;
  return Date.parse(`${value}${zone.replace('GMT', '') || '+00:00'}`);
}

export function voteShare(votes, total) { return total > 0 && votes != null ? votes / total * 100 : null; }

export function boothValue(booth, key, voteType, metric) {
  if (key === 'name') return booth.name;
  if (booth.unavailable) return null;
  if (key === 'reported') return Number(booth.reported);
  if (key === 'updated') return validSourceTime(booth.updated);
  const total = voteType === 'candidates' ? booth.candidateVotes : booth.partyVotes;
  if (key === 'total') return total;
  const votes = booth[voteType]?.find(item => item.id === key)?.votes;
  return metric === 'percent' ? voteShare(votes, total) : votes ?? null;
}

export function filterBooths(rows, { search, status, sortKey, direction, voteType, metric }) {
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return rows.filter(row => fold(row.name).includes(fold(search.trim())) &&
    (status === 'all' || (status === 'reported' ? row.reported : !row.reported && !row.unavailable)))
    .sort((a,b) => {
      const av = boothValue(a, sortKey, voteType, metric), bv = boothValue(b, sortKey, voteType, metric);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av-bv) * direction || a.name.localeCompare(b.name);
    });
}
