// Proposition 1 on a model small enough to enumerate: three tokens, sequences of three.
// The training objective weighs each context's divergence by how often the calibration
// windows visit it. With exact samples of the dense model at temperature one, the expected
// objective equals the sequence-level divergence divided by T; with any other calibration
// distribution it does not.
import { d3, el, parts, responsive, svgIn, cssVar, rng, gauss, tipOn, tableView, seqLog } from "../viz.js";

const V = ["a", "b", "c"];
const T = 3;

function softmax(z) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
const kl = (p, q) => p.reduce((s, pi, i) => s + (pi > 0 ? pi * Math.log(pi / q[i]) : 0), 0);

// contexts: prefixes of length 0..T-1 after the start token
function build() {
  const r = rng(7);
  const ctxs = [];
  const walk = (prefix) => {
    if (prefix.length === T) return;
    const logits = V.map(() => 1.25 * gauss(r));
    const p = softmax(logits);
    // the compressed model: the dense logits plus an error whose size varies by context
    const err = 0.25 + 1.1 * r() ** 2;
    const q = softmax(logits.map((l) => l + err * gauss(r)));
    // a different "corpus" model, which visits contexts in other proportions
    const c = softmax(V.map((_, i) => 1.4 * gauss(r) + (i === 2 ? 0.8 : 0)));
    ctxs.push({ prefix, p, q, c, kl: kl(p, q) });
    V.forEach((t) => walk(prefix + t));
  };
  walk("");
  return new Map(ctxs.map((d) => [d.prefix, d]));
}

function temper(p, tau) {
  return softmax(p.map((x) => Math.log(x) / tau));
}

