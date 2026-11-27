#!/usr/bin/env python3
"""Build the data files of the project page from the paper's public run records.

    python3 tools/build_data.py --calibrank ../calibrank

Reads the records and the run tables of https://github.com/calibrank/calibrank
(``records/`` and ``results/``, the files from which that repository rebuilds every
table and figure of the paper) and writes:

    data/paper.json     everything the figures of the page draw
    data/runs.json      one row per run, for the run explorer
    data/examples.json  window layouts and the hand-picked excerpts of self-generated text
                        (from tools/examples_raw.json and tools/examples_selected.json)

The run selections follow the paper's report scripts (scripts/make_report.py and
scripts/make_report_ext.py of the code repository), so that every number on the page
is the number in the paper; tools/check_data.py checks a sample of them against the
paper's tables. Standard library only.
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import math
import os
import re
import subprocess
from statistics import mean, pstdev, stdev

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)

MAIN = ["opt-1.3b", "llama-3.2-1b", "qwen3-1.7b"]
ALL = MAIN + ["llama-3.1-8b"]
MODEL_LABEL = {"opt-1.3b": "OPT-1.3B", "llama-3.2-1b": "Llama-3.2-1B", "qwen3-1.7b": "Qwen3-1.7B",
               "llama-3.1-8b": "Llama-3.1-8B", "opt-125m": "OPT-125M",
               "llama-3.2-1b-it": "Llama-3.2-1B-Instruct"}
SOURCES = ["wikitext2", "c4", "slimpajama", "alpaca", "selfgen", "selfdoc"]
SOURCE_LABEL = {"wikitext2": "WikiText-2", "c4": "C4", "slimpajama": "SlimPajama",
                "alpaca": "Alpaca", "selfgen": "Self (seq.)", "selfdoc": "Self (doc.)"}
KLSETS = ["wikitext2", "c4", "slimpajama", "alpaca", "selfgen"]
NEWDOM = ["dolly", "gsm8k", "pubmedqa", "mbpp", "opus", "pg19"]
SP_DOMAINS = ["cc", "c4", "github", "book", "arxiv", "wiki", "stack"]
TASKS = ["arc_easy", "arc_challenge", "piqa", "hellaswag", "winogrande", "openbookqa", "boolq"]
RATIOS = [0.3, 0.5]


# ----------------------------------------------------------------------------
# reading
# ----------------------------------------------------------------------------

def num(x):
    if x is None or x == "" or x == "nan":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


def r4(x, sig=5):
    """Round to `sig` significant digits (JSON size), keeping None. Five digits keep every
    number the paper prints (the largest, 66,048, has five)."""
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0.0
    return float(f"{x:.{sig}g}")


def clean(o):
    """Replace NaN and infinities (e.g. a standard deviation over one seed) by null."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


def rtag(r: float) -> str:
    return f"r{int(round(r * 100))}"


class Table:
    """A run table (results/runs.csv or results/extended/runs.csv), indexed by (model, run)."""

    def __init__(self, path: str):
        self.rows = list(csv.DictReader(open(path)))
        self.by = {(r["model"], r["run"]): r for r in self.rows if r.get("done") == "True"}

    def get(self, model: str, run: str):
        return self.by.get((model, run))

    def val(self, model: str, run: str, key: str):
        r = self.get(model, run)
        return None if r is None else num(r.get(key))


def read_dense(path: str) -> dict:
    out = {}
    for r in csv.DictReader(open(path)):
        out[r["model"]] = r
    return out


def acc(row, prefix="final_", six=False):
    tasks = [t for t in TASKS if not (six and t == "boolq")]
    vals = [num(row.get(f"{prefix}zs_{t}_acc")) for t in tasks]
    if any(v is None for v in vals):
        return None
    return 100 * mean(vals)


def geo(xs):
    return math.exp(mean(math.log(x) for x in xs))


# ----------------------------------------------------------------------------
# sections of paper.json
# ----------------------------------------------------------------------------

def dense_block(dense: dict, models) -> dict:
    out = {}
    for m in models:
        d = dense.get(m)
        if d is None:
            continue
        e = {"wiki": r4(num(d.get("ppl_wikitext2"))), "c4": r4(num(d.get("ppl_c4"))),
             "sp": r4(num(d.get("sp_geo"))),
             "wikiStream": r4(num(d.get("pplstream_wikitext2"))),
             "sp_dom": {k: r4(num(d.get(f"sp_{k}"))) for k in SP_DOMAINS},
             "zs": {t: r4(100 * num(d[f"zs_{t}_acc"])) for t in TASKS if num(d.get(f"zs_{t}_acc")) is not None}}
        a7 = acc(d, prefix="")
        a6 = acc(d, prefix="", six=True)
        e["acc7"], e["acc6"] = r4(a7), r4(a6)
        if num(d.get("gen_ifeval_prompt_level_strict_acc")) is not None:
            e["ifevalPrompt"] = r4(100 * num(d["gen_ifeval_prompt_level_strict_acc"]))
            e["ifevalInst"] = r4(100 * num(d["gen_ifeval_inst_level_strict_acc"]))
        out[m] = e
    return out


