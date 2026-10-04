// Cloudflare Pages Function: GET /api/tools
// Reads the "Tool Library" data source from Notion and returns a small JSON list
// the page can draw. The Notion token stays on the server (env.NOTION_TOKEN).

const NOTION_VERSION = "2025-09-03";
const DEFAULT_DATA_SOURCE_ID = "7a98a490-089a-4c67-9f26-e92d9bd8e0a4"; // 🧰 Tool Library
const CACHE_SECONDS = 60;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

const text = (prop) =>
  (prop?.title || prop?.rich_text || []).map((t) => t.plain_text).join("").trim();
const rel = (prop) => (prop?.relation || []).map((r) => r.id.replace(/-/g, ""));
const icon = (i) => {
  if (!i) return null;
  if (i.type === "external") return { url: i.external.url };
  if (i.type === "file") return { url: i.file.url };
  if (i.type === "emoji") return { emoji: i.emoji };
  return null;
};

export function toTool(page) {
  const p = page.properties || {};
  return {
    id: page.id.replace(/-/g, ""),
    name: text(p["Name"]),
    cat: p["Category"]?.select?.name || "Other",
    link: p["Link"]?.url || "",
    desc: text(p["What it does"]),
    price: p["Pricing"]?.select?.name || "",
    status: p["Status"]?.select?.name || "",
    tags: (p["Tags"]?.multi_select || []).map((t) => t.name),
    works: rel(p["Works with"]),
    alts: rel(p["Alternative to"]),
    icon: icon(page.icon),
    notion: page.url,
  };
}

async function fetchAll(env) {
  const id = env.NOTION_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE_ID;
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${id}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `Notion answered ${res.status}`);
      err.status = res.status;
      err.code = body.code;
      throw err;
    }
    const data = await res.json();
    pages.push(...data.results.filter((r) => r.object === "page" && !r.in_trash && !r.archived));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages.map(toTool).filter((t) => t.name);
}

export async function onRequestGet({ env, request, waitUntil }) {
  if (!env.NOTION_TOKEN) {
    return json({ error: "NOTION_TOKEN is not set in Cloudflare Pages → Settings → Variables and Secrets." }, 500);
  }

  const cache = caches.default;
  const key = new Request(new URL("/api/tools", request.url).toString());
  const fresh = new URL(request.url).searchParams.has("fresh");
  if (!fresh) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  try {
    const tools = await fetchAll(env);
    const res = json({ tools, updatedAt: new Date().toISOString() }, 200, {
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    const hint =
      e.status === 401 ? "The Notion token is wrong or was revoked. Create a new one and update NOTION_TOKEN." :
      e.status === 404 ? "Notion can't find the Tool Library. Share the database with your integration (••• → Connections)." :
      e.status === 429 ? "Notion is rate-limiting requests. Try again in a minute." :
      "Couldn't read from Notion right now.";
    return json({ error: hint, detail: e.message }, 502);
  }
}
