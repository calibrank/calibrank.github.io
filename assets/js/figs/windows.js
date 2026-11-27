// What a calibration window looks like: the first training windows of the seed-0 runs,
// with their document boundaries (EOS) and beginning-of-sequence tokens (BOS).
import {
  d3, SOURCES, SRC, MODEL, srcColor, segmented, parts, responsive, svgIn, showTip, hideTip, tipOn,
  tableView, el, cssVar,
} from "../viz.js";

export default function init(fig, { EX }) {
  const { controls, body } = parts(fig);
  if (!EX) { body.textContent = "Window data unavailable."; return; }
  const T = EX.seqlen;
  let model = "llama-3.2-1b", fmt = "packed", win = 2;

  segmented(controls, { label: "Model", value: model,
    options: ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"].map((m) => ({ value: m, label: MODEL[m] })),
    onChange: (v) => { model = v; redraw(); } });
  segmented(controls, { label: "Format", value: fmt,
    options: [{ value: "packed", label: "Packed documents" }, { value: "segments", label: "Matched segments" }],
    onChange: (v) => { fmt = v; redraw(); } });
  segmented(controls, { label: "Window", value: win, options: [1, 2, 3].map((i) => ({ value: i, label: `#${i}` })),
    onChange: (v) => { win = v; redraw(); } });

  // documents of a window from its EOS and BOS positions
  function layout(w, hasBos, bosIsEos) {
    const bos = new Set(w.bos);
    const eos = w.eos.filter((p) => !(bosIsEos && p === 0));
    const docs = [];
    let start = hasBos || bosIsEos ? 1 : 0;
    for (const e of eos) {
      if (e >= start) docs.push([start, e]);
      start = e + 1;
      if (bos.has(start)) start += 0; // a BOS token opens the next document; drawn as a tick
    }
    if (start < T) docs.push([start, T - 1]);
    const bosPos = bosIsEos ? [0] : [...bos];
    return { docs: docs.filter(([a, b]) => b >= a), bos: bosPos, eos };
  }

  function rows() {
    const W = EX.windows[model];
    const bosIsEos = model === "opt-1.3b";
    const hasBos = W.hasBos;
    if (fmt === "segments") {
      const w = W.segments[win - 1];
      return SOURCES.filter((s) => s !== "selfgen").map((s) => ({ s, ...layout(w, hasBos, bosIsEos), same: true }));
    }
    return SOURCES.map((s) => ({ s, ...layout(W.sources[s][win - 1], hasBos, bosIsEos) }));
  }

  let draw;
  function redraw() { draw?.(); }
  responsive(body, (width) => {
    draw = () => render(width);
    draw();
  });

  function render(width) {
    const data = rows();
    const left = width < 560 ? 78 : 112, right = width < 560 ? 98 : 110;
    const rowH = 30, top = 22;
    const H = top + data.length * rowH + 30;
    const svg = svgIn(body, width, H, "Layout of calibration windows by source");
    const x = d3.scaleLinear().domain([0, T]).range([left, width - right]);
    const g = svg.append("g");
    // position axis
    const ax = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${top - 6})`)
      .call(d3.axisTop(x).tickValues([0, 512, 1024, 1536, 2048]).tickSize(3));
    ax.select(".domain").remove();
    const bg = cssVar("--bg-2");
    data.forEach((r, i) => {
      const y0 = top + i * rowH + 4, h = 14;
      const row = g.append("g");
      row.append("text").attr("class", "win-row-label").attr("x", 0).attr("y", y0 + 11).text(SRC[r.s]);
      const nb = r.bos.length;
      const sub = `${r.docs.length} doc${r.docs.length === 1 ? "" : "s"}${model === "llama-3.2-1b" ? `, ${nb} BOS` : ""}`;
      row.append("text").attr("class", "win-row-sub").attr("x", width - right + 10).attr("y", y0 + 11).text(sub);
      const segs = row.selectAll("rect.doc").data(r.docs).join("rect").attr("class", "doc")
        .attr("x", (d) => x(d[0]) + 1).attr("y", y0)
        .attr("width", (d) => Math.max(1.2, x(d[1] + 1) - x(d[0]) - 2)).attr("height", h)
        .attr("rx", 3).attr("fill", srcColor(r.s)).attr("opacity", 0.9)
        .attr("stroke", bg).attr("stroke-width", 0);
      tipOn(segs, (d) => ({
        title: `${SRC[r.s]}, document ${r.docs.indexOf(d) + 1} of ${r.docs.length}`,
        sub: `tokens ${d[0]}–${d[1]} (${d[1] - d[0] + 1} tokens)`,
        note: r.docs.indexOf(d) === r.docs.length - 1 && d[1] === T - 1 ? "continues in the next window" : "ends with EOS",
      }));
      // BOS ticks
      row.selectAll("path.bos").data(r.bos).join("path").attr("class", "bos")
        .attr("d", d3.symbol(d3.symbolTriangle, 34)())
        .attr("transform", (p) => `translate(${x(p) + 1.5},${y0 + h + 6})`)
        .attr("fill", cssVar("--ink"));
    });
    // legend line
    const ly = H - 8;
    svg.append("path").attr("d", d3.symbol(d3.symbolTriangle, 34)()).attr("transform", `translate(${left + 4},${ly - 4})`)
      .attr("fill", cssVar("--ink"));
    svg.append("text").attr("class", "lbl-2").attr("x", left + 14).attr("y", ly).text(
      model === "qwen3-1.7b" ? "Qwen3 has no BOS token; gaps are end-of-sequence (EOS) tokens"
        : model === "opt-1.3b" ? "BOS (for OPT the same token also separates documents); gaps are document boundaries"
          : "beginning-of-sequence (BOS) token; gaps are end-of-sequence (EOS) tokens");
  }

  tableView(fig, () => {
    const data = rows();
    return {
      caption: `${MODEL[model]}, ${fmt === "packed" ? "packed documents" : "matched segments"}, window ${win} of the seed-0 training set.`,
      columns: ["Calibration", "Documents", "BOS tokens", "Document lengths (tokens)"],
      rows: data.map((r) => [SRC[r.s], r.docs.length, r.bos.length, r.docs.map((d) => d[1] - d[0] + 1).join(", ")]),
    };
  });
}