def hero(ext: Table) -> list:
    """Every run of the three-seed grid and of Llama-3.1-8B: untrained and trained perplexity."""
    pts = []
    for m in ALL:
        for r in RATIOS:
            for s in SOURCES:
                for seed in (0, 1, 2):
                    row = ext.get(m, f"proj-{s}-{rtag(r)}-s{seed}")
                    if row is None:
                        continue
                    vals = [num(row.get(k)) for k in ("init_ppl_wikitext2", "init_ppl_c4",
                                                     "final_ppl_wikitext2", "final_ppl_c4")]
                    if any(v is None for v in vals):
                        continue
                    pts.append([m, r, seed, s] + [r4(v) for v in vals])
    return pts


def dumbbell(main: Table, ext: Table) -> dict:
    """Perplexity before and after training (Figures 2 and A1), with the oblique truncation
    of SVD-LLM (Table 2); Llama-3.1-8B from the extended evaluation, seed 0."""
    out = {}
    for m in ALL:
        tab = main if m in MAIN else ext
        out[m] = {}
        for r in RATIOS:
            cell = {}
            for s in SOURCES:
                row = tab.get(m, f"proj-{s}-{rtag(r)}-s0")
                if row is None:
                    continue
                e = {ph: {"wiki": r4(num(row.get(f"{ph}_ppl_wikitext2"))),
                          "c4": r4(num(row.get(f"{ph}_ppl_c4"))),
                          "sp": r4(num(row.get(f"{ph}_sp_geo")))} for ph in ("init", "final")}
                obl = main.get(m, f"none-{s}-{rtag(r)}-s0")
                if obl is not None:
                    e["oblique"] = {"wiki": r4(num(obl.get("init_ppl_wikitext2"))),
                                    "c4": r4(num(obl.get("init_ppl_c4"))),
                                    "sp": r4(num(obl.get("init_sp_geo")))}
                cell[s] = e
            if cell:
                out[m][rtag(r)] = cell
    return out


def kl_main(main: Table) -> dict:
    """Divergence on the five held-out sets, main grid (Figures 3 and A2, Table 5)."""
    out = {}
    for m in MAIN:
        out[m] = {}
        for r in RATIOS:
            out[m][rtag(r)] = {s: {t: r4(main.val(m, f"proj-{s}-{rtag(r)}-s0", f"final_kl_{t}"))
                                   for t in KLSETS} for s in SOURCES}
    return out


def seed_mean(ext: Table, m: str, run_of_seed, seeds=(0, 1, 2)):
    rows = [ext.get(m, run_of_seed(k)) for k in seeds]
    rows = [x for x in rows if x is not None]
    if not rows:
        return None, 0
    keys = {}
    for t in KLSETS + NEWDOM:
        vs = [num(x.get(f"final_kl_{t}")) for x in rows]
        if all(v is not None for v in vs):
            keys[f"kl_{t}"] = mean(vs)
    for k, col in (("wiki", "final_ppl_wikitext2"), ("c4", "final_ppl_c4"), ("sp", "final_sp_geo")):
        vs = [num(x.get(col)) for x in rows]
        if all(v is not None for v in vs):
            keys[k] = mean(vs)
    a6 = [acc(x, six=True) for x in rows]
    a7 = [acc(x) for x in rows]
    if all(v is not None for v in a6):
        keys["acc6"] = mean(a6)
        keys["acc7"] = mean(a7)
    return keys, len(rows)


def kl_seeds(ext: Table) -> dict:
    """Three-seed mean divergence on the five held-out sets and the six independent
    domains (Tables 6 and A5), for the uniform-fidelity explorer; Llama-3.1-8B at -50%
    has one seed."""
    out = {}
    for m in ALL:
        out[m] = {}
        for r in RATIOS:
            seeds = (0,) if (m == "llama-3.1-8b" and r == 0.5) else (0, 1, 2)
            cell, nseeds = {}, None
            for s in SOURCES:
                v, n = seed_mean(ext, m, lambda k, s=s, r=r: f"proj-{s}-{rtag(r)}-s{k}", seeds)
                if v is None:
                    continue
                nseeds = n
                cell[s] = {t: r4(v.get(f"kl_{t}")) for t in KLSETS + NEWDOM}
            if cell:
                out[m][rtag(r)] = {"seeds": nseeds, "kl": cell}
    return out


