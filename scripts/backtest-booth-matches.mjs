import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {sha256} from '../lib/history.mjs';
import {backtestBoothMatching,boothReviewQueue} from '../lib/booth-backtest.mjs';

const root=new URL('../',import.meta.url), read=path=>readFile(new URL(path,root));
const [auditBytes,indexBytes]=await Promise.all([read('data/booth-matching/report.json'),read('public/data/2023/index.json')]);
const audit=JSON.parse(auditBytes),index=JSON.parse(indexBytes);
const snapshot=await read('data/booth-matching/source/current-votingplaces.xml');
if(sha256(snapshot)!==audit.sources.current.sha256)throw new Error('Audit metadata snapshot has changed; rerun the audit.');
const electorates=await Promise.all(audit.sources.historicalDatasets.map(async source=>{
  if(!/^public\/data\/2023\/electorates\/\d+\.json$/.test(source.path))throw new Error('Unexpected historical dataset path');
  const bytes=await read(source.path);
  if(sha256(bytes)!==source.sha256)throw new Error(`Audit dataset changed: ${source.path}; rerun the audit.`);
  return JSON.parse(bytes);
}));
if(electorates.length!==72)throw new Error('Expected all 72 original-derived historical electorates');
const report=backtestBoothMatching(audit,electorates,index);
report.sources={auditSha256:sha256(auditBytes),boundaryIndexSha256:sha256(indexBytes),currentMetadataSha256:sha256(snapshot),historicalManifestSha256:audit.sources.historicalManifestSha256};
const reviewBytes=await read('data/booth-matching/venue-label-reviews.json'),reviews=JSON.parse(reviewBytes);
if(reviews.scope!=='venue-label-only-not-production-approval' || reviews.currentMetadataSha256!==audit.sources.current.sha256 || reviews.historicalManifestSha256!==audit.sources.historicalManifestSha256)throw new Error('Venue-label review source version or scope mismatch');
report.reviewedLabelScenario=backtestBoothMatching(audit,electorates,index,reviews.matches);
report.sources.venueLabelReviewsSha256=sha256(reviewBytes);
const queue=boothReviewQueue(audit,index,reviews.matches);
report.remainingVenueReview={venues:queue.length,historicalOrdinaryVotesInUnchangedSeats:queue.reduce((sum,r)=>sum+r.historicalOrdinaryVotesInUnchangedSeats,0),note:'Historic missing-venue volume for prioritising label review, not present-day votes or an approved reconstruction.'};
const pct=n=>n==null?'—':`${n.toFixed(1)}%`,pp=n=>n==null?'—':`${n.toFixed(2)} pp`;
const s=report.summary;
const text=[
  '# Unchanged-seat booth backtest','',
  '**Research diagnostic, not production validation. The separate `booths:build` pipeline publishes labelled matched-booth estimates with coverage and assumption disclaimers.**','',
  `Tested ${s.unchangedSeats} unchanged electorates using ${s.exactCandidateVenuesUsed} unique exact-label venue candidates. Unreviewed candidates are used for sensitivity testing, not promoted to production mappings. No fuzzy matches are auto-accepted and no live vote counts are used. A separate scenario adds ${report.reviewedLabelScenario.summary.reviewedVenueLabelsUsed} explicitly listed label-only reviews.`,
  '', '## 1. Known-population matched cohort','',
  'Keep each historic vote attached to its original electorate, selecting votes at venues with exact current-label matches. Compare those party shares with the full 2023 ordinary-vote reference. This diagnoses missing-venue bias; knowing the old electorate is an oracle unavailable when reconstructing moved populations.',
  '',`- Median ordinary-vote coverage: **${pct(s.knownPopulationCohort.medianCoveragePercent)}**.`,
  `- Median seat-level largest party-share error: **${pp(s.knownPopulationCohort.medianMaxPartyErrorPp)}**.`,
  `- Seats below 80% coverage: **${s.knownPopulationCohort.seatsBelow80PercentCoverage}/${s.unchangedSeats}** (diagnostic threshold, not an approval rule).`,
  `- Largest party-share error: **${pp(s.knownPopulationCohort.worstPartyErrorPp)}**, ${s.knownPopulationCohort.worstSeat}.`,
  '', '## 2. Naive host-location proxy','',
  'As a contrast, assign same-roll 2023 votes at matched venues to the current electorate hosting the booth. This tests whether venue location alone is an adequate reconstruction rule. We count votes imported from other historic electorates explicitly. The proxy/reference vote-mass ratio is not coverage.',
  '',`- Available for **${s.hostLocationProxy.availableSeats}/${s.unchangedSeats}** seats; unavailable for **${s.hostLocationProxy.unavailableSeats}**.`,
  `- Median seat-level largest party-share error: **${pp(s.hostLocationProxy.medianMaxPartyErrorPp)}**.`,
  `- Median share of proxy votes belonging to another historic electorate: **${pct(s.hostLocationProxy.medianOtherElectorateSharePercent)}**.`,
  `- Largest party-share error: **${pp(s.hostLocationProxy.worstPartyErrorPp)}**, ${s.hostLocationProxy.worstSeat}.`,
  '', '## Seat results — ordinary votes only','',
  '| Current seat | 2023 seat | Advance coverage | Election-day coverage | Ordinary coverage | Cohort max error | Host proxy max error | Host proxy foreign votes |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...report.seats.map(e=>{
    const c=e.categories,combined=c['ordinary-combined'];
    return `| ${e.name} | ${e.historicalName} | ${pct(c.advance.knownPopulationCohort.coveragePercent)} | ${pct(c['election-day'].knownPopulationCohort.coveragePercent)} | ${pct(combined.knownPopulationCohort.coveragePercent)} | ${pp(combined.knownPopulationCohort.maxAbsPartyErrorPp)} | ${pp(combined.hostLocationProxy.maxAbsPartyErrorPp)} | ${pct(combined.hostLocationProxy.otherElectorateSharePercent)} |`;
  }),
  '', '## 3. Explicitly reviewed label-only scenario','',
  'Nine source-label checks cover spelling changes, omitted landmarks and added room/entrance details at the same stated street address. They establish label consistency only, **not** verified geography, current counting coverage or resident populations. The exact-only scenario remains separately available above. See `venue-label-reviews.json` for each association and its basis.',
  '',`- Median ordinary-vote coverage after these checks: **${pct(report.reviewedLabelScenario.summary.knownPopulationCohort.medianCoveragePercent)}**.`,
  `- Median seat-level largest party-share error: **${pp(report.reviewedLabelScenario.summary.knownPopulationCohort.medianMaxPartyErrorPp)}**.`,
  `- Largest party-share error: **${pp(report.reviewedLabelScenario.summary.knownPopulationCohort.worstPartyErrorPp)}**, ${report.reviewedLabelScenario.summary.knownPopulationCohort.worstSeat}.`,
  '', '| Seat | Exact-only coverage | Label-reviewed coverage | Exact-only max error | Label-reviewed max error |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...report.seats.map((e,i)=>{
    const before=e.categories['ordinary-combined'].knownPopulationCohort,after=report.reviewedLabelScenario.seats[i].categories['ordinary-combined'].knownPopulationCohort;
    return `| ${e.name} | ${pct(before.coveragePercent)} | ${pct(after.coveragePercent)} | ${pp(before.maxAbsPartyErrorPp)} | ${pp(after.maxAbsPartyErrorPp)} |`;
  }),
  '', '## 4. Highest-impact remaining venue reviews','',
  'Prioritised by missing 2023 ordinary votes belonging to the unchanged-seat test set. These volumes are historical diagnostic weights, **not** estimates of current votes. Closed venues and shifted voting locations require a missing-vote model, not a forced name match. Full queue: `review-queue.json`.',
  '', '| Historical venue | Locality | Missing historical votes | Best unused current label candidate | Score |',
  '| --- | --- | ---: | --- | ---: |',
  ...queue.slice(0,25).map(row=>`| ${row.venue.replaceAll('|','/')} | ${row.locality || '—'} | ${row.historicalOrdinaryVotesInUnchangedSeats.toLocaleString('en-NZ')} | ${row.currentCandidates[0]?.address.replaceAll('|','/')||'None — investigate closure/relocation'} | ${row.currentCandidates[0]?.score.toFixed(3)||'—'} |`),
  '', '## Method and limits','',...Object.entries(report.methodology).map(([name,value])=>`- **${name}**: ${value}`),
  '', 'Party-by-party signed errors, raw counts and separate advance/election-day results are in `backtest.json`. No special votes are blended into these references; the historical ordinary-combined reference retains suppressed-small-booth votes so missing records cannot disappear from the denominator.',
  '', 'Reproduce offline: `npm run booths:backtest`. Regenerate the candidate audit first with `npm run booths:audit` if its saved inputs changed.','',
].join('\n');
await mkdir(new URL('data/booth-matching/',root),{recursive:true});
for(const [path,content] of [['data/booth-matching/backtest.json',`${JSON.stringify(report,null,2)}\n`],['data/booth-matching/BACKTEST.md',text],['data/booth-matching/review-queue.json',`${JSON.stringify({schemaVersion:1,status:'review-only-no-approved-mappings',sources:report.sources,venues:queue},null,2)}\n`]]){
  if(process.argv.includes('--check')){
    if(await readFile(new URL(path,root),'utf8')!==content)throw new Error(`Backtest output out of date: ${path}`);
  }else await writeFile(new URL(path,root),content);
}
console.log(JSON.stringify({exactOnly:report.summary,reviewedLabels:report.reviewedLabelScenario.summary},null,2));
