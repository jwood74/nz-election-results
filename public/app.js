import { coalition, filterRaces, sourceTime, createChangeTracker, nationalSignature, electorateSignature, partyVoteComparison, seatChange } from './model.js';
import { $, int, pct, pp, changeClass, clock, saved, save, node, cell, message, get, markChange } from './ui.js';
const selected = saved('nz-coalition');
const watchlist = saved('nz-watchlist');
let national, races, busy = false, checked, failures = [];
let view = 'closest', sortKey = 'margin', direction = 1;
const trackNational = createChangeTracker(nationalSignature), trackRaces = createChangeTracker(electorateSignature);
let partyChanges = new Map(), raceChanges = new Map();
let history, historyFailed = false;
// Only known abbreviations are used as CSS classes, with a neutral fallback.
const partyColourClass = party => `party-${['NAT','LAB','GP','ACT','NZF','TPMAO','OPP'].includes(party.abbreviation) ? party.abbreviation : 'other'}`;

async function loadHistory() {
  try {
    // Load static history once per page, independently of live polling.
    const response = await fetch('/data/2023/national.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Historical baseline unavailable');
    const data = await response.json();
    if (data.schemaVersion !== 1 || data.year !== 2023 || !Array.isArray(data.parties) || !data.parties.length || !(data.totalValidVotes > 0)) throw new Error('Invalid historical baseline');
    history = data;
  } catch { historyFailed = true; }
  if (national) renderNational();
}

function renderNational() {
  $('counted').textContent = pct(national.percentPlacesCounted);
  $('counted-detail').textContent = `${int(national.placesCounted)} voting places reported`;
  $('votes').textContent = int(national.votes);
  $('seats').textContent = national.seats > 0 ? int(national.seats) : '—';
  $('national-time').textContent = `Source updated ${clock(national.updated)} NZ`;
  $('national-empty').hidden = national.votes > 0;
  $('national-changes').textContent = `${partyChanges.size} party rows changed since the previous successful refresh in this tab (votes or seats); the first load establishes a baseline.`;
  $('national-history').textContent = historyFailed ? '2023 baseline unavailable. Live results are unaffected.' : !history ? 'Loading the saved 2023 baseline…' :
    '2023 final party votes are compiled from the saved original CSVs and include special votes. Change shows the percentage-point difference in vote share, not relative percentage growth or a forecast; early live results may be unrepresentative. Unmapped parties show —.';
  if (history) {
    const link = node('a', ' Saved baseline and provenance ↗'); link.href = '/data/2023/national.json'; link.target = '_blank'; link.rel = 'noopener'; $('national-history').append(link);
  }
  $('seat-history').textContent = history?.seatComparison ? 'The seat-change column compares with the completed 2023 Parliament, including Port Waikato (National 49; Parliament 123). Green + is a gain, red − a loss; 0 means unchanged and — means unavailable or unmapped. These are not changes since the previous refresh.' : 'Seat changes require a saved 2023 seat baseline and a live allocation.';
  const validPartyVotes = national.parties.reduce((sum, party) => sum + party.votes, 0);
  $('party-rows').replaceChildren();
  for (const party of national.parties) {
    const tr = node('tr');
    const name = cell(tr, null, 'party-name');
    name.append(node('span', '', `party-dot ${partyColourClass(party)}`), document.createTextNode(party.name));
    cell(tr, int(party.votes), 'num'); cell(tr, national.votes > 0 ? pct(party.percent) : '—', 'num');
    const comparison = partyVoteComparison(party, validPartyVotes, history);
    const previous = cell(tr, pct(comparison.previousPercent), 'num');
    if (comparison.previousPercent == null && history) previous.title = history.unmappedCurrentParties?.[party.id] || 'No verified comparable 2023 baseline.';
    cell(tr, pp(comparison.change), `num ${changeClass(comparison.change)}`);
    for (const key of ['electorateSeats', 'listSeats', 'seats']) cell(tr, national.seats > 0 ? int(party[key]) : '—', 'num');
    const seats = seatChange(party, national.seats, history);
    const value = cell(tr, seats ? seats.change === 0 ? '0' : null : '—', 'num');
    if (seats) {
      const comparison = seats;
      const description = comparison.change === 0 ? `Unchanged from ${comparison.previous} seats in 2023` : `${comparison.change > 0 ? 'Up' : 'Down'} ${Math.abs(comparison.change)} seats from ${comparison.previous} in 2023`;
      value.title = `${description}, including the deferred Port Waikato result`;
      if (comparison.change === 0) value.append(node('span', ` (${description})`, 'sr-only'));
      else {
        const gain = comparison.change > 0;
        const badge = node('span', null, `seat-change ${gain ? 'seat-gain' : 'seat-loss'}`);
        const visible = node('span', `${gain ? '+' : '−'}${int(Math.abs(comparison.change))}`); visible.setAttribute('aria-hidden','true');
        badge.append(visible, node('span', ` (${description})`, 'sr-only')); value.append(badge);
      }
    }
    $('party-rows').append(tr);
  }
  // Preserve keyboard focus during automatic refreshes.
  if ($('coalition-options').dataset.ids !== national.parties.map(p => p.id).sort().join(',')) {
    $('coalition-options').replaceChildren();
    for (const party of [...national.parties].sort((a,b) => a.name.localeCompare(b.name))) {
      const label = node('label', null, `party-option ${partyColourClass(party)}`);
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = party.id; input.checked = selected.has(party.id);
      input.addEventListener('change', () => { input.checked ? selected.add(party.id) : selected.delete(party.id); save('nz-coalition', selected); renderCoalition(); });
      label.append(input, document.createTextNode(party.name)); $('coalition-options').append(label);
    }
    $('coalition-options').dataset.ids = national.parties.map(p => p.id).sort().join(',');
  }
  renderCoalition();
}
function renderCoalition() {
  const total = coalition(national.parties, selected, national.majority);
  $('coalition-seats').textContent = national.majority == null ? '—' : int(total.seats);
  $('coalition-status').textContent = national.majority == null ? 'Seat allocation not yet available.' :
    `${national.majority} needed for a majority · ${total.needed ? `${total.needed} seats short` : 'majority on current feed numbers'}`;
}