def domains(main: Table, ext: Table, dense_main: dict, dense_ext: dict) -> dict:
    """SlimPajama domains relative to the dense model (Figures 4, A3, 7; Table 8)."""
    out = {"grid": {}, "single": {}}
    for m in MAIN:
        d = dense_main[m]
        out["grid"][m] = {}
        for r in RATIOS:
            out["grid"][m][rtag(r)] = {
                s: {k: r4(main.val(m, f"proj-{s}-{rtag(r)}-s0", f"final_sp_{k}") / num(d[f"sp_{k}"]))
                    for k in SP_DOMAINS} for s in SOURCES}
    # Llama-3.1-8B, -30%: geometric mean over three seeds (Figure 7)
    m, d = "llama-3.1-8b", dense_ext["llama-3.1-8b"]
    out["grid"][m] = {"r30": {}}
    for s in SOURCES:
        rows = [ext.get(m, f"proj-{s}-r30-s{k}") for k in (0, 1, 2)]
        out["grid"][m]["r30"][s] = {k: r4(geo([num(x[f"final_sp_{k}"]) for x in rows]) / num(d[f"sp_{k}"]))
                                    for k in SP_DOMAINS}
    # single-domain calibration, Llama-3.2-1B, -50% (Table 8)
    m, d = "llama-3.2-1b", dense_main["llama-3.2-1b"]
    for key, run in (("slimpajama", "proj-slimpajama-r50-s0"), ("github", "proj-sp-github-r50-s0"),
                     ("arxiv", "proj-sp-arxiv-r50-s0"), ("book", "proj-sp-book-r50-s0")):
        row = main.get(m, run)
        out["single"][key] = {"rel": {k: r4(num(row[f"final_sp_{k}"]) / num(d[f"sp_{k}"])) for k in SP_DOMAINS},
                              "acc": r4(acc(row))}
    return out


def accuracy(main: Table, stats: dict) -> dict:
    """Per-task zero-shot accuracy (Table A1), paired intervals (Table 17), BoolQ (Table A2)."""
    tasks = {}
    for m in MAIN:
        tasks[m] = {}
        for r in RATIOS:
            tasks[m][rtag(r)] = {}
            for s in SOURCES:
                row = main.get(m, f"proj-{s}-{rtag(r)}-s0")
                tasks[m][rtag(r)][s] = {t: r4(100 * num(row[f"final_zs_{t}_acc"])) for t in TASKS}
    seeds = {}
    for key, per in stats["seeds"].items():
        m, r = key.split("/")
        seeds.setdefault(m, {})[r] = {
            s: {k: [r4(v[0] * (100 if k.startswith("acc") or k == "boolq" else 1)),
                    r4(v[1] * (100 if k.startswith("acc") or k == "boolq" else 1))]
                for k, v in per[s].items() if k in ("wiki", "c4", "sp", "acc7", "acc6", "accnorm", "boolq")}
            for s in per}
    paired = {}
    for key, per in stats["paired_acc"].items():
        m, r = key.split("/")
        paired.setdefault(m, {})[r] = {
            pair: {k: [r4(100 * v[k]["diff"]), r4(100 * v[k]["lo"]), r4(100 * v[k]["hi"])]
                   for k in ("acc6", "acc7")} | {"n_seeds": v.get("n_seeds")}
            for pair, v in per.items()}
    return {"tasks": tasks, "seeds": seeds, "paired": paired}


def paired_kl(stats: dict) -> dict:
    """Ratio of the divergence of the matching source to that of each other source, with
    95% paired-bootstrap intervals (Section 4.9)."""
    out = {}
    for key, per in stats["paired_kl"].items():
        m, r = key.split("/")
        out.setdefault(m, {})[r] = {
            a: {b: [r4(v["ratio"]), r4(v["lo"]), r4(v["hi"])] for b, v in bs.items()}
            for a, bs in per.items()}
    return out


def uniform_stats(stats: dict) -> dict:
    out = {}
    for key, per in stats["uniform"].items():
        m, r = key.split("/")
        out.setdefault(m, {})[r] = per
    return out


def alpaca_variants(ext: Table) -> list:
    """Alpaca with its template, without it and its responses alone; seed 0 (Table 4)."""
    rows = []
    for m in MAIN:
        for r in RATIOS:
            for label, run in (("Alpaca", f"proj-alpaca-{rtag(r)}-s0"),
                               ("Alpaca, plain", f"proj-alpaca-plain-{rtag(r)}-s0"),
                               ("Alpaca, responses", f"proj-alpaca-resp-{rtag(r)}-s0"),
                               ("C4", f"proj-c4-{rtag(r)}-s0"),
                               ("SlimPajama", f"proj-slimpajama-{rtag(r)}-s0")):
                x = ext.get(m, run)
                if x is None:
                    continue
                rows.append({"model": m, "ratio": r, "cal": label,
                             "wiki": r4(num(x["final_ppl_wikitext2"])), "c4": r4(num(x["final_ppl_c4"])),
                             "sp": r4(num(x["final_sp_geo"])), "acc6": r4(acc(x, six=True)),
                             "acc7": r4(acc(x))})
    return rows


