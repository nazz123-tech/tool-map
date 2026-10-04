// Tool Map — draws the Notion Tool Library as a force-directed graph.
// Data comes from /api/tools (a Cloudflare Pages Function); snapshot.json is the fallback.

const CATS = ["AI app builders","AI image & video","Hosting & deploy","Domains & DNS","APIs & services","Dev tools",
  "AI agents & automation","Databases & storage","Design & UI","Student perks","Auth & logins","Other","Desktop apps","Learning"];
const catVar = c => `var(--c${Math.min(11, Math.max(0, CATS.indexOf(c))) + 1})`;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

let tools = [], byId = new Map(), edges = [], selected = null, activeCat = null, query = "";

function buildEdges() {
  byId = new Map(tools.map(t => [t.id, t]));
  const seen = new Set(); edges = [];
  for (const t of tools) for (const [type, list] of [["works", t.works], ["alt", t.alts]]) for (const o of list || []) {
    if (!byId.has(o) || o === t.id) continue;
    const k = type + ":" + [t.id, o].sort().join("|");
    if (seen.has(k)) continue; seen.add(k);
    edges.push({ source: t.id, target: o, type });
  }
}
function neighbors(id) {
  const w = new Set(), a = new Set();
  for (const e of edges) {
    const s = e.source.id ?? e.source, t = e.target.id ?? e.target;
    if (s === id || t === id) (e.type === "alt" ? a : w).add(s === id ? t : s);
  }
  return { works: [...w], alts: [...a] };
}

// ---------- graph ----------
const svg = d3.select("#graph");
const defs = svg.append("defs");
defs.append("clipPath").attr("id", "round").attr("clipPathUnits", "objectBoundingBox")
  .append("circle").attr("cx", .5).attr("cy", .5).attr("r", .5);
const root = svg.append("g");
const gLinks = root.append("g"), gNodes = root.append("g");
const zoom = d3.zoom().scaleExtent([0.3, 3]).on("zoom", e => root.attr("transform", e.transform));
svg.call(zoom).on("dblclick.zoom", null);
let sim, nodeSel, linkSel, fitted = false;

function anchors(w, h) {
  const used = CATS.filter(c => tools.some(t => t.cat === c));
  for (const t of tools) if (!used.includes(t.cat)) used.push(t.cat);
  const R = Math.min(w, h) * 0.34, m = new Map();
  used.forEach((c, i) => { const a = (i / used.length) * Math.PI * 2 - Math.PI / 2; m.set(c, [w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R]); });
  return m;
}

