// Figure 1: entropy of the dense model's next-token distribution along the calibration
// windows of each source; below, what the self-generated text looks like.
import {
  d3, SOURCES, SRC, MODEL, srcColor, segmented, legend, parts, responsive, svgIn, showTip, hideTip,
  tableView, el, cssVar, dur,
} from "../viz.js";

const SPECIAL = /(<\|end_of_text\|>|<\|begin_of_text\|>|<\|endoftext\|>|<\/s>|<s>)/g;

function tokenized(text) {
  // plain text with special tokens shown as chips; never innerHTML
  const frag = document.createDocumentFragment();
  const LABEL = { "<|end_of_text|>": "EOS", "<|begin_of_text|>": "BOS", "<|endoftext|>": "EOS", "</s>": "BOS/EOS", "<s>": "BOS" };
  for (const part of text.split(SPECIAL)) {
    if (!part) continue;
    if (Object.hasOwn(LABEL, part)) frag.append(el("span", { class: "tok-special", title: part, text: LABEL[part] }));
    else frag.append(document.createTextNode(part));
  }
  return frag;
}

export default function init(fig, { P, EX }) {
  const { controls, body } = parts(fig);
  let model = "llama-3.2-1b";
  let hover = null;
  const stats = P.sourceStats;

  segmented(controls, { label: "Model", value: model,
    options: ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"].map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; chart.rerender(); renderExcerpts(); } });
  const lg = legend(body.parentNode, SOURCES.map((s) => ({ key: s, label: SRC[s], color: srcColor(s), kind: "line" })),
    { onHover: (k) => { hover = k; paint(); } });
  body.before(lg);

  const plot = el("div");
  const ex = el("div");
  body.replaceChildren(plot, ex);

  let lines;
  function paint() {
    lines?.attr("opacity", (d) => (hover && d.s !== hover ? 0.15 : 1))
      .attr("stroke-width", (d) => (hover === d.s ? 3 : 2));
  }

  const chart = responsive(plot, (width) => {
    const m = { top: 14, right: 96, bottom: 42, left: 46 };
    const Wd = width - m.left - m.right, Hd = Math.min(300, Math.max(220, width * 0.32));
    const svg = svgIn(plot, width, Hd + m.top + m.bottom, `Entropy along the calibration windows, ${MODEL[model]}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const series = SOURCES.map((s) => ({ s, v: stats[model][s].entropy }));
    const n = series[0].v.length;
    const x = d3.scaleLinear().domain([0, 2048]).range([0, Wd]);
    const y = d3.scaleLinear().domain([0, 6]).nice().range([Hd, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-Wd).tickFormat(""));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${Hd})`)
      .call(d3.axisBottom(x).tickValues([0, 512, 1024, 1536, 2048]).tickSizeOuter(0));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    g.append("text").attr("class", "axis-title").attr("x", Wd).attr("y", Hd + 34).attr("text-anchor", "end")
      .text("position in the 2048-token window");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -34).attr("text-anchor", "end")
      .text("entropy (nats per token)");
    const xc = (i) => x(64 + 128 * i);
    const line = d3.line().x((_, i) => xc(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
    lines = g.selectAll("path.s").data(series).join("path").attr("class", "s")
      .attr("fill", "none").attr("stroke", (d) => srcColor(d.s)).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", (d) => line(d.v));
    if (dur(1)) {
      lines.each(function () {
        const L = this.getTotalLength();
        d3.select(this).attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
          .transition().duration(1100).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0)
          .on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
      });
    }
    // direct labels for the two self-generated sources, which carry the story
    const ends = series.filter((d) => d.s === "selfgen" || d.s === "selfdoc")
      .map((d) => ({ s: d.s, y: y(d.v[n - 1]) })).sort((a, b) => a.y - b.y);
    if (ends.length === 2 && ends[1].y - ends[0].y < 14) { ends[0].y -= 7; ends[1].y += 7; }
    g.selectAll("text.end").data(ends).join("text").attr("class", "lbl").attr("x", Wd + 8).attr("y", (d) => d.y + 4)
      .text((d) => SRC[d.s]);
    // crosshair
    const cross = g.append("line").attr("stroke", cssVar("--ink-3")).attr("y1", 0).attr("y2", Hd).attr("opacity", 0);
    g.append("rect").attr("width", Wd).attr("height", Hd).attr("fill", "transparent")
      .on("pointermove", (e) => {
        const [px] = d3.pointer(e);
        const i = Math.max(0, Math.min(n - 1, Math.round((x.invert(px) - 64) / 128)));
        cross.attr("x1", xc(i)).attr("x2", xc(i)).attr("opacity", 1);
        const rows = [...series].sort((a, b) => b.v[i] - a.v[i])
          .map((d) => ({ label: SRC[d.s], value: d.v[i].toFixed(2), color: srcColor(d.s) }));
        showTip(e, { title: `tokens ${128 * i}–${128 * i + 127}`, sub: MODEL[model], rows });
      })
      .on("pointerleave", () => { cross.attr("opacity", 0); hideTip(); });
    paint();
  });

  function renderExcerpts() {
    ex.replaceChildren();
    if (!EX) return;
    const mine = EX.excerpts.filter((e) => e.model === model);
    const exact = mine.filter((e) => e.kind === "exact");
    const docs = mine.filter((e) => e.kind === "document");
    let ei = 0, di = 0;
    const box = el("div");
    const head = el("div", { class: "fig-head", style: "margin:18px 0 0" },
      el("div", {}, el("p", { class: "fig-title" }, `What ${MODEL[model]} writes`),
        el("p", { class: "fig-sub" }, "Raw samples of the dense model at temperature one, unedited. Special tokens are shown as chips.")));
    const another = el("button", { type: "button", class: "linkbtn" }, "Another sample");
    head.append(another);
    const draw = () => {
      box.replaceChildren();
      const e = exact[ei % exact.length];
      const d = docs[di % docs.length];
      const grid = el("div", { class: "excerpts" });
      if (e) {
        grid.append(
          el("div", { class: "excerpt" }, el("div", { class: "ex-head" }, el("span", {}, "Exact sample · tokens 1–96"),
            el("span", {}, "start")), el("pre", {}, tokenized(e.head))),
          el("div", { class: "excerpt" }, el("div", { class: "ex-head" }, el("span", {}, "Same sample · tokens 1953–2048"),
            el("span", {}, "end")), el("pre", {}, tokenized(e.tail))),
        );
      }
      box.append(grid);
      if (e) box.append(el("p", { class: "ex-note" }, e.note));
      if (d) {
        box.append(el("div", { class: "excerpts", style: "grid-template-columns:1fr" },
          el("div", { class: "excerpt" }, el("div", { class: "ex-head" },
            el("span", {}, `Self-generated document · ${d.length} tokens${d.length >= 512 ? " (cut at the 512-token limit)" : ""}`),
            el("span", {}, "first 96 tokens")), el("pre", {}, tokenized(d.text)))));
        box.append(el("p", { class: "ex-note" }, d.note));
      }
    };
    another.addEventListener("click", () => { ei++; di++; draw(); });
    if (exact.length < 2 && docs.length < 2) another.hidden = true;
    ex.append(head, box);
    draw();
  }
  renderExcerpts();

  tableView(fig, () => ({
    caption: `Entropy (nats per token) of ${MODEL[model]} along the windows of each source, in buckets of 128 positions (32 validation windows).`,
    columns: ["Positions", ...SOURCES.map((s) => SRC[s])],
    rows: stats[model].wikitext2.entropy.map((_, i) => [`${128 * i}–${128 * i + 127}`,
      ...SOURCES.map((s) => stats[model][s].entropy[i].toFixed(2))]),
  }));
}