def ablations(main: Table) -> dict:
    """Llama-3.2-1B at -50%: crossover of statistics and windows, window format,
    temperature (Table 9)."""
    m = "llama-3.2-1b"

    def cells(run):
        x = main.get(m, run)
        return {"wiki": r4(num(x["final_ppl_wikitext2"])), "c4": r4(num(x["final_ppl_c4"])),
                "sp": r4(num(x["final_sp_geo"])), "acc": r4(acc(x))}

    cross = []
    for init, train, run in (("c4", "c4", "proj-c4-r50-s0"), ("selfdoc", "c4", "proj-c4-r50-s0-initselfdoc"),
                             ("selfdoc", "selfdoc", "proj-selfdoc-r50-s0"),
                             ("c4", "selfdoc", "proj-selfdoc-r50-s0-initc4"),
                             ("wikitext2", "wikitext2", "proj-wikitext2-r50-s0"),
                             ("slimpajama", "wikitext2", "proj-wikitext2-r50-s0-initslimpajama"),
                             ("slimpajama", "slimpajama", "proj-slimpajama-r50-s0"),
                             ("wikitext2", "slimpajama", "proj-slimpajama-r50-s0-initwikitext2")):
        cross.append({"init": init, "train": train} | cells(run))
    fmt_ = [{"format": f} | cells(run) for f, run in (("BOS at window start", "proj-c4-r50-s0"),
                                                       ("BOS at every document start", "proj-c4-r50-s0-docbos"),
                                                       ("Plain chunks, no BOS", "proj-c4-r50-s0-nobos"))]
    temp = [{"T": t} | cells(run) for t, run in ((0.7, "proj-selfgenT0.7-r50-s0"), (1.0, "proj-selfgen-r50-s0"),
                                                  (1.3, "proj-selfgenT1.3-r50-s0"))]
    for t, run in ((0.7, "proj-selfgenT0.7-r50-s0"), (1.0, "proj-selfgen-r50-s0"), (1.3, "proj-selfgenT1.3-r50-s0")):
        next(x for x in temp if x["T"] == t)["klSelf"] = r4(main.val(m, run, "final_kl_selfgen"))
    return {"crossover": cross, "format": fmt_, "temperature": temp}


def subspaces(records: str) -> dict:
    """Overlap of the removed subspaces by block (Figure A4 and Section 4.4)."""
    out = {}
    for path in sorted(glob.glob(os.path.join(records, "subspaces", "subspaces-*.csv"))):
        name = os.path.basename(path)[len("subspaces-"):-4]
        m, r = name.rsplit("-", 1)
        rows = list(csv.DictReader(open(path)))
        blocks = sorted({int(x["block"]) for x in rows})
        series = {}
        for pair in ("init-final", "init-init", "final-final"):
            series[pair] = [r4(mean(float(x["overlap"]) for x in rows
                                    if x["pair"] == pair and int(x["block"]) == b), 5) for b in blocks]
        chance = [r4(mean(float(x["chance"]) for x in rows if int(x["block"]) == b)) for b in blocks]
        allmean = {pair: r4(mean(float(x["overlap"]) for x in rows if x["pair"] == pair), 5)
                   for pair in series}
        out.setdefault(m, {})[r] = {"blocks": blocks, "series": series, "chance": chance,
                                    "mean": allmean,
                                    "chanceRange": [r4(min(float(x["chance"]) for x in rows)),
                                                    r4(max(float(x["chance"]) for x in rows))]}
    return out


def source_stats(records: str) -> dict:
    """Documents and BOS per window, dense NLL, entropy by position (Table 1, Figure 1)."""
    out = {}
    for m in MAIN:
        d = json.load(open(os.path.join(records, "stats", f"sources-{m}.json")))
        out[m] = {s: {"docs": r4(v["docs_per_window"]), "bos": r4(v["bos_per_window"]),
                      "nll": r4(v["nll"]), "entropy": [r4(x) for x in v["entropy_by_pos_128"]]}
                  for s, v in d.items()}
    return out


def selfgen_controls(ext: Table) -> dict:
    """Length limits and restarts of self-generated text (Table 12), composition (Table 13)."""
    rows = []
    for m in ("qwen3-1.7b", "llama-3.2-1b"):
        for label, run in (("Exact, 2048 tokens", "proj-selfgen-r30-s0"),
                           ("Exact, restarted every 512", "proj-selfpack512-r30-s0"),
                           ("Documents, at most 128", "proj-selfdoc-r30-s0-M128"),
                           ("Documents, at most 512", "proj-selfdoc-r30-s0"),
                           ("Documents, at most 1024", "proj-selfdoc-r30-s0-M1024"),
                           ("Documents, at most 2048", "proj-selfdoc-r30-s0-M2048")):
            x = ext.get(m, run)
            rows.append({"model": m, "text": label, "wiki": r4(num(x["final_ppl_wikitext2"])),
                         "c4": r4(num(x["final_ppl_c4"])), "sp": r4(num(x["final_sp_geo"])),
                         "acc6": r4(acc(x, six=True)), "klSelf": r4(num(x["final_kl_selfgen"])),
                         "klC4": r4(num(x["final_kl_c4"]))})
    return {"lengths": rows}


def composition(records: str) -> dict:
    d = json.load(open(os.path.join(records, "extended", "analysis", "selfgen-composition.json")))
    out = {}
    for key, per in d.items():
        m, kind = key.split(":")
        out.setdefault(m, {})[kind] = {
            blk: {k: r4(v[k]) for k in ("rep4", "gzip_ratio", "script_cjk", "script_cyrillic",
                                         "english", "code", "doc_starts") if k in v}
            for blk, v in per.items() if isinstance(v, dict)}
    return out


