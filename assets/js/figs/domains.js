// Figures 4, A3 and 7, and Table 8: perplexity on the seven SlimPajama domains relative
// to the dense model, by calibration source; and calibration on a single domain.
import {
  d3, SOURCES, SRC, MODEL, MODELS, SP_DOMAINS, SP_DOMAIN, srcColor, segmented, parts, responsive, svgIn,
  tipOn, tableView, el, cssVar, inkFor, blueRamp,
} from "../viz.js";

const SINGLE = [["slimpajama", "SlimPajama (all)"], ["github", "GitHub only"], ["arxiv", "arXiv only"], ["book", "Books only"]];

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let view = "sources", model = "llama-3.2-1b", ratio = "r30";
  const G = P.domains.grid;

  const viewSeg = segmented(controls, { label: "Rows", value: view,
    options: [{ value: "sources", label: "Calibration sources" }, { value: "single", label: "Single domains (Llama-3.2-1B, −50%)" }],
    onChange: (v) => { view = v; sync(); draw(); } });
  const modelSeg = segmented(controls, { label: "Model", value: model, options: MODELS.map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; if (v === "llama-3.1-8b") { ratio = "r30"; ratioSeg.set("r30"); } sync(); draw(); } });
  const ratioSeg = segmented(controls, { label: "Ratio", value: ratio, options: [{ value: "r30", label: "−30%" }, { value: "r50", label: "−50%" }],
    onChange: (v) => { ratio = v; draw(); } });
  function sync() {
    modelSeg.node.style.display = view === "single" ? "none" : "";
    ratioSeg.node.style.display = view === "single" ? "none" : "";
    ratioSeg.disable("r50", model === "llama-3.1-8b");
  }
  sync();

  // one shared logarithmic color scale for every panel, as in the paper
  const all = [];
  for (const m of Object.keys(G)) for (const r of Object.keys(G[m])) for (const s of SOURCES)
    if (G[m][r][s]) all.push(...Object.values(G[m][r][s]));
  for (const [k] of SINGLE) all.push(...Object.values(P.domains.single[k].rel));
  const vmax = d3.max(all);

  function rows() {
    if (view === "single") {
      return SINGLE.map(([k, label]) => ({ key: k, label, color: k === "slimpajama" ? srcColor("slimpajama") : cssVar("--ink-3"),
        vals: P.domains.single[k].rel, acc: P.domains.single[k].acc }));
    }
    const cell = G[model][ratio];
    return SOURCES.map((s) => ({ key: s, label: SRC[s], color: srcColor(s), vals: cell[s] }));
  }

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });

  function draw() {
    if (!width) return;
    const data = rows();
    const left = width < 560 ? 104 : 136;
    const cw = Math.min(92, (width - left - 8) / SP_DOMAINS.length);
    const ch = 34, top = 44;
    const H = top + data.length * ch + 40;
    const svg = svgIn(body, width, H, "Perplexity on SlimPajama domains relative to the dense model");
    const ramp = blueRamp();
    const sc = d3.scaleLog().domain([1, vmax]).range([0, 12]).clamp(true);
    const fill = (v) => ramp[Math.round(sc(v))];
    const g = svg.append("g").attr("transform", `translate(${left},${top})`);
    SP_DOMAINS.forEach((dname, j) => {
      const t = svg.append("text").attr("class", "lbl").attr("font-size", 12);
      if (cw < 70) t.attr("transform", `translate(${left + j * cw + cw / 2},${top - 8}) rotate(-35)`).text(SP_DOMAIN[dname]);
      else t.attr("x", left + j * cw + cw / 2).attr("y", top - 10).attr("text-anchor", "middle").text(SP_DOMAIN[dname]);
    });
    data.forEach((r, i) => {
      const yy = top + i * ch + ch / 2 + 4;
      svg.append("circle").attr("cx", 7).attr("cy", yy - 4).attr("r", 4.5).attr("fill", r.color);
      svg.append("text").attr("class", "lbl").attr("x", 17).attr("y", yy).text(r.label);
    });
    const cells = data.flatMap((r, i) => SP_DOMAINS.map((dname, j) => ({ r, i, j, dname, v: r.vals[dname] })));
    const minPer = Object.fromEntries(SP_DOMAINS.map((dname) => [dname, d3.min(data, (r) => r.vals[dname])]));
    const cg = g.selectAll("g.c").data(cells).join("g").attr("class", "c")
      .attr("transform", (d) => `translate(${d.j * cw},${d.i * ch})`);
    cg.append("rect").attr("x", 1).attr("y", 1).attr("width", cw - 2).attr("height", ch - 2).attr("rx", 4).attr("fill", (d) => fill(d.v));
    if (cw >= 36) {
      cg.append("text").attr("class", "cell-text").attr("x", cw / 2).attr("y", ch / 2 + 4).attr("text-anchor", "middle")
        .attr("fill", (d) => inkFor(fill(d.v))).text((d) => (d.v >= 100 ? d3.format(".0f")(d.v) : d.v >= 10 ? d.v.toFixed(1) : d.v.toFixed(2)));
    }
    g.selectAll("rect.best").data(cells.filter((d) => d.v === minPer[d.dname])).join("rect")
      .attr("x", (d) => d.j * cw + 1).attr("y", (d) => d.i * ch + 1).attr("width", cw - 2).attr("height", ch - 2).attr("rx", 4)
      .attr("fill", "none").attr("stroke", cssVar("--ink")).attr("stroke-width", 2.2).attr("pointer-events", "none");
    tipOn(cg, (d) => ({
      title: `${d.r.label}${view === "single" ? " calibration" : " calibration"}`,
      sub: `${SP_DOMAIN[d.dname]} text · ${view === "single" ? "Llama-3.2-1B, −50%" : `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}${model === "llama-3.1-8b" ? ", geometric mean of three seeds" : ""}`}`,
      rows: [{ label: "perplexity ÷ dense model", value: `${d.v >= 100 ? d3.format(".0f")(d.v) : d.v.toFixed(2)}×`, color: d.r.color }],
    }));
    // key
    const key = svg.append("g").attr("transform", `translate(${left},${H - 14})`);
    const kw = Math.min(14, (width - left - 220) / 13);
    if (kw > 5) {
      ramp.forEach((c, k) => key.append("rect").attr("x", k * kw).attr("y", -9).attr("width", kw - 1).attr("height", 8).attr("rx", 1.5).attr("fill", c));
      key.append("text").attr("class", "lbl-2").attr("x", 0).attr("y", 12).text("1×");
      key.append("text").attr("class", "lbl-2").attr("x", 13 * kw).attr("y", 12).attr("text-anchor", "end").text(`${d3.format(".0f")(vmax)}×`);
      key.append("text").attr("class", "lbl-2").attr("x", 13 * kw + 8).attr("y", -1).text("perplexity ÷ dense model (log scale) · outlined: lowest");
    }
  }

  tableView(fig, () => {
    const data = rows();
    return {
      caption: view === "single" ? "Llama-3.2-1B compressed by 50%: perplexity on each SlimPajama domain relative to the dense model, calibrated on the whole mixture or on one subset."
        : `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}: perplexity on each SlimPajama domain relative to the dense model.`,
      columns: ["Calibration", ...SP_DOMAINS.map((k) => SP_DOMAIN[k]), ...(view === "single" ? ["Accuracy (%)"] : [])],
      rows: data.map((r) => [r.label, ...SP_DOMAINS.map((k) => r.vals[k].toFixed(2)), ...(view === "single" ? [r.acc.toFixed(1)] : [])]),
    };
  });
}
