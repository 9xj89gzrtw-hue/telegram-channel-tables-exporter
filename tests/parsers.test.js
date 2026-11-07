import test from "node:test";
import assert from "node:assert/strict";

import { decodeEntities, extractTables, stripTags } from "../src/html.js";
import { normalizeChannel, parseChannelPage, parseCount } from "../src/telegram.js";
import { parseCsv } from "../src/tables.js";
import { classifySource } from "../src/run.js";
import { offerLine, OFFER } from "../src/offer.js";

test("entities: named, decimal and hex", () => {
  assert.equal(decodeEntities("A &amp; B &lt;tag&gt; &#36; &#x20AC; &nbsp;"), "A & B <tag> $ €  ");
});

test("stripTags: keeps text, drops scripts and turns <br> into newline", () => {
  const out = stripTags("<div>Hello<br>world</div><script>alert(1)</script>");
  assert.equal(out, "Hello\nworld");
});

test("telegram: normalizes every public link shape", () => {
  const shapes = [
    "https://t.me/ozon_chat",
    "http://t.me/s/ozon_chat",
    "t.me/ozon_chat",
    "@ozon_chat",
    "ozon_chat"
  ];
  for (const s of shapes) {
    assert.equal(normalizeChannel(s).username, "ozon_chat", s);
  }
  assert.equal(normalizeChannel("https://t.me/+AbCdEf").kind, "private-invite");
  assert.equal(normalizeChannel("not a channel!"), null);
});

test("telegram: counts with K/M suffixes and thin spaces", () => {
  assert.equal(parseCount("12.3K"), 12300);
  assert.equal(parseCount("1,2 млн"), 1200000);
  assert.equal(parseCount("54 428"), 54428);
  assert.equal(parseCount("54\u202f428"), 54428);
  assert.equal(parseCount(""), null);
});

const TG_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Durov">
<meta property="og:description" content="Public channel">
</head><body>
<div class="tgme_widget_message_wrap js-widget_message_wrap">
<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="durov/101">
  <div class="tgme_widget_message_text js-message_text" dir="auto">Hello <a href="https://example.com/x">world</a><br>second line</div>
  <a class="tgme_widget_message_date" href="https://t.me/durov/101"><time datetime="2026-11-06T18:20:00+00:00" class="datetime">18:20</time></a>
  <span class="tgme_widget_message_views">12.3K</span>
  <span class="tgme_widget_message_forwards">42</span>
  <span class="tgme_widget_message_replies">7</span>
  <div class="tgme_widget_message_reactions"><span class="tgme_reaction">👍 830</span><span class="tgme_reaction">🔥 12</span></div>
</div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap">
<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="durov/100">
  <div class="tgme_widget_message_text js-message_text">Older post</div>
  <a class="tgme_widget_message_date" href="https://t.me/durov/100"><time datetime="2026-11-05T10:00:00+00:00" class="datetime">10:00</time></a>
  <span class="tgme_widget_message_views">900</span>
</div></div>
</body></html>`;

test("telegram: parses posts, views, reactions and links", () => {
  const page = parseChannelPage(TG_HTML, "durov", "https://t.me/s/durov");
  assert.equal(page.title, "Durov");
  assert.equal(page.posts.length, 2);
  const post = page.posts[0];
  assert.equal(post.post_id, 101);
  assert.equal(post.views, 12300);
  assert.equal(post.forwards, 42);
  assert.equal(post.replies, 7);
  assert.equal(post.reactions_total, 842);
  assert.deepEqual(post.reactions[0], { reaction: "👍", count: 830 });
  assert.equal(post.links[0], "https://example.com/x");
  assert.match(post.text, /Hello world/);
  assert.equal(post.date, "2026-11-06T18:20:00+00:00");
});

const TABLE_HTML = `<html><head><title>GDP table</title></head><body>
<table>
<tr><th rowspan="2">Country</th><th colspan="2">GDP</th></tr>
<tr><th>2025</th><th>2026</th></tr>
<tr><td>Germany</td><td>4,456</td><td>4,700</td></tr>
<tr><td>France</td><td>3,100</td><td>3,200</td></tr>
</table>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
</body></html>`;

test("tables: expands rowspan/colspan and merges multi-row headers", () => {
  const tables = extractTables(TABLE_HTML);
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].headers, ["Country", "GDP 2025", "GDP 2026"]);
  assert.equal(tables[0].rowCount, 2);
  assert.deepEqual(tables[0].rows[0], {
    Country: "Germany",
    "GDP 2025": "4,456",
    "GDP 2026": "4,700"
  });
  assert.deepEqual(tables[1].rows[0], { A: "1", B: "2" });
});

test("csv: quotes, embedded commas and CRLF", () => {
  const rows = parseCsv('name,note\r\n"Smith, John","line 1\nline 2"\r\n"say ""hi""",ok\r\n');
  assert.deepEqual(rows, [
    ["name", "note"],
    ["Smith, John", "line 1\nline 2"],
    ['say "hi"', "ok"]
  ]);
});

test("sources: auto-classification", () => {
  assert.equal(classifySource("https://t.me/s/durov"), "telegram");
  assert.equal(classifySource("@durov"), "telegram");
  assert.equal(classifySource("durov"), "telegram");
  assert.equal(classifySource("https://en.wikipedia.org/wiki/Table"), "table");
  assert.equal(classifySource("https://example.com/data.csv"), "table");
});

test("offer: every record points at the same Pro product", () => {
  assert.equal(OFFER.code, "TW1-CLIP");
  assert.equal(OFFER.priceRub, 299);
  const line = offerLine();
  assert.match(line, /TW1-CLIP/);
  assert.match(line, /299 RUB/);
  assert.match(line, /plati\.market\/itm\/6354602/);
});
