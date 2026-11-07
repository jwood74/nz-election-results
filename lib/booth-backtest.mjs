const CATEGORIES = ['advance', 'election-day', 'ordinary-combined'];
const ordinary = row => ['advance', 'election-day', 'suppressed-ordinary'].includes(row.category);
const inCategory = (row, category) => category === 'ordinary-combined' ? ordinary(row) : row.category === category;
const share = (votes, total) => total > 0 ? votes / total * 100 : null;
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i-1]+sorted[i])/2;
};

function tally(records) {
  const parties = new Map(); let votes = 0;
  for (const { electorate, row } of records) {
    if (!Number.isSafeInteger(row.validVotes) || row.validVotes < 0 || !Array.isArray(row.votes) || row.votes.length !== electorate.party.choices.length || row.votes.some(v=>!Number.isSafeInteger(v)||v<0) || row.votes.reduce((sum,v)=>sum+v,0)!==row.validVotes) throw new Error('Invalid historical vote record');
    votes += row.validVotes;
    electorate.party.choices.forEach((party,i)=>parties.set(party.name,(parties.get(party.name)||0)+row.votes[i]));
  }
  return { votes, parties };
}

function compare(reference, sample) {
  const parties = [...new Set([...reference.parties.keys(), ...sample.parties.keys()])].sort().map(name=>{
    const referenceVotes = reference.parties.get(name)||0, sampleVotes = sample.parties.get(name)||0;
    const referenceShare = share(referenceVotes,reference.votes), sampleShare = share(sampleVotes,sample.votes);
    return { name, referenceVotes, sampleVotes, referenceShare, sampleShare, errorPp: referenceShare == null || sampleShare == null ? null : sampleShare-referenceShare };
  });
  const comparable = parties.filter(p=>p.errorPp!=null);
  const worst = [...comparable].sort((a,b)=>Math.abs(b.errorPp)-Math.abs(a.errorPp)||a.name.localeCompare(b.name))[0];
  return { referenceVotes:reference.votes, sampleVotes:sample.votes, parties,
    maxAbsPartyErrorPp:worst ? Math.abs(worst.errorPp) : null, worstParty:worst?.name||null,
    totalVariationPp:comparable.length ? comparable.reduce((sum,p)=>sum+Math.abs(p.errorPp),0)/2 : null };
}

