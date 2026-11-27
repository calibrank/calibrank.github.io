// Figures 5 and 6: number of distinct calibration windows at a fixed budget of 512 steps,
// and the learning curves behind it (Llama-3.2-1B, -50%).
import { d3, SRC, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn, showTip, hideTip, tipOn,
  tableView, el, cssVar, blueRamp } from "../viz.js";

const METRICS = { wiki: "WikiText-2 perplexity", c4: "C4 perplexity", sp: "SlimPajama perplexity", acc: "mean accuracy (%)" };
const NS = [64, 128, 256, 512, 1024, 4096];

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let view = "size", metric = "sp", src = "c4";
  const SZ = P.data.size, CV = P.data.curves;

  segmented(controls, { label: "Show", value: view,
    options: [{ value: "size", label: "Final model vs. windows" }, { value: "curves", label: "Learning curves" }],
    onChange: (v) => { view = v; sync(); draw(); } });
  const mSeg = segmented(controls, { label: "Measure", value: metric,
    options: Object.entries(METRICS).map(([k, l]) => ({ value: k, label: l.replace(" perplexity", "").replace("mean accuracy (%)", "Accuracy") })),
    onChange: (v) => { metric = v; draw(); } });
  const sSeg = segmented(controls, { label: "Source", value: src,
    options: [{ value: "c4", label: "C4" }, { value: "selfdoc", label: "Self (doc.)" }], onChange: (v) => { src = v; draw(); } });
  function sync() { mSeg.node.style.display = view === "size" ? "" : "none"; sSeg.node.style.display = view === "curves" ? "" : "none"; }
  sync();

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() { if (!width) return; if (view === "size") size(); else curves(); }

  function size() {
    const m = { top: 16, right: 96, bottom: 42, left: 54 };
    const Wd = width - m.left - m.right, Hd = 270;
    const svg = svgIn(body, width, Hd + m.top + m.bottom, "Effect of the number of distinct calibration windows");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const x = d3.scaleLog().base(2).domain([56, 4700]).range([0, Wd]);
    const vals = ["c4", "selfdoc"].flatMap((s) => SZ[s].map((d) => d[metric]));
    const isAcc = metric === "acc";
    const y = isAcc ? d3.scaleLinear().domain([d3.min(vals) - 0.6, d3.max(vals) + 0.6]).range([Hd, 0])
      : d3.scaleLog().domain([d3.min(vals) / 1.12, d3.max(vals) * 1.12]).range([Hd, 0]);
    const yt = isAcc ? y.ticks(5) : y.ticks(5).filter((v, i, a) => a.length < 8 || [1, 2, 5].includes(+String(v)[0]));
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickValues(yt).tickSize(-Wd).tickFormat(""));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues(yt).tickFormat(isAcc ? (v) => `${v}%` : d3.format("~g")).tickSizeOuter(0));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${Hd})`)
      .call(d3.axisBottom(x).tickValues(NS).tickFormat(d3.format("d")).tickSizeOuter(0));
    g.append("text").attr("class", "axis-title").attr("x", Wd).attr("y", Hd + 34).attr("text-anchor", "end")
      .text("distinct calibration windows (512 steps each; at 4096 every window is seen once)");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -42).attr("text-anchor", "end").text(METRICS[metric]);
    g.append("line").attr("class", "ref-line").attr("x1", x(512)).attr("x2", x(512)).attr("y1", 0).attr("y2", Hd).attr("opacity", 0.6);
    g.append("text").attr("class", "ref-label").attr("x", x(512) + 4).attr("y", 10).text("main experiments");
    const line = d3.line().x((d) => x(d.n)).y((d) => y(d[metric]));
    for (const s of ["c4", "selfdoc"]) {
      const data = SZ[s];
      g.append("path").datum(data).attr("fill", "none").attr("stroke", srcColor(s)).attr("stroke-width", 2).attr("d", line);
      const pts = g.selectAll(`path.p-${s}`).data(data).join("path").attr("d", symbolPath(s, 70))
        .attr("transform", (d) => `translate(${x(d.n)},${y(d[metric])}) rotate(${symbolRotate(s)})`)
        .attr("fill", srcColor(s)).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
      tipOn(pts, (d) => ({ title: `${SRC[s]}, ${d.n} windows`, rows: [
        { label: "WikiText-2", value: d.wiki.toFixed(1), color: srcColor(s) }, { label: "C4", value: d.c4.toFixed(1), color: srcColor(s) },
        { label: "SlimPajama", value: d.sp.toFixed(1), color: srcColor(s) }, { label: "accuracy", value: `${d.acc.toFixed(1)}%`, color: srcColor(s) }],
        note: d.n === 4096 && s === "selfdoc" ? "Fresh documents for every step (a larger pool)." : null }));
      const last = data[data.length - 1];
      g.append("text").attr("class", "lbl").attr("x", x(last.n) + 10).attr("y", y(last[metric]) + 4).text(SRC[s]);
    }
  }

  function curves() {
    const m = { top: 16, right: 84, bottom: 42, left: 50 };
    const Wd = width - m.left - m.right, Hd = 270;
    const svg = svgIn(body, width, Hd + m.top + m.bottom, `Learning curves, ${SRC[src]}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const data = NS.filter((n) => CV[src][String(n)]).map((n) => ({ n, ...CV[src][String(n)] }));
    const x = d3.scaleLinear().domain([0, 512]).range([0, Wd]);
    const ymax = d3.max(data, (d) => d3.max(d.val.concat(d.train.slice(1))));
    const y = d3.scaleLinear().domain([0, ymax * 1.05]).nice().range([Hd, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-Wd).tickFormat(""));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${Hd})`)
      .call(d3.axisBottom(x).tickValues([64, 128, 192, 256, 320, 384, 448, 512]).tickSizeOuter(0));
    g.append("text").attr("class", "axis-title").attr("x", Wd).attr("y", Hd + 34).attr("text-anchor", "end").text("training step");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -36).attr("text-anchor", "end").text("KL from the dense model (nats per token)");
    const ramp = blueRamp();
    const col = (n) => ramp[{ 64: 2, 128: 4, 256: 6, 512: 8, 1024: 10, 4096: 12 }[n]];
    const line = d3.line().x((_, i) => x(data[0].steps[i])).y((v) => y(v));
    data.forEach((d) => {
      const steps = d.steps;
      const lv = d3.line().x((_, i) => x(steps[i])).y((v) => y(v));
      g.append("path").attr("fill", "none").attr("stroke", col(d.n)).attr("stroke-width", 2).attr("d", lv(d.val));
      // training KL from the second epoch (the first ramps the projectors in)
      g.append("path").attr("fill", "none").attr("stroke", col(d.n)).attr("stroke-width", 1.5).attr("opacity", 0.55)
        .attr("stroke-dasharray", "2 3").attr("d", d3.line().x((_, i) => x(steps[i + 1])).y((v) => y(v))(d.train.slice(1)));
      g.append("text").attr("class", "lbl").attr("x", Wd + 8).attr("y", y(d.val[d.val.length - 1]) + 4).attr("font-size", 11.5)
        .text(`${d.n}`);
    });
    void line;
    g.append("text").attr("class", "lbl-2").attr("x", Wd + 8).attr("y", -4).text("windows");
    // legend for line styles
    const lg = g.append("g").attr("transform", `translate(${Wd - 250},8)`);
    lg.append("line").attr("x1", 0).attr("x2", 22).attr("y1", 0).attr("y2", 0).attr("stroke", cssVar("--ink")).attr("stroke-width", 2);
    lg.append("text").attr("class", "lbl").attr("x", 28).attr("y", 4).text("validation windows");
    lg.append("line").attr("x1", 140).attr("x2", 162).attr("y1", 0).attr("y2", 0).attr("stroke", cssVar("--ink")).attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "2 3").attr("opacity", 0.6);
    lg.append("text").attr("class", "lbl").attr("x", 168).attr("y", 4).text("training windows");
    const cross = g.append("line").attr("stroke", cssVar("--ink-3")).attr("y1", 0).attr("y2", Hd).attr("opacity", 0);
    g.append("rect").attr("width", Wd).attr("height", Hd).attr("fill", "transparent").on("pointermove", (e) => {
      const [px] = d3.pointer(e);
      const i = Math.max(0, Math.min(7, Math.round(x.invert(px) / 64) - 1));
      cross.attr("x1", x(64 * (i + 1))).attr("x2", x(64 * (i + 1))).attr("opacity", 1);
      showTip(e, { title: `step ${64 * (i + 1)} (epoch ${i + 1})`, sub: `${SRC[src]}, KL on validation / training windows`,
        rows: data.map((d) => ({ label: `${d.n} windows`, value: `${d.val[i].toFixed(2)} / ${i ? d.train[i].toFixed(2) : "–"}`, color: col(d.n) })) });
    }).on("pointerleave", () => { cross.attr("opacity", 0); hideTip(); });
  }

  tableView(fig, () => {
    if (view === "size") {
      return { caption: "Llama-3.2-1B, −50%: trained model by number of distinct windows (Figure 5).",
        columns: ["Windows", "C4: WikiText-2", "C4: C4", "C4: SlimPajama", "C4: acc.", "Self (doc.): WikiText-2", "Self (doc.): C4", "Self (doc.): SlimPajama", "Self (doc.): acc."],
        rows: NS.map((n) => {
          const a = SZ.c4.find((d) => d.n === n), b = SZ.selfdoc.find((d) => d.n === n);
          return [n, ...[a, b].flatMap((d) => (d ? [d.wiki.toFixed(1), d.c4.toFixed(1), d.sp.toFixed(1), d.acc.toFixed(1)] : ["–", "–", "–", "–"]))];
        }) };
    }
    const data = NS.filter((n) => CV[src][String(n)]).map((n) => ({ n, ...CV[src][String(n)] }));
    return { caption: `${SRC[src]}: KL on validation and training windows after each epoch, and on the five common held-out sets (geometric mean).`,
      columns: ["Windows", "Final validation KL", "Final training KL", "Held-out (geo. mean)"],
      rows: data.map((d) => [d.n, d.val[d.val.length - 1].toFixed(3), d.train[d.train.length - 1].toFixed(3), d.heldout?.toFixed(3) ?? "–"]) };
  });
}
