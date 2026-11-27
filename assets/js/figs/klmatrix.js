// Figure 3 / A2 and Tables 5, 6, A5: divergence from the dense model on held-out text of
// every source (and six independent domains), and which source is the most uniformly
// faithful under weights the reader chooses.
import {
  d3, SOURCES, SRC, MODEL, MODELS, KLSETS, KLSET, NEWDOM, NEWDOM_LABEL, NEWDOM_LONG, srcColor, segmented,
  parts, responsive, svgIn, tipOn, tableView, el, cssVar, inkFor, blueRamp, rng,
} from "../viz.js";

const SETNAME = { ...KLSET, ...NEWDOM_LABEL };
const SETLONG = {
  wikitext2: "WikiText-2 test", c4: "C4 validation", slimpajama: "SlimPajama validation",
  alpaca: "held-out Alpaca examples", selfgen: "exact samples of the dense model", ...NEWDOM_LONG,
};

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let mode = "main", model = "llama-3.2-1b", ratio = "r50";
  let preset = "five";
  let weights = {};

  const modeSeg = segmented(controls, { label: "Data", value: mode,
    options: [{ value: "main", label: "Main grid, seed 0" }, { value: "seeds", label: "Three seeds + 6 new domains" }],
    onChange: (v) => {
      mode = v;
      modelSeg.disable("llama-3.1-8b", v === "main");
      if (v === "main" && model === "llama-3.1-8b") { model = "llama-3.2-1b"; modelSeg.set(model); }
      if (v === "main" && (preset === "domains" || preset === "all")) preset = "five";
      setPreset(preset); renderAll();
    } });
  const modelSeg = segmented(controls, { label: "Model", value: model,
    options: MODELS.map((m) => ({ value: m, label: MODEL[m] })), onChange: (v) => { model = v; renderAll(); } });
  modelSeg.disable("llama-3.1-8b", true);
  segmented(controls, { label: "Ratio", value: ratio, options: [{ value: "r30", label: "−30%" }, { value: "r50", label: "−50%" }],
    onChange: (v) => { ratio = v; renderAll(); } });

  const layout = el("div", { class: "kl-layout" });
  const heat = el("div");
  const side = el("div", { class: "weights" });
  layout.append(heat, side);
  body.replaceChildren(layout);

  const sets = () => (mode === "main" ? KLSETS : KLSETS.concat(NEWDOM));
  function matrix() {
    if (mode === "main") return P.kl.main[model]?.[ratio];
    return P.kl.seeds[model]?.[ratio]?.kl;
  }
  const best = (M, t) => d3.min(SOURCES, (s) => M[s]?.[t]);

  // ---------------------------------------------------------- weights panel
  const presetBox = el("div", { class: "presets" });
  const sliderBox = el("div");
  const rankBox = el("div", { class: "rank" });
  const randBox = el("p", { class: "muted", style: "margin:10px 0 0;font-size:12.5px;line-height:1.5" });
  side.append(el("h4", {}, "Which source is the most uniformly faithful?"),
    el("p", { class: "muted", style: "margin:0;font-size:12.5px;line-height:1.5" },
      "Weigh the held-out sets you care about. Each source is scored by the weighted geometric mean of its divergence relative to the best source for each set (1 = the best on every set)."),
    presetBox, sliderBox, rankBox, randBox);

  const PRESETS = [
    { key: "five", label: "Five held-out sets", w: (t) => (KLSETS.includes(t) ? 1 : 0) },
    { key: "real", label: "Four real sets", w: (t) => (KLSETS.slice(0, 4).includes(t) ? 1 : 0) },
    { key: "domains", label: "Six new domains", w: (t) => (NEWDOM.includes(t) ? 1 : 0), seedsOnly: true },
    { key: "all", label: "All eleven", w: () => 1, seedsOnly: true },
  ];
  function setPreset(k) {
    preset = k;
    const p = PRESETS.find((x) => x.key === k);
    if (p) for (const t of KLSETS.concat(NEWDOM)) weights[t] = p.w(t);
  }
  setPreset("five");

  function renderPresets() {
    presetBox.replaceChildren(...PRESETS.filter((p) => !p.seedsOnly || mode === "seeds").map((p) => {
      const b = el("button", { type: "button", class: "linkbtn", "aria-expanded": String(preset === p.key) }, p.label);
      b.addEventListener("click", () => { setPreset(p.key); renderSide(); });
      return b;
    }));
  }

  function renderSliders() {
    sliderBox.replaceChildren(...sets().map((t) => {
      const id = `w-${fig.id}-${t}`;
      const input = el("input", { type: "range", min: "0", max: "4", step: "1", value: String(weights[t] ?? 0), id });
      const out = el("output", { for: id, text: String(weights[t] ?? 0) });
      input.addEventListener("input", () => {
        weights[t] = +input.value; out.textContent = input.value; preset = "custom";
        renderPresets(); renderRank();
      });
      return el("div", { class: "wrow" }, el("label", { for: id, title: SETLONG[t], text: SETNAME[t] }), input, out);
    }));
  }

  function scores(M, w) {
    const ts = sets().filter((t) => (w[t] ?? 0) > 0);
    const tot = d3.sum(ts, (t) => w[t]);
    if (!ts.length || !tot) return null;
    return SOURCES.filter((s) => M[s]).map((s) => ({
      s, v: Math.exp(d3.sum(ts, (t) => w[t] * Math.log(M[s][t] / best(M, t))) / tot),
    })).sort((a, b) => a.v - b.v);
  }

  function renderRank() {
    const M = matrix();
    rankBox.replaceChildren();
    randBox.textContent = "";
    if (!M) return;
    const sc = scores(M, weights);
    if (!sc) { rankBox.append(el("p", { class: "muted" }, "Give at least one set a weight.")); return; }
    const vmax = d3.max(sc, (d) => Math.log(d.v)) || 1;
    sc.forEach((d, i) => {
      rankBox.append(el("div", { class: `rank-row${i === 0 ? " first" : ""}` },
        el("span", { class: "nm" }, el("span", { class: "sw", style: `--c:var(--s-${d.s})` }), SRC[d.s]),
        el("div", {}, el("div", { class: "rank-bar", style: `width:${Math.max(2, 100 * Math.log(d.v) / vmax)}%;background:var(--s-${d.s})` })),
        el("span", { class: "vv", text: `${d.v.toFixed(2)}×` })));
    });
    // random weightings over the selected sets (the paper's analysis: 5000 Dirichlet(1) draws)
    const ts = sets().filter((t) => (weights[t] ?? 0) > 0);
    if (ts.length < 2) return;
    let p;
    const paper = P.uniform?.[model]?.[ratio]?.p_best_dirichlet;
    const isFive = mode === "seeds" && ts.length === 5 && KLSETS.every((t) => ts.includes(t));
    if (isFive && paper) p = paper;
    else {
      const r = rng(2026);
      const wins = Object.fromEntries(SOURCES.map((s) => [s, 0]));
      const L = SOURCES.filter((s) => M[s]).map((s) => ({ s, l: ts.map((t) => Math.log(M[s][t] / best(M, t))) }));
      for (let k = 0; k < 5000; k++) {
        const e = ts.map(() => -Math.log(1 - r()));
        let bi = null, bv = Infinity;
        for (const row of L) {
          const v = d3.sum(row.l, (x, j) => x * e[j]);
          if (v < bv) { bv = v; bi = row.s; }
        }
        wins[bi]++;
      }
      p = Object.fromEntries(Object.entries(wins).map(([s, n]) => [s, n / 5000]));
    }
    const top = Object.entries(p).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0).slice(0, 3);
    randBox.append(`With random weights on these ${ts.length} sets, `,
      el("strong", { text: SRC[top[0][0]] }), ` ranks first in ${Math.round(100 * top[0][1])}% of 5,000 draws`,
      top.length > 1 ? ` (${top.slice(1).map(([s, v]) => `${SRC[s]} ${Math.round(100 * v)}%`).join(", ")})` : "",
      isFive && paper ? ". Paper's draws." : ".");
  }

  function renderSide() { renderPresets(); renderSliders(); renderRank(); }

  // ---------------------------------------------------------- heatmap
  let width = 0;
  responsive(heat, (w) => { width = w; renderHeat(); });

  function renderHeat() {
    const M = matrix();
    if (!M || !width) return;
    const cols = sets();
    const left = width < 520 ? 84 : 98;
    const cw = Math.min(78, (width - left - 4) / cols.length);
    const ch = 34;
    const rotate = cols.length > 5 || cw < 66;
    const headH = rotate ? 74 : 40;
    const top = headH + (mode === "seeds" ? 16 : 0);
    const H = top + SOURCES.length * ch + 40;
    const svg = svgIn(heat, width, H, "Divergence from the dense model by calibration source and held-out set");
    const ramp = blueRamp();
    const cscale = d3.scaleLog().domain([1, 4]).range([0, 10]).clamp(true);
    const fillFor = (r) => ramp[Math.round(cscale(r))];
    const g = svg.append("g").attr("transform", `translate(${left},${top})`);
    // column headers
    const hdr = svg.append("g").attr("transform", `translate(${left},${top - 8})`);
    cols.forEach((t, j) => {
      const tx = hdr.append("text").attr("class", "lbl").attr("font-size", 12);
      if (rotate) tx.attr("transform", `translate(${j * cw + cw / 2},0) rotate(-38)`).text(SETNAME[t]);
      else tx.attr("x", j * cw + cw / 2).attr("text-anchor", "middle").text(SETNAME[t]);
    });
    if (mode === "seeds") {
      const gl = svg.append("g").attr("transform", `translate(${left},12)`);
      gl.append("text").attr("class", "lbl-2").attr("x", 0).text("held-out text of the sources");
      gl.append("text").attr("class", "lbl-2").attr("x", 5 * cw + 6).text("six independent domains");
      g.append("line").attr("x1", 5 * cw).attr("x2", 5 * cw).attr("y1", -4).attr("y2", SOURCES.length * ch)
        .attr("stroke", cssVar("--ink-3")).attr("stroke-width", 1.5);
    }
    // row labels
    SOURCES.forEach((s, i) => {
      const yy = i * ch + ch / 2 + 4;
      svg.append("circle").attr("cx", 7).attr("cy", top + yy - 4).attr("r", 4.5).attr("fill", srcColor(s));
      svg.append("text").attr("class", "lbl").attr("x", 17).attr("y", top + yy).text(SRC[s]);
    });
    const cells = [];
    SOURCES.forEach((s, i) => cols.forEach((t, j) => {
      const v = M[s]?.[t];
      if (v == null) return;
      cells.push({ s, t, i, j, v, r: v / best(M, t) });
    }));
    const cg = g.selectAll("g.c").data(cells).join("g").attr("class", "c")
      .attr("transform", (d) => `translate(${d.j * cw},${d.i * ch})`);
    cg.append("rect").attr("x", 1).attr("y", 1).attr("width", cw - 2).attr("height", ch - 2).attr("rx", 4)
      .attr("fill", (d) => fillFor(d.r));
    if (cw >= 34) {
      cg.append("text").attr("class", "cell-text").attr("x", cw / 2).attr("y", ch / 2 + 4).attr("text-anchor", "middle")
        .attr("fill", (d) => inkFor(fillFor(d.r))).text((d) => (d.v < 10 ? d.v.toFixed(2) : d.v.toFixed(1)));
    }
    // best per column
    g.selectAll("rect.best").data(cells.filter((d) => d.r === 1)).join("rect").attr("class", "best")
      .attr("x", (d) => d.j * cw + 1).attr("y", (d) => d.i * ch + 1).attr("width", cw - 2).attr("height", ch - 2)
      .attr("rx", 4).attr("fill", "none").attr("stroke", cssVar("--ink")).attr("stroke-width", 2.2).attr("pointer-events", "none");
    tipOn(cg, (d) => {
      const bs = SOURCES.find((s) => M[s]?.[d.t] === best(M, d.t));
      return {
        title: `${SRC[d.s]} calibration`,
        sub: `on ${SETLONG[d.t]} · ${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}`,
        rows: [
          { label: "KL(p‖q), nats per token", value: d.v.toFixed(3), color: srcColor(d.s) },
          { label: `relative to the best (${SRC[bs]})`, value: `${d.r.toFixed(2)}×` },
        ],
        note: d.t === "selfgen" ? "On exact samples of the dense model this estimates the sequence-level divergence (Proposition 1)." : null,
      };
    });
    // color key: ratio to the best source for the set
    const key = svg.append("g").attr("transform", `translate(${left},${H - 14})`);
    const steps = d3.range(0, 11);
    const kw = Math.min(16, (width - left - 150) / 11);
    if (kw > 6) {
      steps.forEach((k) => key.append("rect").attr("x", k * kw).attr("y", -9).attr("width", kw - 1).attr("height", 8)
        .attr("rx", 1.5).attr("fill", ramp[k]));
      key.append("text").attr("class", "lbl-2").attr("x", 0).attr("y", 12).text("1×");
      key.append("text").attr("class", "lbl-2").attr("x", 11 * kw).attr("y", 12).attr("text-anchor", "end").text("≥4×");
      key.append("text").attr("class", "lbl-2").attr("x", 11 * kw + 8).attr("y", -1)
        .text(width < 560 ? "÷ best source for the set" : "divergence ÷ best source for the set · outlined: best");
    }
  }

  function renderAll() { renderHeat(); renderSide(); }
  renderSide();
  document.addEventListener("themechange", renderRank);

  tableView(fig, () => {
    const M = matrix() || {};
    const cols = sets();
    return {
      caption: `KL(p‖q) in nats per token, ${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}, ${mode === "main" ? "main grid (seed 0, 32 windows per set)" : "mean of three seeds (128 windows per set, 64 per domain)"}. Bold: the best source for each set.`,
      columns: ["Calibration", ...cols.map((t) => SETNAME[t])],
      rows: SOURCES.filter((s) => M[s]).map((s) => [SRC[s], ...cols.map((t) => M[s][t].toFixed(3))]),
      best: (i, j) => j > 0 && M[SOURCES.filter((s) => M[s])[i]]?.[cols[j - 1]] === best(M, cols[j - 1]),
    };
  });
}
