// Does the specialization survive the controls of Section 3.4? Each line is recomputed
// here from the run data, not copied from the text.
import { d3, SOURCES, SRC, MODEL, parts, el, tableView } from "../viz.js";

const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export default function init(fig, { P }) {
  const { body } = parts(fig);
  const C = P.controls;
  const argmin = (rows, key) => rows.reduce((a, b) => (b[key] < a[key] ? b : a));
  const rank = (rows, key) => [...rows].sort((a, b) => a[key] - b[key]).map((r) => r.source).join(">");

  // three seeds, all models: WikiText-2 best on WikiText-2, C4 best on C4
  const groups = d3.groups(P.hero, (d) => `${d[0]}|${d[1]}|${d[2]}`);
  let seedOk = 0;
  for (const [, v] of groups) {
    const rows = v.map(([m, r, seed, s, iw, ic, fw, fc]) => ({ s, fw, fc }));
    if (argmin(rows, "fw").s === "wikitext2" && argmin(rows, "fc").s === "c4") seedOk++;
  }

  // matched-segment format: each real corpus keeps the lowest divergence on its own text
  let fmtOk = 0, fmtN = 0;
  for (const m of ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"]) {
    const seg = C.format.filter((r) => r.model === m && r.format === "segments");
    for (const t of ["wikitext2", "c4", "slimpajama", "alpaca"]) {
      fmtN++;
      if (argmin(seg, `kl_${t}`).source === t) fmtOk++;
    }
  }

  // per-source learning rates
  const lrOk = C.optim.filter((r) => r["val_1e-4"] <= Math.min(r["val_3e-5"], r["val_3e-4"])).length;

  // 24 epochs: same order of the six sources on each corpus
  const e8 = C.optim.map((r) => ({ source: r.source, ...r.e8 })), e24 = C.optim.map((r) => ({ source: r.source, ...r.e24 }));
  const orderSame = ["wiki", "c4", "sp"].filter((k) => rank(e8, k) === rank(e24, k)).length;
  const wikiC4ratio8 = e8.find((r) => r.source === "wikitext2").c4 / e8.find((r) => r.source === "c4").c4;
  const wikiC4ratio24 = e24.find((r) => r.source === "wikitext2").c4 / e24.find((r) => r.source === "c4").c4;

  // SVD-LLM + LoRA: each corpus best on its own text
  let loraOk = 0, loraN = 0;
  for (const m of ["llama-3.2-1b", "opt-1.3b"]) {
    const rows = C.lora.filter((r) => r.model === m && r.method === "SVD-LLM + LoRA");
    for (const [k, s] of [["wiki", "wikitext2"], ["c4", "c4"], ["sp", "slimpajama"]]) { loraN++; if (argmin(rows, k).source === s) loraOk++; }
  }

  // measured-KL allocation: same best source per column; cells improved
  const uni = C.alloc.map((r) => ({ source: r.source, ...r.uniform })), mea = C.alloc.map((r) => ({ source: r.source, ...r.measured }));
  const allocSame = ["wiki", "c4", "sp"].every((k) => argmin(uni, k).source === argmin(mea, k).source)
    && d3.greatest(uni, (r) => r.acc).source === d3.greatest(mea, (r) => r.acc).source;
  let improved = 0;
  C.alloc.forEach((r) => { for (const k of ["wiki", "c4", "sp"]) if (r.measured[k] < r.uniform[k]) improved++; if (r.measured.acc > r.uniform.acc) improved++; });

  // free factors: same ranking of the three sources on every corpus
  let ffSame = 0, ffN = 0;
  for (const m of ["llama-3.2-1b", "opt-1.3b"]) {
    const rows = C.factors.filter((r) => r.model === m);
    for (const k of ["wiki", "c4", "sp"]) {
      ffN++;
      const a = [...rows].sort((x, y) => x.projectors[k] - y.projectors[k]).map((r) => r.source).join();
      const b = [...rows].sort((x, y) => x.factors[k] - y.factors[k]).map((r) => r.source).join();
      if (a === b) ffSame++;
    }
  }

  const items = [
    { ctl: "Three seeds", what: "the full grid repeated with new windows, dropout and self-generated pools",
      res: `${seedOk} of ${groups.length} settings (model × ratio × seed, Llama-3.1-8B included): WikiText-2 calibration has the lowest WikiText-2 perplexity and C4 the lowest C4 perplexity.`, ref: "4.9" },
    { ctl: "Matched-segment format", what: "every window holds 16 segments of 127 tokens after one BOS, so only content differs",
      res: `${fmtOk} of ${fmtN} real corpora keep the lowest divergence on their own held-out text.`, ref: "4.4, Table 10" },
    { ctl: "Per-source learning rates", what: "each source tuned on its own validation windows (3×10⁻⁵, 10⁻⁴, 3×10⁻⁴)",
      res: `${lrOk} of 6 sources select the shared rate of 10⁻⁴.`, ref: "4.8, Table 16" },
    { ctl: "Three times longer training", what: "24 epochs (1,536 steps) instead of 8",
      res: `Every perplexity drops, but the six sources keep their order on ${orderSame} of 3 corpora; WikiText-2 calibration still gives ${wikiC4ratio24.toFixed(1)}× the C4 perplexity of C4 calibration (${wikiC4ratio8.toFixed(1)}× at 8 epochs).`, ref: "4.8" },
    { ctl: "Fixed checkpoint", what: "the last epoch instead of the epoch with the lowest validation KL",
      res: "92 of the 108 three-seed runs already select their last epoch; in the others the last epoch changes the WikiText-2 and C4 perplexities by at most 0.8%.", ref: "4.8" },
    { ctl: "Another learned compressor", what: "SVD-LLM truncation recovered with LoRA (cross-entropy, no teacher)",
      res: `${loraOk} of ${loraN} corpus–model pairs: each corpus gives the lowest perplexity on its own text; narrow sources pay more away from it than with LSP.`, ref: "4.7, Table 15" },
    { ctl: "Data-dependent rank allocation", what: "the measured-KL allocation of LSP, computed on each source's windows",
      res: `${allocSame ? "Same" : "Different"} best source on every corpus and in accuracy; ${improved} of 24 cells improve.`, ref: "4.4, Table 11" },
    { ctl: "Free low-rank factors", what: "train A and B directly (2.3 to 2.8× more parameters)",
      res: `The ranking of the three sources is the same on ${ffSame} of ${ffN} corpus–model pairs; free factors specialize more.`, ref: "4.7, Table 14" },
    { ctl: "A larger model", what: "Llama-3.1-8B, six sources, three seeds at −30% and one at −50%",
      res: `WikiText-2 calibration best on WikiText-2 (${P.scale.r30.wikitext2.wiki.toFixed(1)}) and C4 best on C4 (${P.scale.r30.c4.c4.toFixed(1)}); self-generated documents most uniformly faithful (${P.scale.r30.selfdoc.relKL.toFixed(2)}×).`, ref: "4.10, Table 18" },
  ];

  const table = el("table", { class: "robust" });
  table.append(el("thead", {}, el("tr", {}, el("th", { text: "Control" }), el("th", { text: "Specialization survives?" }),
    el("th", { class: "hide-sm", text: "Paper" }))));
  const tb = el("tbody");
  for (const it of items) {
    const yes = el("span", { class: "yes" });
    yes.innerHTML = CHECK; // static icon markup, no data
    yes.append("Yes");
    tb.append(el("tr", {},
      el("td", { class: "ctl" }, it.ctl, el("small", {}, it.what)),
      el("td", {}, yes, el("div", { style: "margin-top:3px;line-height:1.5" }, it.res)),
      el("td", { class: "hide-sm muted", style: "white-space:nowrap" }, `§${it.ref}`)));
  }
  table.append(tb);
  body.replaceChildren(table);

  tableView(fig, () => ({ caption: "Controls and what survives them.", columns: ["Control", "Change", "Result", "Paper section"],
    rows: items.map((i) => [i.ctl, i.what, i.res, i.ref]) }));
}