function render() {
  buildEdges();
  const { width: w, height: h } = svg.node().getBoundingClientRect();
  const anc = anchors(w || 800, h || 600);
  const prev = new Map((sim ? sim.nodes() : []).map(n => [n.id, n]));
  const nodes = tools.map(t => { const p = prev.get(t.id); const [ax, ay] = anc.get(t.cat) || [w / 2, h / 2];
    return Object.assign({}, t, p ? { x: p.x, y: p.y } : { x: ax + (Math.random() - .5) * 60, y: ay + (Math.random() - .5) * 60 }); });
  const deg = id => edges.filter(e => e.source === id || e.target === id).length;
  nodes.forEach(n => n.r = 19 + Math.min(deg(n.id), 6) * 2);

  if (sim) sim.stop();
  sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(d => d.id).distance(e => e.type === "alt" ? 115 : 95).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-360))
    .force("x", d3.forceX(d => (anc.get(d.cat) || [w / 2])[0]).strength(0.09))
    .force("y", d3.forceY(d => (anc.get(d.cat) || [0, h / 2])[1]).strength(0.09))
    .force("collide", d3.forceCollide(d => d.r + 22));

  linkSel = gLinks.selectAll("line").data(edges, e => e.type + (e.source.id ?? e.source) + (e.target.id ?? e.target))
    .join("line").attr("class", e => "link" + (e.type === "alt" ? " alt" : ""));

  nodeSel = gNodes.selectAll("g.node").data(nodes, d => d.id).join(enter => {
    const g = enter.append("g").attr("class", "node").attr("tabindex", 0).attr("role", "button");
    g.append("circle").attr("class", "halo");
    g.append("circle").attr("class", "ring");
    g.append("text").attr("class", "mono");
    g.append("image").attr("clip-path", "url(#round)").attr("preserveAspectRatio", "xMidYMid slice");
    g.append("text").attr("class", "lbl");
    return g;
  });
  nodeSel.attr("aria-label", d => d.name + ", " + d.cat);
  nodeSel.select(".halo").attr("r", d => d.r + 6);
  nodeSel.select(".ring").attr("r", d => d.r).style("stroke", d => catVar(d.cat));
  nodeSel.select(".mono")
    .text(d => d.icon?.emoji || d.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2))
    .style("font-size", d => d.icon?.emoji ? (d.r * 0.95) + "px" : null)
    .attr("display", d => d.icon?.url ? "none" : null);
  nodeSel.select("image").each(function (d) {
    const img = d3.select(this), s = (d.r - 4) * 2;
    if (!d.icon?.url) { img.attr("display", "none"); return; }
    img.attr("display", null).attr("href", d.icon.url).attr("x", -s / 2).attr("y", -s / 2).attr("width", s).attr("height", s)
      .on("error", () => { img.attr("display", "none"); d3.select(this.parentNode).select(".mono").attr("display", null); });
  });
  nodeSel.select(".lbl").attr("y", d => d.r + 16).text(d => d.name);
  nodeSel.on("click", (e, d) => { e.stopPropagation(); select(d.id); })
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d.id); } })
    .call(d3.drag()
      .on("start", (e, d) => { if (!e.active && !reduce) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; if (reduce) { d.x = e.x; d.y = e.y; tick(); } })
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  function tick() {
    linkSel.attr("x1", e => e.source.x).attr("y1", e => e.source.y).attr("x2", e => e.target.x).attr("y2", e => e.target.y);
    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
  }
  if (reduce) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); tick(); if (!fitted) { fit(false); fitted = true; } }
  else { sim.on("tick", tick).on("end", () => { if (!fitted) { fit(true); fitted = true; } }); for (let i = 0; i < 120; i++) sim.tick(); tick(); if (!fitted) fit(false); }

  document.getElementById("count").textContent = tools.length + " tools.";
  if (!selected || !byId.has(selected)) {
    const hub = [...tools].sort((a, b) => neighbors(b.id).works.length - neighbors(a.id).works.length)[0];
    selected = hub ? hub.id : null;
  }
  buildChips(); applyFocus(); renderPanel();
}

function fit(animate) {
  const ns = sim ? sim.nodes() : []; if (!ns.length) return;
  const { width: w, height: h } = svg.node().getBoundingClientRect();
  const x0 = d3.min(ns, d => d.x - d.r - 40), x1 = d3.max(ns, d => d.x + d.r + 40);
  const y0 = d3.min(ns, d => d.y - d.r - 20), y1 = d3.max(ns, d => d.y + d.r + 40);
  const k = Math.min(1.4, 0.95 * Math.min(w / (x1 - x0), h / (y1 - y0)));
  const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  (animate && !reduce ? svg.transition().duration(600) : svg).call(zoom.transform, t);
}

function applyFocus() {
  if (!nodeSel) return;
  const q = query.trim().toLowerCase();
  const nb = selected ? neighbors(selected) : null;
  const near = nb ? new Set([selected, ...nb.works, ...nb.alts]) : null;
  nodeSel.classed("hidden-cat", d => activeCat && d.cat !== activeCat)
    .classed("sel", d => d.id === selected)
    .classed("dim", d => q ? !d.name.toLowerCase().includes(q) : (near ? !near.has(d.id) : false));
  linkSel.classed("hidden-cat", e => activeCat && (e.source.cat !== activeCat || e.target.cat !== activeCat))
    .classed("dim", e => q ? true : (selected ? (e.source.id !== selected && e.target.id !== selected) : false));
}

function select(id) { selected = selected === id ? null : id; applyFocus(); renderPanel(); }
svg.on("click", () => { if (selected) { selected = null; applyFocus(); renderPanel(); } });

// ---------- chips / search ----------
function buildChips() {
  const box = document.getElementById("chips"); box.textContent = "";
  const mk = (label, cat, n) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip";
    b.setAttribute("aria-pressed", String(activeCat === cat));
    if (cat) { const i = document.createElement("i"); i.style.background = catVar(cat); b.append(i); }
    b.append(label);
    if (n != null) { const s = document.createElement("span"); s.className = "n"; s.textContent = n; b.append(s); }
    b.onclick = () => { activeCat = activeCat === cat ? null : cat; buildChips(); applyFocus(); };
    box.append(b);
  };
  mk("All", null, null);
  const cats = [...new Set([...CATS, ...tools.map(t => t.cat)])];
  for (const c of cats) { const n = tools.filter(t => t.cat === c).length; if (n) mk(c, c, n); }
}
document.getElementById("search").addEventListener("input", e => {
  query = e.target.value; applyFocus();
  const q = query.trim().toLowerCase();
  if (q) { const hit = tools.filter(t => t.name.toLowerCase().includes(q)); if (hit.length === 1) { selected = hit[0].id; renderPanel(); } }
});