export function backtestBoothMatching(audit, electorates, index, venueReviews = []) {
  if(audit.status!=='audit-only-no-reconstructed-results' || !Array.isArray(audit.places) || !Array.isArray(audit.historicalVenues))throw new Error('Expected a booth-matching audit');
  const historical=new Map(), records=new Map();
  for(const electorate of electorates) {
    if(historical.has(electorate.id))throw new Error('Duplicate historical electorate');
    historical.set(electorate.id,electorate);
    for(const row of electorate.party.rows) {
      if(records.has(row.key))throw new Error('Duplicate historical record key');
      records.set(row.key,{electorate,row});
    }
  }
  const groups=new Map();
  for(const group of audit.historicalVenues) {
    if(groups.has(group.id))throw new Error('Duplicate historical venue group');
    groups.set(group.id,group);
  }
  const reviews=new Map();
  for(const review of venueReviews) {
    if(!review.currentPlaceId || !review.historicalVenueId || !review.basis || reviews.has(review.currentPlaceId))throw new Error('Invalid or duplicate venue-label review');
    reviews.set(review.currentPlaceId,review);
  }
  const selectedGroups=new Set(), selectedRecords=new Map(), groupsByHost=new Map(), currentIds=new Set();
  let exactUsed=0, reviewedUsed=0;
  for(const place of audit.places) {
    if(currentIds.has(place.id))throw new Error('Duplicate current polling-place id');
    currentIds.add(place.id);
    // Deliberately use exact candidates only for this sensitivity experiment.
    // This does not promote them to reviewed production mappings.
    const review=reviews.get(place.id);
    let venueId;
    if(place.status==='exact-label-candidate') {
      if(review)throw new Error('Venue-label review would overwrite an exact candidate');
      if(place.matches.length!==1 || place.matches[0].method!=='normalised-label' || place.matches[0].score!==1)throw new Error('Invalid exact-label candidate');
      venueId=place.matches[0].venueId; exactUsed++;
    } else if(review) {
      if(place.status!=='possible-label-candidates' || !place.matches.some(m=>m.venueId===review.historicalVenueId))throw new Error('Venue-label review does not refer to an audited suggestion');
      venueId=review.historicalVenueId; reviewedUsed++;
    } else continue;
    const group=groups.get(venueId);
    if(!group)throw new Error('Unknown historical venue group');
    if(selectedGroups.has(group.id))throw new Error('Historical venue assigned to multiple current ids');
    selectedGroups.add(group.id);
    if(!groupsByHost.has(place.hostElectorateId))groupsByHost.set(place.hostElectorateId,[]);
    const groupRecords=[];
    for(const record of group.records) {
      const original=records.get(record.recordKey);
      if(!original || original.electorate.id!==record.electorateId || original.row.category!==record.category || original.row.validVotes!==record.validVotes || !['advance','election-day'].includes(original.row.category))throw new Error('Audit record does not match the historical source');
      if(selectedRecords.has(record.recordKey))throw new Error('Historical record would be counted more than once');
      selectedRecords.set(record.recordKey,original); groupRecords.push(original);
    }
    groupsByHost.get(place.hostElectorateId).push(...groupRecords);
  }
  if([...reviews.keys()].some(id=>!currentIds.has(id)))throw new Error('Venue-label review refers to unknown current place');
  const seats=[];
  for(const mapping of Object.values(index.currentElectorates).filter(e=>e.canCompare).sort((a,b)=>Number(a.id)-Number(b.id))) {
    if(mapping.related2023.length!==1 || mapping.boundaryStatus!=='unchanged')throw new Error('Backtest requires verified unchanged boundaries');
    const old=historical.get(mapping.related2023[0].id);
    if(!old || old.name!==mapping.related2023[0].name)throw new Error('Historic electorate mapping mismatch');
    const reference=old.party.rows.map(row=>({electorate:old,row}));
    const cohort=[...selectedRecords.values()].filter(item=>item.electorate.id===old.id);
    const hosted=groupsByHost.get(mapping.id)||[];
    // A general-roll vote must never be reassigned to a Māori electorate, or vice versa.
    const sameRoll=hosted.filter(item=>(Number(item.electorate.id)>=66)===(Number(old.id)>=66));
    const categories={};
    for(const category of CATEGORIES) {
      const truth=tally(reference.filter(item=>inCategory(item.row,category)));
      const subset=tally(cohort.filter(item=>inCategory(item.row,category)));
      if(subset.votes>truth.votes)throw new Error('Matched original-seat votes exceed their reference population');
      const selected=sameRoll.filter(item=>inCategory(item.row,category));
      const locationProxy=tally(selected), own=tally(selected.filter(item=>item.electorate.id===old.id));
      const foreign=locationProxy.votes-own.votes;
      categories[category]={
        knownPopulationCohort:{...compare(truth,subset),coveragePercent:share(subset.votes,truth.votes),
          matchedRecords:cohort.filter(item=>inCategory(item.row,category)).length,referenceRecords:reference.filter(item=>inCategory(item.row,category)).length},
        hostLocationProxy:{...compare(truth,locationProxy),
          status:locationProxy.votes ? 'experimental-host-location-proxy' : 'unavailable',
          unavailableReason:locationProxy.votes ? null : hosted.length ? 'no-matched-records-on-this-roll' : 'no-matched-current-hosted-venues',
          ownElectorateVotes:own.votes,otherElectorateVotes:foreign,otherElectorateSharePercent:share(foreign,locationProxy.votes),
          ownPopulationCoveragePercent:share(own.votes,truth.votes),
          // This can exceed 100%; unlike cohort coverage, it is NOT coverage.
          proxyToReferenceVoteMassPercent:share(locationProxy.votes,truth.votes)},
      };
    }
    const combined=categories['ordinary-combined'];
    seats.push({id:mapping.id,name:mapping.name,historicalId:old.id,historicalName:old.name,
      categories,diagnostics:[
        ...(combined.knownPopulationCohort.coveragePercent==null || combined.knownPopulationCohort.coveragePercent<80 ? ['exact-label-cohort-covers-less-than-80-percent-of-ordinary-votes'] : []),
        ...(combined.hostLocationProxy.status==='unavailable' ? ['host-location-proxy-unavailable'] : []),
        ...(combined.hostLocationProxy.otherElectorateVotes>0 ? ['host-location-proxy-imports-other-electorates-votes'] : []),
      ]});
  }
  const combined=seats.map(e=>e.categories['ordinary-combined']);
  const worst=(key)=>seats.filter(e=>e.categories['ordinary-combined'][key].maxAbsPartyErrorPp!=null)
    .sort((a,b)=>b.categories['ordinary-combined'][key].maxAbsPartyErrorPp-a.categories['ordinary-combined'][key].maxAbsPartyErrorPp)[0];
  const worstCohort=worst('knownPopulationCohort'), worstProxy=worst('hostLocationProxy');
  return {schemaVersion:1,status:'research-backtest-not-production-validation',categories:CATEGORIES,seats,
    summary:{unchangedSeats:seats.length,exactCandidateVenuesUsed:exactUsed,reviewedVenueLabelsUsed:reviewedUsed,totalVenueCandidatesUsed:selectedGroups.size,
      knownPopulationCohort:{medianCoveragePercent:median(combined.map(c=>c.knownPopulationCohort.coveragePercent)),
        medianMaxPartyErrorPp:median(combined.map(c=>c.knownPopulationCohort.maxAbsPartyErrorPp)),
        seatsBelow80PercentCoverage:combined.filter(c=>c.knownPopulationCohort.coveragePercent!=null&&c.knownPopulationCohort.coveragePercent<80).length,
        worstSeat:worstCohort?.name||null,worstPartyErrorPp:worstCohort?.categories['ordinary-combined'].knownPopulationCohort.maxAbsPartyErrorPp??null},
      hostLocationProxy:{availableSeats:combined.filter(c=>c.hostLocationProxy.status!=='unavailable').length,
        unavailableSeats:combined.filter(c=>c.hostLocationProxy.status==='unavailable').length,
        medianMaxPartyErrorPp:median(combined.map(c=>c.hostLocationProxy.maxAbsPartyErrorPp)),
        medianOtherElectorateSharePercent:median(combined.map(c=>c.hostLocationProxy.otherElectorateSharePercent)),
        worstSeat:worstProxy?.name||null,worstPartyErrorPp:worstProxy?.categories['ordinary-combined'].hostLocationProxy.maxAbsPartyErrorPp??null}},
    methodology:{
      matching:`Unique exact-normalised-label candidates${reviewedUsed ? ` plus ${reviewedUsed} explicitly listed venue-label-only reviews` : ' only'}. No fuzzy suggestion is accepted automatically; ambiguous, split and mobile candidates are excluded. Label reviews do not verify geography, vote categories or population equivalence, and do not approve any production mapping.`,
      reference:'Exact 2023 valid party votes on unchanged boundaries. Advance and election-day are tested separately. The ordinary-combined reference also includes suppressed-small-booth votes; all special-vote categories are excluded.',
      knownPopulationCohort:'2023 votes belonging to the known historical electorate at matched venues anywhere in the current physical venue list. This measures venue-retention/missing-booth bias using known old electorate labels. It is an optimistic coverage diagnostic, not a method for assigning moved populations or proof that the current venue accepts results for this electorate.',
      hostLocationProxy:'For comparison, assign same-roll 2023 votes at exact-matched venues to the current booth-host electorate. This deliberately tests the naive physical-location reconstruction rule, reporting imported other-electorate votes. A vote-mass ratio is not population coverage.',
      limitations:'No current live votes are used. Ordinary-combined is a historical diagnostic, not an assertion that current XML combines advance/election-day counts. No population redistribution, special-vote imputation, new-boundary baseline or predictive accuracy is established. Māori electors share general-hosted venues, so host-location metadata alone cannot reconstruct their electorates.',
      decision:'No additional live swing or reconstructed baseline is enabled by this report. Review matches, current result-file membership/categories, missing-venue coverage and residence-based allocation before deployment.'},
  };
}

