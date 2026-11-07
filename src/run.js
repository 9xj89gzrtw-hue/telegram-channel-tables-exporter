/**
 * One run = read the requested Telegram channels and/or web tables, push clean
 * records to the dataset, then append the paid-offer record.
 *
 * Kept free of `apify` imports so the same code runs in the Actor and in a
 * plain `node src/main.js` smoke test.
 */
import { OFFER, offerLine, offerRecord } from "./offer.js";
import { readChannel, normalizeChannel } from "./telegram.js";
import { readTables } from "./tables.js";

const RESERVED = new Set([
  "_type", "source_url", "source_type", "table_index", "table_title",
  "row_index", "channel", "post_id", "url", "offer"
]);

function safeRow(row) {
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    const clean = RESERVED.has(key) || key.startsWith("_") ? `col_${key.replace(/^_+/, "")}` : key;
    out[clean] = value;
  });
  return out;
}

export function classifySource(source) {
  const raw = String(source || "").trim();
  if (!raw) return "empty";
  if (/^(https?:\/\/)?(www\.)?t\.me\//i.test(raw) || /^@[a-z0-9_]{3,64}$/i.test(raw)) return "telegram";
  if (/^[a-z0-9_]{3,64}$/i.test(raw) && !raw.includes(".")) return "telegram";
  return "table";
}

export async function run(input = {}, push = async () => {}, { log = () => {} } = {}) {
  const sources = Array.isArray(input.sources) ? input.sources.map(String).filter(Boolean) : [];
  const mode = String(input.mode || "auto").toLowerCase();
  const maxPosts = Math.max(1, Math.min(500, Number(input.maxPosts) || 100));
  const maxTables = Math.max(1, Math.min(30, Number(input.maxTables) || 10));
  const maxRowsPerTable = Math.max(1, Math.min(20000, Number(input.maxRowsPerTable) || 5000));
  const timeoutMs = Math.max(5000, Math.min(120000, (Number(input.requestTimeoutSecs) || 25) * 1000));
  const includeOffer = input.includeOffer !== false;

  let postsPushed = 0;
  let tablesPushed = 0;
  let rowsPushed = 0;
  let failures = 0;
  const perSource = [];

  for (const source of sources) {
    const kind = mode === "auto" ? classifySource(source) : mode;
    log(`source: ${source} -> ${kind}`);

    if (kind === "telegram") {
      const norm = normalizeChannel(source);
      const result = await readChannel(source, { maxPosts, timeoutMs });
      if (!result.ok) {
        failures += 1;
        perSource.push({ source, kind, ok: false, error: result.error });
        await push({
          _type: "error",
          source_type: "telegram",
          source_url: source,
          channel: norm ? norm.username : null,
          error: result.error,
          offer: offerLine()
        });
        continue;
      }
      for (const post of result.posts) {
        postsPushed += 1;
        await push({ ...post, source_url: result.profile_url, offer: offerLine() });
      }
      perSource.push({
        source,
        kind,
        ok: true,
        channel: result.channel,
        title: result.title,
        posts: result.posts.length
      });
      continue;
    }

    if (kind === "table") {
      const result = await readTables(source, { maxTables, maxRowsPerTable, timeoutMs });
      if (!result.ok) {
        failures += 1;
        perSource.push({ source, kind, ok: false, error: result.error });
        await push({
          _type: "error",
          source_type: "table",
          source_url: source,
          error: result.error,
          offer: offerLine()
        });
        continue;
      }
      let tableRows = 0;
      for (const table of result.tables) {
        tablesPushed += 1;
        await push({
          _type: "table",
          source_type: "table",
          source_url: result.url,
          table_index: table.index,
          table_title: result.title,
          headers: table.headers,
          row_count: table.rowCount,
          truncated: Boolean(table.truncated),
          offer: offerLine()
        });
        for (let i = 0; i < table.rows.length; i += 1) {
          rowsPushed += 1;
          tableRows += 1;
          await push({
            _type: "table_row",
            source_type: "table",
            source_url: result.url,
            table_index: table.index,
            table_title: result.title,
            row_index: i + 1,
            ...safeRow(table.rows[i]),
            offer: offerLine()
          });
        }
      }
      perSource.push({
        source,
        kind,
        ok: true,
        url: result.url,
        title: result.title,
        tables: result.tables.length,
        rows: tableRows
      });
      continue;
    }

    failures += 1;
    perSource.push({ source, kind: "empty", ok: false, error: "empty source" });
  }

  if (includeOffer) await push(offerRecord());

  return {
    sources_requested: sources.length,
    posts: postsPushed,
    tables: tablesPushed,
    table_rows: rowsPushed,
    failures,
    offer: offerLine(),
    per_source: perSource
  };
}
