# Unchanged-seat booth backtest

**Research diagnostic, not production validation. The separate `booths:build` pipeline publishes labelled matched-booth estimates with coverage and assumption disclaimers.**

Tested 19 unchanged electorates using 1467 unique exact-label venue candidates. Unreviewed candidates are used for sensitivity testing, not promoted to production mappings. No fuzzy matches are auto-accepted and no live vote counts are used. A separate scenario adds 9 explicitly listed label-only reviews.

## 1. Known-population matched cohort

Keep each historic vote attached to its original electorate, selecting votes at venues with exact current-label matches. Compare those party shares with the full 2023 ordinary-vote reference. This diagnoses missing-venue bias; knowing the old electorate is an oracle unavailable when reconstructing moved populations.

- Median ordinary-vote coverage: **57.9%**.
- Median seat-level largest party-share error: **0.99 pp**.
- Seats below 80% coverage: **19/19** (diagnostic threshold, not an approval rule).
- Largest party-share error: **7.56 pp**, Dunedin.

## 2. Naive host-location proxy

As a contrast, assign same-roll 2023 votes at matched venues to the current electorate hosting the booth. This tests whether venue location alone is an adequate reconstruction rule. We count votes imported from other historic electorates explicitly. The proxy/reference vote-mass ratio is not coverage.

- Available for **15/19** seats; unavailable for **4**.
- Median seat-level largest party-share error: **1.39 pp**.
- Median share of proxy votes belonging to another historic electorate: **3.6%**.
- Largest party-share error: **7.07 pp**, Dunedin.

## Seat results — ordinary votes only

| Current seat | 2023 seat | Advance coverage | Election-day coverage | Ordinary coverage | Cohort max error | Host proxy max error | Host proxy foreign votes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Banks Peninsula | Banks Peninsula | 42.2% | 66.1% | 51.8% | 1.63 pp | 2.05 pp | 13.8% |
| Coromandel | Coromandel | 53.2% | 70.6% | 58.9% | 2.37 pp | 2.27 pp | 0.2% |
| Dunedin | Dunedin | 27.8% | 55.8% | 39.9% | 7.56 pp | 7.07 pp | 1.3% |
| East Cape | East Coast | 67.9% | 77.8% | 72.2% | 1.13 pp | 0.85 pp | 1.2% |
| Hamilton East | Hamilton East | 69.5% | 86.2% | 75.1% | 0.66 pp | 2.23 pp | 17.9% |
| Hamilton West | Hamilton West | 81.9% | 74.4% | 79.4% | 0.61 pp | 2.20 pp | 24.7% |
| Kaikōura | Kaikōura | 51.7% | 65.2% | 57.9% | 1.13 pp | 1.12 pp | 0.3% |
| Nelson | Nelson | 50.7% | 61.1% | 54.0% | 0.77 pp | 0.38 pp | 8.5% |
| Port Waikato | Port Waikato | 62.8% | 60.1% | 61.5% | 0.93 pp | 0.88 pp | 3.6% |
| Rangitata | Rangitata | 36.6% | 71.4% | 50.0% | 0.99 pp | 1.39 pp | 4.7% |
| Taieri | Taieri | 57.5% | 67.8% | 62.0% | 1.51 pp | 1.24 pp | 14.9% |
| Waikato | Waikato | 39.4% | 54.8% | 45.9% | 0.72 pp | 2.33 pp | 8.7% |
| Waimakariri | Waimakariri | 12.4% | 16.7% | 14.0% | 4.33 pp | 5.01 pp | 1.6% |
| Waitaki | Waitaki | 60.9% | 61.6% | 61.2% | 0.80 pp | 0.70 pp | 1.3% |
| West Coast-Tasman | West Coast-Tasman | 63.1% | 77.5% | 71.2% | 0.51 pp | 0.70 pp | 0.5% |
| Hauraki-Waikato | Hauraki-Waikato | 62.6% | 69.5% | 64.7% | 0.82 pp | — | — |
| Tāmaki Makaurau | Tāmaki Makaurau | 33.1% | 52.3% | 39.4% | 1.64 pp | — | — |
| Te Tai Tokerau | Te Tai Tokerau | 40.7% | 53.4% | 45.4% | 0.86 pp | — | — |
| Waiariki | Waiariki | 48.3% | 62.5% | 54.6% | 2.10 pp | — | — |