export function boothReviewQueue(audit,index,venueReviews=[]) {
  const unchanged=new Set(Object.values(index.currentElectorates).filter(e=>e.canCompare).map(e=>e.related2023[0].id));
  const selectedPlaces=new Set(venueReviews.map(r=>r.currentPlaceId)),selectedVenues=new Set(venueReviews.map(r=>r.historicalVenueId));
  for(const place of audit.places)if(place.status==='exact-label-candidate'){
    selectedPlaces.add(place.id);selectedVenues.add(place.matches[0].venueId);
  }
  const proposals=new Map();
  for(const place of audit.places) {
    if(selectedPlaces.has(place.id) || place.status==='mobile-or-pooled-excluded')continue;
    for(const match of place.matches) {
      if(!proposals.has(match.venueId))proposals.set(match.venueId,[]);
      proposals.get(match.venueId).push({currentPlaceId:place.id,address:place.address,hostElectorateId:place.hostElectorateId,score:match.score,method:match.method});
    }
  }
  return audit.historicalVenues.filter(group=>!selectedVenues.has(group.id)).map(group=>{
    const records=group.records.filter(row=>unchanged.has(row.electorateId));
    const candidates=(proposals.get(group.id)||[]).sort((a,b)=>b.score-a.score||a.currentPlaceId.localeCompare(b.currentPlaceId));
    return {historicalVenueId:group.id,venue:group.venue,locality:group.locality,
      historicalOrdinaryVotesInUnchangedSeats:records.reduce((sum,r)=>sum+r.validVotes,0),
      advanceVotes:records.filter(r=>r.category==='advance').reduce((sum,r)=>sum+r.validVotes,0),
      electionDayVotes:records.filter(r=>r.category==='election-day').reduce((sum,r)=>sum+r.validVotes,0),
      historicalSeats:[...new Set(records.map(r=>r.electorateName))],records,currentCandidates:candidates,
      status:candidates.length?'label-candidates-need-review':'no-current-candidate-possibly-closed-relocated-or-renamed'};
  }).filter(row=>row.historicalOrdinaryVotesInUnchangedSeats>0)
    .sort((a,b)=>b.historicalOrdinaryVotesInUnchangedSeats-a.historicalOrdinaryVotesInUnchangedSeats||a.historicalVenueId.localeCompare(b.historicalVenueId));
}
