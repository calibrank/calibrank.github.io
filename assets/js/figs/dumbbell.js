// Figures 2 and A1 (and Table 2): perplexity before training (hollow), after training
// (filled), and the oblique truncation of SVD-LLM, for every calibration source.
import {
  d3, SOURCES, SRC, MODEL, MODELS, srcColor, symbolPath, symbolRotate, segmented, parts, responsive,
  svgIn, tipOn, tableView, logTicks, tickFmt, fmtPpl, dur, el, cssVar,
} from "../viz.js";

const METRICS = { wiki: "WikiText-2", c4: "C4", sp: "SlimPajama" };

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let model = "llama-3.2-1b", ratio = "r30", metric = "wiki", showObl = false;
  const D = P.dumbbell;
  const denseOf = (m) => (m === "llama-3.1-8b" ? P.dense.ext[m] : P.dense.main[m]);

  segmented(controls, { label: "Model", value: model, options: MODELS.map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; obl.node.style.display = v === "llama-3.1-8b" ? "none" : ""; update(); } });
  segmented(controls, { label: "Ratio", value: ratio, options: [{ value: "r30", label: "−30%" }, { value: "r50", label: "−50%" }],
    onChange: (v) => { ratio = v; update(); } });
  segmented(controls, { label: "Perplexity on", value: metric,
    options: Object.entries(METRICS).map(([k, l]) => ({ value: k, label: l })), onChange: (v) => { metric = v; update(); } });
  const oblInput = el("input", { type: "checkbox" });
  const obl = { node: el("label", { class: "toggle" }, oblInput, "Oblique truncation of SVD-LLM") };
  oblInput.addEventListener("change", () => { showObl = oblInput.checked; update(); });
  controls.append(obl.node);

  const summary = el("p", { class: "fig-sub", style: "margin:0 0 6px;font-family:var(--font-sans)" });
  body.before(summary);

  let svg, g, y, x, Wd, Hd, gy, grid, denseLine, denseLbl, conn, hollow, filled, oblq, xa;
  const m = { top: 12, right: 18, bottom: 34, left: 54 };
  const mobileBottom = 70;

  responsive(body, (width) => {
    Wd = width - m.left - m.right;
    Hd = Math.min(360, Math.max(240, width * 0.36));
    svg = svgIn(body, width, Hd + m.top + (width < 600 ? mobileBottom : m.bottom), "Perplexity before and after training by calibration source");
    g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    x = d3.scaleBand().domain(SOURCES).range([0, Wd]).padding(0.3);
    y = d3.scaleLog().range([Hd, 0]);
    grid = g.append("g").attr("class", "grid");
    gy = g.append("g").attr("class", "axis");
    xa = g.append("g").attr("class", "axis").attr("transform", `translate(0,${Hd})`)
      .call(d3.axisBottom(x).tickFormat((s) => SRC[s]).tickSizeOuter(0));
    if (width < 600) xa.selectAll("text").attr("text-anchor", "end").attr("transform", "rotate(-35)").attr("dx", "-0.4em").attr("dy", "0.5em");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -42).attr("text-anchor", "end")
      .text("perplexity (log scale)");
    denseLine = g.append("line").attr("class", "ref-line");
    denseLbl = g.append("text").attr("class", "ref-label").attr("text-anchor", "end");
    conn = g.append("g"); hollow = g.append("g"); oblq = g.append("g"); filled = g.append("g");
    update(0);
  });

  function cells() {
    const cell = D[model][ratio];
    return SOURCES.filter((s) => cell?.[s]).map((s) => ({
      s, a: cell[s].init[metric], b: cell[s].final[metric], o: cell[s].oblique?.[metric],
    }));
  }

  function update(ms = 750) {
    if (!svg) return;
    const t = svg.transition().duration(dur(ms)).ease(d3.easeCubicInOut);
    const data = cells();
    const dn = denseOf(model)[metric];
    const vals = data.flatMap((d) => [d.a, d.b, showObl ? d.o : null]).concat([dn]).filter((v) => v != null);
    const lo = d3.min(vals) / 1.35, hi = d3.max(vals) * 1.35;
    y.domain([lo, hi]);
    const ticks = logTicks([lo, hi], 7);
    gy.transition(t).call(d3.axisLeft(y).tickValues(ticks).tickFormat(tickFmt).tickSizeOuter(0));
    grid.transition(t).call(d3.axisLeft(y).tickValues(ticks).tickSize(-Wd).tickFormat(""));
    denseLine.transition(t).attr("x1", 0).attr("x2", Wd).attr("y1", y(dn)).attr("y2", y(dn));
    denseLbl.transition(t).attr("x", Wd).attr("y", y(dn) + 14).text(`dense model ${fmtPpl(dn)}`);
    const cx = (d) => x(d.s) + x.bandwidth() / 2;
    conn.selectAll("line").data(data, (d) => d.s).join("line")
      .attr("stroke", (d) => srcColor(d.s)).attr("stroke-width", 2).attr("opacity", 0.45)
      .transition(t).attr("x1", cx).attr("x2", cx).attr("y1", (d) => y(d.a)).attr("y2", (d) => y(d.b));
    const bg = cssVar("--bg-2");
    const hs = hollow.selectAll("path").data(data, (d) => d.s).join("path")
      .attr("d", (d) => symbolPath(d.s, 110)).attr("fill", bg).attr("stroke", (d) => srcColor(d.s)).attr("stroke-width", 2);
    hs.transition(t).attr("transform", (d) => `translate(${cx(d)},${y(d.a)}) rotate(${symbolRotate(d.s)})`);
    const fs = filled.selectAll("path").data(data, (d) => d.s).join("path")
      .attr("d", (d) => symbolPath(d.s, 110)).attr("fill", (d) => srcColor(d.s)).attr("stroke", bg).attr("stroke-width", 1.5);
    fs.transition(t).attr("transform", (d) => `translate(${cx(d)},${y(d.b)}) rotate(${symbolRotate(d.s)})`);
    const od = showObl ? data.filter((d) => d.o != null) : [];
    const os = oblq.selectAll("g").data(od, (d) => d.s).join((enter) => {
      const gg = enter.append("g");
      gg.append("line").attr("x1", -11).attr("x2", 11).attr("stroke-width", 3).attr("stroke-linecap", "round");
      return gg;
    });
    os.select("line").attr("stroke", (d) => srcColor(d.s));
    os.transition(t).attr("transform", (d) => `translate(${cx(d) + 16},${y(d.o)})`);
    const tip = (d) => ({
      title: `${SRC[d.s]} calibration`, sub: `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}, ${METRICS[metric]} perplexity`,
      rows: [
        { label: "untrained (whitened init.)", value: fmtPpl(d.a), color: srcColor(d.s) },
        { label: "trained (LSP)", value: fmtPpl(d.b), color: srcColor(d.s) },
        ...(d.o != null ? [{ label: "oblique (SVD-LLM)", value: fmtPpl(d.o), color: srcColor(d.s) }] : []),
      ],
      note: `Training lowers it ${d3.format(".1f")(d.a / d.b)}-fold.`,
    });
    tipOn(hs, tip); tipOn(fs, tip); tipOn(os, tip);
    // spread across sources, before and after
    const sa = d3.max(data, (d) => d.a) / d3.min(data, (d) => d.a);
    const sb = d3.max(data, (d) => d.b) / d3.min(data, (d) => d.b);
    const bestB = data.reduce((p, c) => (c.b < p.b ? c : p));
    summary.replaceChildren(
      "Spread across the six sources: ", el("strong", { text: `${d3.format(",.1f")(sa)}-fold untrained` }),
      ", ", el("strong", { text: `${d3.format(".1f")(sb)}-fold trained` }),
      `. Lowest after training: ${SRC[bestB.s]}.`);
  }

  tableView(fig, () => {
    const data = cells();
    return {
      caption: `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}: ${METRICS[metric]} perplexity${model === "llama-3.1-8b" ? " (extended evaluation, seed 0)" : " (main grid, seed 0)"}.`,
      columns: ["Calibration", "Untrained (whitened init.)", "Oblique (SVD-LLM)", "Trained (LSP)"],
      rows: data.map((d) => [SRC[d.s], fmtPpl(d.a), d.o != null ? fmtPpl(d.o) : "–", fmtPpl(d.b)]),
    };
  });
}
