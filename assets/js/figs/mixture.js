// Table 7: SlimPajama, self-generated documents and their half-and-half mixture (seed 0),
// scored by the geometric-mean divergence relative to the best of the seven calibrations.
import { d3, SOURCES, SRC, MODEL, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn, tipOn, tableView, cssVar } from "../viz.js";

const SETS = { five: "five held-out sets", real: "four real held-out sets", domains: "six independent domains" };

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let k = "real";
  const M = P.mixture;
  segmented(controls, { label: "Measured on", value: k,
    options: [{ value: "five", label: "5 held-out sets" }, { value: "real", label: "4 real sets" }, { value: "domains", label: "6 new domains" }],
    onChange: (v) => { k = v; draw(); } });
  const settings = ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"].flatMap((m) => ["r30", "r50"].map((r) => ({ m, r })));

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() {
    if (!width) return;
    const left = 132, right = 30, rowH = 34, top = width < 640 ? 52 : 34;
    const H = top + settings.length * rowH + 34;
    const svg = svgIn(body, width, H, "Uniform fidelity of SlimPajama, self-generated documents and their mixture");
    const all = settings.flatMap(({ m, r }) => Object.values(M[m][r].rel[k]));
    const x = d3.scaleLog().domain([0.97, d3.max(all) * 1.05]).range([left, width - right]);
    const ticks = [1, 1.2, 1.5, 2, 3, 4, 5, 7].filter((v) => v <= x.domain()[1]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${top - 6})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(settings.length * rowH + 6).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${top + settings.length * rowH})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat((v) => `${v}×`).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-title").attr("x", width - right).attr("y", H - 2).attr("text-anchor", "end")
      .text(width < 640 ? "relative divergence (geometric mean)" : `divergence relative to the best calibration on each set, geometric mean over the ${SETS[k]}`);
    // legend
    const lg = svg.append("g").attr("transform", `translate(${width < 640 ? 6 : left},12)`);
    const items = [["slimpajama", SRC.slimpajama], ["selfdoc", SRC.selfdoc], ["mix", "Half and half"], ["other", "other sources"]];
    let lx = 0, ly = 0;
    const maxW = width - (width < 640 ? 12 : left) - 8;
    items.forEach(([s, label]) => {
      const est = 26 + 7 * label.length;
      if (lx > 0 && lx + est > maxW) { lx = 0; ly += 18; }
      const g = lg.append("g").attr("transform", `translate(${lx},${ly})`);
      if (s === "mix") g.append("path").attr("d", d3.symbol(d3.symbolStar, 120)()).attr("fill", cssVar("--ink"));
      else if (s === "other") g.append("circle").attr("r", 4).attr("fill", "none").attr("stroke", cssVar("--muted")).attr("stroke-width", 1.5);
      else g.append("path").attr("d", symbolPath(s, 70)).attr("fill", srcColor(s)).attr("transform", `rotate(${symbolRotate(s)})`);
      const t = g.append("text").attr("class", "lbl").attr("x", 10).attr("y", 4).text(label);
      lx += 26 + t.node().getComputedTextLength();
    });
    settings.forEach(({ m, r }, i) => {
      const yy = top + i * rowH + rowH / 2;
      const rel = M[m][r].rel[k];
      svg.append("text").attr("class", "lbl").attr("x", 0).attr("y", yy + 4).text(`${MODEL[m]}, ${r === "r30" ? "−30%" : "−50%"}`);
      SOURCES.filter((s) => s !== "slimpajama" && s !== "selfdoc").forEach((s) => {
        const c = svg.append("circle").attr("cx", x(rel[s])).attr("cy", yy).attr("r", 4).attr("fill", "none")
          .attr("stroke", srcColor(s)).attr("stroke-width", 1.5).attr("opacity", 0.55);
        tipOn(c, () => ({ title: `${SRC[s]} calibration`, sub: `${MODEL[m]}, ${r === "r30" ? "−30%" : "−50%"}`, rows: [{ label: "relative divergence", value: `${rel[s].toFixed(2)}×`, color: srcColor(s) }] }));
      });
      const marks = [["slimpajama", rel.slimpajama], ["selfdoc", rel.selfdoc], ["mix", rel.mix]];
      const [lo, hi] = d3.extent(marks, (d) => d[1]);
      svg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", yy).attr("y2", yy).attr("stroke", cssVar("--axis")).attr("stroke-width", 2);
      marks.forEach(([s, v]) => {
        const p = svg.append("path").attr("transform", `translate(${x(v)},${yy}) rotate(${s === "mix" ? 0 : symbolRotate(s)})`)
          .attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
        if (s === "mix") p.attr("d", d3.symbol(d3.symbolStar, 170)()).attr("fill", cssVar("--ink"));
        else p.attr("d", symbolPath(s, 90)).attr("fill", srcColor(s));
        const row = M[m][r].rows[s];
        tipOn(p, () => ({ title: s === "mix" ? "SlimPajama + Self (doc.), half and half" : `${SRC[s]} calibration`,
          sub: `${MODEL[m]}, ${r === "r30" ? "−30%" : "−50%"}, seed 0`,
          rows: [{ label: `relative divergence (${SETS[k]})`, value: `${v.toFixed(2)}×` },
            { label: "WikiText-2 / C4 / SlimPajama", value: `${row.wiki.toFixed(1)} / ${row.c4.toFixed(1)} / ${row.sp.toFixed(1)}` },
            { label: "accuracy, six tasks", value: `${row.acc6.toFixed(1)}%` }] }));
      });
    });
  }

  tableView(fig, () => ({
    caption: "Seed 0: perplexity, accuracy without BoolQ, and divergence relative to the best of the seven calibrations (Table 7).",
    columns: ["Setting", "Calibration", "WikiText-2", "C4", "SlimPajama", "Acc. (6)", "Rel. KL, 5 sets", "Rel. KL, 4 real", "Rel. KL, 6 domains"],
    rows: settings.flatMap(({ m, r }) => ["slimpajama", "selfdoc", "mix"].map((s) => {
      const x = M[m][r].rows[s];
      return [`${MODEL[m]}, ${r === "r30" ? "−30%" : "−50%"}`, s === "mix" ? "SlimPajama + Self (doc.)" : SRC[s], x.wiki.toFixed(1), x.c4.toFixed(1),
        x.sp.toFixed(1), x.acc6.toFixed(1), x.rel_five.toFixed(2), x.rel_real.toFixed(2), x.rel_domains.toFixed(2)];
    })),
  }));
}
