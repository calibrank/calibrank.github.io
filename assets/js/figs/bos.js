// Section 5.5 and Appendix D: compressed Llama models collapse on text that does not start
// with the BOS token they were calibrated with (Tables A10 and 22).
import { d3, SRC, MODEL, srcColor, parts, responsive, svgIn, tipOn, tableView, el, cssVar, dur, fmtPpl } from "../viz.js";

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let bos = true, trained = true;
  const B = P.bos;

  const tokens = el("div", { class: "tokens", "aria-hidden": "true" });
  const bosTok = el("span", { class: "tok bos", text: "<|begin_of_text|>" });
  tokens.append(bosTok, ...["The", "tower", "is", "324", "metres", "(", "1", ",", "063", "ft", ")", "tall", "…"]
    .map((t) => el("span", { class: "tok", text: t })));
  const sw = el("input", { type: "checkbox", checked: true, role: "switch", "aria-label": "Input starts with the BOS token" });
  const swLabel = el("label", { class: "switch" }, sw, el("span", { class: "track" }), el("span", {}, "Input starts with BOS"));
  const tr = el("input", { type: "checkbox", checked: true });
  controls.append(swLabel, el("label", { class: "toggle" }, tr, "Trained models (untick: untrained initialization)"));
  sw.addEventListener("change", () => { bos = sw.checked; bosTok.classList.toggle("gone", !bos); update(); });
  tr.addEventListener("change", () => { trained = tr.checked; update(); });

  const chart = el("div");
  const ranges = el("div");
  body.replaceChildren(tokens, chart, ranges);

  const rows = () => [{ cal: "Dense model", source: null, bos: B.denseLlama.bos, stream: B.denseLlama.stream,
    initBos: B.denseLlama.bos, initStream: B.denseLlama.stream }].concat(B.llama50);

  let width = 0, svg, x, bars, labels;
  const left = 170, right = 70, rowH = 30, top = 24;
  responsive(chart, (w) => { width = w; build(); });

  function val(r) {
    if (trained) return bos ? r.bos : r.stream;
    return bos ? r.initBos : r.initStream;
  }

  function build() {
    const data = rows();
    const H = top + data.length * rowH + 44;
    svg = svgIn(chart, width, H, "WikiText-2 perplexity of compressed Llama-3.2-1B with and without the BOS token");
    x = d3.scaleLog().domain([5, 80000]).range([left, width - right]);
    const ticks = [10, 100, 1000, 10000];
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${top - 6})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(data.length * rowH + 6).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${top + data.length * rowH})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format(",")).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-title").attr("x", width - right).attr("y", H - 2).attr("text-anchor", "end")
      .text("WikiText-2 perplexity, Llama-3.2-1B compressed by 50% (log scale)");
    svg.append("text").attr("class", "lbl-2").attr("x", 0).attr("y", 12).text("Calibration");
    const g = svg.append("g");
    const rowG = g.selectAll("g").data(data).join("g").attr("transform", (d, i) => `translate(0,${top + i * rowH})`);
    rowG.append("text").attr("class", "lbl").attr("x", 0).attr("y", rowH / 2 + 4)
      .attr("font-weight", (d) => (d.cal === "C4, no BOS" || d.source == null ? 650 : 400)).text((d) => d.cal);
    bars = rowG.append("rect").attr("x", left).attr("y", 7).attr("height", rowH - 14).attr("rx", 3)
      .attr("fill", (d) => (d.source ? srcColor(d.source) : cssVar("--ink")))
      .attr("opacity", (d) => (d.cal.startsWith("C4,") ? 0.65 : 1)).attr("width", (d) => x(val(d)) - left);
    labels = rowG.append("text").attr("class", "lbl").attr("font-variant-numeric", "tabular-nums").attr("y", rowH / 2 + 4)
      .attr("x", (d) => x(val(d)) + 6).text((d) => fmtPpl(val(d)));
    rowG.append("rect").attr("class", "hit").attr("width", width).attr("height", rowH);
    tipOn(rowG, (d) => ({ title: d.cal, sub: "WikiText-2 perplexity, with BOS / without BOS",
      rows: [{ label: "untrained", value: `${fmtPpl(d.initBos)} / ${fmtPpl(d.initStream)}` },
        { label: "trained", value: `${fmtPpl(d.bos)} / ${fmtPpl(d.stream)}` },
        { label: "collapse factor (trained)", value: `${d3.format(",.0f")(d.stream / d.bos)}×` }],
      note: d.cal === "C4, no BOS" ? "Calibrated on windows without BOS: no collapse, at a small cost with BOS." : null }));
  }

  function update() {
    if (!bars) return;
    const t = svg.transition().duration(dur(900)).ease(d3.easeCubicInOut);
    bars.transition(t).attr("width", (d) => Math.max(1, x(val(d)) - left));
    labels.transition(t).attr("x", (d) => x(val(d)) + 6).textTween(function (d) {
      const from = +this.textContent.replace(/,/g, "") || val(d);
      const i = d3.interpolate(from, val(d));
      return (tt) => fmtPpl(i(tt));
    });
  }

  // Table 22: every model and ratio
  const R = B.ranges;
  const box = el("div", { class: "stats", style: "margin:16px 0 0" });
  const fmt = (v) => (v >= 100 ? d3.format(",.0f")(v) : v.toFixed(2));
  for (const r of R) {
    const vals = Object.values(r.bySource);
    if (r.model === "qwen3-1.7b" && r.ratio === 0.5) continue;
    const lo = d3.min(vals), hi = d3.max(vals);
    const txt = r.model === "qwen3-1.7b" ? "no BOS token" : `${fmt(lo)}× to ${fmt(hi)}×`;
    box.append(el("div", { class: "stat" },
      el("div", { class: "v", style: r.model.startsWith("llama") ? "" : "color:var(--ink-2)" }, r.model === "qwen3-1.7b" ? "n/a" : `${fmt(hi)}×`),
      el("div", { class: "l" }, el("strong", { style: "color:var(--ink)" }, `${MODEL[r.model]}${r.model === "qwen3-1.7b" ? "" : `, ${r.ratio === 0.3 ? "−30%" : "−50%"}`}`),
        el("br"), r.model === "qwen3-1.7b" ? "no BOS token" : `sources: ${txt}`, el("br"), `dense model: ${r.dense.toFixed(2)}×`)));
  }
  ranges.append(el("p", { class: "fig-sub", style: "margin:16px 0 0" },
    "Every model: perplexity on text without BOS divided by perplexity with BOS, trained models (the worst calibration source shown large)."), box);

  tableView(fig, () => ({
    caption: "WikiText-2 perplexity of Llama-3.2-1B compressed by 50%, on windows that start with BOS and on stream windows that do not (Table A10).",
    columns: ["Calibration", "Untrained, BOS", "Untrained, no BOS", "Trained, BOS", "Trained, no BOS"],
    rows: rows().map((r) => [r.cal, fmtPpl(r.initBos), fmtPpl(r.initStream), fmtPpl(r.bos), fmtPpl(r.stream)]),
  }));
}