def size_and_curves(main: Table, records: str) -> dict:
    """Number of distinct windows at 512 steps (Figure 5) and learning curves (Figure 6)."""
    m, ns = "llama-3.2-1b", [64, 128, 256, 512, 1024, 4096]
    tags = {512: {"c4": "", "selfdoc": ""}, 4096: {"c4": "-n4096", "selfdoc": "-fresh4096"}}
    size = {}
    for s in ("c4", "selfdoc"):
        size[s] = []
        for n in ns:
            tag = tags.get(n, {}).get(s, f"-n{n}")
            x = main.get(m, f"proj-{s}-r50-s0{tag}")
            if x is None:
                continue
            size[s].append({"n": n, "wiki": r4(num(x["final_ppl_wikitext2"])), "c4": r4(num(x["final_ppl_c4"])),
                            "sp": r4(num(x["final_sp_geo"])), "acc": r4(acc(x))})
    curves = {}
    for s in ("c4", "selfdoc"):
        curves[s] = {}
        for n in ns:
            run = f"proj-{s}-r50-s0" if n == 512 else f"proj-{s}-r50-s0-n{n}"
            p = os.path.join(records, "extended", "runs", m, run, "train_log.jsonl")
            if not os.path.exists(p):
                continue
            recs = [json.loads(x) for x in open(p) if x.strip()]
            met = json.load(open(os.path.join(os.path.dirname(p), "metrics.json")))
            kl = met.get("final", {}).get("kl", {})
            heldout = r4(geo([kl[t] for t in KLSETS])) if all(t in kl for t in KLSETS) else None
            curves[s][str(n)] = {"steps": [x.get("steps", 64 * (x["epoch"] + 1)) for x in recs],
                                 "train": [r4(x["train_kl"]) for x in recs],
                                 "val": [r4(x["val_kl"]) for x in recs], "heldout": heldout}
    return {"size": size, "curves": curves}


def bos(main: Table, dense_main: dict) -> dict:
    """The first token: Table A10 (Llama-3.2-1B at -50%) and Table 22 (all models)."""
    m = "llama-3.2-1b"
    rows = []
    for label, run, s in [(SOURCE_LABEL[s], f"proj-{s}-r50-s0", s) for s in SOURCES] + \
                         [("C4, BOS per document", "proj-c4-r50-s0-docbos", "c4"),
                          ("C4, no BOS", "proj-c4-r50-s0-nobos", "c4")]:
        x = main.get(m, run)
        rows.append({"cal": label, "source": s, "run": run,
                     "initBos": r4(num(x["init_ppl_wikitext2"])), "initStream": r4(num(x["init_pplstream_wikitext2"])),
                     "bos": r4(num(x["final_ppl_wikitext2"])), "stream": r4(num(x["final_pplstream_wikitext2"]))})
    ranges = []
    for mm, r in [(x, y) for x in MAIN for y in RATIOS] + [("llama-3.1-8b", 0.3)]:
        ratios = {}
        for s in SOURCES:
            x = main.get(mm, f"proj-{s}-{rtag(r)}-s0")
            if x is None:
                continue
            ratios[s] = r4(num(x["final_pplstream_wikitext2"]) / num(x["final_ppl_wikitext2"]))
        d = dense_main.get(mm)
        ranges.append({"model": mm, "ratio": r, "dense": r4(num(d["pplstream_wikitext2"]) / num(d["ppl_wikitext2"])),
                       "bySource": ratios})
    return {"llama50": rows, "ranges": ranges,
            "denseLlama": {"bos": r4(num(dense_main[m]["ppl_wikitext2"])),
                           "stream": r4(num(dense_main[m]["pplstream_wikitext2"]))}}


def behavior(records: str, ext: Table, dense_ext: dict) -> dict:
    """Generation, long context, passkey, generative tasks (Table 19); IFEval (Table 20);
    memory and latency (Table 21)."""
    rows = []
    for m in ALL:
        for run, s in [("dense", "dense")] + [(f"proj-{s}-r30-s0", s) for s in SOURCES]:
            p = os.path.join(records, "extended", "runs", m, run, "behave.json")
            if not os.path.exists(p):
                continue
            b = json.load(open(p))
            og, lc = b.get("open_gen", {}), b.get("long_ctx", {}).get("ppl_by_position", {})
            pk, tk = b.get("passkey", {}), b.get("tasks", {})
            gsm = tk.get("gsm8k", {}).get("exact_match,flexible-extract")
            nq = tk.get("nq_open", {}).get("exact_match,remove_whitespace")
            far = [v for k, v in lc.items() if k.startswith("4096")]
            near = [v for k, v in lc.items() if k.startswith("0-")]
            rows.append({"model": m, "source": s,
                         "genNll": r4(og.get("sample", {}).get("teacher_nll")),
                         "rep4": r4(og.get("greedy", {}).get("rep4")),
                         "distinct2": r4(og.get("sample", {}).get("distinct2")),
                         "pplFar": r4(far[0]) if far else None, "pplNear": r4(near[0]) if near else None,
                         "passkey": {k: r4(100 * v) for k, v in pk.items()},
                         "gsm8k": r4(100 * gsm) if gsm is not None else None,
                         "nq": r4(100 * nq) if nq is not None else None})
    inst = []
    m = "llama-3.2-1b-it"
    d = dense_ext[m]
    inst.append({"cal": "dense", "prompt": r4(100 * num(d["gen_ifeval_prompt_level_strict_acc"])),
                 "inst": r4(100 * num(d["gen_ifeval_inst_level_strict_acc"])), "acc6": r4(acc(d, prefix="", six=True)),
                 "wiki": r4(num(d["ppl_wikitext2"])), "klAlpaca": 0, "klSelf": 0})
    for label, run in (("C4", "proj-c4-r30-s0"), ("SlimPajama", "proj-slimpajama-r30-s0"),
                       ("Alpaca, chat format", "proj-alpaca-chat-r30-s0"), ("Self (doc.)", "proj-selfdoc-r30-s0"),
                       ("Self (responses)", "proj-selfresp-r30-s0")):
        x = ext.get(m, run)
        inst.append({"cal": label, "prompt": r4(100 * num(x["final_gen_ifeval_prompt_level_strict_acc"])),
                     "inst": r4(100 * num(x["final_gen_ifeval_inst_level_strict_acc"])),
                     "acc6": r4(acc(x, six=True)), "wiki": r4(num(x["final_ppl_wikitext2"])),
                     "klAlpaca": r4(num(x["final_kl_alpaca"])), "klSelf": r4(num(x["final_kl_selfgen"]))})
    bench = {}
    for mm in ALL:
        b = json.load(open(os.path.join(records, "extended", "analysis", f"bench-{mm}.json")))
        bench[mm] = {k: {f: r4(b[k][f]) for f in ("weights_gb", "prefill_ms_b1", "prefill_ms_b8",
                                                  "decode_tok_s_b1", "decode_tok_s_b16", "peak_gb_b16")}
                     for k in ("dense", "r30", "r50") if k in b}
    return {"rows": rows, "ifeval": inst, "bench": bench}


