# 2023 historical results

## Saved sources and outputs

- `raw/`: all **144 user-downloaded original CSVs**: party and candidate votes for each of the 72 historical electorates. Originals are preserved byte-for-byte, outside the published directory.
- `source/csv-manifest.json`: canonical source URLs, byte sizes and SHA-256 checksums for every original. Download timestamps were not supplied and are not invented.
- `source/national-indexed-table.json`: the previous search-index transcription, retained for audit only. **It no longer drives production output.** Its counts agree exactly with the originals.
- `source/current-electorates.xml`: directly downloaded snapshot of the current XML electorate IDs/names. IDs differ from 2023 and are never matched numerically.
- `source/seat-baseline.json`: separately attributed **completed 2023 Parliament** composition: National 49, Labour 34, Green 15, ACT 11, NZ First 8, Te Pāti Māori 6 (123 seats). Transcribed from the official Parliament order-of-calls table revised 12 December 2023, whose footnote includes Port Waikato. These seat counts are not derived from booth CSVs.
- `source/boundary-review.json`: explicit unchanged-boundary list and related names for renamed/reconfigured seats, attributed to the official 2025 Representation Commission Schedule B and final summary. These boundary facts were transcribed from indexed official documents; PDF download endpoints returned HTML challenges, so no original PDF is claimed.
- `mappings.json`: explicit current party IDs → 2023 party names. Unverified party renames/alliances remain unmapped. Reserved manual electorate/booth overrides are not populated or inferred.
- `../../public/data/2023/national.json`: national counts aggregated from all 72 original party CSVs: **2,851,211 valid party votes**, 17 historical parties, nine mapped current parties, separate category totals and provenance hashes.
- `../../public/data/2023/index.json`: all 72 historic electorate names/paths, 71 explicit current-to-historical references and boundary status. Only 19 unchanged-boundary electorates are enabled for electorate-wide party-vote change.
- `../../public/data/2023/electorates/`: compact per-electorate JSON containing both contests, exact totals, candidate affiliations, category subtotals, source references/checksums and individual records. Vote arrays follow the corresponding `choices` array; `key` identifies a logical CSV record, not a physical line.

## Rebuild and verify — entirely offline

```sh
npm run history:build
npm run history:check
npm test
```

The importer requires all 144 originals and validates filename/title IDs, contest, header shape, numeric counts, per-record valid votes, footer results, valid-plus-informal totals and complete row/category reconciliation. Missing sources or conflicting totals fail rather than generating partial national data. It handles quoted commas, Māori host-electorate subheadings and Port Waikato's multiline cancelled-candidate-poll title.

The Port Waikato **candidate** poll was cancelled; its zero candidate total is preserved. Its valid **party** votes still contribute to the general-election national result. No by-election candidate votes are substituted into those CSV totals. Seat comparisons use the separate completed-Parliament baseline described above, rather than the 122-seat result before Port Waikato voted.

## Renames and boundaries

The official Schedule B lists **19 unchanged** current electorates. All others are excluded from electorate-wide change, even if their names have not changed. Related 2023 names are navigation references, **not** an exhaustive population crosswalk and never permission to aggregate whole historic electorates.

| Current name | Related 2023 names | Electorate-wide party comparison |
| --- | --- | --- |
| East Cape | East Coast | Enabled: renamed, unchanged boundaries |
| Wellington North | Wellington Central | Disabled: boundaries changed |
| Wellington Bays | Rongotai | Disabled: boundaries changed |
| Waitākere | New Lynn, Kelston | Disabled: reconfigured |
| Henderson | Te Atatū, Upper Harbour, Kaipara ki Mahurangi | Disabled: reconfigured |
| Glendene | Kelston, Te Atatū | Disabled: reconfigured |
| Ōtāhuhu | Panmure-Ōtāhuhu, Botany | Disabled: reconfigured |
| Mt Maunganui | Bay of Plenty, Tauranga | Disabled: reconfigured |
| Kapiti | Ōtaki, Mana | Disabled: reconfigured |
| Kenepuru | Mana, Ōhāriu | Disabled: reconfigured |

## Vote categories and swing limitations

Advance and election-day venue rows remain separate. Pooled records also retain distinct `overseas-party-only`, `overseas-special`, `special-before`, `special-on`, `party-only-unspecified` and `suppressed-ordinary` categories. In particular, the source does not assign the party-only-unspecified and suppressed-small-booth records to advance/election-day venues, and neither do we.

National and enabled electorate-wide comparisons use **final valid party votes including special votes**, displayed as percentage-point change from exact counts. Zero live valid votes means no change value, not a negative historical share. Early live shares are descriptive, not a forecast or a matched-count estimate. Unmapped parties show dashes, not an assumed historic zero. Candidate-vote swing is not enabled.

The separate **Seat change** column after national-table **Total seats** shows green **↑ +N** and red **↓ −N** against the completed 2023 Parliament, **not** movement since the previous refresh. Unchanged seats show **0** with no arrow; zeroed/missing allocations and unverified party mappings show **—**. Explicit arrow/sign text and screen-reader descriptions supplement colour. The 2023 reference is 123 seats, not the outgoing Parliament's later vacancies or membership changes.

**Booth swing remains disabled.** Current XML supplies venue IDs, addresses and vote totals but no explicit advance/election-day category. The same 2023 venue can have both categories; a current venue-name match alone cannot establish which to compare or whether its electorate population is equivalent. This needs confirmation of current count coverage and reviewed venue/population matches before any booth swing is displayed.

## Optional collection utility

```sh
npm run history:download
# Optional, separate national summary export (not required by the importer):
npm run history:download -- --include-summary
```

The collector reuses existing CSVs, validates bytes and records checksums; it never overwrites originals. For missing files it makes a normal direct request, stops on the first error/block and refuses HTML masquerading as CSV. It is not part of Netlify builds or polling. All required sources are already local, so no new archive download is needed to build or use the site.

## Official references

- [2023 booth CSV index](https://archive.electionresults.govt.nz/electionresults_2023/statistics/votes-by-voting-place-electorate-index.html)
- [2025 Schedule B: unchanged and changed electorates](https://elections.nz/assets/pagecomponent-file-files/SCHEDULE-B-LIST-OF-UNCHANGED-AND-CHANGED-ELECTORATES.pdf)
- [2025 final electorate summary](https://elections.nz/assets/pagecomponent-file-files/Final-electorates-summary-080825.pdf)
- [Current electorate XML](https://media.election.net.nz/xml/electorates.xml)

Only static processed JSON is served. Pages load national history, or the mapping index plus an eligible electorate's history, once independently of live polling; no runtime requests are made to the archive.
