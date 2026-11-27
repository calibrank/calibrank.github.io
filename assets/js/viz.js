// Shared helpers for the figures: labels, palette, controls, tooltip, legend, table view.
// D3 is loaded as a classic script (assets/js/lib/d3/d3.min.js) and read from window.

export const d3 = window.d3;

export const SOURCES = ["wikitext2", "c4", "slimpajama", "alpaca", "selfgen", "selfdoc"];
export const SRC = {
  wikitext2: "WikiText-2", c4: "C4", slimpajama: "SlimPajama", alpaca: "Alpaca",
  selfgen: "Self (seq.)", selfdoc: "Self (doc.)",
};
export const SRC_LONG = {
  wikitext2: "WikiText-2", c4: "C4", slimpajama: "SlimPajama", alpaca: "Alpaca",
  selfgen: "Self-generated sequences", selfdoc: "Self-generated documents",
};
export const MODELS = ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b", "llama-3.1-8b"];
export const MODEL = {
  "opt-1.3b": "OPT-1.3B", "llama-3.2-1b": "Llama-3.2-1B", "qwen3-1.7b": "Qwen3-1.7B",
  "llama-3.1-8b": "Llama-3.1-8B", "llama-3.2-1b-it": "Llama-3.2-1B-Instruct",
};
export const KLSETS = ["wikitext2", "c4", "slimpajama", "alpaca", "selfgen"];
export const KLSET = { wikitext2: "WikiText-2", c4: "C4", slimpajama: "SlimPajama", alpaca: "Alpaca", selfgen: "Self" };
export const NEWDOM = ["dolly", "gsm8k", "pubmedqa", "mbpp", "opus", "pg19"];
export const NEWDOM_LABEL = {
  dolly: "Dolly", gsm8k: "GSM8K", pubmedqa: "PubMedQA", mbpp: "MBPP", opus: "OPUS-100", pg19: "PG-19",
};
export const NEWDOM_LONG = {
  dolly: "human-written instructions (Dolly-15k)", gsm8k: "grade-school math (GSM8K)",
  pubmedqa: "biomedical abstracts (PubMedQA)", mbpp: "Python programs (MBPP)",
  opus: "eight non-English languages (OPUS-100)", pg19: "19th-century books (PG-19)",
};
export const SP_DOMAINS = ["cc", "c4", "github", "book", "arxiv", "wiki", "stack"];
export const SP_DOMAIN = {
  cc: "CommonCrawl", c4: "C4", github: "GitHub", book: "Books", arxiv: "arXiv",
  wiki: "Wikipedia", stack: "StackExchange",
};
export const TASKS = ["arc_easy", "arc_challenge", "piqa", "hellaswag", "winogrande", "openbookqa", "boolq"];
export const TASK = {
  arc_easy: "ARC-Easy", arc_challenge: "ARC-Challenge", piqa: "PIQA", hellaswag: "HellaSwag",
  winogrande: "WinoGrande", openbookqa: "OpenBookQA", boolq: "BoolQ",
};
export const RATIO = { r30: "−30%", r50: "−50%" };

export const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const dur = (ms) => (REDUCED ? 0 : ms);

// ---------------------------------------------------------------- color

export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
export function srcColor(key) {
  return cssVar(`--s-${key}`) || cssVar("--ink");
}
export function inkFor(hex) {
  // near-black or white text inside a fill, by luminance (APCA-ish threshold)
  const c = d3.color(hex);
  if (!c) return "#0b0b0b";
  const { r, g, b } = c.rgb();
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.36 ? "#0b0b0b" : "#ffffff";
}
export const BLUES = ["--q100", "--q150", "--q200", "--q250", "--q300", "--q350", "--q400", "--q450",
  "--q500", "--q550", "--q600", "--q650", "--q700"];
export function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}
// The sequential blue ramp, from "near zero" to "far". Its anchor flips in dark mode, so
// that small values recede toward the dark surface instead of glowing.
export function blueRamp() {
  const r = BLUES.map((v) => cssVar(v));
  return isDark() ? r.reverse() : r;
}
// Sequential scale over [lo, hi] on a log axis, discrete steps of the blue ramp.
export function seqLog(lo, hi, from = 0, to = 12) {
  const ramp = blueRamp().slice(from, to + 1);
  const s = d3.scaleLog().domain([lo, hi]).range([0, ramp.length - 1]).clamp(true);
  return (v) => ramp[Math.round(s(v))];
}

export function symbolType(src) {
  return {
    wikitext2: d3.symbolCircle, c4: d3.symbolSquare, slimpajama: d3.symbolTriangle,
    alpaca: d3.symbolDiamond, selfgen: d3.symbolTriangle, selfdoc: d3.symbolCross,
  }[src] || d3.symbolCircle;
}
export function symbolPath(src, size = 64) {
  return d3.symbol(symbolType(src), size)();
}
export const symbolRotate = (src) => (src === "selfgen" ? 180 : 0);

// ---------------------------------------------------------------- format

