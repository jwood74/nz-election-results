# NZ election night

Table-first election-night viewer: national party votes, 2023 national share change and feed-reported seats, a coalition selector, closest electorate races, search, sorting and a local watchlist. Open an electorate for separate candidate/party totals and sortable, searchable booth results, with votes/percentages toggles and a full-result dialog for each booth. Electorate party swing uses estimated matched-booth baselines, with coverage and changed-boundary warnings; headline shares always use all electorate votes.

Click **Last Updated** in the electorate table for newest-first order, then click again for oldest-first. Invalid/missing timestamps stay last. Green rows and explicit “Changed” badges highlight changes since the previous successful refresh in the current tab, with signed vote deltas (including negative corrections). First loads/new rows establish a baseline; timestamp-only updates do not highlight. Sorting/filtering does not reset highlights; an unchanged successful refresh clears them. Baselines survive unavailable feeds and stale retained rows. These are in-memory comparisons, not persistent count history or notifications.

The **Seat change** column after national-table **Total seats** shows green **↑ +N** / red **↓ −N** against the completed 2023 Parliament, including the deferred Port Waikato result (National 49; total 123). These are separate from per-refresh highlights. Unchanged parties show **0**; unavailable allocations and unverified mappings show **—**.

## Run locally

Node 22 or newer:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8888. This lightweight local server uses the same function handlers as Netlify; it does not emulate Netlify's CDN or headers.

The dev command watches backend modules and restarts when they change. If a dev server was started before this watch-mode change, stop it and rerun `npm run dev`; an older running process may otherwise lack newly added API routes even though it serves the latest HTML/JS files.

```sh
npm test
npm run check:feed
```

## Deploy to Netlify

Push this folder to a GitHub repository, then import it in Netlify. `netlify.toml` defines the publish directory (`public`), functions directory and API routes. No build command or secrets are required. Netlify installs the dependency from `package-lock.json`.

Alternatively use the Netlify CLI from this directory after authenticating:

```sh
npx netlify-cli deploy --build
```

This creates a preview deployment. Verify `/api/national`, `/api/electorates`, `/api/electorate?id=1` and `/api/booths?id=1&page=0` on the deployed URL before publishing to production. A successful local fetch does **not** prove the source permits Netlify's outbound IP addresses. Check function duration/usage and plan limits as well. Do not use a static-folder drag-and-drop deployment: the functions must be built and deployed too.

## Data and caching

- The backend fetches only fixed paths from https://media.election.net.nz/xml/; no open proxy or browser CORS workaround.
- National and electorate endpoints are separate. Electorate requests have bounded concurrency (12) and each upstream fetch has an eight-second timeout.
- Detail URLs use `/electorate.html?id=1`. Only validated electorate IDs and bounded numeric page inputs reach the source; unknown electorates/pages return 404.
- Booth result filenames come from the source's directory listing, cached for five minutes; labels are joined by global `vp_id` from `votingplaces.xml`. This includes booths outside the contest's host electorate and Māori electorate coverage. No booth affiliation is inferred from its address.
- `/api/booths?id=1&page=0` loads at most 40 result files with concurrency 12. The browser loads remaining batches with concurrency three and sorts/searches across all loaded rows. It retries on the next one-minute refresh and does not start overlapping refreshes. This is on-demand, not a national booth crawl.
- A batch with some missing files returns explicit warnings without CDN caching; an entirely failed batch returns 502. The browser retains previous good booth rows on a failed batch/file, marks them stale, and shows progress and missing-batch counts. Candidate/party shares use their own valid-vote totals; absent data and all-zero denominators show dashes.
- Reported booth status uses `time_received`, issued ballots, votes or informals, not merely `updated`. Booth files and electorate totals may have different coverage/timestamps and are not assumed to reconcile.
- Metadata caches for an hour per warm function instance; results cache for 55 seconds. In-flight requests within an instance are coalesced.
- Netlify CDN responses cache for 55 seconds, may serve stale while revalidating for another minute, and may serve stale on errors for five minutes. Warm-instance caching is opportunistic, not a persistent collector.
- Partial electorate responses identify missing feeds and are not CDN-cached. An all-feed failure returns 502. The browser keeps its previous response when an endpoint fails and retries every minute. No persistent offline snapshot is stored.
- Source timestamps are interpreted in `Pacific/Auckland`. The page distinguishes source age, snapshot age and last attempted refresh.
- All-zero feeds have no leader or usable seat allocation. Ties have no sole leader. The XML `final` attribute is deliberately not used to call winners.
- Coalition arithmetic uses the reported seat allocation and a minimum 120-seat parliament (increased if reported totals exceed 120). It is not a forecast. Validate the upstream seat field semantics during the live count.

