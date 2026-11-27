// Section 4.6: exact self-samples fail on Qwen3-1.7B in every seed; independent documents
// do not. Left view: C4 perplexity of every seed. Right view: length limits and restarts
// (Table 12), with the share of tokens that follow a document boundary (text of 4.6).
import { d3, SOURCES, SRC, MODEL, srcColor, symbolPath, symbolRotate, segmented, parts, responsive, svgIn, tipOn,
  tableView, el, cssVar } from "../viz.js";

// Section 4.6: share of the tokens of each kind of sample that follow a document boundary
const AFTER_BOUNDARY = { "Exact, 2048 tokens": 58, "Exact, restarted every 512": 23, "Documents, at most 512": 0 };

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  let view = "seeds", model = "qwen3-1.7b", ratio = 0.3;

  segmented(controls, { label: "Show", value: view,
    options: [{ value: "seeds", label: "Every seed" }, { value: "variants", label: "Length and restarts" }],
    onChange: (v) => { view = v; sync(); draw(); } });
  const mSeg = segmented(controls, { label: "Model", value: model,
    options: ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"].map((m) => ({ value: m, label: MODEL[m] })), onChange: (v) => { model = v; draw(); } });
  const rSeg = segmented(controls, { label: "Ratio", value: ratio, options: [{ value: 0.3, label: "−30%" }, { value: 0.5, label: "−50%" }],
    onChange: (v) => { ratio = v; draw(); } });
  function sync() { mSeg.node.style.display = rSeg.node.style.display = view === "seeds" ? "" : "none"; }
  sync();

  const pts = P.hero.map(([m, r, seed, s, iw, ic, fw, fc]) => ({ m, r, seed, s, fw, fc }));
  let width = 0;
  responsive(body, (w) => { width = w; draw(); });
  function draw() { if (!width) return; if (view === "seeds") seeds(); else variants(); }

  function seeds() {
    const data = pts.filter((d) => d.m === model && d.r === ratio);
    const left = 104, right = 30, rowH = 32, top = 14;
    const H = top + SOURCES.length * rowH + 40;
    const svg = svgIn(body, width, H, "C4 perplexity of each seed by calibration source");
    const x = d3.scaleLog().domain([d3.min(data, (d) => d.fc) / 1.1, d3.max(data, (d) => d.fc) * 1.1]).range([left, width - right]);
    let ticks = x.ticks(6).filter((v) => [1, 2, 3, 5].includes(+String(v)[0]));
    if (ticks.length < 4) ticks = x.ticks(6);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${top - 4})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(SOURCES.length * rowH + 4).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${top + SOURCES.length * rowH})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("~g")).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-title").attr("x", width - right).attr("y", H - 4).attr("text-anchor", "end")
      .text("C4 perplexity after training (log scale), one mark per seed");
    SOURCES.forEach((s, i) => {
      const yy = top + i * rowH + rowH / 2;
      svg.append("text").attr("class", "lbl").attr("x", 0).attr("y", yy + 4).text(SRC[s]);
      const ds = data.filter((d) => d.s === s);
      const [lo, hi] = d3.extent(ds, (d) => d.fc);
      svg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", yy).attr("y2", yy).attr("stroke", srcColor(s))
        .attr("stroke-width", 2).attr("opacity", 0.45);
      const mk = svg.selectAll(null).data(ds).join("path").attr("d", symbolPath(s, 80))
        .attr("transform", (d) => `translate(${x(d.fc)},${yy}) rotate(${symbolRotate(s)})`)
        .attr("fill", srcColor(s)).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5);
      tipOn(mk, (d) => ({ title: `${SRC[s]}, seed ${d.seed}`, sub: `${MODEL[model]}, ${ratio === 0.3 ? "−30%" : "−50%"}`,
        rows: [{ label: "C4 perplexity", value: d.fc.toFixed(1), color: srcColor(s) }, { label: "WikiText-2 perplexity", value: d.fw.toFixed(1), color: srcColor(s) }],
        note: s === "selfgen" ? "Each seed samples its own pool of exact self-samples." : null }));
      if (hi / lo > 1.25) svg.append("text").attr("class", "lbl-2").attr("x", x(hi) + 10).attr("y", yy + 4).text(`${(hi / lo).toFixed(1)}× apart`);
    });
  }

  function variants() {
    const rows = P.selfgen.lengths;
    const groups = ["qwen3-1.7b", "llama-3.2-1b"];
    const left = Math.min(230, width * 0.42), right = 70, rowH = 26, gap = 30, top = 30;
    const H = top + groups.length * (6 * rowH + gap) + 10;
    const svg = svgIn(body, width, H, "C4 perplexity by kind of self-generated calibration text");
    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.c4) * 1.08]).range([left, width - right]);
    let yy = top;
    svg.append("text").attr("class", "lbl-2").attr("x", left).attr("y", 12).text("C4 perplexity after training, −30%, seed 0");
    for (const m of groups) {
      svg.append("text").attr("class", "lbl").attr("font-weight", 650).attr("x", 0).attr("y", yy + 2).text(MODEL[m]);
      yy += 10;
      rows.filter((d) => d.model === m).forEach((d) => {
        const exact = d.text.startsWith("Exact");
        const color = exact ? srcColor("selfgen") : srcColor("selfdoc");
        const g = svg.append("g").attr("transform", `translate(0,${yy})`).datum(d);
        g.append("text").attr("class", "lbl").attr("x", 10).attr("y", rowH / 2 + 4).text(d.text);
        g.append("rect").attr("x", left).attr("y", 5).attr("height", rowH - 10).attr("width", Math.max(1, x(d.c4) - left))
          .attr("rx", 3).attr("fill", color);
        let label = d.c4.toFixed(1);
        if (m === "qwen3-1.7b" && AFTER_BOUNDARY[d.text] != null) label += `  ·  ${AFTER_BOUNDARY[d.text]}% of tokens after a boundary`;
        g.append("text").attr("class", "lbl").attr("x", x(d.c4) + 6).attr("y", rowH / 2 + 4).text(label);
        g.append("rect").attr("class", "hit").attr("x", 0).attr("y", 0).attr("width", width).attr("height", rowH);
        tipOn(g, () => ({ title: d.text, sub: MODEL[m], rows: [
          { label: "C4 perplexity", value: d.c4.toFixed(1), color }, { label: "WikiText-2", value: d.wiki.toFixed(1), color },
          { label: "accuracy (6 tasks)", value: `${d.acc6.toFixed(1)}%`, color },
          { label: "KL on held-out self-samples", value: d.klSelf.toFixed(3), color }] }));
        yy += rowH;
      });
      yy += gap - 10;
    }
  }

  tableView(fig, () => {
    if (view === "seeds") {
      const data = pts.filter((d) => d.m === model && d.r === ratio);
      return { caption: `${MODEL[model]}, ${ratio === 0.3 ? "−30%" : "−50%"}: C4 perplexity of every seed.`,
        columns: ["Calibration", "Seed 0", "Seed 1", "Seed 2"],
        rows: SOURCES.map((s) => [SRC[s], ...[0, 1, 2].map((k) => data.find((d) => d.s === s && d.seed === k)?.fc.toFixed(1) ?? "–")]) };
    }
    return { caption: "Self-generated calibration with length limits and restarts, −30%, seed 0 (Table 12).",
      columns: ["Model", "Self-generated text", "WikiText-2", "C4", "SlimPajama", "Acc. (6 tasks)", "KL self", "KL C4"],
      rows: P.selfgen.lengths.map((d) => [MODEL[d.model], d.text, d.wiki.toFixed(1), d.c4.toFixed(1), d.sp.toFixed(1), d.acc6.toFixed(1), d.klSelf.toFixed(3), d.klC4.toFixed(3)]) };
  });
}
