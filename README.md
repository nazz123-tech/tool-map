# Tool Map

An interactive graph of my Notion **Tool Library**: every tool is a node, solid lines mean
"works with", dashed lines mean "alternative to". Hosted on Cloudflare Pages.

## How it works

```
Browser ──► public/index.html + app.js   (static page, draws the graph with d3)
   │
   └─► GET /api/tools ──► functions/api/tools.js ──► Notion API (data source query)
                           (Cloudflare Pages Function; keeps NOTION_TOKEN secret,
                            caches the answer for 60 s)
```

If Notion can't be reached, the page falls back to `public/snapshot.json`.

Everything is edited in Notion. Add a tool, set its Category, logo (page icon),
"Works with" and "Alternative to", and the site shows it within a minute.

## Setup

### 1. Give the site read access to Notion
1. Go to <https://www.notion.so/profile/integrations> → **New integration**.
2. Name it `Tool Map`, pick your workspace, type **Internal**. Save.
3. Under **Capabilities**, keep only **Read content**. Copy the **Internal Integration Secret** (starts with `ntn_`).
4. Open the **🧰 Tool Library** database in Notion → **•••** (top right) → **Connections** → add **Tool Map**.

### 2. Deploy on Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repo.
2. Build settings: Framework preset **None**, build command empty, build output directory `public`.
3. **Settings → Variables and Secrets** → add a **Secret** named `NOTION_TOKEN` with the secret from step 1
   (for Production, and Preview if you want previews to work).
4. Redeploy once so the secret is picked up. The site is at `https://<project>.pages.dev`.

Optional: `NOTION_DATA_SOURCE_ID` overrides which Notion data source is read
(default is the Tool Library: `7a98a490-089a-4c67-9f26-e92d9bd8e0a4`).

### Run locally
```
echo 'NOTION_TOKEN=ntn_...' > .dev.vars
npx wrangler pages dev
```

## Troubleshooting
The status line at the top right of the page says what's wrong:
- *NOTION_TOKEN is not set* → step 2.3, then redeploy.
- *Notion can't find the Tool Library* → step 1.4 (connect the integration to the database).
- *The Notion token is wrong* → make a new secret and update `NOTION_TOKEN`.
