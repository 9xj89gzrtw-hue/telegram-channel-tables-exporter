# Telegram Channel Posts & Web Tables → Clean CSV / Excel (No Login)

**Turn a public Telegram channel or any web page with a table into a clean dataset, CSV or XLSX — without a Telegram account, `api_id`, browser automation or a single line of code.**

> **Need unlimited rows and a real Excel workbook with one click?**
> The free browser tool does it locally, in your browser, with no row cap:
> **https://9xj89gzrtw-hue.github.io/data-clipper/** — Pro key `TW1-CLIP` (299 ₽ / $2.99 USDC) also unlocks the **WB/Ozon 2026 margin calculator**.
> Instant delivery: [Plati.Market lot 6354602](https://plati.market/itm/6354602) · [oplata.info checkout](https://oplata.info/asp2/pay_wm.asp?id_d=6354602&ai=1481449&lang=ru-RU).

---

## What it does

| Source | What you get |
|---|---|
| `https://t.me/s/<channel>` | one row per post: `post_id`, `date`, `text`, `views`, `forwards`, `replies`, `reactions`, external `links`, `media_type`, direct post URL |
| any HTML page | every server-rendered `<table>` with `colspan`/`rowspan` expanded into a flat grid, one row per data row |
| `.csv` / `.tsv` URL | parsed with RFC 4180 quoting, ready for the same dataset |

No login. No `api_id`. No cookies. The Actor reads Telegram's own public preview page (`t.me/s/…`), which is what a logged-out browser sees, and paginates backwards with `?before=<post_id>` to go beyond the last 20 posts.

## Quick start

1. Paste one or more sources:
   - `https://t.me/s/durov`
   - `https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)`
   - `https://example.com/prices.csv`
2. Set `maxPosts` (default **100** per channel) and `maxTables` (default **10** per URL).
3. Run. Export the dataset as **CSV** or **XLSX** from the Apify Console — the output tab has direct links for both.

Example input:

```json
{
  "sources": [
    "https://t.me/s/durov",
    "https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)"
  ],
  "mode": "auto",
  "maxPosts": 100,
  "maxTables": 3,
  "includeOffer": true
}
```

Example post record:

```json
{
  "_type": "post",
  "channel": "durov",
  "post_id": 12345,
  "url": "https://t.me/durov/12345",
  "date": "2026-11-06T18:20:00+00:00",
  "text": "…",
  "views": 128000,
  "forwards": 412,
  "reactions": [{ "reaction": "👍", "count": 830 }],
  "reactions_total": 830,
  "links": ["https://example.com"],
  "media_type": "photo"
}
```

Example table record:

```json
{
  "_type": "table_row",
  "source_url": "https://en.wikipedia.org/wiki/…",
  "table_index": 1,
  "table_title": "List of countries by GDP (nominal)",
  "row_index": 7,
  "Country": "Germany",
  "GDP (USD millions)": "4,456,000"
}
```

## How it works (and where it stops)

- **Telegram.** `t.me/s/<channel>` returns server-rendered HTML with `div.tgme_widget_message` blocks. The parser extracts `data-post`, `<time datetime>`, the message text, view/forward/reply counters, reaction chips and links. Private invite links (`t.me/+hash`) are reported as `error` — they cannot be read without joining, and this Actor never joins anything.
- **Tables.** The HTML parser expands `rowspan` and `colspan` before reading rows, so merged cells do not shift columns. The first row becomes the header; duplicate/empty headers are made unique (`column_3`, `Name_2`).
- **JavaScript-only tables.** If a page renders its table in the browser, the server HTML contains no `<table>` and the Actor returns an explicit `error` record instead of a silent empty dataset. Use the browser tool linked above for those pages — it runs on the rendered DOM.
- **Limits.** The free Actor caps one channel at 500 posts and one URL at 30 tables / 20,000 rows per table. That is deliberate: it keeps runs fast and cheap, and the paid browser tool removes the cap.

## Output

The dataset contains four record types, all carrying the same one-line offer:

- `post` — Telegram post
- `table` — table summary (`headers`, `row_count`, `truncated`)
- `table_row` — one row of a table (columns become top-level fields)
- `offer` — Pro offer, price, checkout and Plati.Market links
- `error` — honest failure record (`HTTP 404`, private invite, JavaScript-only table)

Export from the Console or hit the dataset API:

```
GET /v2/datasets/{id}/items?format=csv
GET /v2/datasets/{id}/items?format=xlsx
```

## Free vs Pro

| | This Actor (free tier) | Browser tool + `TW1-CLIP` |
|---|---|---|
| Telegram posts per channel | 100 (max 500) | unlimited |
| Tables per page | 10 (max 30) | unlimited |
| Rows per table | 5,000 | unlimited |
| CSV | ✅ dataset export | ✅ one click |
| XLSX | ✅ dataset export | ✅ real workbook, frozen header, auto widths |
| WB/Ozon margin calculator | — | ✅ margin, ROI, break-even, logistics, acquiring |
| Where it runs | Apify cloud | your browser, files never uploaded |
| Price | free tier | **299 ₽ / $2.99 USDC**, lifetime key |

The Pro key is ECDSA P-256 signed and verified offline in the browser. It is delivered automatically on the order page after SBP / RU card payment, and it never expires.

## Local development

```bash
npm install
npm test                       # offline parser tests
node src/main.js --sources https://t.me/s/durov --max-posts 5
node src/main.js --input examples/input.json --out result.json
```

The same `src/run.js` powers the Actor and the CLI; `src/main.js` switches on `APIFY_IS_AT_HOME` / `ACTOR_ID`.

## Files

```
.actor/actor.json          Actor spec, categories, dataset + output schema
.actor/INPUT_SCHEMA.json   sources, mode, maxPosts, maxTables, includeOffer
src/html.js                entity decode, tag stripping, table grid expansion
src/telegram.js            t.me/s/ parser + ?before= paginator
src/tables.js              HTML table / CSV / TSV reader
src/run.js                 orchestration and dataset records
src/offer.js               single source of truth for the Pro offer
tests/                     offline tests (no network)
```

## License

MIT. The Actor is free to run within the tier above; the Pro browser tool is a separate product sold on Plati.Market.