// ---------- side panel ----------
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function relBlock(title, ids, alt) {
  const wrap = el("div", "rel"); const h = el("h3");
  h.innerHTML = `<svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" class="link${alt ? " alt" : ""}"/></svg>`;
  h.append(title); wrap.append(h);
  if (!ids.length) { wrap.append(el("p", "none", alt ? "No alternatives saved yet." : "No connections saved yet.")); return wrap; }
  const ul = el("ul");
  for (const id of ids) { const t = byId.get(id); if (!t) continue;
    const b = el("button"); b.type = "button"; const i = el("i"); i.style.background = catVar(t.cat); b.append(i, t.name);
    b.onclick = () => { selected = id; applyFocus(); renderPanel(); };
    const li = el("li"); li.append(b); ul.append(li); }
  wrap.append(ul); return wrap;
}
function renderPanel() {
  const p = document.getElementById("panel"); p.textContent = "";
  const t = selected && byId.get(selected);
  if (!t) {
    p.append(el("span", "cat-tag", "Overview"), el("h2", null, "Pick a tool"),
      el("p", null, "Click any circle to see what it does, what it pairs with, and what could replace it. Drag circles to rearrange, scroll or pinch to zoom."));
    const best = [...tools].sort((a, b) => neighbors(b.id).works.length - neighbors(a.id).works.length).slice(0, 5).map(x => x.id);
    p.append(relBlock("Most connected", best, false));
    return;
  }
  const head = el("div", "head");
  if (t.icon?.url) { const img = el("img"); img.src = t.icon.url; img.alt = ""; img.onerror = () => img.remove(); head.append(img); }
  else if (t.icon?.emoji) head.append(el("span", "em", t.icon.emoji));
  const titles = el("div"); const tag = el("span", "cat-tag"); const i = el("i"); i.style.background = catVar(t.cat); tag.append(i, t.cat);
  titles.append(tag, el("h2", null, t.name)); head.append(titles);
  const pills = el("div", "pills"); for (const v of [t.price, t.status]) if (v) pills.append(el("span", "pill", v));
  const links = el("div", "links");
  if (t.link) { const a = el("a", null, "Open website ↗"); a.href = t.link; a.target = "_blank"; a.rel = "noopener"; links.append(a); }
  const nb = neighbors(t.id);
  p.append(head);
  if (t.desc) p.append(el("p", null, t.desc));
  p.append(pills, links, relBlock("Works with", nb.works, false), relBlock("Alternative to", nb.alts, true));
}

// ---------- zoom buttons ----------
document.getElementById("zin").onclick = () => svg.transition().duration(reduce ? 0 : 250).call(zoom.scaleBy, 1.3);
document.getElementById("zout").onclick = () => svg.transition().duration(reduce ? 0 : 250).call(zoom.scaleBy, 1 / 1.3);
document.getElementById("zfit").onclick = () => fit(true);
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => fit(false), 150); });

// ---------- data ----------
function setStatus(kind, text) {
  document.getElementById("dot").className = "dot" + (kind ? " " + kind : "");
  document.getElementById("statusText").textContent = text;
}
const fmt = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
let lastKey = "";
function use(list) {
  const key = JSON.stringify(list);
  if (key === lastKey) return;
  lastKey = key; tools = list; render();
}
async function load(fresh) {
  try {
    const res = await fetch("/api/tools" + (fresh ? "?fresh=1" : ""), { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || !Array.isArray(body.tools)) throw new Error(body.error || "Couldn't read from Notion.");
    use(body.tools);
    setStatus("live", "Live from Notion · updated " + fmt(body.updatedAt));
  } catch (e) {
    if (!tools.length) {
      try { const snap = await (await fetch("/snapshot.json")).json(); use(snap.tools); } catch {}
      setStatus("warn", (e.message || "Couldn't reach Notion.") + " Showing a saved copy.");
    } else {
      setStatus("warn", (e.message || "Couldn't reach Notion.") + " Showing the last loaded data.");
    }
  }
}
document.getElementById("refresh").onclick = () => { setStatus("", "Refreshing…"); load(true); };
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
load(false);
