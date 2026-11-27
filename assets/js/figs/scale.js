// Section 4.10, Table 18: Llama-3.1-8B, three seeds at -30% and one at -50%.
import { d3, SOURCES, SRC, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn, tipOn, tableView, cssVar } from "../viz.js";

const METRICS = {
  wiki: { label: "WikiText-2 perplexity", better: "low" }, c4: { label: "C4 perplexity", better: "low" },
  sp: { label: "SlimPajama perplexity", better: "low" }, acc6: { label: "Accuracy, six tasks (%)", better: "high" },
  relKL: { label: "Divergence relative to the best source (five sets)", better: "low" },
};

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let metric = "wiki";
  const S = P.scale;
  segmented(controls, { label: "Measure", value: metric,
    options: [{ value: "wiki", label: "WikiText-2" }, { value: "c4", label: "C4" }, { value: "sp", label: "SlimPajama" },
      { value: "acc6", label: "Accuracy" }, { value: "relKL", label: "Uniform fidelity" }], onChange: (v) => { metric = v; draw(); } });

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() {
    if (!width) return;
    const dense = P.dense.ext["llama-3.1-8b"];
    const dv = { wiki: dense.wiki, c4: dense.c4, sp: dense.sp, acc6: dense.acc6, relKL: null }[metric];
    const panels = [["r30", "−30%, mean of three seeds"], ["r50", "−50%, one seed"]];
    const narrow = width < 640;
    const pw = narrow ? width : (width - 24) / 2;
    const left = 100, rowH = 28, top = 46;
    const H = top + SOURCES.length * rowH + 30;
    const svg = svgIn(body, width, narrow ? 2 * H : H, `Llama-3.1-8B: ${METRICS[metric].label}`);
    panels.forEach(([r, title], k) => {
      const ox = narrow ? 0 : k * (pw + 24), oy = narrow ? k * H : 0;
      const g = svg.append("g").attr("transform", `translate(${ox},${oy})`);
      const data = SOURCES.map((s) => ({ s, v: S[r][s][metric] }));
      const vals = data.map((d) => d.v).concat(dv != null ? [dv] : []);
      const log = metric !== "acc6";
      const x = (log ? d3.scaleLog().domain([d3.min(vals) / 1.15, d3.max(vals) * 1.15])
        : d3.scaleLinear().domain([d3.min(vals) - 2, d3.max(vals) + 2])).range([left, pw - 44]);
      const ticks = log ? x.ticks(5).filter((v) => [1, 2, 5].includes(+String(v)[0])) : x.ticks(5);
      g.append("text").attr("class", "lbl").attr("font-weight", 650).attr("x", 0).attr("y", 14).text(title);
      g.append("g").attr("class", "grid").attr("transform", `translate(0,${top - 4})`)
        .call(d3.axisBottom(x).tickValues(ticks).tickSize(SOURCES.length * rowH + 4).tickFormat(""));
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${top + SOURCES.length * rowH})`)
        .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("~g")).tickSizeOuter(0));
      if (dv != null) {
        g.append("line").attr("class", "ref-line").attr("x1", x(dv)).attr("x2", x(dv)).attr("y1", top - 6).attr("y2", top + SOURCES.length * rowH);
        g.append("text").attr("class", "ref-label").attr("x", x(dv) + 4).attr("y", top - 8).text(`dense ${dv.toFixed(1)}`);
      }
      const best = METRICS[metric].better === "low" ? d3.min(data, (d) => d.v) : d3.max(data, (d) => d.v);
      data.forEach((d, i) => {
        const yy = top + i * rowH + rowH / 2;
        g.append("text").attr("class", "lbl").attr("x", 0).attr("y", yy + 4).attr("font-weight", d.v === best ? 700 : 400).text(SRC[d.s]);
        g.append("line").attr("x1", x.range()[0]).attr("x2", x(d.v)).attr("y1", yy).attr("y2", yy).attr("stroke", cssVar("--rule")).attr("stroke-width", 1);
        const mk = g.append("path").datum(d).attr("d", symbolPath(d.s, 90)).attr("transform", `translate(${x(d.v)},${yy}) rotate(${symbolRotate(d.s)})`)
          .attr("fill", srcColor(d.s)).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
        g.append("text").attr("class", "lbl").attr("font-variant-numeric", "tabular-nums").attr("x", x(d.v) + 9).attr("y", yy + 4)
          .attr("font-weight", d.v === best ? 700 : 400).text(metric === "relKL" ? `${d.v.toFixed(2)}×` : d.v >= 100 ? d.v.toFixed(0) : d.v.toFixed(1));
        tipOn(mk, () => ({ title: `${SRC[d.s]} calibration`, sub: `Llama-3.1-8B, ${title}`,
          rows: [{ label: METRICS[metric].label, value: metric === "relKL" ? `${d.v.toFixed(2)}×` : d.v.toFixed(1), color: srcColor(d.s) }] }));
      });
    });
  }

  tableView(fig, () => ({
    caption: "Llama-3.1-8B (Table 18): −30% mean of three seeds, −50% one seed.",
    columns: ["Calibration", "−30% Wiki", "−30% C4", "−30% SP", "−30% Acc", "−30% Rel. KL", "−50% Wiki", "−50% C4", "−50% SP", "−50% Acc", "−50% Rel. KL"],
    rows: SOURCES.map((s) => [SRC[s], ...["r30", "r50"].flatMap((r) => {
      const v = S[r][s];
      return [v.wiki.toFixed(1), v.c4.toFixed(1), v.sp.toFixed(1), v.acc6.toFixed(1), v.relKL.toFixed(2)];
    })]),
  }));
}
