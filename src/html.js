/**
 * Tiny, dependency-free HTML helpers.
 *
 * The Actor runs inside a minimal Docker image, so instead of pulling a DOM
 * library we use a handful of deterministic regexes over the markup Telegram
 * and ordinary web pages actually emit. Everything here is pure and testable
 * offline.
 */

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", laquo: "«", raquo: "»",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥",
  times: "×", divide: "÷", middot: "·", bull: "•", deg: "°",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", shy: ""
};

export function decodeEntities(input = "") {
  return String(input)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCode(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED, key) ? NAMED[key] : m;
    });
}

function safeFromCode(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function stripTags(input = "") {
  return decodeEntities(
    String(input)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function oneLine(input = "") {
  return stripTags(input).replace(/\s+/g, " ").trim();
}

export function attr(tag = "", name = "") {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = String(tag).match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

export function extractLinks(html = "", baseUrl = "") {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = attr(m[1], "href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    let absolute = href;
    try {
      absolute = new URL(href, baseUrl || "https://example.invalid/").href;
    } catch {
      /* keep the raw href */
    }
    out.push({ url: absolute, text: oneLine(m[2]) });
  }
  return out;
}

/**
 * Parse every <table> in the document into headers + objects.
 * Handles colspan/rowspan by expanding the grid before reading rows.
 */
export function extractTables(html = "") {
  const tables = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  let index = 0;
  while ((tm = tableRe.exec(html))) {
    index += 1;
    const body = tm[1];
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(body))) {
      const cells = [];
      const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1]))) {
        cells.push({
          tag: cm[1].toLowerCase(),
          colspan: Math.max(1, Math.min(50, parseInt(attr(cm[2], "colspan") || "1", 10) || 1)),
          rowspan: Math.max(1, Math.min(200, parseInt(attr(cm[2], "rowspan") || "1", 10) || 1)),
          text: oneLine(cm[3])
        });
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) continue;

    const grid = expandGrid(rows);
    if (!grid.length) continue;

    // Multi-row headers: keep merging leading rows that are made of <th> cells
    // (a colspan="2" "GDP" over "2025" / "2026" becomes "GDP 2025").
    let headerRowCount = 1;
    let probe = 0;
    while (probe < rows.length && rows[probe].length && rows[probe].every((c) => c.tag === "th")) {
      headerRowCount = probe + 1;
      probe += 1;
    }

    const width = Math.max(...grid.map((r) => r.length));
    const headers = [];
    for (let c = 0; c < width; c += 1) {
      const parts = [];
      for (let r = 0; r < headerRowCount; r += 1) {
        let value = String((grid[r] || [])[c] || "").trim();
        // A colspan header ("GDP" over "2025"/"2026") leaves the continuation
        // columns empty; inherit the spanning label from the previous column.
        if (!value && c > 0 && headerRowCount > 1) {
          const left = String((grid[r] || [])[c - 1] || "").trim();
          if (left) value = left;
        }
        if (value && !parts.includes(value)) parts.push(value);
      }
      headers.push(parts.length ? parts.join(" ") : `column_${c + 1}`);
    }
    const seen = new Map();
    const uniqueHeaders = headers.map((h) => {
      const n = (seen.get(h) || 0) + 1;
      seen.set(h, n);
      return n === 1 ? h : `${h}_${n}`;
    });

    const dataRows = [];
    for (let r = headerRowCount; r < grid.length; r += 1) {
      const values = grid[r];
      if (values.every((v) => !String(v || "").trim())) continue;
      const obj = {};
      uniqueHeaders.forEach((h, i) => {
        obj[h] = String(values[i] ?? "").trim();
      });
      dataRows.push(obj);
    }

    tables.push({
      index,
      headers: uniqueHeaders,
      rows: dataRows,
      rowCount: dataRows.length,
      hasHeaderRow: rows[0].some((c) => c.tag === "th")
    });
  }
  return tables;
}

function expandGrid(rows) {
  const grid = [];
  const pending = []; // pending[col] = remaining rowspan

  rows.forEach((cells, rowIdx) => {
    if (!grid[rowIdx]) grid[rowIdx] = [];
    let col = 0;
    const put = (value, colspan, rowspan) => {
      for (let c = 0; c < colspan; c += 1) {
        while (grid[rowIdx][col] !== undefined) col += 1;
        grid[rowIdx][col] = c === 0 ? value : "";
        if (rowspan > 1 && c === 0) {
          pending[col] = pending[col] || [];
          pending[col].push({ remaining: rowspan - 1, value });
        }
        col += 1;
      }
    };

    // Fill rowspan carries from previous rows first.
    Object.keys(pending).forEach((key) => {
      const c = Number(key);
      const stack = pending[key];
      if (!stack || !stack.length) return;
      while (grid[rowIdx][c] !== undefined) {
        // collision with a real cell; skip this column
        return;
      }
      const entry = stack[0];
      grid[rowIdx][c] = entry.value;
      entry.remaining -= 1;
      if (entry.remaining <= 0) stack.shift();
      if (!stack.length) delete pending[key];
    });

    cells.forEach((cell) => put(cell.text, cell.colspan, cell.rowspan));

    // Materialise carries for columns that were not covered above.
    Object.keys(pending).forEach((key) => {
      const c = Number(key);
      const stack = pending[key];
      if (!stack || !stack.length) return;
      if (grid[rowIdx][c] === undefined) {
        const entry = stack[0];
        grid[rowIdx][c] = entry.value;
        entry.remaining -= 1;
        if (entry.remaining <= 0) stack.shift();
        if (!stack.length) delete pending[key];
      }
    });
  });

  return grid.map((r) => Array.from({ length: r.length }, (_, i) => r[i] ?? ""));
}

/** Pull the <title> and meta description for provenance. */
export function pageMeta(html = "") {
  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const desc = (html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || "";
  return { title: oneLine(title), description: oneLine(desc) };
}
