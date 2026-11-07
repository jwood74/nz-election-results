import { createHash } from 'node:crypto';

export function normaliseVenue(value) {
  let text=String(value || '');
  const named={amp:'&',apos:"'",quot:'"',nbsp:' ',lt:'<',gt:'>',rsquo:'’',lsquo:'‘',ndash:'–',mdash:'—'};
  // Some XML address strings contain a second, literal HTML-entity layer.
  // Decode text only (no HTML parsing or execution), retaining raw snapshots.
  for(let i=0;i<2;i++)text=text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(original,entity)=>{
    if(entity.startsWith('#')){
      const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
      return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):original;
    }
    return Object.hasOwn(named,entity.toLowerCase())?named[entity.toLowerCase()]:original;
  });
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’‘`]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const mobile = value => /\b(teams?|mobile|pop up|telephone|overseas|special votes|taken in)\b/.test(normaliseVenue(value));
const geographic = row => row.category === 'advance' || row.category === 'election-day';
const groupId = key => createHash('sha256').update(key).digest('hex').slice(0, 20);

// Same venue across contests/electorates is one physical-label candidate, but its
// individual vote records/categories are never collapsed or reassigned.
export function historicalVenueGroups(electorates) {
  const groups = new Map();
  let excludedPooledRecords = 0, excludedMobileRecords = 0;
  for (const electorate of electorates) for (const row of electorate.party.rows) {
    if (!geographic(row)) { excludedPooledRecords++; continue; }
    if (mobile(row.venue) || mobile(row.locality)) { excludedMobileRecords++; continue; }
    const key = JSON.stringify([normaliseVenue(row.venue), normaliseVenue(row.locality)]);
    if (!groups.has(key)) groups.set(key, { id: groupId(key), venue: row.venue, locality: row.locality, records: [] });
    groups.get(key).records.push({ electorateId: electorate.id, electorateName: electorate.name,
      electorateType: Number(electorate.id) >= 66 ? 'maori' : 'general', category: row.category,
      recordKey: row.key, validVotes: row.validVotes });
  }
  return { groups: [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)), excludedPooledRecords, excludedMobileRecords };
}

function labelForms(group) {
  return new Set([group.venue, `${group.venue}, ${group.locality || ''}`, `${group.locality || ''}, ${group.venue}`].map(normaliseVenue).filter(Boolean));
}
const fillers = new Set(['the','and','of','at','in','near','corner']);
const aliases = { road:'rd', street:'st', saint:'st', avenue:'ave', drive:'dr', place:'pl' };
function tokens(label) {
  return new Set(normaliseVenue(label).split(' ').filter(t=>t && !fillers.has(t)).map(t=>Object.hasOwn(aliases,t)?aliases[t]:t));
}
function similarity(a,b,weight) {
  const numbers = set => [...set].filter(t=>/^\d+$/.test(t));
  const an = numbers(a), bn = numbers(b);
  // Different numbered addresses are not quietly suggested as the same place.
  if (an.length && bn.length && !an.some(n=>bn.includes(n))) return 0;
  let common=0, total=0;
  for(const token of a) { total+=weight(token); if(b.has(token))common+=weight(token); }
  for(const token of b)total+=weight(token);
  return total ? 2*common/total : 0;
}

export function auditBoothMatches(currentPlaces, electorates) {
  const built = historicalVenueGroups(electorates), groups = built.groups;
  const exact = new Map(), inverted = new Map();
  const groupTokens = groups.map(group=>tokens(`${group.venue} ${group.locality || ''}`));
  groups.forEach((group,i)=>{
    for(const form of labelForms(group)) { if(!exact.has(form))exact.set(form,new Set());exact.get(form).add(i); }
    for(const token of groupTokens[i]) { if(!inverted.has(token))inverted.set(token,new Set());inverted.get(token).add(i); }
  });
  // A shared "School, 1 ... Road" is weak evidence; rare venue/street/locality
  // tokens should matter more than generic words or a common street number.
  const weight=token=>1+Math.log((groups.length+1)/((inverted.get(token)?.size||0)+1));
  const ids = new Set();
  const places = currentPlaces.map(place=>{
    if (!place.vp_id || ids.has(String(place.vp_id)) || !place.vp_address || !place.vp_e_no) throw new Error('Invalid or duplicate current polling-place metadata');
    ids.add(String(place.vp_id));
    const coordinate = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
    const result = { id: String(place.vp_id), hostElectorateId: String(place.vp_e_no), address: place.vp_address,
      latitude: coordinate(place.vp_lat), longitude: coordinate(place.vp_lon), status: 'unmatched', matches: [], approval: 'unreviewed' };
    if(mobile(place.vp_address))return { ...result, status:'mobile-or-pooled-excluded' };
    const indices = [...(exact.get(normaliseVenue(place.vp_address)) || [])];
    if(indices.length) {
      result.status = indices.length===1?'exact-label-candidate':'ambiguous-exact-label';
      result.matches = indices.map(i=>({ venueId:groups[i].id, method:'normalised-label', score:1 }));
    } else {
      const query=tokens(place.vp_address), pool=new Set();
      for(const token of query) {
        const candidates=inverted.get(token);
        if(candidates && candidates.size<=200)for(const i of candidates)pool.add(i);
      }
      const suggestions=[...pool].map(i=>({i,score:similarity(query,groupTokens[i],weight)}))
        .filter(item=>item.score>=0.55).sort((a,b)=>b.score-a.score||groups[a.i].id.localeCompare(groups[b.i].id)).slice(0,3);
      if(suggestions.length) {
        result.status='possible-label-candidates';
        result.matches=suggestions.map(({i,score})=>({ venueId:groups[i].id,method:'token-similarity-review-only',score:Number(score.toFixed(3)) }));
      }
    }
    return result;
  });
  // One historic venue proposed for multiple current IDs is a split/duplicate,
  // not a licence to count those 2023 votes multiple times.
  const assignments = new Map();
  for(const place of places)if(place.status==='exact-label-candidate'){
    const key=place.matches[0].venueId;
    if(!assignments.has(key))assignments.set(key,[]);assignments.get(key).push(place);
  }
  for(const values of assignments.values())if(values.length>1)for(const place of values)place.status='current-split-or-duplicate';
  const summary={currentPlaces:places.length,historicalVenueGroups:groups.length,...Object.fromEntries(['exact-label-candidate','ambiguous-exact-label','current-split-or-duplicate','possible-label-candidates','unmatched','mobile-or-pooled-excluded'].map(status=>[status,places.filter(p=>p.status===status).length])),
    excludedPooledHistoricalRecords:built.excludedPooledRecords,excludedMobileHistoricalRecords:built.excludedMobileRecords,approvedMatches:0};
  const hostElectorates=[...new Set(places.map(p=>p.hostElectorateId))].sort((a,b)=>Number(a)-Number(b)).map(id=>{
    const rows=places.filter(p=>p.hostElectorateId===id);
    return {id,places:rows.length,exactLabelCandidates:rows.filter(p=>p.status==='exact-label-candidate').length,needsReview:rows.filter(p=>!['exact-label-candidate','mobile-or-pooled-excluded'].includes(p.status)).length,mobileExcluded:rows.filter(p=>p.status==='mobile-or-pooled-excluded').length};
  });
  return {schemaVersion:1,status:'audit-only-no-reconstructed-results',summary,hostElectorates,places,historicalVenues:groups,
    limitations:[
      'Counts describe physical polling places, not current electorate result files or vote-weighted coverage.',
      'A normalised label match is a candidate only: no historic vote is reassigned or counted as a reconstructed result.',
      '2023 advance/election-day records and each historic electorate population remain separate. Special/pooled/mobile records are excluded from venue matching.',
      'Current host electorate describes booth location, not necessarily the electorate of the voters using it.',
      'Historic coordinates and current vote-category coverage are not available in these inputs. Exact labels still need geographic/category/population review.',
      'Suggestions are review-only; no fuzzy match is approved automatically. Splits/duplicates must be resolved to prevent double counting.',
    ]};
}