def scale(ext: Table) -> dict:
    """Llama-3.1-8B: three-seed means at -30%, one seed at -50% (Table 18)."""
    out = {}
    m = "llama-3.1-8b"
    for r, seeds in ((0.3, (0, 1, 2)), (0.5, (0,))):
        per = {}
        for s in SOURCES:
            v, n = seed_mean(ext, m, lambda k, s=s, r=r: f"proj-{s}-{rtag(r)}-s{k}", seeds)
            if v:
                per[s] = v
        best = {t: min(per[s][f"kl_{t}"] for s in per) for t in KLSETS}
        out[rtag(r)] = {s: {"wiki": r4(v["wiki"]), "c4": r4(v["c4"]), "sp": r4(v["sp"]), "acc6": r4(v["acc6"]),
                            "relKL": r4(geo([v[f"kl_{t}"] / best[t] for t in KLSETS]))}
                        for s, v in per.items()}
        out[rtag(r)]["_seeds"] = len(seeds)
    return out


def controls(main: Table, ext: Table) -> dict:
    """The controls of Section 3.4 that the page summarizes: matched-segment format
    (Table 10), SVD-LLM + LoRA (Table 15), optimization (Table 16), measured-KL allocation
    (Table 11), free factors (Table 14), mixture (Table 7)."""
    def ppl(x):
        return {"wiki": r4(num(x["final_ppl_wikitext2"])), "c4": r4(num(x["final_ppl_c4"])),
                "sp": r4(num(x["final_sp_geo"]))}

    fmt_ = []
    for m in MAIN:
        for s in ["wikitext2", "c4", "slimpajama", "alpaca", "selfdoc"]:
            for f, run in (("packed", f"proj-{s}-r50-s0"),
                           ("segments", f"proj-{'wikitext2-art' if s == 'wikitext2' else s}-r50-s0-seg127")):
                x = ext.get(m, run)
                if x is None:
                    continue
                fmt_.append({"model": m, "source": s, "format": f} | ppl(x) |
                            {"acc6": r4(acc(x, six=True))} |
                            {f"kl_{t}": r4(num(x[f"final_kl_{t}"])) for t in KLSETS[:4]})
    lora = []
    for m in ("llama-3.2-1b", "opt-1.3b"):
        for s in SOURCES:
            for method, run in (("SVD-LLM + LoRA", f"lora-{s}-r30-s0"), ("LSP", f"proj-{s}-r30-s0")):
                x = ext.get(m, run)
                lora.append({"model": m, "source": s, "method": method} | ppl(x) |
                            {"acc6": r4(acc(x, six=True)), "klAlpaca": r4(num(x["final_kl_alpaca"])),
                             "klSelf": r4(num(x["final_kl_selfgen"]))})
    optim = []
    m = "llama-3.2-1b"
    for s in SOURCES:
        e = {"source": s}
        for lr, run in (("3e-5", f"proj-{s}-r50-s0-lr3e-5"), ("1e-4", f"proj-{s}-r50-s0"),
                        ("3e-4", f"proj-{s}-r50-s0-lr3e-4")):
            e[f"val_{lr}"] = r4(ext.val(m, run, "best_val_kl"))
        x8, x24 = ext.get(m, f"proj-{s}-r50-s0"), ext.get(m, f"proj-{s}-r50-s0-e24")
        e["e8"] = ppl(x8) | {"acc6": r4(acc(x8, six=True))}
        e["e24"] = ppl(x24) | {"acc6": r4(acc(x24, six=True))}
        optim.append(e)
    alloc = []
    for s in SOURCES:
        u, k = main.get(m, f"proj-{s}-r50-s0"), main.get(m, f"proj-{s}-r50-s0-klalloc")
        alloc.append({"source": s, "uniform": ppl(u) | {"acc": r4(acc(u))},
                      "measured": ppl(k) | {"acc": r4(acc(k))}})
    factors = []
    for mm in ("llama-3.2-1b", "opt-1.3b"):
        for s in ("wikitext2", "c4", "selfgen"):
            p = main.get(mm, f"proj-{s}-r50-s0")
            # free factors: the better of two learning rates on validation KL
            cands = [main.get(mm, f"factors-{s}-r50-s0-lr{lr}") for lr in ("1e-4", "1e-5")]
            cands = [c for c in cands if c is not None]
            f = min(cands, key=lambda c: num(c["best_val_kl"]))
            factors.append({"model": mm, "source": s,
                            "projectors": ppl(p) | {"acc": r4(acc(p)), "trainable": num(p["trainable_params"])},
                            "factors": ppl(f) | {"acc": r4(acc(f)), "trainable": num(f["trainable_params"])}})
    mix = []
    for mm in MAIN:
        for r in RATIOS:
            for label, run in (("SlimPajama", f"proj-slimpajama-{rtag(r)}-s0"), ("Self (doc.)", f"proj-selfdoc-{rtag(r)}-s0"),
                               ("SlimPajama + Self (doc.)", f"proj-mix-sp-selfdoc-{rtag(r)}-s0")):
                x = ext.get(mm, run)
                mix.append({"model": mm, "ratio": r, "cal": label} | ppl(x) | {"acc6": r4(acc(x, six=True))} |
                           {f"kl_{t}": r4(num(x[f"final_kl_{t}"])) for t in KLSETS + NEWDOM})
    return {"format": fmt_, "lora": lora, "optim": optim, "alloc": alloc, "factors": factors, "mix": mix}


