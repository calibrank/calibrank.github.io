// Which calibration data to use: the recommendations of the paper's Discussion (Sections
// 5.1-5.5 and Conclusions), turned into three questions. Every line links to its evidence.
import { SRC, el, parts, srcColor } from "../viz.js";

const Q = [
  { key: "use", label: "What is the compressed model for?", options: [
    { v: "general", t: "A general-purpose replacement", s: "any text, any task" },
    { v: "domain", t: "One known domain", s: "code, scientific text, a product's documents…" },
    { v: "instruct", t: "Following instructions", s: "an instruction-tuned (chat) model" }] },
  { key: "data", label: "What data can you calibrate on?", options: [
    { v: "broad", t: "Broad, pretraining-like text", s: "e.g. SlimPajama" },
    { v: "domain", t: "Text from the target domain", s: "" },
    { v: "none", t: "No external data", s: "private, licensed, or unavailable" }] },
  { key: "bos", label: "Will every input start with the model's BOS token?", options: [
    { v: "yes", t: "Yes, always", s: "as in standard benchmarks" },
    { v: "no", t: "Not always", s: "batched or streaming inference that splits documents" }] },
];

export default function init(fig) {
  const { body } = parts(fig);
  const ans = { use: "general", data: "broad", bos: "yes" };
  const wrap = el("div", { class: "helper" });
  const qs = el("div");
  const out = el("div", { class: "advice", "aria-live": "polite" });
  wrap.append(qs, out);
  body.replaceChildren(wrap);

  for (const q of Q) {
    const box = el("div", { class: "choice", role: "radiogroup", "aria-label": q.label });
    const buttons = q.options.map((o) => {
      const b = el("button", { type: "button", role: "radio", "aria-checked": String(ans[q.key] === o.v) }, o.t, o.s ? el("small", {}, o.s) : null);
      b.addEventListener("click", () => {
        ans[q.key] = o.v;
        buttons.forEach((x, i) => x.setAttribute("aria-checked", String(q.options[i].v === o.v)));
        render();
      });
      return b;
    });
    box.append(...buttons);
    qs.append(el("div", { class: "q" }, el("div", { class: "q-label" }, q.label), box));
  }

  const link = (href, text) => el("a", { href, class: "ev" }, text);
  const plus = () => el("span", { class: "muted", style: "align-self:center;font-weight:650" }, "+");
  const chip = (src, label) => el("span", { class: "chip" }, el("span", { class: "sw", style: `--c:${src ? `var(--s-${src})` : "var(--ink)"}` }), label || SRC[src]);

  function render() {
    let title, chips, why = [];
    const { use, data, bos } = ans;
    if (use === "general") {
      if (data === "broad") {
        title = "Broad text mixed half and half with self-generated documents";
        chips = [chip("slimpajama"), plus(), chip("selfdoc")];
        why.push(["The mixture is never more than 11% less uniform than the best source, and the most uniform on the real held-out sets in five of the six settings. Either component alone is also among the best.", "#mixture", "§5.2, Table 7"]);
      } else {
        title = "Self-generated documents";
        chips = [chip("selfdoc")];
        why.push(["Independent documents sampled from the dense model need no external data and give the most uniformly faithful Llama models by every summary of the divergence.", "#uniform", "§4.3, Table 6"]);
        if (data === "domain") why.push(["Calibrating on domain data instead would specialize the model to that domain, at a cost elsewhere.", "#domains", "Table 8"]);
      }
      why.push(["Avoid WikiText-2 for a general-purpose model: the customary choice gives the least general compressed models, with up to 9.6 times the divergence of the best source on other text.", "#specialization", "§4.3"]);
    } else if (use === "domain") {
      if (data === "none") {
        title = "Self-generated documents, then measure on your domain";
        chips = [chip("selfdoc")];
        why.push(["Without domain data the model cannot specialize to the domain; self-generated documents are the safest general-purpose choice.", "#uniform", "§4.3"]);
      } else if (data === "broad") {
        title = "Broad data now, domain data when you can get it";
        chips = [chip("slimpajama")];
        why.push(["Specialization needs data from the domain: single-domain calibration brings its perplexity from 3.2–3.6× to 1.6–2.4× that of the dense model.", "#domains", "Table 8"]);
      } else {
        title = "Your domain data, with broad initialization statistics";
        chips = [chip(null, "domain windows"), plus(), chip("slimpajama", "broad statistics")];
        why.push(["For deployment on a known domain, specialization is the intended effect: single-domain calibration brings the domain's perplexity from 3.2–3.6× to 1.6–2.4× that of the dense model.", "#domains", "Table 8"]);
        why.push(["The initialization and the training windows act separately: whitening statistics from broad data with training windows from the domain keep most of the domain fit at a much smaller cost elsewhere.", "#where", "§4.4, Table 9"]);
      }
    } else {
      title = data === "none" ? "Self-generated documents" : "The model's own responses to instructions";
      chips = data === "none" ? [chip("selfdoc")] : [chip("selfgen", "Self (responses)")];
      why.push(["On Llama-3.2-1B-Instruct, its own responses to Alpaca instructions were the best tested source for IFEval (14.0% of prompts) and the most faithful on held-out instructions; Alpaca's pairs in the chat format were the worst (9.8%).", "#behavior", "§4.11, Table 20"]);
      why.push(["Expect large losses whatever the source: compressed by 30%, the model follows at most 14% of the prompts, against 49.7% for the dense model. Evaluate instruction following directly.", "#behavior", "§5.4"]);
    }
    if (bos === "no") {
      why.push(["Calibrate in the input format of deployment. Compressed Llama models collapse on text that does not start with BOS (112 to 36,834 times the perplexity); calibrating on windows without BOS removes the collapse at a small cost on BOS-prefixed inputs.", "#first-token", "§5.5, App. D"]);
    } else {
      why.push(["Keep the BOS token at the start of every calibration window (the default), and serve every input with it: the compressed Llama models depend on it.", "#first-token", "§5.5"]);
    }
    why.push(["Report the calibration source with every perplexity, compare methods at a fixed source, and check abilities your calibration does not exercise (after Alpaca calibration, Llama-3.2-1B no longer retrieves a passkey).", "#behavior", "§5.1, §5.4"]);

    out.replaceChildren(
      el("div", { class: "muted", style: "font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:4px" }, "Suggested calibration"),
      el("h4", {}, title), el("div", { class: "pick" }, ...chips),
      el("ul", {}, why.map(([t, href, ref]) => el("li", {}, t, " ", link(href, ref)))),
      el("p", { class: "muted", style: "font-size:12.5px;margin:10px 0 0" },
        "From the paper's experiments with learned subspace projections on 1–8B models at 30–50% compression. A starting point, not a guarantee."));
  }
  render();
}
