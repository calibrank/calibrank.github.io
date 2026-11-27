// Hero: every compressed model of the three-seed grid and of Llama-3.1-8B, placed by its
// WikiText-2 and C4 perplexity. Three states: untrained, trained, relative to the best source.
import {
  d3, SOURCES, SRC, MODEL, MODELS, srcColor, symbolPath, symbolRotate, segmented, legend, showTip,
  hideTip, tableView, parts, responsive, svgIn, logTicks, tickFmt, fmtPpl, fmtX, dur, REDUCED, el, cssVar,
} from "../viz.js";

const STATES = [
  { key: "init", label: "Untrained", x: "C4 perplexity ÷ dense model", y: "WikiText-2 perplexity ÷ dense model" },
  { key: "final", label: "Trained", x: "C4 perplexity ÷ dense model", y: "WikiText-2 perplexity ÷ dense model" },
  { key: "best", label: "Specialized", x: "C4 perplexity ÷ best source in the setting",
    y: "WikiText-2 perplexity ÷ best source in the setting" },
];

export default function init(fig, { P }) {
  const { controls, body } = parts(fig);
  const captionNode = fig.querySelector(".state-caption");
  const stepsNode = fig.querySelector(".steps");
  const dense = P.dense.ext;

  const pts = P.hero.map(([m, r, seed, s, iw, ic, fw, fc], i) => ({ i, m, r, seed, s, iw, ic, fw, fc }));
  const key = (d) => `${d.m}|${d.r}|${d.seed}`;
  const best = d3.rollup(pts, (v) => ({ w: d3.min(v, (d) => d.fw), c: d3.min(v, (d) => d.fc) }), key);
  for (const d of pts) {
    const dn = dense[d.m];
    const b = best.get(key(d));
    d.pos = {
      init: [d.ic / dn.c4, d.iw / dn.wiki],
      final: [d.fc / dn.c4, d.fw / dn.wiki],
      best: [d.fc / b.c, d.fw / b.w],
    };
  }
  const settings = new Set(pts.map(key)).size;

  // numbers for the captions, computed from the records
  const spread = (metric) => d3.max(d3.groups(pts, key), ([, v]) => d3.max(v, metric) / d3.min(v, metric));
  const untrainedSpread = Math.max(spread((d) => d.iw), spread((d) => d.ic));
  const trainedSpread = Math.max(spread((d) => d.fw), spread((d) => d.fc));
  const initRange = d3.extent(pts.flatMap((d) => d.pos.init));
  const finalRange = d3.extent(pts.flatMap((d) => d.pos.final));
  const wikiFloor = pts.filter((d) => d.s === "wikitext2" && Math.abs(d.pos.best[1] - 1) < 1e-9).length;
  const c4Wall = pts.filter((d) => d.s === "c4" && Math.abs(d.pos.best[0] - 1) < 1e-9).length;
  const nWiki = pts.filter((d) => d.s === "wikitext2").length;
  const nC4 = pts.filter((d) => d.s === "c4").length;

  const captions = {
    init: [
      el("span", { class: "big" }, "Before training"),
      `, the compressed models (the whitened initialization of each calibration source) sit ${fmtX(initRange[0])} to ${fmtX(initRange[1])} above the dense model's perplexity. On the same model, ratio and seed, the six sources differ by up to ${d3.format(",.0f")(untrainedSpread)}-fold.`,
    ],
    final: [
      el("span", { class: "big" }, "After training"),
      `, every model is within ${fmtX(finalRange[0])} to ${fmtX(finalRange[1])} of the dense model, and the sources differ by at most ${d3.format(".1f")(trainedSpread)}-fold. Training removes most of the dependence on the calibration data, but not all of it.`,
    ],
    best: [
      el("span", { class: "big" }, "Relative to the best source"),
      ` in each of the ${settings} settings, the remaining differences are specialization: all ${wikiFloor} of ${nWiki} WikiText-2-calibrated models are the best on WikiText-2 (the floor, y = 1), and all ${c4Wall} of ${nC4} C4-calibrated models are the best on C4 (the wall, x = 1). Each source preserves its own text.`,
    ],
  };

  // ------------------------------------------------------------ controls
  // ?hero=init|final|best opens a given step (and skips the autoplay), for links to a view
  const asked = new URLSearchParams(location.search).get("hero");
  let state = STATES.some((s) => s.key === asked) ? asked : "init";
  let modelFilter = "all";
  let ratioFilter = "all";
  let hover = null;
  let autoplay = !REDUCED && !asked;
  const timers = [];
  const stopAuto = () => { autoplay = false; timers.forEach(clearTimeout); };

  const stepButtons = STATES.map((s, i) => {
    const b = el("button", { type: "button", class: "step", "aria-pressed": String(s.key === state) },
      el("span", { class: "n", text: String(i + 1) }), s.label);
    b.addEventListener("click", () => { stopAuto(); go(s.key); });
    stepsNode.append(b);
    return b;
  });
  segmented(controls, {
    label: "Model", value: "all",
    options: [{ value: "all", label: "All" }, ...MODELS.map((m) => ({ value: m, label: MODEL[m] }))],
    onChange: (v) => { modelFilter = v; paint(); },
  });
  segmented(controls, {
    label: "Ratio", value: "all",
    options: [{ value: "all", label: "Both" }, { value: 0.3, label: "−30%" }, { value: 0.5, label: "−50%" }],
    onChange: (v) => { ratioFilter = v; paint(); },
  });
  const legendNode = legend(body.parentNode, SOURCES.map((s) => ({ key: s, label: SRC[s], color: srcColor(s) })), {
    onHover: (k) => { hover = k; paint(); },
  });
  body.before(legendNode);

  // ------------------------------------------------------------ drawing
  let svg, g, x, y, W, H, gx, gy, gridx, gridy, marks, delaunay, refs, notes, xTitle, yTitle;
  const margin = { top: 12, right: 18, bottom: 48, left: 58 };

  function domainFor(s) {
    const xs = pts.map((d) => d.pos[s][0]), ys = pts.map((d) => d.pos[s][1]);
    const lo = s === "best" ? 0.93 : 0.85;
    return [[lo, d3.max(xs) * 1.25], [lo, d3.max(ys) * 1.25]];
  }

  function draw(width) {
    W = width - margin.left - margin.right;
    H = Math.round(Math.min(520, Math.max(320, width * 0.52))) - margin.top - margin.bottom;
    svg = svgIn(body, width, H + margin.top + margin.bottom,
      "Scatter plot of compressed models by WikiText-2 and C4 perplexity");
    g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const [dx, dy] = domainFor(state);
    x = d3.scaleLog().domain(dx).range([0, W]);
    y = d3.scaleLog().domain(dy).range([H, 0]);
    gridx = g.append("g").attr("class", "grid");
    gridy = g.append("g").attr("class", "grid");
    gx = g.append("g").attr("class", "axis").attr("transform", `translate(0,${H})`);
    gy = g.append("g").attr("class", "axis");
    xTitle = g.append("text").attr("class", "axis-title").attr("x", W).attr("y", H + 38).attr("text-anchor", "end");
    yTitle = g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("x", 0).attr("y", -44)
      .attr("text-anchor", "end");
    refs = g.append("g");
    notes = g.append("g");
    marks = g.append("g").selectAll("path").data(pts, (d) => d.i).join("path")
      .attr("d", (d) => symbolPath(d.s, 62))
      .attr("fill", (d) => srcColor(d.s))
      .attr("stroke", cssVar("--bg-2")).attr("stroke-width", 1.5).attr("paint-order", "stroke");
    const overlay = g.append("rect").attr("width", W).attr("height", H).attr("fill", "transparent")
      .style("cursor", "crosshair");
    overlay.on("pointermove", (e) => {
      const [px, py] = d3.pointer(e);
      const i = delaunay?.find(px, py);
      if (i == null) return;
      const d = visiblePts[i];
      const [cx, cy] = [x(d.pos[state][0]), y(d.pos[state][1])];
      if (Math.hypot(cx - px, cy - py) > 28) { hideTip(); setFocus(null); return; }
      setFocus(d);
      showTip(e, tipFor(d));
    }).on("pointerleave", () => { hideTip(); setFocus(null); });
    axes(0);
    place(0);
    paint();
  }

  let visiblePts = pts;
  let focus = null;
  function setFocus(d) {
    if (focus === d) return;
    focus = d;
    marks.attr("d", (p) => symbolPath(p.s, p === focus ? 150 : 62));
  }

  function tipFor(d) {
    const dn = dense[d.m];
    return {
      title: `${MODEL[d.m]}, ${d.r === 0.3 ? "−30%" : "−50%"}, seed ${d.seed}`,
      sub: `calibrated on ${SRC[d.s]}`,
      rows: [
        { label: "WikiText-2 untrained", value: fmtPpl(d.iw), color: srcColor(d.s) },
        { label: "WikiText-2 trained", value: fmtPpl(d.fw), color: srcColor(d.s) },
        { label: "C4 untrained", value: fmtPpl(d.ic), color: srcColor(d.s) },
        { label: "C4 trained", value: fmtPpl(d.fc), color: srcColor(d.s) },
      ],
      note: `Dense model: ${fmtPpl(dn.wiki)} on WikiText-2, ${fmtPpl(dn.c4)} on C4.`,
    };
  }

  function axes(ms) {
    const [dx, dy] = domainFor(state);
    x.domain(dx); y.domain(dy);
    const tx = logTicks(dx, W < 420 ? 4 : 7), ty = logTicks(dy, 6);
    const t = svg.transition().duration(ms).ease(d3.easeCubicInOut);
    gx.transition(t).call(d3.axisBottom(x).tickValues(tx).tickFormat((v) => `${tickFmt(v)}×`).tickSizeOuter(0));
    gy.transition(t).call(d3.axisLeft(y).tickValues(ty).tickFormat((v) => `${tickFmt(v)}×`).tickSizeOuter(0));
    gridx.transition(t).call(d3.axisBottom(x).tickValues(tx).tickSize(H).tickFormat(""))
      .attr("transform", "translate(0,0)");
    gridy.transition(t).call(d3.axisLeft(y).tickValues(ty).tickSize(-W).tickFormat(""));
    const st = STATES.find((s) => s.key === state);
    xTitle.text(st.x);
    yTitle.text(st.y);
    // reference marks
    refs.selectAll("*").remove();
    notes.selectAll("*").remove();
    if (state === "best") {
      refs.append("line").attr("class", "ref-line").attr("x1", 0).attr("x2", W).attr("y1", y(1)).attr("y2", y(1));
      refs.append("line").attr("class", "ref-line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", 0).attr("y2", H);
      const wiki = pts.filter((d) => d.s === "wikitext2").map((d) => d.pos.best[0]);
      const c4 = pts.filter((d) => d.s === "c4").map((d) => d.pos.best[1]);
      const nx = x(d3.max(wiki)) + 10, ny = y(d3.max(c4)) - 10;
      const narrow = W < 520;
      const floor = notes.append("text").attr("class", "lbl").attr("y", y(1) - 10)
        .text(narrow ? "WikiText-2: best on WikiText-2" : "WikiText-2 calibration: best on WikiText-2");
      if (narrow) floor.attr("x", W - 2).attr("text-anchor", "end");
      else floor.attr("x", Math.min(nx, W - 4)).attr("text-anchor", nx > W - 260 ? "end" : "start");
      notes.append("text").attr("class", "lbl").attr("x", x(1) + 10).attr("y", Math.max(14, ny))
        .text(narrow ? "C4: best on C4" : "C4 calibration: best on C4");
      notes.attr("opacity", 0).transition().delay(dur(ms * 0.8)).duration(dur(400)).attr("opacity", 1);
    } else {
      refs.append("path").attr("d", d3.symbol(d3.symbolStar, 120)()).attr("fill", cssVar("--ink"))
        .attr("transform", `translate(${x(1)},${y(1)})`);
      refs.append("text").attr("class", "lbl").attr("x", x(1) + 12).attr("y", y(1) - 8).text("dense model");
    }
  }

  function place(ms) {
    marks.transition().duration(ms).ease(d3.easeCubicInOut)
      .delay((d) => (ms ? (SOURCES.indexOf(d.s) * 35 + (d.i % 7) * 12) : 0))
      .attr("transform", (d) => `translate(${x(d.pos[state][0])},${y(d.pos[state][1])}) rotate(${symbolRotate(d.s)})`);
    visiblePts = pts.filter(isOn);
    delaunay = d3.Delaunay.from(visiblePts, (d) => x(d.pos[state][0]), (d) => y(d.pos[state][1]));
  }

  const isOn = (d) => (modelFilter === "all" || d.m === modelFilter) && (ratioFilter === "all" || d.r === ratioFilter);

  function paint() {
    if (!marks) return;
    marks.attr("opacity", (d) => {
      if (!isOn(d)) return 0.07;
      if (hover && d.s !== hover) return 0.12;
      return 0.95;
    }).attr("pointer-events", "none");
    marks.filter((d) => isOn(d)).raise();
    visiblePts = pts.filter(isOn);
    delaunay = d3.Delaunay.from(visiblePts, (d) => x(d.pos[state][0]), (d) => y(d.pos[state][1]));
  }

  function go(s, ms = 1300) {
    state = s;
    stepButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(STATES[i].key === s)));
    captionNode.replaceChildren(...captions[s]);
    axes(dur(ms));
    place(dur(ms));
  }

  captionNode.replaceChildren(...captions[state]);
  responsive(body, (w) => draw(w));

  // play the story once, the first time the figure is on screen
  if (autoplay) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      timers.push(setTimeout(() => { if (autoplay) go("final"); }, 1600));
      timers.push(setTimeout(() => { if (autoplay) go("best"); }, 5600));
    }, { threshold: 0.45 });
    io.observe(body);
  }
  body.addEventListener("pointerdown", stopAuto);

  tableView(fig, () => ({
    caption: "Perplexity of each compressed model before and after training (extended evaluation; three seeds, Llama-3.1-8B at −50% one seed).",
    columns: ["Model", "Ratio", "Seed", "Calibration", "WikiText-2 untrained", "WikiText-2 trained", "C4 untrained", "C4 trained"],
    rows: pts.filter(isOn).map((d) => [MODEL[d.m], d.r === 0.3 ? "−30%" : "−50%", d.seed, SRC[d.s],
      fmtPpl(d.iw), fmtPpl(d.fw), fmtPpl(d.ic), fmtPpl(d.fc)]),
  }));
}