function renderRaces() {
  if (!races) return;
  const rows = filterRaces(races.electorates, { view, search: $('search').value, watchlist, sortKey, direction });
  $('race-count').textContent = `${rows.length} / ${races.electorates.length} electorates`;
  $('race-status').textContent = races.warnings.length ? `${races.warnings.length} electorate feeds unavailable: ${races.warnings.join(', ')}.` : 'Electorate feeds loaded. Each row shows its own source update time.';
  $('race-status').textContent += ` ${raceChanges.size} electorate rows changed since the previous successful refresh in this tab (candidate votes or counting progress).`;
  for (const button of document.querySelectorAll('[data-sort]')) button.parentElement.setAttribute('aria-sort', button.dataset.sort === sortKey ? (direction === 1 ? 'ascending' : 'descending') : 'none');
  if (!rows.length) { message($('race-rows'), view === 'closest' ? 'No matching races with votes reported yet. Try All electorates.' : view === 'watchlist' ? 'No matching watched electorates. Use the stars in All electorates to add some.' : 'No matching electorates.', 6); return; }
  $('race-rows').replaceChildren();
  for (const row of rows) {
    const tr = node('tr');
    const watch = node('button', watchlist.has(row.id) ? '★' : '☆', 'watch');
    watch.type = 'button'; watch.setAttribute('aria-label', `Watch ${row.name}`); watch.setAttribute('aria-pressed', String(watchlist.has(row.id)));
    watch.addEventListener('click', () => {
      watchlist.has(row.id) ? watchlist.delete(row.id) : watchlist.add(row.id); save('nz-watchlist', watchlist);
      if (view === 'watchlist') { renderRaces(); $('search').focus(); }
      else { watch.textContent = watchlist.has(row.id) ? '★' : '☆'; watch.setAttribute('aria-pressed', String(watchlist.has(row.id))); }
    });
    cell(tr).append(watch);
    const link = node('a', row.name); link.href = `/electorate.html?id=${encodeURIComponent(row.id)}`;
    const name = cell(tr, null, 'party-name'); name.append(link);
    markChange(tr, name, raceChanges.get(row.id), row, 'candidateVotes', 'candidate votes');
    const leader = cell(tr, row.unavailable ? 'Feed unavailable' : row.tied ? 'Tied for the lead' : row.leader?.name || 'Awaiting votes');
    if (row.leader) leader.append(node('span', row.leader.party, 'party-sub'));
    const margin = cell(tr, int(row.margin), 'num');
    if (row.marginPercent != null) margin.append(node('span', `${pct(row.marginPercent)} of candidate votes`, 'party-sub'));
    const counted = cell(tr, pct(row.percentPlacesCounted), 'num');
    if (!row.unavailable) counted.append(node('span', `${int(row.placesCounted)} / ${int(row.placesTotal)} places`, 'party-sub'));
    cell(tr, clock(row.updated), 'meta');
    $('race-rows').append(tr);
  }
}

