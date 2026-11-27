#!/usr/bin/env python3
"""Check the page's data against numbers printed in the paper.

    python3 tools/check_data.py

Each check reads a value of data/paper.json and compares it with the value the paper
prints (tables and text of Pham, Informatics 13(11), 201, 2026), to the paper's
precision: a value printed as 17.4 must lie within 0.05 of it. Exit status 1 on any
mismatch. Run after tools/build_data.py.
"""

from __future__ import annotations

import json
import os
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = json.load(open(os.path.join(SITE, "data", "paper.json")))


def tol(printed: str) -> float:
    s = printed.replace(",", "").lstrip("+-")
    return 0.5 * 10 ** -(len(s.split(".")[1]) if "." in s else 0) + 1e-9


def get(path):
    x = P
    for k in path:
        if isinstance(x, list):
            x = next(e for e in x if all(e.get(a) == b for a, b in k.items())) if isinstance(k, dict) else x[k]
        else:
            x = x[k]
    return x


def find(rows, **kw):
    return next(r for r in rows if all(r.get(k) == v for k, v in kw.items()))


CHECKS = []


def check(label, value, printed, scale=1.0):
    CHECKS.append((label, None if value is None else value * scale, printed))


# Table 3: trained models, main grid
D = P["dumbbell"]
check("T3 OPT -30 Wiki/Wiki", D["opt-1.3b"]["r30"]["wikitext2"]["final"]["wiki"], "17.4")
check("T3 OPT -30 Wiki/C4", D["opt-1.3b"]["r30"]["wikitext2"]["final"]["c4"], "31.1")
check("T3 Llama -30 C4/Wiki", D["llama-3.2-1b"]["r30"]["c4"]["final"]["wiki"], "37.8")
check("T3 Llama -30 C4/C4", D["llama-3.2-1b"]["r30"]["c4"]["final"]["c4"], "30.9")
check("T3 Llama -30 C4/SP", D["llama-3.2-1b"]["r30"]["c4"]["final"]["sp"], "63.5")
check("T3 Qwen -50 Alpaca/Wiki", D["qwen3-1.7b"]["r50"]["alpaca"]["final"]["wiki"], "104")
check("T3 Qwen -50 Self(doc)/SP", D["qwen3-1.7b"]["r50"]["selfdoc"]["final"]["sp"], "25.4")
check("T3 dense Llama Wiki", P["dense"]["main"]["llama-3.2-1b"]["wiki"], "9.8")
check("T3 dense Qwen acc", P["dense"]["main"]["qwen3-1.7b"]["acc7"], "59.0")
check("T3 dense OPT SP", P["dense"]["main"]["opt-1.3b"]["sp"], "9.5")
# Section 4.1 and Table 2: training-free truncations
check("4.1 Llama -30 Self(seq) untrained Wiki", D["llama-3.2-1b"]["r30"]["selfgen"]["init"]["wiki"], "91")
check("4.1 Llama -50 Self(seq) untrained Wiki", D["llama-3.2-1b"]["r50"]["selfgen"]["init"]["wiki"], "454")
check("4.1 Qwen -30 Self(doc) untrained C4", D["qwen3-1.7b"]["r30"]["selfdoc"]["init"]["c4"], "551")
check("T2 OPT -30 Wiki rec C4", D["opt-1.3b"]["r30"]["wikitext2"]["init"]["c4"], "93.9")
check("T2 OPT -30 Wiki obl C4", D["opt-1.3b"]["r30"]["wikitext2"]["oblique"]["c4"], "40.3")
check("T2 OPT -30 Wiki obl SP", D["opt-1.3b"]["r30"]["wikitext2"]["oblique"]["sp"], "31.3")
check("T2 Llama -50 Self(seq) rec C4", D["llama-3.2-1b"]["r50"]["selfgen"]["init"]["c4"], "473")
check("T2 Qwen -50 SP obl SP", D["qwen3-1.7b"]["r50"]["slimpajama"]["oblique"]["sp"], "1403")
check("T2 Llama -50 Alpaca rec SP", D["llama-3.2-1b"]["r50"]["alpaca"]["init"]["sp"], "37,759")
# Figure 3, Table 5: divergence on held-out sets
K = P["kl"]["main"]
check("F3 Llama -50 Self(doc) on SP", K["llama-3.2-1b"]["r50"]["selfdoc"]["slimpajama"], "1.258")
check("F3 Llama -50 SP on SP", K["llama-3.2-1b"]["r50"]["slimpajama"]["slimpajama"], "1.262")
# Table 6: uniform fidelity, three-seed means (geometric mean of relative KL)
U = P["uniform"]
check("T6 OPT -30 five sets Self(doc)", U["opt-1.3b"]["r30"]["five_sets"]["selfdoc"]["geo"], "1.59")
check("T6 OPT -30 five sets C4", U["opt-1.3b"]["r30"]["five_sets"]["c4"]["geo"], "1.64")
# Table 18: Llama-3.1-8B
S = P["scale"]
check("T18 -30 Wiki/Wiki", S["r30"]["wikitext2"]["wiki"], "10.0")
check("T18 -30 Wiki/C4", S["r30"]["wikitext2"]["c4"], "41.5")
check("T18 -30 Wiki/SP", S["r30"]["wikitext2"]["sp"], "101")
check("T18 -30 Wiki acc", S["r30"]["wikitext2"]["acc6"], "49.1")
check("T18 -30 Wiki relKL", S["r30"]["wikitext2"]["relKL"], "3.32")
check("T18 -30 Self(doc) SP", S["r30"]["selfdoc"]["sp"], "11.3")
check("T18 -30 Self(doc) relKL", S["r30"]["selfdoc"]["relKL"], "1.37")
check("T18 -50 C4/C4", S["r50"]["c4"]["c4"], "26.5")
check("T18 -50 Alpaca acc", S["r50"]["alpaca"]["acc6"], "46.3")
# Table 8: single-domain calibration
SD = P["domains"]["single"]
check("T8 SP all CC", SD["slimpajama"]["rel"]["cc"], "3.39")
check("T8 GitHub on GitHub", SD["github"]["rel"]["github"], "1.60")
check("T8 GitHub on Wiki", SD["github"]["rel"]["wiki"], "49.41")
check("T8 arXiv on Wiki", SD["arxiv"]["rel"]["wiki"], "185")
check("T8 Books on Books", SD["book"]["rel"]["book"], "2.37")
check("T8 arXiv acc", SD["arxiv"]["acc"], "38.4")
# Figure 4: domain profile, Llama -30
check("F4 Llama -30 Wiki-cal code", P["domains"]["grid"]["llama-3.2-1b"]["r30"]["wikitext2"]["github"], "144")
check("F4 Llama -30 Alpaca multilingual Wiki", P["domains"]["grid"]["llama-3.2-1b"]["r30"]["alpaca"]["wiki"], "97")
# Table 9: ablations
A = P["ablations"]
r = find(A["crossover"], init="selfdoc", train="c4")
check("T9 Self(doc) init, C4 training: Wiki", r["wiki"], "49.4")
check("T9 Self(doc) init, C4 training: SP", r["sp"], "45.8")
r = find(A["crossover"], init="slimpajama", train="wikitext2")
check("T9 SP init, Wiki training: C4", r["c4"], "76.2")
check("T9 SP init, Wiki training: SP", r["sp"], "71.3")
check("T9 T=0.7 Wiki", find(A["temperature"], T=0.7)["wiki"], "123")
check("T9 T=1.3 C4", find(A["temperature"], T=1.3)["c4"], "131")
check("4.5 T=1 KL self", find(A["temperature"], T=1.0)["klSelf"], "0.65")
check("4.5 T=0.7 KL self", find(A["temperature"], T=0.7)["klSelf"], "1.38")
# Table A10 and Table 22: the first token
B = P["bos"]
r = find(B["llama50"], cal="WikiText-2")
check("TA10 Wiki untrained BOS", r["initBos"], "4716")
check("TA10 Wiki untrained stream", r["initStream"], "20,034")
check("TA10 Wiki trained stream", r["stream"], "5151")
r = find(B["llama50"], cal="C4, no BOS")
check("TA10 C4 no BOS trained BOS", r["bos"], "68.5")
check("TA10 C4 no BOS trained stream", r["stream"], "68.1")
r = find(B["llama50"], cal="C4, BOS per document")
check("TA10 C4 BOS per doc untrained", r["initBos"], "2602")
rng = {(x["model"], x["ratio"]): x for x in B["ranges"]}
by = rng[("llama-3.2-1b", 0.3)]["bySource"]
check("T22 Llama -30 min", min(by.values()), "178")
check("T22 Llama -30 max", max(by.values()), "1058")
by = rng[("llama-3.1-8b", 0.3)]["bySource"]
check("T22 8B -30 min", min(by.values()), "1722")
check("T22 8B -30 max", max(by.values()), "36,834")
check("T22 OPT -50 max", max(rng[("opt-1.3b", 0.5)]["bySource"].values()), "1.03")
# Table 19: behavior
BH = P["behavior"]["rows"]
check("T19 Llama Alpaca passkey 8k", find(BH, model="llama-3.2-1b", source="alpaca")["passkey"]["8000"], "0")
check("T19 Llama Wiki passkey 8k", find(BH, model="llama-3.2-1b", source="wikitext2")["passkey"]["8000"], "8")
check("T19 Qwen dense GSM8K", find(BH, model="qwen3-1.7b", source="dense")["gsm8k"], "70.1")
check("T19 8B Self(doc) GSM8K", find(BH, model="llama-3.1-8b", source="selfdoc")["gsm8k"], "6.6")
check("T19 Qwen Self(seq) gen NLL", find(BH, model="qwen3-1.7b", source="selfgen")["genNll"], "3.58")
check("T19 Qwen Self(seq) rep", find(BH, model="qwen3-1.7b", source="selfgen")["rep4"], "0.82")
check("T19 Llama SP PPL 4k-8k", find(BH, model="llama-3.2-1b", source="slimpajama")["pplFar"], "33.7")
# Table 20: instruction following
I = P["behavior"]["ifeval"]
check("T20 dense prompt", find(I, cal="dense")["prompt"], "49.7")
check("T20 dense inst", find(I, cal="dense")["inst"], "63.1")
check("T20 Self(resp) prompt", find(I, cal="Self (responses)")["prompt"], "14.0")
check("T20 Alpaca chat Wiki", find(I, cal="Alpaca, chat format")["wiki"], "102")
check("T20 Self(resp) KL Alpaca", find(I, cal="Self (responses)")["klAlpaca"], "0.549")
# Table 21: memory and latency
check("T21 OPT dense weights", P["behavior"]["bench"]["opt-1.3b"]["dense"]["weights_gb"], "2.45")
check("T21 8B -50 weights", P["behavior"]["bench"]["llama-3.1-8b"]["r50"]["weights_gb"], "8.46")
check("T21 Llama dense decode b1", P["behavior"]["bench"]["llama-3.2-1b"]["dense"]["decode_tok_s_b1"], "91")
# Table 12: self-generated text, Qwen3
Q = P["selfgen"]["lengths"]
check("T12 Qwen exact C4", find(Q, model="qwen3-1.7b", text="Exact, 2048 tokens")["c4"], "53.5")
check("T12 Qwen restarted C4", find(Q, model="qwen3-1.7b", text="Exact, restarted every 512")["c4"], "44.0")
check("T12 Qwen docs 512 C4", find(Q, model="qwen3-1.7b", text="Documents, at most 512")["c4"], "28.7")
check("T12 Llama docs 128 acc", find(Q, model="llama-3.2-1b", text="Documents, at most 128")["acc6"], "39.8")
# Table 17: paired accuracy intervals
PA = P["accuracy"]["paired"]
check("T17 Qwen -30 Alpaca-C4 acc6", PA["qwen3-1.7b"]["r30"]["alpaca-c4"]["acc6"][0], "1.9")
check("T17 Qwen -30 Alpaca-C4 lo", PA["qwen3-1.7b"]["r30"]["alpaca-c4"]["acc6"][1], "1.2")
check("T17 OPT -30 Alpaca-C4 hi", PA["opt-1.3b"]["r30"]["alpaca-c4"]["acc6"][2], "0.6")
# Table A1: per-task accuracy
check("TA1 Llama -30 Alpaca ARC-e", P["accuracy"]["tasks"]["llama-3.2-1b"]["r30"]["alpaca"]["arc_easy"], "52.6")
check("TA1 Llama -30 Alpaca BoolQ", P["accuracy"]["tasks"]["llama-3.2-1b"]["r30"]["alpaca"]["boolq"], "51.3")
# Figures 5 and 6: data size and learning curves
SZ = P["data"]["size"]
check("F5 C4 64 Wiki", SZ["c4"][0]["wiki"], "114")
check("F5 C4 4096 Wiki", SZ["c4"][-1]["wiki"], "48.9")
check("F5 Self(doc) 64 SP", SZ["selfdoc"][0]["sp"], "47.2")
check("F5 Self(doc) 4096 SP", SZ["selfdoc"][-1]["sp"], "29.8")
CV = P["data"]["curves"]
check("F6 C4 64 final train KL", CV["c4"]["64"]["train"][-1], "0.21")
check("F6 C4 64 final val KL", CV["c4"]["64"]["val"][-1], "1.39")
check("F6 Self(doc) 4096 final val KL", CV["selfdoc"]["4096"]["val"][-1], "0.89")
check("F6 C4 held-out 64", CV["c4"]["64"]["heldout"], "1.86")
check("F6 Self(doc) held-out 4096", CV["selfdoc"]["4096"]["heldout"], "1.03")
# Table 1 and Figure 1: sources
SS = P["sourceStats"]
check("T1 Llama Self(seq) docs/window", SS["llama-3.2-1b"]["selfgen"]["docs"], "7.8")
check("T1 Llama Self(seq) NLL", SS["llama-3.2-1b"]["selfgen"]["nll"], "4.65")
check("T1 Qwen Alpaca docs", SS["qwen3-1.7b"]["alpaca"]["docs"], "20.6")
check("F1 Llama Self(seq) entropy first", SS["llama-3.2-1b"]["selfgen"]["entropy"][0], "2.6")
check("F1 Llama Self(seq) entropy last", SS["llama-3.2-1b"]["selfgen"]["entropy"][-1], "5.7")
check("F1 Qwen Self(seq) entropy last", SS["qwen3-1.7b"]["selfgen"]["entropy"][-1], "4.7")
# Section 4.4: subspace overlaps
SU = P["subspaces"]
for m in ("opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"):
    for r_ in ("r30", "r50"):
        v = SU[m][r_]["mean"]["init-final"]
        CHECKS.append((f"4.4 {m} {r_} init-final in [0.996, 0.997]", v if 0.9955 <= v < 0.9975 else -1, None))