export function fmtPpl(v) {
  if (v == null || Number.isNaN(v)) return "–";
  if (v >= 10000) return d3.format(",.0f")(v);
  if (v >= 100) return d3.format(".0f")(v);
  return d3.format(".1f")(v);
}
export function fmtX(v) {
  if (v == null) return "–";
  if (v >= 1000) return `${d3.format(",.0f")(v)}×`;
  if (v >= 100) return `${d3.format(".0f")(v)}×`;
  if (v >= 10) return `${d3.format(".1f")(v)}×`;
  return `${d3.format(".2f")(v)}×`;
}
export const f1 = d3.format(".1f");
export const f2 = d3.format(".2f");
export const f3 = d3.format(".3f");
export function signed(v, nd = 1) {
  const s = d3.format(`.${nd}f`)(Math.abs(v));
  return (v < 0 && s !== d3.format(`.${nd}f`)(0) ? "−" : v < 0 ? "−" : "+") + s;
}
export function minus(s) {
  return String(s).replace(/^-/, "−");
}

// Log-axis ticks: 1, 2, 5 × 10^k inside the domain, thinned to at most `max` ticks.
export function logTicks(domain, max = 7) {
  const [lo, hi] = domain;
  const out = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  if (out.length <= max) return out;
  const ones = out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  if (ones.length >= 2 && ones.length <= max) return ones;
  const step = Math.ceil(ones.length / max);
  return ones.filter((_, i) => i % step === 0);
}
export function tickFmt(v) {
  if (v >= 10000) return d3.format(",.0f")(v);
  if (v >= 1) return d3.format("~g")(v);
  return d3.format("~g")(v);
}

// ---------------------------------------------------------------- DOM

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

// A radio group of pill buttons. Arrow keys move the selection.
export function segmented(parent, { label, options, value, onChange, name }) {
  const wrap = el("div", { class: "control" });
  if (label) wrap.append(el("span", { class: "control-label", text: label }));
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": name || label || "" });
  const buttons = new Map();
  let current = value;
  const set = (v, fire = true) => {
    current = v;
    for (const [k, b] of buttons) {
      b.setAttribute("aria-checked", String(k === v));
      b.tabIndex = k === v ? 0 : -1;
    }
    if (fire) onChange?.(v);
  };
  options.forEach((o) => {
    const opt = typeof o === "string" ? { value: o, label: o } : o;
    const b = el("button", { type: "button", role: "radio", "aria-checked": "false", title: opt.title || null },
      opt.label);
    if (opt.disabled) b.disabled = true;
    b.addEventListener("click", () => { if (current !== opt.value) set(opt.value); });
    b.addEventListener("keydown", (e) => {
      const keys = [...buttons.keys()].filter((k) => !buttons.get(k).disabled);
      const i = keys.indexOf(current);
      let j = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % keys.length;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + keys.length) % keys.length;
      if (j != null) { e.preventDefault(); set(keys[j]); buttons.get(keys[j]).focus(); }
    });
    buttons.set(opt.value, b);
    seg.append(b);
  });
  wrap.append(seg);
  parent.append(wrap);
  set(value, false);
  return {
    get value() { return current; },
    set: (v, fire = false) => set(v, fire),
    disable(v, off) { const b = buttons.get(v); if (b) b.disabled = off; },
    node: wrap,
  };
}

// ---------------------------------------------------------------- tooltip

let tipNode = null;
function tipEl() {
  if (!tipNode) {
    tipNode = el("div", { class: "tooltip", role: "status", "aria-live": "polite" });
    document.body.append(tipNode);
  }
  return tipNode;
}
// rows: [{label, value, color}] ; values lead (bold), labels follow
export function showTip(evt, { title, sub, rows = [], note }) {
  const t = tipEl();
  t.replaceChildren();
  if (title) t.append(el("div", { class: "tt-title", text: title }));
  if (sub) t.append(el("div", { class: "tt-sub", text: sub }));
  for (const r of rows) {
    const k = el("span", { class: "k" });
    if (r.color) k.append(el("span", { class: "key", style: `background:${r.color}` }));
    k.append(document.createTextNode(r.label));
    t.append(el("div", { class: "tt-row" }, k, el("span", { class: "v", text: r.value })));
  }
  if (note) t.append(el("div", { class: "tt-note", text: note }));
  placeTip(evt);
  t.classList.add("show");
}
export function placeTip(evt) {
  const t = tipEl();
  let x, y;
  if (evt && evt.clientX != null && !(evt.type === "focus" || evt.type === "focusin")) {
    x = evt.clientX; y = evt.clientY;
  } else if (evt?.target?.getBoundingClientRect) {
    const r = evt.target.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top;
  } else { x = 0; y = 0; }
  const pad = 14;
  const w = t.offsetWidth || 220, h = t.offsetHeight || 80;
  let left = x + pad, top = y + pad;
  if (left + w > window.innerWidth - 8) left = x - w - pad;
  if (top + h > window.innerHeight - 8) top = y - h - pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}