def mixture(ext: Table) -> dict:
    """SlimPajama, self-generated documents and their half-and-half mixture, seed 0, with the
    geometric-mean divergence relative to the best of the seven calibrations (Table 7)."""
    out = {}
    for m in MAIN:
        for r in RATIOS:
            runs = {s: f"proj-{s}-{rtag(r)}-s0" for s in SOURCES} | {"mix": f"proj-mix-sp-selfdoc-{rtag(r)}-s0"}
            kl = {s: {t: num(ext.get(m, run)[f"final_kl_{t}"]) for t in KLSETS + NEWDOM} for s, run in runs.items()}
            rel = {}
            for name, sets in (("five", KLSETS), ("real", KLSETS[:4]), ("domains", NEWDOM)):
                best = {t: min(kl[s][t] for s in kl) for t in sets}
                rel[name] = {s: r4(geo([kl[s][t] / best[t] for t in sets])) for s in kl}
            rows = {}
            for s in ("slimpajama", "selfdoc", "mix"):
                x = ext.get(m, runs[s])
                rows[s] = {"wiki": r4(num(x["final_ppl_wikitext2"])), "c4": r4(num(x["final_ppl_c4"])),
                           "sp": r4(num(x["final_sp_geo"])), "acc6": r4(acc(x, six=True)),
                           **{f"rel_{k}": rel[k][s] for k in rel}}
            out.setdefault(m, {})[rtag(r)] = {"rows": rows,
                                              "bestOf7": {k: min(rel[k].values()) for k in rel},
                                              "rel": rel}
    return out


def gpu_name(g: str) -> str:
    """'NVIDIA A100-SXM4-80GB' -> 'A100 80GB'; 'NVIDIA H100 80GB HBM3' -> 'H100'."""
    g = (g or "").replace("NVIDIA ", "")
    m = re.match(r"(A100)[-\w]*?(\d+GB)", g)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return g.split()[0] if g else ""


def run_index(main: Table, ext: Table, dense_paths: dict) -> list:
    """One row per run (459), for the explorer. Training-free runs report the truncation
    (their init_* metrics); trained runs the selected epoch (final_*)."""
    out = []
    for setname, path in dense_paths.items():
        for r in csv.DictReader(open(path)):
            if r.get("done") != "True":
                continue
            out.append({"set": setname, "model": r["model"], "run": r["run"], "mode": "dense", "source": None,
                        "ratio": 0.0, "seed": None, "wiki": r4(num(r.get("ppl_wikitext2"))),
                        "c4": r4(num(r.get("ppl_c4"))), "sp": r4(num(r.get("sp_geo"))), "acc": r4(acc(r, prefix="")),
                        "valkl": None, "trainMin": None, "gpu": gpu_name(r.get("gpu"))})
    for setname, tab in (("main", main), ("extended", ext)):
        for r in tab.rows:
            if r.get("done") != "True":
                continue
            trained = num(r.get("final_ppl_wikitext2")) is not None
            ph = "final" if trained else "init"
            out.append({
                "set": setname, "model": r["model"], "run": r["run"], "mode": r.get("mode"),
                "source": r.get("source"), "ratio": num(r.get("ratio")), "seed": num(r.get("seed")),
                "trained": trained,
                "wiki": r4(num(r.get(f"{ph}_ppl_wikitext2"))), "c4": r4(num(r.get(f"{ph}_ppl_c4"))),
                "sp": r4(num(r.get(f"{ph}_sp_geo"))), "acc": r4(acc(r, prefix=f"{ph}_")),
                "valkl": r4(num(r.get("best_val_kl"))),
                "trainMin": r4(num(r.get("t_train_s")) / 60) if num(r.get("t_train_s")) else None,
                "gpu": gpu_name(r.get("gpu")),
            })
    return out