## 3. Explicitly reviewed label-only scenario

Nine source-label checks cover spelling changes, omitted landmarks and added room/entrance details at the same stated street address. They establish label consistency only, **not** verified geography, current counting coverage or resident populations. The exact-only scenario remains separately available above. See `venue-label-reviews.json` for each association and its basis.

- Median ordinary-vote coverage after these checks: **61.8%**.
- Median seat-level largest party-share error: **0.77 pp**.
- Largest party-share error: **2.10 pp**, Waiariki.

| Seat | Exact-only coverage | Label-reviewed coverage | Exact-only max error | Label-reviewed max error |
| --- | ---: | ---: | ---: | ---: |
| Banks Peninsula | 51.8% | 51.9% | 1.63 pp | 1.55 pp |
| Coromandel | 58.9% | 84.9% | 2.37 pp | 0.46 pp |
| Dunedin | 39.9% | 61.8% | 7.56 pp | 0.72 pp |
| East Cape | 72.2% | 72.2% | 1.13 pp | 1.13 pp |
| Hamilton East | 75.1% | 75.1% | 0.66 pp | 0.66 pp |
| Hamilton West | 79.4% | 79.4% | 0.61 pp | 0.61 pp |
| Kaikōura | 57.9% | 60.7% | 1.13 pp | 1.03 pp |
| Nelson | 54.0% | 54.0% | 0.77 pp | 0.77 pp |
| Port Waikato | 61.5% | 61.5% | 0.93 pp | 0.93 pp |
| Rangitata | 50.0% | 70.8% | 0.99 pp | 1.97 pp |
| Taieri | 62.0% | 67.2% | 1.51 pp | 0.73 pp |
| Waikato | 45.9% | 45.9% | 0.72 pp | 0.72 pp |
| Waimakariri | 14.0% | 43.9% | 4.33 pp | 0.49 pp |
| Waitaki | 61.2% | 61.8% | 0.80 pp | 0.82 pp |
| West Coast-Tasman | 71.2% | 71.2% | 0.51 pp | 0.51 pp |
| Hauraki-Waikato | 64.7% | 69.1% | 0.82 pp | 0.31 pp |
| Tāmaki Makaurau | 39.4% | 39.4% | 1.64 pp | 1.64 pp |
| Te Tai Tokerau | 45.4% | 45.4% | 0.86 pp | 0.86 pp |
| Waiariki | 54.6% | 54.6% | 2.10 pp | 2.10 pp |

## 4. Highest-impact remaining venue reviews

Prioritised by missing 2023 ordinary votes belonging to the unchanged-seat test set. These volumes are historical diagnostic weights, **not** estimates of current votes. Closed venues and shifted voting locations require a missing-vote model, not a forced name match. Full queue: `review-queue.json`.

