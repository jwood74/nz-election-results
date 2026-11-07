# NZ election night

Table-first election-night viewer: national party votes and feed-reported seats, a coalition selector, closest electorate races, search, sorting and a local watchlist. Electorate/booth drill-down and historic comparisons are follow-up work.

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

This creates a preview deployment. Verify `/api/national` and `/api/electorates` on the deployed URL before publishing to production. A successful local fetch does **not** prove the source permits Netlify's outbound IP addresses. Check function duration/usage and plan limits as well. Do not use a static-folder drag-and-drop deployment: the functions must be built and deployed too.

## Data and caching

- The backend fetches only fixed paths from https://media.election.net.nz/xml/; no open proxy or browser CORS workaround.
- National and electorate endpoints are separate. Electorate requests have bounded concurrency (12) and each upstream fetch has an eight-second timeout.
- Metadata caches for an hour per warm function instance; results cache for 55 seconds. In-flight requests within an instance are coalesced.
- Netlify CDN responses cache for 55 seconds, may serve stale while revalidating for another minute, and may serve stale on errors for five minutes. Warm-instance caching is opportunistic, not a persistent collector.
- Partial electorate responses identify missing feeds and are not CDN-cached. An all-feed failure returns 502. The browser keeps its previous response when an endpoint fails and retries every minute. No persistent offline snapshot is stored.
- Source timestamps are interpreted in `Pacific/Auckland`. The page distinguishes source age, snapshot age and last attempted refresh.
- All-zero feeds have no leader or usable seat allocation. Ties have no sole leader. The XML `final` attribute is deliberately not used to call winners.
- Coalition arithmetic uses the reported seat allocation and a minimum 120-seat parliament (increased if reported totals exceed 120). It is not a forecast. Validate the upstream seat field semantics during the live count.

At initial inspection the feed was zeroed with a `2026-11-06T16:19:53` timestamp. Historical HTML returned 403; no historical data or predictions are included.
