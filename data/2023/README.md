# 2023 historical baseline

## What is saved

- `source/national-indexed-table.json`: integer party-vote counts transcribed from the web-search-indexed **official final** results table, retrieved 7 November 2026. The source URL and retrieval method are embedded. This is **not** an original downloaded CSV.
- `mappings.json`: explicit current XML party-ID → 2023 party-name mappings. Only direct name matches are enabled. Unverified renames, new parties and alliance member votes are not inferred.
- `../../public/data/2023/national.json`: deterministic output for the static site, containing all 17 source parties, nine mapped current parties, and SHA-256 hashes of the source/mappings. The 17 source counts reconcile to **2,851,211 valid party votes**.

The archive returned 403 to direct downloads and a fresh automated Edge session. The national indexed snapshot is a transparent fallback; no CSV originals or booth datasets have been downloaded yet. The 3 November 2023 media release has subsequently amended counts and must not be substituted for the final table.

## Build and verify (offline)

```sh
npm run history:build
npm run history:check
```

The builder validates counts, exact reconciliation, unique party names and one-to-one mappings. It uses the saved indexed snapshot, not any future CSV files automatically: switching to a downloaded source must be reviewed for revisions and schema differences.

## Original CSV collection

```sh
npm run history:download
```

This attempts the national summary, then all 72 historical party-vote-by-voting-place CSVs. It stops on the first blocked/error response; it does not retry around access restrictions, save HTML as CSV, overwrite local originals or re-download cached files. Saved files and provenance/checksums go under `raw/`. This collection command is manual, **never** part of Netlify builds or live polling.

If downloads work in your browser, save files from the official [statistics index](https://archive.electionresults.govt.nz/electionresults_2023/statistics/index.html) and [booth index](https://archive.electionresults.govt.nz/electionresults_2023/statistics/votes-by-voting-place-electorate-index.html) into `data/2023/raw/` using the original filenames, then rerun the collector to record them. Start with `overall-results-summary.csv`; booth party files are `party-votes-by-voting-place-1.csv` through `party-votes-by-voting-place-72.csv`.

## Comparison rules

- National share change is **percentage points**, computed from exact valid-party-vote counts, not truncated published percentages. Zero live valid votes produces no change, not a negative historical share.
- The national 2023 baseline includes ordinary and special votes combined. They cannot be separated from this table. Election-night live shares vs final 2023 shares are descriptive, not a forecast or matched-count estimate.
- Electorate and booth comparisons are disabled pending original CSVs and reviewed mappings. Same-name electorates may have changed boundaries; booth IDs are not assumed stable. The CSVs distinguish advance, election-day and special categories, which must remain separate during import. A booth venue match alone is not enough to infer matching electorate populations or vote categories.
- No candidate-vote swing is inferred. No alliance vote is assigned to a constituent party. Unmapped current parties display dashes rather than assuming a 2023 share of zero.

## Sources

- Final national table: https://archive.electionresults.govt.nz/electionresults_2023/
- Statistics: https://archive.electionresults.govt.nz/electionresults_2023/statistics/index.html
- Booth CSV index: https://archive.electionresults.govt.nz/electionresults_2023/statistics/votes-by-voting-place-electorate-index.html

Raw originals stay outside `public/`; only compact processed JSON is served to visitors. History is requested once per page load and does not block or join the live refresh loop.