# Controls
C = P["controls"]
r = find(C["lora"], model="llama-3.2-1b", source="wikitext2", method="SVD-LLM + LoRA")
check("T15 LoRA Llama Wiki/C4", r["c4"], "95.0")
check("T15 LoRA Llama Wiki/Wiki", r["wiki"], "17.0")
r = find(C["optim"], source="wikitext2")
check("T16 Wiki val KL 3e-5", r["val_3e-5"], "0.967")
check("T16 Wiki val KL 1e-4", r["val_1e-4"], "0.888")
check("T16 Wiki 24 epochs C4", r["e24"]["c4"], "86.3")
r = find(C["alloc"], source="wikitext2")
check("T11 Wiki measured C4", r["measured"]["c4"], "91.7")
r = find(C["factors"], model="llama-3.2-1b", source="wikitext2")
check("T14 Llama Wiki factors SP", r["factors"]["sp"], "301")
check("T14 Llama factors trainable (M)", r["factors"]["trainable"] / 1e6, "486")
check("T14 Llama projectors trainable (M)", r["projectors"]["trainable"] / 1e6, "174")
r = find(C["mix"], model="opt-1.3b", ratio=0.3, cal="SlimPajama + Self (doc.)")
check("T7 OPT -30 mix C4", r["c4"], "22.1")
MX = P["mixture"]
check("T7 OPT -30 mix rel 5 sets", MX["opt-1.3b"]["r30"]["rows"]["mix"]["rel_five"], "1.47")
check("T7 OPT -30 mix rel domains", MX["opt-1.3b"]["r30"]["rows"]["mix"]["rel_domains"], "1.10")
check("T7 Qwen -50 Self(doc) rel 5 sets", MX["qwen3-1.7b"]["r50"]["rows"]["selfdoc"]["rel_five"], "1.51")
check("T7 Llama -50 SP rel domains", MX["llama-3.2-1b"]["r50"]["rows"]["slimpajama"]["rel_domains"], "1.41")
r = find(C["format"], model="opt-1.3b", source="wikitext2", format="segments")
check("T10 OPT Wiki segments Wiki", r["wiki"], "48.8")
check("T10 OPT Wiki segments KL Wiki", r["kl_wikitext2"], "1.273")
r = find(P["alpaca"], model="opt-1.3b", ratio=0.3, cal="Alpaca, plain")
check("T4 OPT -30 Alpaca plain acc6", r["acc6"], "42.7")
check("T4 OPT -30 Alpaca plain acc7", r["acc7"], "43.9")


def main() -> int:
    bad = 0
    for label, value, printed in CHECKS:
        if printed is None:
            ok = value is not None and value >= 0
            shown = "" if ok else f" (got {value})"
        else:
            target = float(printed.replace(",", ""))
            ok = value is not None and abs(value - target) <= tol(printed)
            shown = f": page {value!r}, paper {printed}"
        if not ok:
            bad += 1
            print(f"MISMATCH {label}{shown}")
    print(f"{len(CHECKS) - bad} of {len(CHECKS)} checks agree with the paper")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