| Historical venue | Locality | Missing historical votes | Best unused current label candidate | Score |
| --- | --- | ---: | --- | ---: |
| Richmond Mall, next to Boulevard Café, Queen Street entrance, 212 Queen Street | Richmond | 5,911 | None — investigate closure/relocation | — |
| Matamata St John Hall, (corner Ngaio Street & Rawhiti Avenue) | Matamata | 5,326 | None — investigate closure/relocation | — |
| Oamaru Central, former Noel Leeming Building, 145 Thames St | Oamaru | 4,587 | None — investigate closure/relocation | — |
| Rangiora Public Library, 141 Percival Street | Rangiora | 4,449 | None — investigate closure/relocation | — |
| South Christchurch Library, 66 Colombo Street | Cashmere | 3,516 | None — investigate closure/relocation | — |
| Waiuku Netball Centre, Kitchener Road | Waiuku | 3,329 | Waiuku Netball Centre, 1 Racecourse Road (Corner Kitchener Road), Waiuku | 0.806 |
| The Warehouse Timaru, 11 Victoria Street | Timaru | 3,205 | None — investigate closure/relocation | — |
| Limelight Dance Academy, 144 Rototuna Road | Rototuna | 3,153 | None — investigate closure/relocation | — |
| Municipal Chambers, The Octagon | Central Dunedin | 2,971 | None — investigate closure/relocation | — |
| Green Island Civic Hall, 5 Howden Street | Green Island | 2,890 | None — investigate closure/relocation | — |
| Woodend Community Centre, 6A School Road | Woodend | 2,786 | None — investigate closure/relocation | — |
| Hurunui Library, RSA Room, 111 Carters Road (State Highway 1) | Amberley | 2,696 | Amberley (Hurunui District) Library, RSA Room, 111 Carters Road (State Highway 1), Amberley | 0.954 |
| Huntly Town Centre, former ANZ Bank, 127 Main Street | Huntly | 2,657 | None — investigate closure/relocation | — |
| St Christopher's Church Hall, 92 Weld Street, Redwoodtown | Blenheim | 2,656 | None — investigate closure/relocation | — |
| Harrington Hall, 2 Harrington Avenue | Pukekohe | 2,608 | Harrington Theatre, 2 Harrington Avenue, Pukekohe | 0.833 |
| Kawerau Concert Chambers, Ranfurly Court | Kawerau | 2,581 | Kawerau Concert Chambers, Ranfurly Court, adjacent to Kawerau Library, Kawerau | 0.808 |
| Belfast Salvation Army, 794 Main North Road | Belfast | 2,580 | None — investigate closure/relocation | — |
| Corner Shop, opposite McDonald's Nelson, 135 Rutherford Street, (corner of Rutherford Street & Selwyn Place) | Nelson | 2,575 | None — investigate closure/relocation | — |
| Mariners Mall, Shop 17, 100 High Street | Picton | 2,341 | None — investigate closure/relocation | — |
| Timaru Indoor Bowls Stadium, opposite Northtown Mall, 20 Ranui Avenue | Timaru | 2,315 | Timaru Indoor Bowls & Community Centre, 20 Ranui Avenue (opposite Pak&#39;nSave), Timaru | 0.725 |
| Elim Church, 41 Guiness Street | Greymouth | 2,309 | None — investigate closure/relocation | — |
| Hillcrest Baptist Church Hall, (corner Knighton Road & Clyde Street) | Hillcrest | 2,191 | Hillcrest Baptist Church Hall, Corner of Knighton Road & Clyde Street, Hillcrest | 1.000 |
| House of Breakthrough, 7 Potae Avenue | Gisborne | 2,109 | House of Breakthrough Church, 7 Potae Avenue, Gisborne | 0.955 |
| Barrington Mall, 256 Barrington Street | Spreydon | 2,063 | Barrington Mall (next to BNZ), 256 Barrington Street, Spreydon | 0.753 |
| Exchange Area Voting Place, 1 Queens Gardens | Central Dunedin | 1,994 | None — investigate closure/relocation | — |

## Method and limits

- **matching**: Unique exact-normalised-label candidates only. No fuzzy suggestion is accepted automatically; ambiguous, split and mobile candidates are excluded. Label reviews do not verify geography, vote categories or population equivalence, and do not approve any production mapping.
- **reference**: Exact 2023 valid party votes on unchanged boundaries. Advance and election-day are tested separately. The ordinary-combined reference also includes suppressed-small-booth votes; all special-vote categories are excluded.
- **knownPopulationCohort**: 2023 votes belonging to the known historical electorate at matched venues anywhere in the current physical venue list. This measures venue-retention/missing-booth bias using known old electorate labels. It is an optimistic coverage diagnostic, not a method for assigning moved populations or proof that the current venue accepts results for this electorate.
- **hostLocationProxy**: For comparison, assign same-roll 2023 votes at exact-matched venues to the current booth-host electorate. This deliberately tests the naive physical-location reconstruction rule, reporting imported other-electorate votes. A vote-mass ratio is not population coverage.
- **limitations**: No current live votes are used. Ordinary-combined is a historical diagnostic, not an assertion that current XML combines advance/election-day counts. No population redistribution, special-vote imputation, new-boundary baseline or predictive accuracy is established. Māori electors share general-hosted venues, so host-location metadata alone cannot reconstruct their electorates.
- **decision**: No additional live swing or reconstructed baseline is enabled by this report. Review matches, current result-file membership/categories, missing-venue coverage and residence-based allocation before deployment.

Party-by-party signed errors, raw counts and separate advance/election-day results are in `backtest.json`. No special votes are blended into these references; the historical ordinary-combined reference retains suppressed-small-booth votes so missing records cannot disappear from the denominator.

Reproduce offline: `npm run booths:backtest`. Regenerate the candidate audit first with `npm run booths:audit` if its saved inputs changed.