function renderStatus() {
  const oldSource = national && Date.now() - sourceTime(national.updated) > 5 * 60_000;
  const oldFetch = national && Date.now() - Date.parse(national.fetchedAt) > 3 * 60_000;
  const parts = [];
  if (failures.length) parts.push(`${failures.join(' and ')} unavailable. Keeping any previously loaded results; retrying automatically.`);
  if (oldSource) parts.push('The national source timestamp is over 5 minutes old. The feed may be awaiting the count or delayed.');
  if (oldFetch) parts.push('The loaded national snapshot is over 3 minutes old.');
  if (checked) parts.push(`Last checked ${clock(checked)} NZ. Refreshes every 60 seconds.`);
  $('connection').textContent = parts.join(' ') || 'Connecting to the election feed…';
  $('connection').classList.toggle('error', failures.length > 0 || oldSource || oldFetch);
}
async function refresh() {
  if (busy) return;
  busy = true; $('refresh').disabled = true;
  failures = [];
  try {
    // National results should not wait for the slower, multi-electorate request.
    await Promise.all([
      (async () => {
        try { national = await get('national'); partyChanges = trackNational(national.parties); renderNational(); }
        catch { failures.push('National feed'); if (!national) message($('party-rows'), 'National feed unavailable. Retrying automatically.', 9); }
        renderStatus();
      })(),
      (async () => {
        try { races = await get('electorates'); raceChanges = trackRaces(races.electorates); renderRaces(); }
        catch { failures.push('Electorate feed'); if (!races) { message($('race-rows'), 'Electorate feeds unavailable. Retrying automatically.', 6); $('race-status').textContent = 'Unable to retrieve electorate feeds.'; } }
        renderStatus();
      })(),
    ]);
    checked = new Date().toISOString(); renderStatus();
  } finally {
    busy = false; $('refresh').disabled = false;
  }
}
$('refresh').addEventListener('click', refresh);
$('coalition-clear').addEventListener('click', () => {
  selected.clear();
  save('nz-coalition', selected);
  for (const input of $('coalition-options').querySelectorAll('input')) input.checked = false;
  if (national) renderCoalition();
});
$('search').addEventListener('input', renderRaces);
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  view = button.dataset.view;
  sortKey = view === 'closest' ? 'margin' : 'name'; direction = 1;
  for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button));
  renderRaces();
});
for (const button of document.querySelectorAll('[data-sort]')) button.addEventListener('click', () => {
  direction = sortKey === button.dataset.sort ? -direction : button.dataset.sort === 'updated' ? -1 : 1;
  sortKey = button.dataset.sort; renderRaces();
});
loadHistory();
refresh();
setInterval(refresh, 60_000);
setInterval(renderStatus, 30_000);
