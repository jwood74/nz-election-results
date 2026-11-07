export function coalition(parties, selected, majority) {
  const seats = parties.filter(p => selected.has(p.id)).reduce((sum, p) => sum + p.seats, 0);
  return { seats, needed: majority == null ? null : Math.max(0, majority - seats) };
}

export function filterRaces(rows, { view, search, watchlist, sortKey, direction }) {
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return rows.filter(row => (view !== 'closest' || row.margin != null) &&
    (view !== 'watchlist' || watchlist.has(row.id)) && fold(row.name).includes(fold(search.trim())))
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * direction || a.name.localeCompare(b.name);
    });
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