export function hideTip() {
  tipEl().classList.remove("show");
}
// Attach hover and keyboard-focus tooltips to a d3 selection of marks.
export function tipOn(sel, content) {
  sel.attr("tabindex", 0)
    .on("pointerenter pointermove", function (e, d) { showTip(e, content(d, this)); })
    .on("pointerleave blur", hideTip)
    .on("focus", function (e, d) { showTip(e, content(d, this)); });
}

// ---------------------------------------------------------------- legend

// items: [{key, label, color, kind: 'symbol'|'line'|'rect'}]
export function legend(parent, items, { onHover, onToggle, interactive = true } = {}) {
  const box = el("div", { class: "legend", role: interactive ? "group" : null });
  for (const it of items) {
    const svg = d3.create("svg").attr("width", 14).attr("height", 14).attr("aria-hidden", "true");
    if (it.kind === "line") {
      svg.append("line").attr("x1", 1).attr("x2", 13).attr("y1", 7).attr("y2", 7)
        .style("stroke", SOURCES.includes(it.key) ? `var(--s-${it.key})` : it.color).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    } else if (it.kind === "rect") {
      svg.append("rect").attr("x", 1).attr("y", 1).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", it.color);
    } else {
      svg.append("path").attr("d", symbolPath(it.key, 70)).style("fill", SOURCES.includes(it.key) ? `var(--s-${it.key})` : it.color)
        .attr("transform", `translate(7,7) rotate(${symbolRotate(it.key)})`);
    }
    const b = el(interactive ? "button" : "span",
      { class: `legend-item${interactive ? "" : " legend-static"}`, type: interactive ? "button" : null });
    b.append(svg.node(), it.label);
    if (interactive) {
      b.addEventListener("pointerenter", () => onHover?.(it.key));
      b.addEventListener("pointerleave", () => onHover?.(null));
      b.addEventListener("focus", () => onHover?.(it.key));
      b.addEventListener("blur", () => onHover?.(null));
      if (onToggle) {
        b.setAttribute("aria-pressed", "true");
        b.addEventListener("click", () => {
          const on = b.getAttribute("aria-pressed") !== "true";
          b.setAttribute("aria-pressed", String(on));
          b.classList.toggle("off", !on);
          onToggle(it.key, on);
        });
      }
    }
    box.append(b);
  }
  parent.append(box);
  return box;
}

// ---------------------------------------------------------------- figure shell

export function parts(fig) {
  return {
    controls: fig.querySelector(".controls"),
    body: fig.querySelector(".fig-body"),
    tools: fig.querySelector(".fig-tools"),
    foot: fig.querySelector(".fig-foot"),
  };
}

// Adds a "Table" toggle that shows the data behind the chart; build() -> {columns, rows, caption}
export function tableView(fig, build) {
  const { tools, body } = parts(fig);
  const id = `${fig.id || "fig"}-table`;
  const btn = el("button", { type: "button", class: "linkbtn", "aria-expanded": "false", "aria-controls": id }, "Table");
  const wrap = el("div", { class: "table-wrap", id, hidden: true });
  body.after(wrap);
  const render = () => {
    const { columns, rows, caption, best } = build();
    wrap.replaceChildren(renderTable(columns, rows, caption, best));
  };
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    wrap.hidden = !open;
    if (open) render();
  });
  tools?.prepend(btn);
  return { refresh: () => { if (!wrap.hidden) render(); } };
}

export function renderTable(columns, rows, caption, best) {
  const t = el("table", { class: "data" });
  if (caption) t.append(el("caption", { text: caption }));
  const thead = el("thead");
  thead.append(el("tr", {}, columns.map((c) => el("th", { scope: "col", text: c }))));
  const tbody = el("tbody");
  rows.forEach((r, i) => {
    tbody.append(el("tr", {}, r.map((c, j) => {
      const isBest = best && best(i, j);
      return el(j === 0 ? "th" : "td", { scope: j === 0 ? "row" : null, class: isBest ? "best" : null, text: c });
    })));
  });
  t.append(thead, tbody);
  return t;
}

// Responsive width: calls render(width) now and whenever the container width changes.
export function responsive(node, render) {
  let last = 0;
  let raf = 0;
  const run = () => {
    const w = Math.round(node.getBoundingClientRect().width);
    if (w > 0 && w !== last) { last = w; render(w); }
  };
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
  ro.observe(node);
  run();
  document.addEventListener("themechange", () => { last = 0; run(); });
  return { rerender: () => { last = 0; run(); } };
}

export function svgIn(container, width, height, label) {
  container.replaceChildren();
  return d3.select(container).append("svg")
    .attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img").attr("aria-label", label || "");
}

export function ensure(container, selector, make) {
  let n = container.querySelector(selector);
  if (!n) { n = make(); container.append(n); }
  return n;
}

// Seeded PRNG (mulberry32), for deterministic synthetic data.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const geoMean = (xs) => Math.exp(d3.mean(xs, (x) => Math.log(x)));
