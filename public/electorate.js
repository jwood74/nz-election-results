import { sourceTime, voteShare, boothValue, filterBooths, createChangeTracker, boothSignature, partyTintClass, electoratePartyHistory, partyVoteComparison } from './model.js';
import { $, int, pct, pp, clock, saved, save, node, cell, message, get, markChange } from './ui.js';

const id = new URLSearchParams(location.search).get('id');
const watchlist = saved('nz-watchlist');
let detail, detailBusy = false, boothBusy = false, detailError = false, checked;
let voteType = 'candidates', metric = 'votes', sortKey = 'name', direction = 1;
let booths = new Map(), total = 0, failedBatches = 0, completedBatches = 0, pageCount = 0, selectedFile;
const trackCandidates = createChangeTracker(row => row.votes), trackParties = createChangeTracker(row => row.votes);
const trackBooths = createChangeTracker(boothSignature, 'file');
let candidateChanges = new Map(), partyChanges = new Map(), boothChanges = new Map(), progressChanged = false;
let historicalBaseline, historicalMapping, historyLoaded = false, historyFailed = false;

async function staticJson(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Historical data unavailable');
  return response.json();
}
async function loadHistory() {
  try {
    const index = await staticJson('/data/2023/index.json');
    if (index.schemaVersion !== 1 || index.year !== 2023 || !Array.isArray(index.partyMappings)) throw new Error('Invalid historical index');
    historicalMapping = index.currentElectorates?.[id];
    if (historicalMapping?.canCompare) {
      const related = historicalMapping.related2023;
      if (related.length !== 1 || !/^\d+$/.test(related[0].id)) throw new Error('Ambiguous historical electorate mapping');
      const data = await staticJson(`/data/2023/electorates/${related[0].id}.json`);
      if (data.id !== related[0].id || data.year !== 2023 || data.name !== related[0].name) throw new Error('Historical electorate mismatch');
      historicalBaseline = electoratePartyHistory(data, index.partyMappings);
      if (!historicalBaseline) throw new Error('Invalid historical party results');
    }
    historyLoaded = true;
  } catch { historyFailed = true; }
  renderHistoryNote();
  if (detail) renderDetail();
}
function renderHistoryNote() {
  const note = $('history-note');
  if (historyFailed) note.textContent = '2023 comparison unavailable. Live results are unaffected.';
  else if (!historyLoaded) note.textContent = 'Loading the saved 2023 reference and boundary mapping…';
  else if (!historicalMapping) note.textContent = 'No reviewed 2023 electorate mapping is available. No electorate-wide change is shown.';
  else if (!historicalMapping.canCompare) note.textContent = `Boundaries changed or reconfigured. Related 2023 electorate(s): ${historicalMapping.related2023.map(e=>e.name).join(', ')}. These are not equivalent populations; electorate-wide change is deliberately not shown.`;
  else note.textContent = `2023 reference: ${historicalMapping.related2023[0].name}. Boundaries unchanged in the 2025 review. Party-vote change is in percentage points vs final 2023 results including special votes, not a forecast or a matched-count estimate. Unmapped parties show —.`;
  if (historyLoaded && historicalMapping) {
    const link = node('a', ' Mapping and source notes ↗'); link.href = '/data/2023/index.json'; link.target = '_blank'; link.rel = 'noopener'; note.append(link);
  }
  note.classList.toggle('stale', Boolean(historyFailed || historyLoaded && !historicalMapping?.canCompare));
}

