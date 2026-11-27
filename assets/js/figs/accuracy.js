// Zero-shot accuracy: three-seed means by source (Tables A2-A4), and the paired
// comparisons of Table 17 as a forest plot over the eight settings.
import {
  d3, SOURCES, SRC, MODEL, MODELS, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn,
  tipOn, tableView, el, cssVar, dur,
} from "../viz.js";

const METRIC = {
  acc6: "Mean of six tasks (without BoolQ)", acc7: "Mean of seven tasks", boolq: "BoolQ alone",
};

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let model = "qwen3-1.7b", ratio = "r30", metric = "acc6", tasks = "acc6";
  const S = P.accuracy.seeds;

  segmented(controls, { label: "Model", value: model, options: MODELS.map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; drawDots(); } });
  segmented(controls, { label: "Ratio", value: ratio, options: [{ value: "r30", label: "−30%" }, { value: "r50", label: "−50%" }],
    onChange: (v) => { ratio = v; drawDots(); } });
  segmented(controls, { label: "Score", value: metric,
    options: [{ value: "acc6", label: "6 tasks" }, { value: "acc7", label: "7 tasks" }, { value: "boolq", label: "BoolQ" }],
    onChange: (v) => { metric = v; drawDots(); } });

  const top = el("div");
  const forestHead = el("div", { class: "fig-head", style: "margin:22px 0 4px" },
    el("div", {}, el("p", { class: "fig-title", text: "Paired differences, all eight settings" }),
      el("p", { class: "fig-sub", text: "95% paired-bootstrap intervals over benchmark items, averaged over the seeds (one seed for Llama-3.1-8B at −50%). An interval that excludes zero is a difference beyond sampling noise." })));
  const forestCtl = el("div", { class: "controls" });
  const forest = el("div");
  body.replaceChildren(top, forestHead, forestCtl, forest);
  segmented(forestCtl, { label: "Mean over", value: tasks, options: [{ value: "acc6", label: "6 tasks" }, { value: "acc7", label: "7 tasks" }],
    onChange: (v) => { tasks = v; drawForest(); } });

  // ---------------------------------------------------------- dots: one setting
  let wTop = 0;
  responsive(top, (w) => { wTop = w; drawDots(); });
  function drawDots() {
    if (!wTop) return;
    const cell = S[model]?.[ratio];
    if (!cell) return;
    const dense = metric === "boolq" ? P.dense.ext[model].zs.boolq : P.dense.ext[model][metric];
    const data = SOURCES.filter((s) => cell[s]).map((s) => ({ s, m: cell[s][metric][0], sd: cell[s][metric][1] || 0 }));
    const left = 104, right = 24, rowH = 30, topPad = 26;
    const H = topPad + data.length * rowH + 34;
    const svg = svgIn(top, wTop, H, "Zero-shot accuracy by calibration source");
    const xs = data.flatMap((d) => [d.m - d.sd, d.m + d.sd]).concat([dense, metric === "boolq" ? 62.2 : dense]);
    const x = d3.scaleLinear().domain([Math.floor(d3.min(xs) - 1.5), Math.ceil(d3.max(xs) + 1.5)]).range([left, wTop - right]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${topPad - 6})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(data.length * rowH + 6).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${topPad + data.length * rowH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((v) => `${v}%`).tickSizeOuter(0));
    const ref = (v, label) => {
      svg.append("line").attr("class", "ref-line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", topPad - 10).attr("y2", topPad + data.length * rowH);
      svg.append("text").attr("class", "ref-label").attr("x", x(v)).attr("y", topPad - 14).attr("text-anchor", "middle").text(label);
    };
    if (x(dense) <= wTop - right) ref(dense, `dense ${dense.toFixed(1)}%`);
    if (metric === "boolq") ref(62.2, "always “yes” 62.2%");
    const best = d3.max(data, (d) => d.m);
    data.forEach((d, i) => {
      const yy = topPad + i * rowH + rowH / 2;
      svg.append("text").attr("class", "lbl").attr("x", 0).attr("y", yy + 4).text(SRC[d.s]);
      svg.append("line").attr("x1", x(d.m - d.sd)).attr("x2", x(d.m + d.sd)).attr("y1", yy).attr("y2", yy)
        .attr("stroke", srcColor(d.s)).attr("stroke-width", 2.5).attr("stroke-linecap", "round").attr("opacity", 0.55);
      const mk = svg.append("path").datum(d).attr("d", symbolPath(d.s, 90))
        .attr("transform", `translate(${x(d.m)},${yy}) rotate(${symbolRotate(d.s)})`)
        .attr("fill", srcColor(d.s)).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
      if (d.m === best) {
        svg.append("text").attr("class", "lbl").attr("font-weight", 650).attr("x", x(d.m + d.sd) + 8).attr("y", yy + 4)
          .text(`${d.m.toFixed(1)}%`);
      }
      tipOn(mk, () => ({ title: `${SRC[d.s]} calibration`, sub: `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"} · ${METRIC[metric]}`,
        rows: [{ label: "mean over seeds", value: `${d.m.toFixed(1)}%`, color: srcColor(d.s) },
          { label: "standard deviation", value: `${d.sd.toFixed(1)} points` }] }));
    });
  }

  // ---------------------------------------------------------- forest plot
  const SETTINGS = MODELS.flatMap((m) => ["r30", "r50"].map((r) => ({ m, r })));
  const COMPS = [
    { key: "alpaca-c4", label: "Alpaca minus C4", color: () => srcColor("alpaca"), src: "alpaca" },
    { key: "wikitext2-slimpajama", label: "WikiText-2 minus SlimPajama", color: () => srcColor("wikitext2"), src: "wikitext2" },
  ];
  let wF = 0;
  responsive(forest, (w) => { wF = w; drawForest(); });
  function drawForest() {
    if (!wF) return;
    const rows = SETTINGS.map(({ m, r }) => ({ m, r, c: COMPS.map((c) => ({ ...c, v: P.accuracy.paired[m]?.[r]?.[c.key]?.[tasks] })) }));
    const all = rows.flatMap((r) => r.c.flatMap((c) => (c.v ? [c.v[1], c.v[2]] : [])));
    const left = wF < 560 ? 118 : 150, right = 20, rowH = 34, top0 = 30;
    const H = top0 + rows.length * rowH + 36;
    const svg = svgIn(forest, wF, H, "Paired differences in accuracy with 95% intervals");
    const lim = Math.ceil(Math.max(Math.abs(d3.min(all)), Math.abs(d3.max(all))) + 0.5);
    const x = d3.scaleLinear().domain([-lim, lim]).range([left, wF - right]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${top0 - 6})`)
      .call(d3.axisBottom(x).ticks(8).tickSize(rows.length * rowH + 6).tickFormat(""));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", top0 - 10).attr("y2", top0 + rows.length * rowH)
      .attr("stroke", cssVar("--ink")).attr("stroke-width", 1.2);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${top0 + rows.length * rowH})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-title").attr("x", wF - right).attr("y", H - 2).attr("text-anchor", "end")
      .text("difference in mean accuracy (points)");
    // legend
    const narrowF = wF < 560;
    const lg = svg.append("g").attr("transform", `translate(${narrowF ? 6 : left},10)`);
    COMPS.forEach((c, i) => {
      const gx = lg.append("g").attr("transform", narrowF ? `translate(${i * 150},0)` : `translate(${i * 210},0)`);
      gx.append("line").attr("x1", 0).attr("x2", 18).attr("y1", 0).attr("y2", 0).attr("stroke", c.color()).attr("stroke-width", 3).attr("stroke-linecap", "round");
      gx.append("circle").attr("cx", 9).attr("r", 4.5).attr("fill", c.color());
      gx.append("text").attr("class", "lbl").attr("x", 24).attr("y", 4).text(narrowF ? c.label.replace(" minus ", " − ") : c.label);
    });
    rows.forEach((r, i) => {
      const yy = top0 + i * rowH + rowH / 2;
      svg.append("text").attr("class", "lbl").attr("x", 0).attr("y", yy + 4)
        .text(`${MODEL[r.m]}, ${r.r === "r30" ? "−30%" : "−50%"}`);
      r.c.forEach((c, k) => {
        if (!c.v) return;
        const off = (k - 0.5) * 11;
        const [d, lo, hi] = c.v;
        const sig = lo > 0 || hi < 0;
        const gg = svg.append("g").datum(c);
        gg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", yy + off).attr("y2", yy + off)
          .attr("stroke", c.color()).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("opacity", sig ? 0.9 : 0.4);
        gg.append("circle").attr("cx", x(d)).attr("cy", yy + off).attr("r", 5)
          .attr("fill", sig ? c.color() : cssVar("--bg-2")).attr("stroke", c.color()).attr("stroke-width", 2);
        gg.append("rect").attr("class", "hit").attr("x", x(lo) - 6).attr("y", yy + off - 8).attr("width", x(hi) - x(lo) + 12).attr("height", 16);
        tipOn(gg, () => ({ title: c.label, sub: `${MODEL[r.m]}, ${r.r === "r30" ? "−30%" : "−50%"}, ${tasks === "acc6" ? "six tasks" : "seven tasks"}`,
          rows: [{ label: "difference", value: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} points`, color: c.color() },
            { label: "95% interval", value: `${lo >= 0 ? "+" : "−"}${Math.abs(lo).toFixed(1)} to ${hi >= 0 ? "+" : "−"}${Math.abs(hi).toFixed(1)}` }],
          note: sig ? "The interval excludes zero." : "The interval includes zero: within the noise." }));
      });
    });
  }

  tableView(fig, () => {
    const rows = SETTINGS.map(({ m, r }) => {
      const p = P.accuracy.paired[m]?.[r];
      const f = (v) => (v ? `${v[0] >= 0 ? "+" : "−"}${Math.abs(v[0]).toFixed(1)} [${v[1] >= 0 ? "+" : "−"}${Math.abs(v[1]).toFixed(1)}, ${v[2] >= 0 ? "+" : "−"}${Math.abs(v[2]).toFixed(1)}]` : "–");
      return [`${MODEL[m]}, ${r === "r30" ? "−30%" : "−50%"}`, f(p?.["alpaca-c4"]?.acc6), f(p?.["alpaca-c4"]?.acc7),
        f(p?.["wikitext2-slimpajama"]?.acc6), f(p?.["wikitext2-slimpajama"]?.acc7)];
    });
    return { caption: "Paired differences in mean accuracy (points) with 95% paired-bootstrap intervals (Table 17).",
      columns: ["Setting", "Alpaca − C4, 6 tasks", "Alpaca − C4, 7 tasks", "WikiText-2 − SlimPajama, 6 tasks", "WikiText-2 − SlimPajama, 7 tasks"], rows };
  });
}
