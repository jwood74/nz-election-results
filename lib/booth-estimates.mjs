import { backtestBoothMatching } from './booth-backtest.mjs';

// Estimates are a separate derived layer: never overwrite original 2023 totals.
export function buildBoothEstimates(audit, electorates, index, reviews) {
  backtestBoothMatching(audit, electorates, index, reviews);
  const groups = new Map(audit.historicalVenues.map(group => [group.id, group]));
  const records = new Map(electorates.flatMap(e => e.party.rows.map(row => [row.key, { electorate: e, row }])));
  const reviewed = new Map(reviews.map(review => [review.currentPlaceId, review.historicalVenueId]));
  const venues = audit.places.flatMap(place => {
    const venueId = place.status === 'exact-label-candidate' ? place.matches[0].venueId : reviewed.get(place.id);
    return venueId ? [{ place, group: groups.get(venueId), method: reviewed.has(place.id) ? 'reviewed-label' : 'exact-label' }] : [];
  });
  return Object.values(index.currentElectorates).map(mapping => {
    const related = new Set(mapping.related2023.map(e => e.id));
    const booths = {};
    for (const { place, group, method } of venues) {
      const selected = group.records.filter(record => related.has(record.electorateId));
      if (!selected.length) continue;
      const rolls = new Set(selected.map(record => record.electorateType));
      if (rolls.size !== 1) throw new Error('Mixed historical rolls in electorate mapping');
      const categories = {};
      for (const record of selected) {
        const { electorate, row } = records.get(record.recordKey);
        const category = categories[row.category] ||= { totalValidVotes: 0, votes: {} };
        category.totalValidVotes += row.validVotes;
        for (const party of index.partyMappings) {
          const i = electorate.party.choices.findIndex(choice => choice.name === party.name2023);
          category.votes[party.currentId] = (category.votes[party.currentId] || 0) + (i < 0 ? 0 : row.votes[i]);
        }
      }
      const totalValidVotes = Object.values(categories).reduce((sum, c) => sum + c.totalValidVotes, 0);
      if (!totalValidVotes) continue;
      booths[place.id] = { currentAddress: place.address, historicalVenueId: group.id, method,
        totalValidVotes, categories,
        historicalElectorateIds: [...new Set(selected.map(record => record.electorateId))] };
    }
    return { schemaVersion: 1, year: 2023, electorateId: mapping.id, name: mapping.name,
      status: 'estimated-matched-booth-baseline', boundaryStatus: mapping.boundaryStatus,
      related2023: mapping.related2023.map(e => ({ id: e.id, name: e.name })),
      mappedPartyIds: index.partyMappings.map(p => p.currentId),
      categoryAssumption: 'Historical advance and election-day votes combined; current XML does not identify count category.',
      populationAssumption: 'Historical votes from related electorates at the matched venue; changed-boundary residence allocation is approximate and may omit moved populations.',
      booths };
  });
}
