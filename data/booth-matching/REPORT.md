# Booth matching — first audit

**Candidate audit, not production validation. The separate `booths:build` pipeline derives explicitly labelled estimates from these candidates and documented label reviews.**

The current site checkpoint was already committed/pushed before starting this audit. This report uses one saved current metadata snapshot and the checked-in original-derived 2023 datasets.

| Status | Current physical polling places |
| --- | ---: |
| exact-label-candidate | 1467 |
| ambiguous-exact-label | 0 |
| current-split-or-duplicate | 0 |
| possible-label-candidates | 579 |
| unmatched | 476 |
| mobile-or-pooled-excluded | 161 |
| **Total** | **2683** |

Historical venue groups: 2574. Approved/reconstruction-ready matches: **0**. These are place counts, **not** vote-weighted coverage or coverage of each current electorate's result files.

## Interpretation

- Counts describe physical polling places, not current electorate result files or vote-weighted coverage.
- A normalised label match is a candidate only: no historic vote is reassigned or counted as a reconstructed result.
- 2023 advance/election-day records and each historic electorate population remain separate. Special/pooled/mobile records are excluded from venue matching.
- Current host electorate describes booth location, not necessarily the electorate of the voters using it.
- Historic coordinates and current vote-category coverage are not available in these inputs. Exact labels still need geographic/category/population review.
- Suggestions are review-only; no fuzzy match is approved automatically. Splits/duplicates must be resolved to prevent double counting.

## By current booth-host electorate

| Host electorate | Places | Unique exact-label candidates | Other review/unmatched | Mobile excluded |
| --- | ---: | ---: | ---: | ---: |
| Auckland Central | 34 | 12 | 20 | 2 |
| Banks Peninsula | 41 | 26 | 12 | 3 |
| Botany | 23 | 11 | 11 | 1 |
| Christchurch Central | 35 | 14 | 19 | 2 |
| Christchurch East | 34 | 11 | 21 | 2 |
| Coromandel | 59 | 47 | 10 | 2 |
| Dunedin | 43 | 17 | 23 | 3 |
| East Cape | 81 | 61 | 17 | 3 |
| East Coast Bays | 24 | 8 | 14 | 2 |
| Epsom | 31 | 8 | 17 | 6 |
| Glendene | 21 | 7 | 13 | 1 |
| Hamilton East | 31 | 21 | 9 | 1 |
| Hamilton West | 33 | 19 | 10 | 4 |
| Henderson | 23 | 6 | 15 | 2 |
| Hutt South | 37 | 30 | 5 | 2 |
| Ilam | 37 | 27 | 8 | 2 |
| Invercargill | 62 | 37 | 21 | 4 |
| Kaikōura | 64 | 41 | 19 | 4 |
| Kaipara ki Mahurangi | 36 | 16 | 17 | 3 |
| Kapiti | 38 | 26 | 9 | 3 |
| Kenepuru | 32 | 19 | 12 | 1 |
| Māngere | 32 | 15 | 16 | 1 |
| Manurewa | 34 | 17 | 13 | 4 |
| Maungakiekie | 27 | 19 | 6 | 2 |
| Mt Albert | 24 | 5 | 18 | 1 |
| Mt Maunganui | 30 | 17 | 11 | 2 |
| Mt Roskill | 26 | 8 | 16 | 2 |
| Napier | 59 | 39 | 18 | 2 |
| Nelson | 26 | 12 | 12 | 2 |
| New Plymouth | 46 | 33 | 11 | 2 |
| North Shore | 25 | 17 | 7 | 1 |
| Northcote | 27 | 20 | 6 | 1 |
| Northland | 93 | 66 | 20 | 7 |
| Ōtāhuhu | 28 | 14 | 12 | 2 |
| Pakuranga | 25 | 6 | 17 | 2 |
| Palmerston North | 43 | 20 | 19 | 4 |
| Papakura | 30 | 19 | 10 | 1 |
| Port Waikato | 56 | 28 | 26 | 2 |
| Rangitata | 54 | 38 | 14 | 2 |
| Rangitīkei | 70 | 53 | 13 | 4 |
| Remutaka | 36 | 19 | 15 | 2 |
| Rotorua | 52 | 25 | 24 | 3 |
| Selwyn | 38 | 13 | 21 | 4 |
| Southland | 61 | 42 | 18 | 1 |
| Taieri | 48 | 33 | 13 | 2 |
| Takanini | 26 | 10 | 14 | 2 |
| Tāmaki | 30 | 21 | 7 | 2 |
| Taranaki-King Country | 85 | 49 | 31 | 5 |
| Taupō | 51 | 30 | 18 | 3 |
| Tauranga | 29 | 5 | 22 | 2 |
| Tukituki | 53 | 26 | 23 | 4 |
| Upper Harbour | 26 | 13 | 10 | 3 |
| Waikato | 56 | 30 | 25 | 1 |
| Waimakariri | 26 | 4 | 20 | 2 |
| Wairarapa | 58 | 23 | 33 | 2 |
| Waitākere | 25 | 15 | 9 | 1 |
| Waitaki | 68 | 42 | 25 | 1 |
| Wellington Bays | 37 | 19 | 16 | 2 |
| Wellington North | 35 | 16 | 18 | 1 |
| West Coast-Tasman | 88 | 64 | 20 | 4 |
| Whanganui | 77 | 22 | 50 | 5 |
| Whangaparāoa | 20 | 10 | 6 | 4 |
| Whangārei | 50 | 14 | 32 | 4 |
| Wigram | 34 | 12 | 18 | 4 |

## Next steps

1. Review a sample of exact-label candidates and then the ambiguous/duplicate and token-similarity suggestions in `report.json`.
2. Verify current count coverage (advance, election day, or combined) before choosing or combining any historic categories.
3. Distinguish historic votes belonging to different electorates at the same venue, and confirm how voter populations moved across the new boundaries.
4. Record reviewed one-to-one / split / merged mappings with source evidence and prevent reusing historical records.
5. Prototype explicitly labelled estimated baselines with unmatched coverage and methodology visible; validate against the 19 unchanged electorates first.

To reproduce offline: `npm run booths:audit`. To obtain the initial metadata snapshot: `npm run booths:capture` (one normal XML request; existing snapshots are preserved).
