# calibrank.github.io

Source of **https://calibrank.github.io/**, the interactive companion page of

> Van Tien Pham. **When Calibration Data Become Training Data: Specialization and
> Self-Generated Text in Learned Low-Rank Compression of Large Language Models.**
> *Informatics* 13(11), 201 (2026). https://doi.org/10.3390/informatics13110201

The page explains the study and lets readers explore its results: every chart is drawn
from the run records of the code repository,
[calibrank/calibrank](https://github.com/calibrank/calibrank), and the build checks the
numbers it shows against the paper's printed tables.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | the page: all text, the method diagram, and one `<figure data-fig="…">` per interactive figure |
| `assets/css/site.css` | design tokens (light and dark), typography, layout, figure chrome |
| `assets/js/main.js` | theme, navigation, math, and lazy loading of the figures as they scroll into view |
| `assets/js/viz.js` | shared chart helpers: palette, controls, tooltip, legend, table view |
| `assets/js/figs/*.js` | one module per figure, named by its `data-fig` attribute |
| `assets/js/lib/` | D3 7.9.0 and KaTeX 0.16.47, vendored with their licenses |
| `assets/fonts/` | Source Serif 4 (SIL Open Font License), Latin subsets |
| `data/paper.json` | everything the figures draw, built from the run records |
| `data/runs.json` | one row per run (459), for the run explorer |
| `data/examples.json` | real calibration-window layouts and hand-picked excerpts of self-generated text |
| `tools/` | the scripts that build and check `data/`, and the social-preview card |

No build step: the site is static files, served as they are (`.nojekyll` keeps GitHub
Pages from running Jekyll).

## Preview locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
```

The page loads its modules and data with `fetch`, so it needs a server; opening
`index.html` from the file system does not work. Two URL parameters help when sharing or
testing a view: `?theme=dark` or `?theme=light`, and `?hero=init`, `?hero=final` or
`?hero=best` to open the first figure at a given step.

## Rebuild and check the data

The data come from a checkout of the code repository (standard library only):

```bash
git clone https://github.com/calibrank/calibrank.git ../calibrank
python3 tools/build_data.py --calibrank ../calibrank   # writes data/paper.json, data/runs.json
python3 tools/check_data.py                           # compares 122 numbers with the paper
```

Run selections follow the paper's report scripts (`scripts/make_report.py` and
`scripts/make_report_ext.py` of the code repository), so each chart shows the runs behind
the corresponding table or figure of the paper.

`data/examples.json` also needs `tools/examples_raw.json`, which is not committed: it
holds raw model samples, of which only those listed in `tools/examples_selected.json`
(read and chosen by hand) are published. To regenerate it, run
`tools/extract_examples.py` where the self-generated pools of the experiments exist
(they are rebuilt by `scripts/generate_calib.py` of the code repository from the public
model weights and the recorded seeds); it needs a CPU, the `fsc` package and the
experiments' corpora in the Hugging Face cache. Without the raw file,
`tools/build_data.py` leaves `data/examples.json` as it is.

`assets/img/og.png`, the image shown when the page is shared, is a screenshot of
`tools/og.html` at 1200 × 630 (see the comment in that file).

## Deployment

GitHub Pages serves the `main` branch from the repository root: pushing to `main`
publishes the page.

## Licenses

The code of the site is under the Apache License 2.0 (`LICENSE`). The text and figures
adapt the article, published under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Vendored third-party files keep
their own licenses: D3 (ISC, `assets/js/lib/d3/LICENSE`), KaTeX (MIT,
`assets/js/lib/katex/LICENSE`) and Source Serif 4 (SIL Open Font License 1.1,
`assets/fonts/OFL.txt`).
