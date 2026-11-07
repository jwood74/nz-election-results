# NZ election night

Table-first election-night viewer: national party votes, 2023 national share change and feed-reported seats, a coalition selector, closest electorate races, search, sorting and a local watchlist. Open an electorate for separate candidate/party totals and sortable, searchable booth results, with votes/percentages toggles and a full-result dialog for each booth. Local historic comparisons remain disabled pending source downloads and reviewed mappings.

Click **Last Updated** in the electorate table for newest-first order, then click again for oldest-first. Invalid/missing timestamps stay last. Green rows and explicit “Changed” badges highlight changes since the previous successful refresh in the current tab, with signed vote deltas (including negative corrections). First loads/new rows establish a baseline; timestamp-only updates do not highlight. Sorting/filtering does not reset highlights; an unchanged successful refresh clears them. Baselines survive unavailable feeds and stale retained rows. These are in-memory comparisons, not persistent count history or notifications.

## Run locally

Node 22 or newer:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8888. This lightweight local server uses the same function handlers as Netlify; it does not emulate Netlify's CDN or headers.

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

The saved national 2023 baseline is served as static JSON, requested once per page independently of live polling. Build it offline with `npm run history:build`, and verify generated output with `npm run history:check`. See [`data/2023/README.md`](data/2023/README.md) for source provenance, explicit party mappings, comparison limitations and the opt-in CSV collector.

The archive blocks direct downloads here. The national baseline is therefore a transparently labelled transcription of its indexed official final table, **not** downloaded CSV originals. Nine directly named parties are mapped; unverified renames/alliances show dashes. Change uses exact valid-vote denominators and includes 2023 special votes. Electorate/booth swing and predictions are not enabled.

At initial inspection the live feed was zeroed with a `2026-11-06T16:19:53` timestamp.
