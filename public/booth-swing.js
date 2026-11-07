const valid = value => Number.isSafeInteger(value) && value >= 0;

export function boothEstimate(booth, baseline) {
  if (!booth || booth.unavailable || baseline?.status !== 'estimated-matched-booth-baseline') return null;
  const estimate = baseline.booths?.[booth.id];
  // Guard against recycled IDs or changed metadata after the saved snapshot.
  return estimate && estimate.currentAddress === booth.name && valid(estimate.totalValidVotes) && estimate.totalValidVotes > 0 ? estimate : null;
}

export function matchedBoothSwing(booths, baseline) {
  const current = new Map(), previous = new Map(), missingParties = new Set();
  const seen = new Set(), historicalVenues = new Set();
  let reportedBooths = 0, reportedVotes = 0, matchedBooths = 0, currentVotes = 0, previousVotes = 0;
  for (const booth of booths) {
    if (booth.unavailable || booth.stale || !booth.reported || !valid(booth.partyVotes) || !booth.partyVotes || !Array.isArray(booth.parties)) continue;
    if (seen.has(booth.id)) continue;
    seen.add(booth.id);
    if (booth.parties.some(p => !valid(p.votes)) || new Set(booth.parties.map(p => p.id)).size !== booth.parties.length || booth.parties.reduce((sum, p) => sum + p.votes, 0) !== booth.partyVotes) continue;
    reportedBooths++; reportedVotes += booth.partyVotes;
    const estimate = boothEstimate(booth, baseline);
    if (!estimate || historicalVenues.has(estimate.historicalVenueId)) continue;
    const categories = Object.values(estimate.categories || {});
    if (!categories.length || categories.some(c => !valid(c.totalValidVotes)) || categories.reduce((sum, c) => sum + c.totalValidVotes, 0) !== estimate.totalValidVotes) continue;
    if ((baseline.mappedPartyIds || []).some(id => categories.some(c => !valid(c.votes?.[id]) || c.votes[id] > c.totalValidVotes))) continue;
    historicalVenues.add(estimate.historicalVenueId);
    matchedBooths++; currentVotes += booth.partyVotes; previousVotes += estimate.totalValidVotes;
    for (const id of baseline.mappedPartyIds) {
      const party = booth.parties.find(p => p.id === id);
      if (!party) missingParties.add(id);
      current.set(id, (current.get(id) || 0) + (party?.votes || 0));
      previous.set(id, (previous.get(id) || 0) + categories.reduce((sum, c) => sum + c.votes[id], 0));
    }
  }
  const comparisons = new Map();
  if (currentVotes > 0 && previousVotes > 0) for (const id of baseline.mappedPartyIds) {
    const previousPercent = previous.get(id) / previousVotes * 100;
    const currentPercent = missingParties.has(id) ? null : current.get(id) / currentVotes * 100;
    comparisons.set(id, { previousPercent, currentPercent, change: currentPercent == null ? null : currentPercent - previousPercent });
  }
  return { comparisons, matchedBooths, reportedBooths, currentVotes, previousVotes,
    coveragePercent: reportedVotes > 0 ? currentVotes / reportedVotes * 100 : null };
}
