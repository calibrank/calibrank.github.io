// Section 4.11: what compression costs beyond perplexity (Tables 19, 20) and what it saves
// (Table 21). One row per capability: the dense model, and where each compressed model lands.
import { d3, SOURCES, SRC, MODEL, MODELS, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn, tipOn,
  tableView, el, cssVar, blueRamp } from "../viz.js";

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let view = "cap", model = "qwen3-1.7b";
  const BR = P.behavior.rows;
  const row = (m, s) => BR.find((r) => r.model === m && r.source === s);

  segmented(controls, { label: "Show", value: view,
    options: [{ value: "cap", label: "Capabilities" }, { value: "cost", label: "Memory and speed" }],
    onChange: (v) => { view = v; draw(); } });
  segmented(controls, { label: "Model", value: model, options: MODELS.map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; draw(); } });

  function capabilities() {
    const S = P.accuracy.seeds[model]?.r30;
    const dense = row(model, "dense");
    const caps = [
      { name: "Multiple-choice accuracy", sub: "six zero-shot tasks, three seeds", unit: "%", lo: 20, hi: 75, log: false, better: "high",
        dense: P.dense.ext[model].acc6, vals: S ? SOURCES.map((s) => [s, S[s]?.acc6?.[0]]) : [] },
      { name: "Passkey retrieval", sub: "a number hidden in ~8,000 tokens", unit: "%", lo: 0, hi: 100, log: false, better: "high",
        dense: dense?.passkey?.["8000"], vals: SOURCES.map((s) => [s, row(model, s)?.passkey?.["8000"]]) },
      { name: "Long-context perplexity", sub: "positions 4k–8k of PG-19 books", unit: "", lo: 5, hi: 150, log: true, better: "low",
        dense: dense?.pplFar, vals: SOURCES.map((s) => [s, row(model, s)?.pplFar]) },
      { name: "Grade-school math", sub: "GSM8K, exact match", unit: "%", lo: 0, hi: 75, log: false, better: "high",
        dense: dense?.gsm8k, vals: SOURCES.map((s) => [s, row(model, s)?.gsm8k]) },
      { name: "Open-domain questions", sub: "NQ-Open, exact match", unit: "%", lo: 0, hi: 25, log: false, better: "high",
        dense: dense?.nq, vals: SOURCES.map((s) => [s, row(model, s)?.nq]) },
      { name: "Repetition", sub: "repeated 4-grams in greedy continuations", unit: "%", lo: 0, hi: 100, log: false, better: "low",
        dense: dense?.rep4 != null ? 100 * dense.rep4 : null, vals: SOURCES.map((s) => [s, row(model, s)?.rep4 != null ? 100 * row(model, s).rep4 : null]) },
    ];
    const ife = P.behavior.ifeval;
    const ifeMap = { C4: "c4", SlimPajama: "slimpajama", "Alpaca, chat format": "alpaca", "Self (doc.)": "selfdoc" };
    caps.push({ name: "Instruction following", sub: "IFEval prompts, Llama-3.2-1B-Instruct", unit: "%", lo: 0, hi: 60, log: false, better: "high",
      dense: ife.find((r) => r.cal === "dense").prompt,
      vals: ife.filter((r) => r.cal !== "dense").map((r) => [ifeMap[r.cal] || "selfgen", r.prompt, r.cal]), always: true });
    return caps;
  }

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() { if (!width) return; if (view === "cap") drawCaps(); else drawCost(); }

  function drawCaps() {
    const caps = capabilities();
    const narrow = width < 700;
    const box = el("div", { class: "scorecard" });
    for (const c of caps) {
      const present = c.vals.filter(([, v]) => v != null);
      const has = c.dense != null && present.length;
      const name = el("div", { class: "sc-name" }, c.name, el("small", {}, c.sub));
      const plot = el("div");
      const val = el("div", { class: "sc-val" });
      box.append(el("div", { class: "sc-row" }, name, plot, val));
      if (!has) {
        plot.append(el("span", { class: "muted", style: "font-size:13px" },
          model === "opt-1.3b" ? "not evaluated (OPT-1.3B reads 2,048 positions)" : "not evaluated for this model"));
        continue;
      }
      const w = narrow ? width - 8 : Math.max(200, width - 210 - 150 - 28);
      const H = 40;
      const svg = d3.select(plot).append("svg").attr("width", w).attr("height", H).attr("role", "img")
        .attr("aria-label", `${c.name}: dense ${c.dense.toFixed(1)}, compressed ${d3.min(present, (d) => d[1]).toFixed(1)} to ${d3.max(present, (d) => d[1]).toFixed(1)}`);
      const x = (c.log ? d3.scaleLog() : d3.scaleLinear()).domain([c.lo, c.hi]).range([8, w - 8]).clamp(true);
      svg.append("rect").attr("x", 8).attr("y", H / 2 - 3).attr("width", w - 16).attr("height", 6).attr("rx", 3).attr("fill", cssVar("--bg-3"));
      const [mn, mx] = d3.extent(present, (d) => d[1]);
      svg.append("rect").attr("x", x(mn)).attr("y", H / 2 - 3).attr("width", Math.max(2, x(mx) - x(mn))).attr("height", 6).attr("rx", 3)
        .attr("fill", cssVar("--axis"));
      const mk = svg.selectAll("path.s").data(present).join("path").attr("class", "s")
        .attr("d", (d) => symbolPath(d[0], 64))
        .attr("transform", (d) => `translate(${x(d[1])},${H / 2}) rotate(${symbolRotate(d[0])})`)
        .attr("fill", (d) => srcColor(d[0])).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
      tipOn(mk, (d) => ({ title: d[2] || `${SRC[d[0]]} calibration`, sub: `${c.always ? "Llama-3.2-1B-Instruct" : MODEL[model]}, −30%`,
        rows: [{ label: c.name, value: `${d[1].toFixed(1)}${c.unit}`, color: srcColor(d[0]) }, { label: "dense model", value: `${c.dense.toFixed(1)}${c.unit}` }] }));
      svg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 110)()).attr("transform", `translate(${x(c.dense)},${H / 2})`)
        .attr("fill", cssVar("--ink")).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
      svg.append("text").attr("class", "lbl-2").attr("x", x(c.dense)).attr("y", 9).attr("text-anchor", "middle").text("dense");
      const f = (v) => (c.log ? v.toFixed(1) : Number.isInteger(Math.round(v * 10) / 10) ? v.toFixed(0) : v.toFixed(v < 10 ? 1 : 0));
      val.replaceChildren(el("div", {}, "dense ", el("b", { text: `${f(c.dense)}${c.unit}` })),
        el("div", {}, `compressed ${f(mn)}–${f(mx)}${c.unit}`));
    }
    const lg = el("div", { class: "legend", style: "margin-top:12px" });
    for (const s of SOURCES) {
      const svg = d3.create("svg").attr("width", 14).attr("height", 14);
      svg.append("path").attr("d", symbolPath(s, 64)).attr("transform", `translate(7,7) rotate(${symbolRotate(s)})`).attr("fill", srcColor(s));
      lg.append(el("span", { class: "legend-item legend-static" }, svg.node(), SRC[s]));
    }
    const dsvg = d3.create("svg").attr("width", 14).attr("height", 14);
    dsvg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 90)()).attr("transform", "translate(7,7)").attr("fill", cssVar("--ink"));
    lg.append(el("span", { class: "legend-item legend-static" }, dsvg.node(), "dense model"));
    body.replaceChildren(box, lg,
      el("p", { class: "fig-sub", style: "margin:8px 0 0" }, `Models compressed by 30%, seed 0 (accuracy: mean of three seeds). Instruction following is measured on Llama-3.2-1B-Instruct, whose sixth calibration is its own responses to instructions (pink).`));
  }

  function drawCost() {
    const b = P.behavior.bench[model];
    const metrics = [
      { key: "weights_gb", label: "Parameter memory (GB)", better: "lower" },
      { key: "peak_gb_b16", label: "Peak memory, decoding a batch of 16 (GB)", better: "lower" },
      { key: "decode_tok_s_b1", label: "Decoding speed, batch 1 (tokens/s)", better: "higher" },
      { key: "prefill_ms_b1", label: "Prefill of 2,048 tokens, batch 1 (ms)", better: "lower" },
    ];
    const versions = [["dense", "Dense"], ["r30", "−30%"], ["r50", "−50%"]];
    const grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px 22px" });
    for (const m of metrics) {
      const cell = el("div");
      cell.append(el("div", { style: "font-family:var(--font-sans);font-size:13.5px;font-weight:650;margin-bottom:6px" }, m.label,
        el("span", { class: "muted", style: "font-weight:400" }, ` · ${m.better} is better`)));
      const w = Math.max(240, Math.min(520, (width - 22) / (width > 620 ? 2 : 1)));
      const svg = d3.select(cell).append("svg").attr("width", w).attr("height", 3 * 28 + 4).attr("role", "img").attr("aria-label", m.label);
      const max = d3.max(versions, ([k]) => b[k]?.[m.key] ?? 0);
      const x = d3.scaleLinear().domain([0, max * 1.15]).range([0, w - 130]);
      versions.forEach(([k, lab], i) => {
        const v = b[k]?.[m.key];
        if (v == null) return;
        const g = svg.append("g").attr("transform", `translate(0,${i * 28})`);
        g.append("text").attr("class", "lbl").attr("x", 0).attr("y", 17).text(lab);
        g.append("rect").attr("x", 58).attr("y", 5).attr("height", 16).attr("rx", 3).attr("width", Math.max(1, x(v)))
          .attr("fill", k === "dense" ? cssVar("--ink-3") : blueRamp()[k === "r30" ? 5 : 9]);
        const rel = k === "dense" ? "" : ` (${v >= b.dense[m.key] ? "+" : "−"}${Math.abs(Math.round(100 * (v / b.dense[m.key] - 1)))}%)`;
        g.append("text").attr("class", "lbl").attr("font-variant-numeric", "tabular-nums").attr("x", 64 + x(v)).attr("y", 17)
          .text(`${v >= 100 ? v.toFixed(0) : v.toFixed(2)}${rel}`);
      });
      grid.append(cell);
    }
    body.replaceChildren(grid, el("p", { class: "fig-sub", style: "margin:12px 0 0" },
      `${MODEL[model]} in bfloat16 on one A100 GPU, merged factors in eager PyTorch. The ranks, and hence these costs, do not depend on the calibration source.`));
  }

  tableView(fig, () => {
    if (view === "cost") {
      const b = P.behavior.bench[model];
      return { caption: `Memory and latency, ${MODEL[model]} (Table 21).`,
        columns: ["Version", "Weights (GB)", "Prefill b1 (ms)", "Prefill b8 (ms)", "Decode b1 (tok/s)", "Decode b16 (tok/s)", "Peak b16 (GB)"],
        rows: [["dense", "Dense"], ["r30", "−30%"], ["r50", "−50%"]].map(([k, l]) => [l, b[k].weights_gb.toFixed(2), b[k].prefill_ms_b1.toFixed(1),
          b[k].prefill_ms_b8.toFixed(0), b[k].decode_tok_s_b1.toFixed(0), b[k].decode_tok_s_b16.toFixed(0), b[k].peak_gb_b16.toFixed(2)]) };
    }
    const caps = capabilities();
    return { caption: `${MODEL[model]} compressed by 30%: capabilities by calibration source (Tables 19 and 20).`,
      columns: ["Capability", "Dense", ...SOURCES.map((s) => SRC[s])],
      rows: caps.map((c) => [c.name, c.dense != null ? c.dense.toFixed(1) : "–",
        ...SOURCES.map((s) => { const v = c.vals.find((d) => d[0] === s); return v && v[1] != null ? v[1].toFixed(1) : "–"; })]) };
  });
}
