const BLOCS = [
  { id: 'national', name: 'National + NZ First + ACT', ids: ['16', '17', '5'] },
  { id: 'labour', name: 'Labour + Green + Māori + Opportunity', ids: ['13', '10', '14', '24'] },
];
const COLOURS = { '16': 'NAT', '17': 'NZF', '5': 'ACT', '13': 'LAB', '10': 'GP', '14': 'TPMAO', '24': 'OPP' };
const integer = n => Number.isSafeInteger(n) && n >= 0;

export function coalitionBalance(parties) {
  if (!Array.isArray(parties) || parties.some(p => !p.id || !integer(p.seats)) || new Set(parties.map(p => p.id)).size !== parties.length) return null;
  const allocated = parties.reduce((sum, p) => sum + p.seats, 0);
  if (!Number.isSafeInteger(allocated) || !allocated) return null;
  const parliament = Math.max(120, allocated), majority = Math.floor(parliament / 2) + 1;
  const byId = new Map(parties.map(p => [p.id, p]));
  const known = new Set(BLOCS.flatMap(bloc => bloc.ids));
  const blocs = BLOCS.map(bloc => {
    const members = bloc.ids.flatMap(id => byId.has(id) ? [byId.get(id)] : []);
    const seats = members.reduce((sum, p) => sum + p.seats, 0);
    return { ...bloc, members, seats, needed: Math.max(0, majority - seats) };
  });
  const others = parties.filter(p => !known.has(p.id)).sort((a,b) => a.id.localeCompare(b.id));
  const unallocated = parliament - allocated;
  const segment = p => ({ id: p.id, name: p.name, seats: p.seats, colour: COLOURS[p.id] || 'other', label: p.abbreviation || p.name });
  // The two blocs anchor opposite ends; neutral parties/unallocated seats stay in the middle.
  const segments = [
    ...blocs[0].members.map(segment), ...others.map(segment),
    ...(unallocated ? [{ id: 'unallocated', name: 'Seats not allocated in the feed', seats: unallocated, colour: 'unallocated', label: 'Unallocated' }] : []),
    ...[...blocs[1].members].reverse().map(segment),
  ].filter(p => p.seats > 0).map(p => ({ ...p, percent: p.seats / parliament * 100 }));
  return { blocs, others, allocated, parliament, majority, unallocated, segments };
}

export function createCoalitionBalanceView(root) {
  const bar = root.querySelector('[data-balance-bar]');
  const chart = root.querySelector('[data-balance-chart]'), tooltip = root.querySelector('[role="tooltip"]');
  const marker = root.querySelector('[data-balance-marker]');
  let active, pinned = false;
  const hide = () => { tooltip.hidden = true; active = undefined; pinned = false; };
  function show(button, pin = false) {
    active = button; pinned = pin;
    tooltip.textContent = button.getAttribute('aria-label'); tooltip.hidden = false;
    const bounds = chart.getBoundingClientRect(), target = button.getBoundingClientRect();
    const half = tooltip.getBoundingClientRect().width / 2;
    const position = Math.max(half, Math.min(bounds.width - half, target.left + target.width / 2 - bounds.left));
    tooltip.style.left = `${position}px`;
  }
  function buttonFor(p) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.party = p.id;
    button.className = `balance-segment party-${p.colour}`;
    button.setAttribute('aria-describedby', tooltip.id);
    button.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') show(button); });
    button.addEventListener('pointerleave', () => { if (active === button && !pinned && document.activeElement !== button) hide(); });
    button.addEventListener('focus', () => show(button));
    button.addEventListener('blur', () => { if (active === button) hide(); });
    button.addEventListener('click', () => { if (active === button && pinned) hide(); else show(button, true); });
    return button;
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) hide(); });
  function updateButtons(container, entries) {
    const ids = entries.map(p => p.id).join(',');
    if (container.dataset.ids !== ids) {
      hide(); container.replaceChildren(...entries.map(p => buttonFor(p))); container.dataset.ids = ids;
    }
    [...container.children].forEach((button, i) => {
      const p = entries[i];
      const description = `${p.name} · ${p.seats} ${p.seats === 1 ? 'seat' : 'seats'}`;
      button.setAttribute('aria-label', description);
      button.style.width = `${p.percent}%`;
      button.textContent = p.percent >= 10 ? `${p.label} ${p.seats}` : p.percent >= 4 ? String(p.seats) : '';
      if (active === button) show(button, pinned);
    });
  }
  return parties => {
    const data = coalitionBalance(parties);
    root.querySelector('[data-balance-empty]').hidden = Boolean(data);
    chart.hidden = !data; marker.hidden = !data;
    root.querySelector('[data-balance-scale]').hidden = !data;
    if (!data) {
      hide();
      for (const side of ['national', 'labour']) {
        root.querySelector(`[data-balance-total="${side}"]`).textContent = '—';
        root.querySelector(`[data-balance-status="${side}"]`).textContent = 'Awaiting seat allocation';
      }
      return;
    }
    for (const bloc of data.blocs) {
      root.querySelector(`[data-balance-total="${bloc.id}"]`).textContent = `${bloc.seats} seats`;
      root.querySelector(`[data-balance-status="${bloc.id}"]`).textContent = bloc.needed ? `${bloc.needed} ${bloc.needed === 1 ? 'seat' : 'seats'} short` : bloc.seats === data.majority ? 'Majority reached' : `${bloc.seats - data.majority} above majority threshold`;
    }
    marker.textContent = `${data.majority} needed`;
    root.querySelector('[data-balance-scale]').textContent = `${data.parliament}-seat Parliament · Cross the midpoint for a majority.${data.unallocated ? ` ${data.unallocated} seats not allocated in the feed.` : ''}${data.others.some(p => p.seats > 0) ? ` Other parties: ${data.others.reduce((sum,p) => sum + p.seats, 0)} seats in neutral grey.` : ''}`;
    updateButtons(bar, data.segments);
  };
}