function renderWatch() {
  $('watch').textContent = watchlist.has(id) ? '★ Watching electorate' : '☆ Watch electorate';
  $('watch').setAttribute('aria-pressed', String(watchlist.has(id)));
}
function summary(body, items, votes, changes = new Map()) {
  body.replaceChildren();
  for (const item of items) {
    const tr = node('tr', null, partyTintClass(item.party ? item.partyId : item.id));
    const name = cell(tr, item.name, 'party-name');
    if (item.party) name.append(node('span', item.party, 'party-sub'));
    markChange(tr, name, changes.get(item.id), item);
    cell(tr, int(item.votes), 'num'); cell(tr, pct(voteShare(item.votes, votes)), 'num');
    if (body.id === 'electorate-party-rows') {
      const comparison = partyVoteComparison(item, votes, historicalBaseline);
      cell(tr, pct(comparison.previousPercent), 'num'); cell(tr, pp(comparison.change), 'num');
    }
    body.append(tr);
  }
}
function renderDetail() {
  document.title = `${detail.name} — NZ election night`;
  $('electorate-name').textContent = detail.name;
  $('watch').disabled = false; renderWatch();
  $('electorate-lead').textContent = detail.tied ? 'Tied for the lead on current candidate votes.' : detail.leader ? `${detail.leader.name} (${detail.leader.party}) leads by ${int(detail.margin)} votes. Not a declaration.` : 'No candidate votes reported yet.';
  $('source-time').textContent = `Source updated ${clock(detail.updated)} NZ`;
  $('counted').textContent = pct(detail.percentPlacesCounted);
  $('counted-detail').textContent = `${int(detail.placesCounted)} / ${int(detail.placesTotal)} places`;
  $('candidate-total').textContent = int(detail.candidateVotes); $('party-total').textContent = int(detail.partyVotes);
  $('candidate-informals').textContent = `${int(detail.candidateInformals)} informal candidate votes`;
  $('party-informals').textContent = `${int(detail.partyInformals)} informal party votes`;
  $('detail-changes').textContent = `${candidateChanges.size} candidate rows and ${partyChanges.size} party rows changed.${progressChanged ? ' Counting progress changed.' : ''} Highlights compare votes with the previous successful refresh in this tab; the first load establishes a baseline.`;
  summary($('candidate-rows'), detail.candidates, detail.candidateVotes, candidateChanges);
  summary($('electorate-party-rows'), detail.parties, detail.partyVotes, partyChanges);
  renderBooths();
}
function renderStatus() {
  const parts = [];
  const oldSource = detail && Date.now() - sourceTime(detail.updated) > 300_000;
  const oldFetch = detail && Date.now() - Date.parse(detail.fetchedAt) > 180_000;
  if (detailError) parts.push('Electorate feed unavailable. Keeping previously loaded totals and retrying automatically.');
  if (oldSource) parts.push('The electorate source timestamp is over 5 minutes old; the feed may be awaiting the count or delayed.');
  if (oldFetch) parts.push('The loaded electorate snapshot is over 3 minutes old.');
  if (checked) parts.push(`Totals last checked ${clock(checked)} NZ. Refreshes every 60 seconds.`);
  $('connection').textContent = parts.join(' ') || 'Connecting to the electorate feed…';
  $('connection').classList.toggle('error', Boolean(detailError || oldSource || oldFetch));
}
function competitors() {
  const items = new Map((detail?.[voteType] || []).map(item => [item.id, item]));
  for (const booth of booths.values()) for (const item of booth[voteType] || []) if (!items.has(item.id)) items.set(item.id, item);
  return [...items.values()].sort((a,b) => a.name.localeCompare(b.name));
}
function header(row, text, key, numeric = false, tint = '') {
  const th = node('th', null, `${numeric ? 'num' : ''} ${tint}`.trim()); th.scope = 'col';
  th.setAttribute('aria-sort', sortKey === key ? (direction === 1 ? 'ascending' : 'descending') : 'none');
  const button = node('button', `${text} ↕`); button.type = 'button'; button.dataset.boothSort = key;
  button.addEventListener('click', () => { direction = sortKey === key ? -direction : 1; sortKey = key; renderBooths(); });
  th.append(button); row.append(th);
}
function renderBooths() {
  const focus = document.activeElement;
  const focusSort = focus?.dataset.boothSort, focusFile = focus?.dataset.file;
  const items = competitors();
  const head = node('tr');
  header(head, 'Booth / address', 'name'); header(head, 'Status', 'reported'); header(head, 'Valid votes', 'total', true);
  for (const item of items) header(head, voteType === 'parties' ? item.abbreviation || item.name : item.name, item.id, true, partyTintClass(voteType === 'candidates' ? item.partyId : item.id));
  header(head, 'Source updated · NZ', 'updated'); $('booth-head').replaceChildren(head);
  $('booth-caption').textContent = `Booth ${voteType === 'candidates' ? 'candidate' : 'party'} ${metric === 'votes' ? 'votes' : 'vote percentages'}`;
  const rows = filterBooths([...booths.values()], { search: $('booth-search').value, status: $('booth-status').value, sortKey, direction, voteType, metric });
  $('booth-count').textContent = `${rows.length} shown · ${booths.size} / ${total || '—'} files loaded`;
  if (!rows.length) message($('booth-rows'), boothBusy && !booths.size ? 'Loading booth files…' : failedBatches && !booths.size ? 'Booth feeds unavailable. Retrying automatically.' : 'No matching booths.', items.length + 4);
  else {
    $('booth-rows').replaceChildren();
    for (const booth of rows) {
      const tr = node('tr');
      const name = cell(tr);
      if (booth.unavailable) name.textContent = booth.name;
      else {
        const button = node('button', booth.name, 'booth-link'); button.type = 'button'; button.dataset.file = booth.file;
        button.addEventListener('click', () => { selectedFile = booth.file; renderDialog(); $('booth-dialog').showModal(); });
        name.append(button);
        name.append(node('span', `File ${booth.file}${booth.hostElectorateId !== id ? ' · hosted outside this electorate' : ''}`, 'party-sub'));
        markChange(tr, name, boothChanges.get(booth.file), booth, voteType === 'candidates' ? 'candidateVotes' : 'partyVotes', voteType === 'candidates' ? 'candidate votes' : 'party votes');
      }
      cell(tr, booth.unavailable ? 'Unavailable' : booth.stale ? 'Stale · retained' : booth.reported ? 'Reported' : 'Awaiting results', booth.stale || booth.unavailable ? 'stale' : 'meta');
      cell(tr, int(boothValue(booth, 'total', voteType, metric)), 'num');
      for (const item of items) {
        const value = boothValue(booth, item.id, voteType, metric);
        cell(tr, metric === 'percent' ? pct(value) : int(value), `num ${partyTintClass(voteType === 'candidates' ? item.partyId : item.id)}`.trim());
      }
      cell(tr, clock(booth.updated), 'meta'); $('booth-rows').append(tr);
    }
  }
  if (focusSort) [...$('booth-head').querySelectorAll('button')].find(b => b.dataset.boothSort === focusSort)?.focus({ preventScroll: true });
  if (focusFile) [...$('booth-rows').querySelectorAll('button')].find(b => b.dataset.file === focusFile)?.focus({ preventScroll: true });
  renderBoothStatus();
  if ($('booth-dialog').open) renderDialog();
}
function renderBoothStatus() {
  const missing = [...booths.values()].filter(b => b.unavailable).length;
  const stale = [...booths.values()].filter(b => b.stale).length;
  const reported = [...booths.values()].filter(b => b.reported && !b.stale).length;
  const changed = [...booths.values()].filter(b => !b.stale && !b.unavailable && boothChanges.has(b.file)).length;
  $('booth-progress').textContent = `${boothBusy ? 'Loading' : 'Checked'} ${completedBatches} / ${pageCount || '—'} batches · ${reported} loaded files reported.${failedBatches ? ` ${failedBatches} batches failed; retrying next refresh.` : ''}${missing ? ` ${missing} files unavailable.` : ''}${stale ? ` ${stale} older files retained and marked stale.` : ''} ${changed} booth rows changed since their previous successful refresh in this tab (votes, ballots or reporting status, not timestamps). Each row has its own source timestamp.`;
  $('booth-progress').classList.toggle('stale', failedBatches > 0 || missing > 0 || stale > 0);
}
function renderDialog() {
  const booth = booths.get(selectedFile);
  if (!booth || booth.unavailable) { $('booth-dialog').close(); return; }
  $('booth-dialog-title').textContent = booth.name;
  $('booth-dialog-meta').textContent = `${booth.stale ? 'Stale retained results · ' : ''}${booth.reported ? 'Reported' : 'Awaiting results'} · Updated ${clock(booth.updated)} NZ · ${booth.file}${booth.received ? ` · Received ${clock(booth.received)} NZ` : ''}`;
  summary($('dialog-candidates'), booth.candidates, booth.candidateVotes); summary($('dialog-parties'), booth.parties, booth.partyVotes);
  $('dialog-informals').textContent = `${int(booth.issued)} ballot papers issued · ${int(booth.candidateInformals)} informal candidate votes · ${int(booth.partyInformals)} informal party votes`;
}
async function refreshDetail() {
  if (detailBusy) return;
  detailBusy = true;
  try {
    const next = await get(`electorate?id=${id}`);
    progressChanged = Boolean(detail && ['placesCounted','placesTotal','percentPlacesCounted'].some(key => detail[key] !== next[key]));
    candidateChanges = trackCandidates(next.candidates); partyChanges = trackParties(next.parties);
    detail = next; detailError = false; renderDetail();
  }
  catch { detailError = true; if (!detail) { message($('candidate-rows'), 'Electorate feed unavailable.', 3); message($('electorate-party-rows'), 'Electorate feed unavailable.', 5); } }
  finally { checked = new Date().toISOString(); detailBusy = false; renderStatus(); }
}
async function refreshBooths() {
  if (boothBusy) return;
  boothBusy = true; completedBatches = 0; failedBatches = 0;
  const seen = new Set();
  for (const [file, booth] of booths) booths.set(file, { ...booth, stale: !booth.unavailable });
  renderBooths();
  function accept(batch) {
    if (batch.total !== total || batch.pageCount !== pageCount) throw new Error('Source listing changed during load');
    const changes = trackBooths(batch.booths);
    for (const booth of batch.booths) {
      seen.add(booth.file);
      const previous = booths.get(booth.file);
      if (!booth.unavailable) {
        if (changes.has(booth.file)) boothChanges.set(booth.file, changes.get(booth.file));
        else boothChanges.delete(booth.file);
      }
      booths.set(booth.file, booth.unavailable && previous && !previous.unavailable ? { ...previous, stale: true } : booth);
    }
    completedBatches++; renderBooths();
  }
  try {
    const first = await get(`booths?id=${id}&page=0`);
    total = first.total; pageCount = first.pageCount; accept(first);
    let next = 1;
    await Promise.all(Array.from({ length: Math.min(3, pageCount - 1) }, async () => {
      while (next < pageCount) {
        const page = next++;
        try { accept(await get(`booths?id=${id}&page=${page}`)); }
        catch { failedBatches++; renderBoothStatus(); }
      }
    }));
    if (!failedBatches) booths = new Map([...booths].filter(([file]) => seen.has(file)));
  } catch { failedBatches++; }
  finally { boothBusy = false; renderBooths(); }
}
async function refresh() {
  if (detailBusy || boothBusy) return;
  $('refresh').disabled = true;
  try { await Promise.all([refreshDetail(), refreshBooths()]); }
  finally { $('refresh').disabled = false; }
}
$('close-dialog').addEventListener('click', () => $('booth-dialog').close());
$('watch').addEventListener('click', () => { watchlist.has(id) ? watchlist.delete(id) : watchlist.add(id); save('nz-watchlist', watchlist); renderWatch(); });
$('refresh').addEventListener('click', refresh);
$('booth-search').addEventListener('input', renderBooths); $('booth-status').addEventListener('change', renderBooths);
for (const button of document.querySelectorAll('[data-contest]')) button.addEventListener('click', () => {
  voteType = button.dataset.contest; sortKey = 'name'; direction = 1;
  for (const other of document.querySelectorAll('[data-contest]')) other.setAttribute('aria-pressed', String(other === button));
  renderBooths();
});
for (const button of document.querySelectorAll('[data-metric]')) button.addEventListener('click', () => {
  metric = button.dataset.metric;
  for (const other of document.querySelectorAll('[data-metric]')) other.setAttribute('aria-pressed', String(other === button));
  renderBooths();
});
if (/^[1-9]\d?$/.test(id || '')) {
  loadHistory(); refresh(); setInterval(refresh, 60_000); setInterval(renderStatus, 30_000);
} else {
  $('connection').textContent = 'Missing or invalid electorate id. Return to the electorate list to choose a seat.';
  $('connection').classList.add('error'); $('refresh').disabled = true;
  message($('candidate-rows'), 'Choose an electorate from the main page.', 3); message($('electorate-party-rows'), 'Choose an electorate from the main page.', 5);
  $('history-note').textContent = 'Choose an electorate to see its historical comparison status.';
  $('booth-progress').textContent = 'No electorate selected.'; message($('booth-rows'), 'No electorate selected.', 1);
}