# ----------------------------------------------------------------------------
# examples (window layouts, self-generated text)
# ----------------------------------------------------------------------------

def examples() -> dict | None:
    raw_p, sel_p = os.path.join(HERE, "examples_raw.json"), os.path.join(HERE, "examples_selected.json")
    if not (os.path.exists(raw_p) and os.path.exists(sel_p)):
        print("examples: tools/examples_raw.json or tools/examples_selected.json missing; skipped")
        return None
    raw, sel = json.load(open(raw_p)), json.load(open(sel_p))
    out = {"seqlen": raw["seqlen"], "windows": {}, "excerpts": []}
    for m, rec in raw["models"].items():
        def segs(lay):
            # document boundaries -> segment lengths; BOS positions
            cuts = sorted(set(lay["eos"]))
            return {"eos": cuts, "bos": lay["bos"]}
        out["windows"][m] = {"sources": {s: [segs(w) for w in ws] for s, ws in rec["windows"].items()},
                             "segments": [segs(w) for w in rec["segments"]],
                             "hasBos": rec["bos_id"] is not None and rec["bos_id"] != rec["eos_id"]}
    for item in sel["excerpts"]:
        rec = raw["models"][item["model"]]
        if item["kind"] == "exact":
            x = rec["exact"][item["index"]]
            out["excerpts"].append({"model": item["model"], "kind": "exact", "head": x["head"],
                                    "tail": x["tail"], "boundaries": len(x["boundaries"]),
                                    "note": item.get("note", "")})
        else:
            x = rec["documents"][item["index"]]
            out["excerpts"].append({"model": item["model"], "kind": "document", "text": x["text"],
                                    "length": x["length"], "note": item.get("note", "")})
    return out


# ----------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrank", default=os.path.join(os.path.dirname(SITE), "calibrank"),
                    help="checkout of github.com/calibrank/calibrank")
    ap.add_argument("--out", default=os.path.join(SITE, "data"))
    args = ap.parse_args()
    root = os.path.abspath(args.calibrank)
    records, results = os.path.join(root, "records"), os.path.join(root, "results")

    main_t = Table(os.path.join(results, "runs.csv"))
    ext_t = Table(os.path.join(results, "extended", "runs.csv"))
    dense_main = read_dense(os.path.join(results, "dense.csv"))
    dense_ext = read_dense(os.path.join(results, "extended", "dense.csv"))
    stats = json.load(open(os.path.join(results, "extended", "run_stats.json")))
    try:
        commit = subprocess.run(["git", "-C", root, "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None

    paper = {
        "provenance": {"repository": "https://github.com/calibrank/calibrank", "commit": commit,
                       "runs": len([r for r in main_t.rows + ext_t.rows if r.get("done") == "True"])},
        "models": {m: MODEL_LABEL[m] for m in MODEL_LABEL},
        "sources": SOURCES, "sourceLabel": SOURCE_LABEL,
        "dense": {"main": dense_block(dense_main, MAIN + ["llama-3.1-8b"]),
                  "ext": dense_block(dense_ext, ALL + ["llama-3.2-1b-it"])},
        "hero": hero(ext_t),
        "dumbbell": dumbbell(main_t, ext_t),
        "kl": {"main": kl_main(main_t), "seeds": kl_seeds(ext_t)},
        "pairedKL": paired_kl(stats),
        "uniform": uniform_stats(stats),
        "domains": domains(main_t, ext_t, dense_main, dense_ext),
        "accuracy": accuracy(main_t, stats),
        "alpaca": alpaca_variants(ext_t),
        "ablations": ablations(main_t),
        "subspaces": subspaces(records),
        "sourceStats": source_stats(records),
        "selfgen": selfgen_controls(ext_t),
        "composition": composition(records),
        "data": size_and_curves(main_t, records),
        "bos": bos(main_t, dense_main),
        "behavior": behavior(records, ext_t, dense_ext),
        "scale": scale(ext_t),
        "controls": controls(main_t, ext_t),
        "mixture": mixture(ext_t),
    }
    os.makedirs(args.out, exist_ok=True)

    def dump(name, obj):
        p = os.path.join(args.out, name)
        with open(p, "w") as f:
            json.dump(clean(obj), f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        print(f"wrote {p} ({os.path.getsize(p) / 1024:.0f} KB)")

    dump("paper.json", paper)
    dump("runs.json", {"rows": run_index(main_t, ext_t, {
        "main": os.path.join(results, "dense.csv"), "extended": os.path.join(results, "extended", "dense.csv")})})
    ex = examples()
    if ex is not None:
        dump("examples.json", ex)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
