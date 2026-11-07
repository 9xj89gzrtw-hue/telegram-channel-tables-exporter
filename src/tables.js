/**
 * Web table reader: any public URL -> clean rows.
 *
 * Supports HTML tables (colspan/rowspan expanded), CSV/TSV files and pages
 * whose table is rendered server-side. JavaScript-only tables are reported
 * honestly instead of being silently returned empty.
 */
import { extractTables, pageMeta } from "./html.js";

async function fetchPage(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ApifyTableClipper/1.0; +https://apify.com)",
        "accept": "text/html,text/csv,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8"
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    return { status: res.status, text, contentType, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/** RFC 4180-ish CSV parser (handles quotes, embedded newlines, CRLF). */
export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function rowsToObjects(matrix) {
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (String(h).trim() ? String(h).trim() : `column_${i + 1}`));
  const seen = new Map();
  const unique = headers.map((h) => {
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}_${n}`;
  });
  const rows = [];
  for (let r = 1; r < matrix.length; r += 1) {
    if (matrix[r].every((c) => !String(c).trim())) continue;
    const obj = {};
    unique.forEach((h, i) => { obj[h] = String(matrix[r][i] ?? "").trim(); });
    rows.push(obj);
  }
  return { headers: unique, rows };
}

/**
 * Read all tables from one URL.
 * Returns { ok, url, title, tables: [{index, headers, rows, rowCount}] }
 */
export async function readTables(url, { maxTables = 10, maxRowsPerTable = 5000, timeoutMs = 25000 } = {}) {
  let res;
  try {
    res = await fetchPage(url, timeoutMs);
  } catch (err) {
    return { ok: false, url, error: `fetch failed: ${err.message}`, tables: [] };
  }
  if (res.status !== 200) {
    return { ok: false, url, error: `HTTP ${res.status}`, tables: [] };
  }

  const meta = pageMeta(res.text);
  const lower = res.finalUrl.toLowerCase().split("?")[0];
  const isCsv = /\.(csv|tsv)$/.test(lower) || /text\/csv|tab-separated/i.test(res.contentType);

  if (isCsv) {
    const delimiter = /\.tsv$/.test(lower) || /tab-separated/i.test(res.contentType) ? "\t" : ",";
    const matrix = parseCsv(res.text, delimiter);
    const { headers, rows } = rowsToObjects(matrix);
    return {
      ok: true,
      url: res.finalUrl,
      title: meta.title || res.finalUrl,
      kind: "csv",
      tables: [{
        index: 1,
        headers,
        rows: rows.slice(0, maxRowsPerTable),
        rowCount: rows.length,
        truncated: rows.length > maxRowsPerTable
      }]
    };
  }

  const tables = extractTables(res.text)
    .slice(0, maxTables)
    .map((t) => ({
      ...t,
      rows: t.rows.slice(0, maxRowsPerTable),
      rowCount: t.rowCount,
      truncated: t.rowCount > maxRowsPerTable
    }));

  if (!tables.length) {
    return {
      ok: false,
      url: res.finalUrl,
      title: meta.title,
      error: "no server-rendered <table> found; the page probably renders its table with JavaScript",
      tables: []
    };
  }

  return {
    ok: true,
    url: res.finalUrl,
    title: meta.title || res.finalUrl,
    kind: "html",
    tables
  };
}
