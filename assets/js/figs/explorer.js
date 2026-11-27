// Run explorer: every run of the paper, with a link to its record in the code repository.
import { d3, SRC, MODEL, el, parts, fmtPpl } from "../viz.js";

const REPO = "https://github.com/calibrank/calibrank/tree/main/records";
const MODE = { proj: "learned projectors", none: "training-free truncation", factors: "free factors", lora: "SVD-LLM + LoRA",
  dense: "dense model" };

export default function init(fig) {
  const { body } = parts(fig);
  const status = el("p", { class: "status" }, "Loading the run records…");
  body.replaceChildren(status);
  fetch("data/runs.json").then((r) => r.json()).then(({ rows }) => build(rows)).catch((e) => {
    status.textContent = "The run index could not be loaded.";
    console.error(e);
  });

  function build(rows) {
    const models = [...new Set(rows.map((r) => r.model))];
    const modes = [...new Set(rows.map((r) => r.mode).filter(Boolean))];
    const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))];
    const f = { set: "", model: "", mode: "", source: "", ratio: "", q: "" };
    const sel = (key, opts, label) => {
      const s = el("select", { "aria-label": label }, el("option", { value: "" }, `${label}: all`),
        opts.map(([v, t]) => el("option", { value: v }, t)));
      s.addEventListener("change", () => { f[key] = s.value; render(); });
      return s;
    };
    const search = el("input", { type: "search", placeholder: "Filter by run name, e.g. selfdoc-r50", "aria-label": "Filter runs by name" });
    search.addEventListener("input", () => { f.q = search.value.trim().toLowerCase(); render(); });
    const filters = el("div", { class: "explorer-filters" },
      search,
      sel("set", [["main", "main grid (32 windows)"], ["extended", "extended (128 windows, 3 seeds)"]], "Set"),
      sel("model", models.map((m) => [m, MODEL[m] || m]), "Model"),
      sel("mode", modes.map((m) => [m, MODE[m] || m]), "Method"),
      sel("source", sources.map((s) => [s, SRC[s] || s]), "Calibration"),
      sel("ratio", [["0.3", "−30%"], ["0.5", "−50%"], ["0.7", "−70%"]], "Ratio"));
    const cols = [
      { k: "model", t: "Model", f: (r) => MODEL[r.model] || r.model, text: true },
      { k: "set", t: "Set", f: (r) => (r.set === "main" ? "main" : "ext."), text: true },
      { k: "run", t: "Run", text: true },
      { k: "wiki", t: "WikiText-2", num: true, f: (r) => fmtPpl(r.wiki) },
      { k: "c4", t: "C4", num: true, f: (r) => fmtPpl(r.c4) },
      { k: "sp", t: "SlimPajama", num: true, f: (r) => fmtPpl(r.sp) },
      { k: "acc", t: "Acc. (7)", num: true, f: (r) => (r.acc != null ? r.acc.toFixed(1) : "–") },
      { k: "valkl", t: "Val. KL", num: true, f: (r) => (r.valkl != null ? r.valkl.toFixed(3) : "–") },
      { k: "trainMin", t: "Train (min)", num: true, f: (r) => (r.trainMin != null ? r.trainMin.toFixed(0) : "–") },
      { k: "gpu", t: "GPU", text: true },
    ];
    let sortKey = "model", asc = true;
    const thead = el("thead");
    const tbody = el("tbody");
    const table = el("table", { class: "data" }, thead, tbody);
    const scroll = el("div", { class: "explorer-scroll" }, table);
    const count = el("p", { class: "explorer-count" });
    const headRow = el("tr");
    cols.forEach((c) => {
      const th = el("th", { scope: "col", tabindex: 0, text: c.t, "aria-sort": c.k === sortKey ? "ascending" : "none",
        style: c.text ? "text-align:left" : null });
      const go = () => { if (sortKey === c.k) asc = !asc; else { sortKey = c.k; asc = !c.num; } render(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      headRow.append(th);
    });
    thead.append(headRow);
    body.replaceChildren(filters, scroll, count);

    function render() {
      let rs = rows.filter((r) => (!f.set || r.set === f.set) && (!f.model || r.model === f.model) && (!f.mode || r.mode === f.mode)
        && (!f.source || r.source === f.source) && (!f.ratio || String(r.ratio) === f.ratio) && (!f.q || r.run.toLowerCase().includes(f.q)));
      const c = cols.find((x) => x.k === sortKey);
      rs = rs.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const r = c.num ? va - vb : String(va).localeCompare(String(vb), "en", { numeric: true });
        return asc ? r : -r;
      });
      [...headRow.children].forEach((th, i) => th.setAttribute("aria-sort", cols[i].k === sortKey ? (asc ? "ascending" : "descending") : "none"));
      tbody.replaceChildren(...rs.map((r) => el("tr", {}, cols.map((cc, j) => {
        if (cc.k === "run") {
          const href = `${REPO}/${r.set === "extended" ? "extended/" : ""}runs/${encodeURIComponent(r.model)}/${encodeURIComponent(r.run)}`;
          return el("td", { style: "text-align:left" }, el("a", { href, target: "_blank", rel: "noopener", text: r.run }));
        }
        const v = cc.f ? cc.f(r) : r[cc.k] ?? "–";
        return el(j === 0 ? "th" : "td", { scope: j === 0 ? "row" : null, text: v, style: cc.text ? "text-align:left" : null });
      }))));
      count.textContent = `${rs.length} of ${rows.length} runs. Perplexities and accuracy of the trained model (or of the truncation, for training-free runs); a run's name links to its record.`;
    }
    render();
  }
}
