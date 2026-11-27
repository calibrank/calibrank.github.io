// A projector merges into two thin factors: W P = (W U⊥) U⊥ᵀ = B A. The slider sets the
// fraction of the layer's weights to keep; the uniform rule of LSP turns it into a rank.
import { d3, el, parts, responsive, svgIn, cssVar, tableView } from "../viz.js";

const SHAPES = {
  o: { label: "attention output (2048 × 2048)", dout: 2048, din: 2048 },
  down: { label: "MLP down projection (2048 × 8192)", dout: 2048, din: 8192 },
};

export default function init(fig) {
  const { controls, body } = parts(fig);
  let shape = "o";
  let rho = 0.5;

  const wrap = el("div", { class: "merge" });
  const plot = el("div");
  const side = el("div", { class: "merge-side" });
  wrap.append(plot, side);
  body.replaceChildren(wrap);

  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Layer" });
  const btns = Object.entries(SHAPES).map(([k, s]) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(k === shape) }, s.label);
    b.addEventListener("click", () => { shape = k; btns.forEach(([kk, bb]) => bb.setAttribute("aria-checked", String(kk === k))); update(); });
    seg.append(b);
    return [k, b];
  });
  controls.append(el("div", { class: "control" }, el("span", { class: "control-label", text: "Layer" }), seg));

  const slider = el("input", { type: "range", min: "0.05", max: "1", step: "0.01", value: String(rho),
    "aria-label": "Fraction of the layer's weights to keep" });
  const out = el("div");
  side.append(el("label", { style: "display:block;font-weight:650;margin-bottom:4px" }, "Keep this fraction of the weights"),
    slider, out);
  slider.addEventListener("input", () => { rho = +slider.value; update(); });

  let width = 0;
  responsive(plot, (w) => { width = w; update(); });

  function rankFor(s) {
    return Math.floor((rho * s.din * s.dout) / (s.din + s.dout));
  }

  function update() {
    if (!width) return;
    const s = SHAPES[shape];
    const r = rankFor(s);
    const dense = s.din * s.dout, fact = r * (s.din + s.dout);
    const keepDense = fact >= dense;
    const side = Math.min(s.din, s.dout);
    const k = side - Math.min(r, side);
    // drawing: W (d_out × d_in) and B (d_out × r) · A (r × d_in), to scale
    const H = 190;
    const svg = svgIn(plot, width, H, "Weight matrix and its low-rank factors to scale");
    const unit = Math.min((H - 40) / s.dout, (width * 0.42) / s.din, (width * 0.25) / (s.din));
    const wW = s.din * unit, hW = s.dout * unit;
    const rr = Math.min(r, side);
    const wB = Math.max(1.5, rr * unit), hA = Math.max(1.5, rr * unit);
    const ink = cssVar("--ink"), ink2 = cssVar("--ink-2"), fillW = cssVar("--q300"), fillF = cssVar("--q450");
    const g = svg.append("g").attr("transform", "translate(0,22)");
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", wW).attr("height", hW).attr("rx", 3).attr("fill", fillW);
    g.append("text").attr("class", "lbl").attr("x", wW / 2).attr("y", -8).attr("text-anchor", "middle").text("W");
    g.append("text").attr("class", "lbl-2").attr("x", wW / 2).attr("y", hW + 15).attr("text-anchor", "middle")
      .text(`${s.dout} × ${s.din}`);
    const x0 = wW + 34;
    g.append("text").attr("class", "lbl").attr("x", x0 - 17).attr("y", hW / 2 + 4).attr("text-anchor", "middle")
      .attr("font-size", 18).text(keepDense ? "=" : "→");
    if (keepDense) {
      g.append("text").attr("class", "lbl").attr("x", x0 + 4).attr("y", hW / 2 + 4)
        .text("left dense: factors would store more weights");
    } else {
      g.append("rect").attr("x", x0).attr("y", 0).attr("width", wB).attr("height", hW).attr("rx", 2).attr("fill", fillF);
      g.append("text").attr("class", "lbl").attr("x", x0 + wB / 2).attr("y", -8).attr("text-anchor", "middle").text("B");
      g.append("text").attr("class", "lbl-2").attr("x", x0 + wB / 2).attr("y", hW + 15).attr("text-anchor", "middle")
        .text(`${s.dout} × ${rr}`);
      const xA = x0 + wB + 16;
      g.append("text").attr("class", "lbl").attr("x", xA - 8).attr("y", hW / 2 + 4).attr("text-anchor", "middle").text("·");
      g.append("rect").attr("x", xA).attr("y", (hW - hA) / 2).attr("width", wW).attr("height", hA).attr("rx", 2).attr("fill", fillF);
      g.append("text").attr("class", "lbl").attr("x", xA + wW / 2).attr("y", (hW - hA) / 2 - 8).attr("text-anchor", "middle").text("A");
      g.append("text").attr("class", "lbl-2").attr("x", xA + wW / 2).attr("y", (hW + hA) / 2 + 15).attr("text-anchor", "middle")
        .text(`${rr} × ${s.din}`);
    }
    const fmtM = (n) => `${(n / 1e6).toFixed(2)}M`;
    out.replaceChildren(
      el("p", { style: "margin:10px 0 4px" }, "Rank ", el("span", { class: "num", text: String(rr) }),
        ` (the projector removes k = ${k} of the ${side} directions on the layer's ${s.din === s.dout ? "input" : "smaller, output"} side)`),
      el("p", { style: "margin:0 0 4px" }, "Stored weights ", el("span", { class: "num", text: keepDense ? fmtM(dense) : fmtM(fact) }),
        ` of ${fmtM(dense)}`, keepDense ? "" : ` (${Math.round(100 * (1 - fact / dense))}% fewer)`),
      el("p", { class: "muted", style: "margin:8px 0 0;font-size:12.5px" },
        "Rank r = ⌊ρ · d_in · d_out / (d_in + d_out)⌋: every matrix keeps the same fraction ρ of its weights (the uniform rule of LSP). The rank depends only on the shapes, never on the calibration data."),
    );
    void ink; void ink2;
  }

  tableView(fig, () => ({
    caption: "Rank and stored weights at the selected fraction ρ.",
    columns: ["Layer", "Rank", "Dense weights", "Factor weights"],
    rows: Object.values(SHAPES).map((s) => {
      const r = rankFor(s);
      return [s.label, r, (s.din * s.dout).toLocaleString("en-US"), (r * (s.din + s.dout)).toLocaleString("en-US")];
    }),
  }));
}
