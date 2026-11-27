// Section 4.4: the calibration data act through the initialization statistics and the
// training windows. Left: the crossover of Table 9. Right: overlap of removed subspaces
// by depth (Figure A4).
import { d3, SRC, MODEL, srcColor, segmented, parts, responsive, svgIn, showTip, hideTip, tableView, el, cssVar, fmtPpl, blueRamp } from "../viz.js";

const PAIRS = [["c4", "selfdoc"], ["wikitext2", "slimpajama"]];

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let view = "crossover", model = "llama-3.2-1b", ratio = "r50";
  const X = P.ablations.crossover;
  const find = (i, t) => X.find((r) => r.init === i && r.train === t);

  const viewSeg = segmented(controls, { label: "Show", value: view,
    options: [{ value: "crossover", label: "Statistics × windows" }, { value: "subspaces", label: "Removed subspaces" }],
    onChange: (v) => { view = v; sync(); draw(); } });
  const mSeg = segmented(controls, { label: "Model", value: model,
    options: ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"].map((m) => ({ value: m, label: MODEL[m] })), onChange: (v) => { model = v; draw(); } });
  const rSeg = segmented(controls, { label: "Ratio", value: ratio, options: [{ value: "r30", label: "−30%" }, { value: "r50", label: "−50%" }],
    onChange: (v) => { ratio = v; draw(); } });
  function sync() { mSeg.node.style.display = rSeg.node.style.display = view === "subspaces" ? "" : "none"; }
  sync();
  void viewSeg;

  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() { if (!width) return; if (view === "crossover") crossover(); else subspaces(); }

  function crossover() {
    const wrap = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:18px" });
    for (const [a, b] of PAIRS) {
      const grid = el("div", { style: "display:grid;grid-template-columns:auto 1fr 1fr;gap:6px;font-family:var(--font-sans);font-size:13px;align-items:stretch" });
      grid.append(el("div", { style: "align-self:end;color:var(--ink-2);font-size:11.5px;line-height:1.3" }, "statistics ↓", el("br"), "windows →"));
      for (const t of [a, b]) grid.append(el("div", { style: "font-weight:650;text-align:center;padding:4px 0" },
        el("span", { class: "sw", style: `--c:var(--s-${t})` }), SRC[t]));
      for (const i of [a, b]) {
        grid.append(el("div", { style: "font-weight:650;align-self:center;white-space:nowrap" }, el("span", { class: "sw", style: `--c:var(--s-${i})` }), SRC[i]));
        for (const t of [a, b]) {
          const r = find(i, t);
          const own = i === t;
          const cell = el("div", { style: `background:var(--bg);border:1px solid ${own ? "var(--rule)" : "var(--ink)"};border-radius:10px;padding:8px 10px;line-height:1.45` });
          const base = find(t, t);
          const line = (key, label) => {
            const v = r[key], v0 = base[key];
            const better = !own && v < v0 * 0.98, worse = !own && v > v0 * 1.02;
            const pct = Math.round(100 * (v / v0 - 1));
            return el("div", { style: "display:flex;justify-content:space-between;gap:8px;white-space:nowrap" },
              el("span", { class: "muted" }, label),
              el("span", { style: "font-variant-numeric:tabular-nums;font-weight:650" },
                fmtPpl(v), !own ? el("span", { class: "muted", style: "font-weight:400;font-size:11.5px;display:inline-block;min-width:46px;text-align:right" },
                  better || worse ? ` ${pct > 0 ? "+" : "−"}${Math.abs(pct)}%` : " ≈") : ""));
          };
          cell.append(line("wiki", "WikiText-2"), line("c4", "C4"), line("sp", "SlimPajama"));
          if (!own) cell.append(el("div", { class: "muted", style: "font-size:11.5px;margin-top:3px" }, "swapped statistics"));
          grid.append(cell);
        }
      }
      grid.style.minWidth = "400px";
      wrap.append(el("div", { class: "scroll-x" }, grid));
    }
    body.replaceChildren(wrap,
      el("p", { class: "fig-sub", style: "margin:12px 0 0" },
        "Perplexity of Llama-3.2-1B compressed by 50% (seed 0). Each row is the source of the initialization statistics (Gram matrices), each column the source of the training windows; outlined cells swap them, with the change against the same windows trained from their own statistics."));
  }

  function subspaces() {
    const S = P.subspaces[model]?.[ratio];
    if (!S) return;
    const m = { top: 16, right: 150, bottom: 40, left: 50 };
    const Wd = width - m.left - m.right, Hd = 260;
    const svg = svgIn(body, width, Hd + m.top + m.bottom, "Overlap of removed subspaces by block");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const x = d3.scaleLinear().domain(d3.extent(S.blocks)).range([0, Wd]);
    const y = d3.scaleLinear().domain([Math.min(0.4, d3.min(S.chance) - 0.05), 1]).range([Hd, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-Wd).tickFormat(""));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${Hd})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    g.append("text").attr("class", "axis-title").attr("x", Wd).attr("y", Hd + 32).attr("text-anchor", "end").text("transformer block");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -38).attr("text-anchor", "end").text("subspace overlap ‖U_aᵀU_b‖²/k");
    const series = [
      { key: "init-final", label: "same run, before vs after training", color: cssVar("--ink"), v: S.series["init-final"], w: 2.5 },
      { key: "init-init", label: "different sources, before training", color: blueRamp()[4], v: S.series["init-init"], w: 2 },
      { key: "final-final", label: "different sources, after training", color: blueRamp()[9], v: S.series["final-final"], w: 2 },
      { key: "chance", label: "unrelated subspaces (k/d)", color: cssVar("--muted"), v: S.chance, w: 1.5 },
    ];
    const line = d3.line().x((_, i) => x(S.blocks[i])).y((v) => y(v)).curve(d3.curveMonotoneX);
    g.selectAll("path.s").data(series).join("path").attr("fill", "none").attr("stroke", (d) => d.color)
      .attr("stroke-width", (d) => d.w).attr("stroke-linecap", "round").attr("d", (d) => line(d.v));
    const ends = series.map((d) => ({ ...d, y: y(d.v[d.v.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 26) ends[i].y = ends[i - 1].y + 26;
    ends.forEach((d) => {
      const t = g.append("text").attr("class", "lbl").attr("x", Wd + 8).attr("y", d.y + 4).attr("font-size", 11.5);
      const words = d.label.split(", ");
      t.append("tspan").attr("x", Wd + 8).text(words[0] + (words[1] ? "," : ""));
      if (words[1]) t.append("tspan").attr("x", Wd + 8).attr("dy", 13).attr("fill", cssVar("--ink-2")).text(words[1]);
      g.append("line").attr("x1", Wd + 1).attr("x2", Wd + 6).attr("y1", y(d.v[d.v.length - 1])).attr("y2", d.y).attr("stroke", d.color);
    });
    const cross = g.append("line").attr("stroke", cssVar("--ink-3")).attr("y1", 0).attr("y2", Hd).attr("opacity", 0);
    g.append("rect").attr("width", Wd).attr("height", Hd).attr("fill", "transparent").on("pointermove", (e) => {
      const [px] = d3.pointer(e);
      const b = Math.round(x.invert(px));
      const i = S.blocks.indexOf(Math.max(S.blocks[0], Math.min(S.blocks[S.blocks.length - 1], b)));
      if (i < 0) return;
      cross.attr("x1", x(S.blocks[i])).attr("x2", x(S.blocks[i])).attr("opacity", 1);
      showTip(e, { title: `block ${S.blocks[i]}`, sub: `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}, mean over units`,
        rows: series.map((d) => ({ label: d.label, value: d.v[i].toFixed(3), color: d.color })) });
    }).on("pointerleave", () => { cross.attr("opacity", 0); hideTip(); });
  }

  tableView(fig, () => {
    if (view === "crossover") {
      return { caption: "Llama-3.2-1B, −50%, seed 0: initialization statistics × training windows (Table 9).",
        columns: ["Statistics", "Windows", "WikiText-2", "C4", "SlimPajama", "Accuracy (%)"],
        rows: X.map((r) => [SRC[r.init], SRC[r.train], fmtPpl(r.wiki), fmtPpl(r.c4), fmtPpl(r.sp), r.acc.toFixed(1)]) };
    }
    const S = P.subspaces[model][ratio];
    return { caption: `${MODEL[model]}, ${ratio === "r30" ? "−30%" : "−50%"}: mean overlap of removed subspaces per block.`,
      columns: ["Block", "Same run, before vs after", "Sources, before", "Sources, after", "Chance (k/d)"],
      rows: S.blocks.map((b, i) => [b, S.series["init-final"][i].toFixed(3), S.series["init-init"][i].toFixed(3),
        S.series["final-final"][i].toFixed(3), S.chance[i].toFixed(3)]) };
  });
}
