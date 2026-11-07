/**
 * Public Telegram channel reader.
 *
 * `https://t.me/s/<channel>` is Telegram's own no-login preview: it renders the
 * latest posts as plain HTML, including views, reactions and timestamps. Older
 * posts are reachable with `?before=<post_id>`, which is what the paginator
 * below uses. No account, api_id, session or browser is involved.
 */
import { attr, decodeEntities, extractLinks, oneLine, stripTags } from "./html.js";

export function normalizeChannel(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^(https?:\/\/)?(www\.)?t\.me\/\+/i.test(raw) || /joinchat/i.test(raw)) {
    return { kind: "private-invite", username: null, url: raw };
  }
  let value = raw
    .replace(/^https?:\/\/(www\.)?t\.me\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^s\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (!value || !/^[a-z0-9_]{3,64}$/i.test(value)) return null;
  return {
    kind: "channel",
    username: value,
    url: `https://t.me/s/${value}`
  };
}

export function parseCount(text) {
  const raw = String(text || "").replace(/\u00a0|\u202f/g, " ").trim();
  if (!raw) return null;
  const m = raw.match(/([\d\s.,]+)\s*([KkMmBb]|тыс|млн|mln)?/);
  if (!m) return null;
  let num = m[1].replace(/\s/g, "");
  // 12,345.6 / 12.345,6 / 12,3
  if (num.includes(",") && num.includes(".")) {
    num = num.lastIndexOf(",") > num.lastIndexOf(".") ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (num.includes(",")) {
    num = num.replace(",", ".");
  }
  let value = parseFloat(num);
  if (!Number.isFinite(value)) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (["k", "тыс"].includes(suffix)) value *= 1e3;
  if (["m", "млн", "mln"].includes(suffix)) value *= 1e6;
  if (suffix === "b") value *= 1e9;
  return Math.round(value);
}

function channelTitle(html) {
  const og = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (og) return decodeEntities(og[1]);
  const header = html.match(/class=["'][^"']*tgme_channel_info_header_title[^"']*["'][^>]*>([\s\S]*?)<\//i);
  return header ? oneLine(header[1]) : "";
}

function channelDescription(html) {
  const og = html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  return og ? decodeEntities(og[1]) : "";
}

function parseReactions(block) {
  const out = [];
  const wrap = block.match(/class=["'][^"']*tgme_widget_message_reactions[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!wrap) return out;
  const re = /<span\b[^>]*class=["'][^"']*tgme_reaction[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(wrap[1]))) {
    const text = oneLine(m[1]);
    if (!text) continue;
    const emoji = (text.match(/^([^\d\s]+)/) || [])[1] || "";
    const count = parseCount((text.match(/([\d\s.,]+[KkMm]?)\s*$/) || [])[1] || "");
    out.push({ reaction: emoji.trim(), count: count ?? 0 });
  }
  return out;
}

function parsePost(block, channel, htmlBase) {
  const dataPost = attr(block.slice(0, 400), "data-post") || "";
  const m = dataPost.match(/^([^/]+)\/(\d+)$/);
  if (!m) return null;
  const postId = Number(m[2]);
  const textMatch = block.match(/class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const text = textMatch ? stripTags(textMatch[1]) : "";
  const dateMatch = block.match(/<time\b[^>]*datetime=["']([^"']+)["']/i);
  const viewsMatch = block.match(/class=["'][^"']*tgme_widget_message_views[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const forwardsMatch = block.match(/class=["'][^"']*tgme_widget_message_forwards[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const repliesMatch = block.match(/class=["'][^"']*tgme_widget_message_replies[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const authorMatch = block.match(/class=["'][^"']*tgme_widget_message_author[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const media = /tgme_widget_message_(photo|video|document|voice|poll|sticker)/i.exec(block);
  const links = textMatch ? extractLinks(textMatch[1], `https://t.me/${channel}/${postId}`) : [];
  const reactions = parseReactions(block);

  return {
    _type: "post",
    channel,
    post_id: postId,
    url: `https://t.me/${channel}/${postId}`,
    date: dateMatch ? dateMatch[1] : null,
    text,
    text_length: text.length,
    views: parseCount(viewsMatch ? viewsMatch[1] : ""),
    forwards: parseCount(forwardsMatch ? forwardsMatch[1] : ""),
    replies: parseCount(repliesMatch ? repliesMatch[1] : ""),
    reactions,
    reactions_total: reactions.reduce((sum, r) => sum + (r.count || 0), 0),
    media_type: media ? media[1].toLowerCase() : null,
    author: authorMatch ? oneLine(authorMatch[1]) : null,
    links: links.map((l) => l.url).filter((u) => !/^https:\/\/t\.me\/(s\/)?[^/]+\/\d+$/.test(u)),
    source: "telegram",
    source_url: `${htmlBase}`
  };
}

/** Parse one preview page into posts (newest first). */
export function parseChannelPage(html, channel, sourceUrl) {
  const posts = [];
  const re = /<div\b[^>]*class=["'][^"']*tgme_widget_message\b[^"']*["'][^>]*data-post=["'][^"']+["'][^>]*>/gi;
  const starts = [];
  let m;
  while ((m = re.exec(html))) starts.push(m.index);
  for (let i = 0; i < starts.length; i += 1) {
    const block = html.slice(starts[i], starts[i + 1] ?? html.length);
    const post = parsePost(block, channel, sourceUrl);
    if (post) posts.push(post);
  }
  return {
    channel,
    title: channelTitle(html),
    description: channelDescription(html),
    posts
  };
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ApifyTableClipper/1.0; +https://apify.com)",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8"
      }
    });
    const text = await res.text();
    return { status: res.status, text, url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read up to `maxPosts` from a public channel. Telegram's preview exposes the
 * last ~20 posts per page, so we walk backwards with `?before=<min post id>`.
 */
export async function readChannel(input, { maxPosts = 100, timeoutMs = 20000, onPage } = {}) {
  const norm = normalizeChannel(input);
  if (!norm) {
    return { ok: false, error: "not a public channel link", input, posts: [] };
  }
  if (norm.kind === "private-invite") {
    return {
      ok: false,
      error: "private invite links (t.me/+hash) cannot be read without joining",
      input,
      posts: []
    };
  }

  const posts = [];
  const seen = new Set();
  let url = norm.url;
  let title = "";
  let description = "";
  let page = 0;

  while (posts.length < maxPosts && page < 20) {
    page += 1;
    const res = await fetchText(url, timeoutMs);
    if (res.status !== 200) {
      if (!posts.length) {
        return { ok: false, error: `HTTP ${res.status}`, input, posts: [] };
      }
      break;
    }
    const parsed = parseChannelPage(res.text, norm.username, url);
    if (page === 1) {
      title = parsed.title;
      description = parsed.description;
    }
    if (!parsed.posts.length) break;

    let added = 0;
    for (const post of parsed.posts) {
      if (seen.has(post.post_id)) continue;
      seen.add(post.post_id);
      posts.push(post);
      added += 1;
      if (posts.length >= maxPosts) break;
    }
    if (onPage) await onPage(parsed);
    if (!added) break;

    const minId = Math.min(...parsed.posts.map((p) => p.post_id));
    if (!Number.isFinite(minId) || minId <= 1) break;
    url = `${norm.url}?before=${minId}`;
    // Be polite to Telegram's public endpoint.
    await new Promise((r) => setTimeout(r, 350));
  }

  posts.sort((a, b) => b.post_id - a.post_id);
  return {
    ok: true,
    input,
    channel: norm.username,
    title,
    description,
    profile_url: `https://t.me/${norm.username}`,
    posts_read: posts.length,
    posts
  };
}