export default function init(fig) {
  const { controls, body } = parts(fig);
  const C = build();
  const DISTS = [
    { key: "t1", label: "Exact self-samples, T = 1", next: (d) => d.p },
    { key: "t07", label: "Colder, T = 0.7", next: (d) => temper(d.p, 0.7) },
    { key: "t13", label: "Hotter, T = 1.3", next: (d) => temper(d.p, 1.3) },
    { key: "corpus", label: "An external corpus", next: (d) => d.c },
  ];
  let dist = "t1";

  // sequence-level divergence by enumeration
  let seqKL = 0;
  for (const a of V) for (const b of V) for (const c of V) {
    const s = a + b + c;
    let P = 1, Q = 1;
    for (let t = 0; t < T; t++) {
      const ctx = C.get(s.slice(0, t));
      const i = V.indexOf(s[t]);
      P *= ctx.p[i]; Q *= ctx.q[i];
    }
    seqKL += P * Math.log(P / Q);
  }

  // prefix probabilities under a sampling distribution, and the expected objective
  function weights(dKey) {
    const next = DISTS.find((d) => d.key === dKey).next;
    const w = new Map([["", 1]]);
    const order = [...C.keys()].sort((a, b) => a.length - b.length);
    for (const pre of order) {
      const pr = next(C.get(pre));
      V.forEach((t, i) => w.set(pre + t, w.get(pre) * pr[i]));
    }
    let obj = 0;
    for (const [pre, ctx] of C) obj += w.get(pre) * ctx.kl;
    return { w, obj: obj / T };
  }

  const wrap = el("div", { class: "tree-wrap" });
  const plot = el("div");
  const side = el("div", { class: "tree-side" });
  wrap.append(plot, side);
  body.replaceChildren(wrap);

  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Calibration windows drawn from" });
  const btns = DISTS.map((d) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(d.key === dist) }, d.label);
    b.addEventListener("click", () => { dist = d.key; btns.forEach((x, i) => x.setAttribute("aria-checked", String(DISTS[i].key === dist))); update(); });
    seg.append(b);
    return b;
  });
  controls.append(el("div", { class: "control" }, el("span", { class: "control-label", text: "Windows drawn from" }), seg));

  const check = el("div", { class: "eq-check" });
  side.append(el("p", { style: "margin:0 0 6px" },
    "Each node is a context; its shade is the divergence ", el("i", {}, "KL(p‖q)"),
    " of the next-token predictions there. Branch width is how often the calibration windows reach it."), check);

  let width = 0;
  responsive(plot, (w) => { width = w; update(); });

  function update() {
    if (!width) return;
    const { w, obj } = weights(dist);
    const leaves = [];
    for (const a of V) for (const b of V) for (const c of V) leaves.push(a + b + c);
    const H = Math.max(360, leaves.length * 14 + 30);
    const svg = svgIn(plot, width, H, "Prefix tree of a three-token model");
    const left = 28, right = 54;
    const xs = d3.scaleLinear().domain([0, T]).range([left, width - right]);
    const ys = new Map();
    leaves.forEach((s, i) => ys.set(s, 30 + i * ((H - 44) / (leaves.length - 1))));
    for (let len = T - 1; len >= 0; len--) {
      for (const pre of C.keys()) if (pre.length === len) ys.set(pre, d3.mean(V.map((t) => ys.get(pre + t))));
    }
    const maxKL = d3.max([...C.values()], (d) => d.kl);
    const color = seqLog(0.01, maxKL, 0, 11);
    const ink = cssVar("--ink");
    const g = svg.append("g");
    // edges
    const edges = [];
    for (const pre of C.keys()) V.forEach((t) => edges.push({ from: pre, to: pre + t }));
    const wmax = 1;
    g.selectAll("path.e").data(edges).join("path").attr("class", "e")
      .attr("d", (e) => {
        const x0 = xs(e.from.length), y0 = ys.get(e.from), x1 = xs(e.to.length), y1 = ys.get(e.to);
        const mx = (x0 + x1) / 2;
        return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
      })
      .attr("fill", "none").attr("stroke", ink).attr("stroke-opacity", 0.55)
      .attr("stroke-linecap", "round")
      .attr("stroke-width", (e) => 0.4 + 15 * Math.sqrt(w.get(e.to) / wmax));
    // leaves
    g.selectAll("text.leaf").data(leaves).join("text").attr("class", "lbl-2")
      .attr("x", xs(T) + 8).attr("y", (s) => ys.get(s) + 4).attr("font-family", "var(--font-mono)").text((s) => s);
    // contexts
    const nodes = g.selectAll("g.n").data([...C.values()]).join("g").attr("class", "n")
      .attr("transform", (d) => `translate(${xs(d.prefix.length)},${ys.get(d.prefix)})`);
    nodes.append("circle").attr("r", (d) => (d.prefix.length === 0 ? 11 : 8.5))
      .attr("fill", (d) => color(Math.max(0.01, d.kl))).attr("stroke", cssVar("--bg-2")).attr("stroke-width", 2);
    nodes.filter((d) => d.prefix.length === 0).append("text").attr("class", "lbl").attr("x", -14)
      .attr("y", 4).attr("text-anchor", "end").text("start");
    tipOn(nodes, (d) => ({
      title: d.prefix ? `context “${d.prefix}”` : "the start token",
      rows: [
        { label: "KL(p‖q) here", value: d.kl.toFixed(3) },
        { label: "visited by windows", value: `${(100 * w.get(d.prefix)).toFixed(1)}%` },
        { label: "contribution", value: (w.get(d.prefix) * d.kl / T).toFixed(4) },
      ],
      note: `dense p: ${d.p.map((x) => x.toFixed(2)).join(" / ")} · compressed q: ${d.q.map((x) => x.toFixed(2)).join(" / ")}`,
    }));
    // depth labels
    svg.append("text").attr("class", "lbl-2").attr("x", xs(3)).attr("y", 10).attr("text-anchor", "middle").text("sequences");

    const equal = Math.abs(obj - seqKL / T) < 1e-9;
    check.replaceChildren(
      el("div", { class: "row" }, el("span", {}, "Expected training objective"), el("b", { text: obj.toFixed(4) })),
      el("div", { class: "row" }, el("span", {}, "Sequence-level KL(P‖Q) ÷ T"), el("b", { text: (seqKL / T).toFixed(4) })),
      el("div", { class: `verdict${equal ? " ok" : ""}` },
        equal ? "Equal: the objective is the sequence-level divergence."
          : dist === "corpus"
            ? "Different: the corpus weighs the same per-context divergences by its own contexts."
            : dist === "t07"
              ? "Different: colder samples overweight the most likely contexts."
              : "Different: hotter samples overweight high-entropy contexts."),
    );
  }

  tableView(fig, () => {
    const rows = DISTS.map((d) => [d.label, weights(d.key).obj.toFixed(4), (seqKL / T).toFixed(4)]);
    return { caption: "Expected objective by sampling distribution, against the sequence-level divergence per token (toy model).",
      columns: ["Windows drawn from", "Expected objective", "KL(P‖Q) ÷ T"], rows };
  });
}