## Historical data

All 144 user-downloaded original 2023 party/candidate booth CSVs are saved locally. National results, 72 historical electorate datasets and a boundary-aware index rebuild entirely offline with `npm run history:build`; verify generated output with `npm run history:check`. Static history is requested once per page independently of live polling. See [`data/2023/README.md`](data/2023/README.md) for provenance/checksums, explicit party/electorate mappings, preserved vote categories and limitations.

The national baseline comes from the original CSVs, replacing the previous indexed-table transcription (retained for audit), and includes special votes. The 2025 official Schedule B identifies 19 unchanged electorates, including East Cape (formerly East Coast). Same names/IDs do not imply equivalent boundaries. Nine directly named parties are mapped; unverified party renames/alliances show dashes. No candidate swing or predictions are shown.

Electorate party **Share** uses all current electorate votes. **2023 % · matched** and **Swing · pp (est.)** use only fresh reported booth files with positive valid party votes and a matching historical venue on both sides. Unmatched current booths never enter either swing denominator. Each side is weighted by its own valid-vote totals, not an average of booth percentages. Zero, unavailable and stale booth rows are excluded, with coverage shown as matched / fresh loaded reported booths and the share of their current votes. Coverage is not a percentage of the full electorate or a claim that every result file has loaded.

Build the derived public baselines offline with `npm run booths:build`; verify with `npm run booths:check`. Files in `public/data/2023/booth-estimates/` are separate from the untouched original historical datasets. They use unique exact venue-label candidates plus nine explicit label reviews, never automatically accepted fuzzy suggestions. Historical advance and election-day counts remain separate in storage but are combined for the estimate because the current XML does not identify count category; special votes are excluded. For redrawn seats, historical votes at each matched venue are selected from the boundary index’s related electorates. This is an approximate allocation, not a residence-based reconstruction, and can omit moved populations. Pages disclose this and partial coverage. Recycled IDs/changed addresses are rejected. The booth table’s **Estimated 2023 votes** column is the historical valid party-vote total, not a current-turnout prediction, including in candidate view.

At initial inspection the live feed was zeroed with a `2026-11-06T16:19:53` timestamp.

## Booth-matching research

The local-only audit in [`data/booth-matching/REPORT.md`](data/booth-matching/REPORT.md) compares current physical polling-place labels with saved 2023 venue records. Capture current metadata once with `npm run booths:capture`, then reproduce the report offline with `npm run booths:audit`. Exact labels are candidates, fuzzy suggestions require review, and categories/old electorate populations stay separate. No reconstruction or additional production swing is enabled by the audit; files remain outside `public/`.

Run `npm run booths:backtest` for the unchanged-seat coverage/bias experiment in [`data/booth-matching/BACKTEST.md`](data/booth-matching/BACKTEST.md). It compares exact-label-only and nine separately documented venue-label reviews, tests advance/election-day categories separately, and contrasts known-population retention with a deliberately naive booth-host reassignment proxy. The priority queue in `data/booth-matching/review-queue.json` lists high-volume missing venues. These are diagnostic experiments, not validated notional results; all research outputs remain outside `public/`.
