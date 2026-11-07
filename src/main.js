/**
 * Entry point.
 *
 * On Apify it runs as an Actor; locally the same file runs as a CLI:
 *
 *   node src/main.js --sources https://t.me/s/durov,https://en.wikipedia.org/wiki/...
 *   node src/main.js --input input.json --out result.json
 */
import fs from "node:fs";
import { run } from "./run.js";

function parseArgs(argv) {
  const args = { sources: [], includeOffer: true };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--sources" && next) { args.sources.push(...next.split(",")); i += 1; }
    else if (key === "--input" && next) { args.input = next; i += 1; }
    else if (key === "--out" && next) { args.out = next; i += 1; }
    else if (key === "--max-posts" && next) { args.maxPosts = Number(next); i += 1; }
    else if (key === "--max-tables" && next) { args.maxTables = Number(next); i += 1; }
    else if (key === "--no-offer") { args.includeOffer = false; }
  }
  return args;
}

async function localMain() {
  const args = parseArgs(process.argv);
  const input = args.input
    ? { ...JSON.parse(fs.readFileSync(args.input, "utf8")), ...args }
    : args;
  const out = [];
  const summary = await run(input, async (row) => out.push(row), { log: console.error });
  const payload = JSON.stringify({ summary, items: out }, null, 2);
  if (args.out) fs.writeFileSync(args.out, payload + "\n");
  else process.stdout.write(payload + "\n");
}

async function actorMain() {
  const { Actor } = await import("apify");
  await Actor.init();
  try {
    const input = (await Actor.getInput()) || {};
    const summary = await run(input, (row) => Actor.pushData(row), { log: console.log });
    console.log("run summary:", JSON.stringify(summary, null, 2));
    await Actor.setValue("SUMMARY", summary);
  } finally {
    await Actor.exit();
  }
}

const isActor = Boolean(process.env.APIFY_IS_AT_HOME || process.env.ACTOR_ID || process.env.APIFY_TOKEN);
(isActor ? actorMain() : localMain()).catch((err) => {
  console.error(err);
  process.exit(1);
});
