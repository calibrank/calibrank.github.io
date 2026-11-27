#!/usr/bin/env python3
"""Real examples for the project page that the run records do not hold: the layout of
calibration windows (where documents and beginning-of-sequence tokens fall), and
excerpts of the self-generated calibration text.

Runs on a CPU, wherever the experiments' inputs are available: the ``fsc`` package of
https://github.com/calibrank/calibrank on PYTHONPATH, its corpora in the Hugging Face
cache (``scripts/prefetch.py``), and the self-generated pools that
``scripts/generate_calib.py`` writes. Windows are built by the same function and seed
as the experiments (``fsc.data.calibration_windows``, seed 0), so they are the first
training windows of the seed-0 runs; WikiText-2 windows are random chunks, drawn here
from the same generator but for fewer windows.

    HF_HUB_OFFLINE=1 PYTHONPATH=src python extract_examples.py --pools out/calib \\
        --out examples-raw.json

The excerpts are raw model output. tools/build_data.py publishes only the ones listed in
tools/examples_selected.json, which were read and chosen by hand.
"""

from __future__ import annotations

import argparse
import json
import os

import torch
from transformers import AutoTokenizer

from fsc import data as D

MODELS = {"opt-1.3b": "facebook/opt-1.3b", "llama-3.2-1b": "meta-llama/Llama-3.2-1B",
          "qwen3-1.7b": "Qwen/Qwen3-1.7B-Base"}
SOURCES = ["wikitext2", "c4", "slimpajama", "alpaca", "selfgen", "selfdoc"]
SEQLEN = 2048
N_WINDOWS = 3
EXCERPT = 96        # tokens per excerpt
N_SAMPLES = 16      # exact samples and documents decoded per model


def layout(window: torch.Tensor, bos: int | None, eos: int) -> dict:
    ids = window.tolist()
    return {"bos": [i for i, t in enumerate(ids) if bos is not None and t == bos],
            "eos": [i for i, t in enumerate(ids) if t == eos]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pools", required=True, help="directory holding <model>/selfgen-*.pt")
    ap.add_argument("--out", required=True)
    ap.add_argument("--models", nargs="+", default=list(MODELS))
    args = ap.parse_args()

    out: dict = {"seqlen": SEQLEN, "models": {}}
    for m in args.models:
        tok = AutoTokenizer.from_pretrained(MODELS[m])
        bos, eos = D.special_ids(tok)
        pool_seq = os.path.join(args.pools, m, "selfgen-T1.0-s0.pt")
        pool_doc = os.path.join(args.pools, m, "selfdoc-T1.0-s0.pt")
        rec: dict = {"bos_id": bos, "eos_id": eos, "windows": {}, "segments": None,
                     "exact": [], "documents": []}

        for s in SOURCES:
            path = {"selfgen": pool_seq, "selfdoc": pool_doc}.get(s)
            tr, _ = D.calibration_windows(tok, s, N_WINDOWS, 1, SEQLEN, seed=0,
                                          selfgen_path=path)
            rec["windows"][s] = [layout(w, bos, eos) for w in tr]
            print(m, s, [len(x["eos"]) for x in rec["windows"][s]], flush=True)

        # The matched-segment format: identical for every source by construction.
        tr, _ = D.calibration_windows(tok, "c4", N_WINDOWS, 1, SEQLEN, seed=0, segment_len=127)
        rec["segments"] = [layout(w, bos, eos) for w in tr]

        blob = torch.load(pool_seq, map_location="cpu", weights_only=False)
        ids = blob["ids"] if isinstance(blob, dict) else blob
        for i in range(min(N_SAMPLES, ids.shape[0])):
            row = ids[i]
            starts = [j for j, t in enumerate(row.tolist())
                      if j > 0 and (t == eos or (bos is not None and t == bos))]
            rec["exact"].append({
                "index": i,
                "head": tok.decode(row[1:1 + EXCERPT]),
                "tail": tok.decode(row[SEQLEN - EXCERPT:SEQLEN]),
                "boundaries": starts,
            })
        docs = D._pool_documents(pool_doc)
        for i, d in enumerate(docs[:N_SAMPLES]):
            rec["documents"].append({"index": i, "length": len(d),
                                     "text": tok.decode(d[:EXCERPT])})
        out["models"][m] = rec

    with open(args.out, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
