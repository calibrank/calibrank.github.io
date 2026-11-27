// Page bootstrap: theme, navigation, math, lazy figures.
import { el } from "./viz.js";

const root = document.documentElement;

// ---------------------------------------------------------------- theme

const media = window.matchMedia("(prefers-color-scheme: dark)");
function stored() {
  try { return localStorage.getItem("theme"); } catch { return null; }
}
function effective() {
  const t = root.getAttribute("data-theme");
  return t || (media.matches ? "dark" : "light");
}
function announce() {
  document.dispatchEvent(new CustomEvent("themechange", { detail: effective() }));
  const btn = document.querySelector(".theme-btn");
  if (btn) btn.setAttribute("aria-label", effective() === "dark" ? "Switch to light theme" : "Switch to dark theme");
}
const asked = new URLSearchParams(location.search).get("theme");
const saved = asked || stored();
if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
media.addEventListener("change", () => { if (!root.getAttribute("data-theme")) announce(); });
document.querySelector(".theme-btn")?.addEventListener("click", () => {
  const next = effective() === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch { /* private mode */ }
  announce();
});
announce();

// ---------------------------------------------------------------- navigation

const topbar = document.querySelector(".topbar");
const progress = document.querySelector(".progress");
function onScroll() {
  const y = window.scrollY;
  topbar?.classList.toggle("scrolled", y > 140);
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (progress) progress.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`;
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const links = [...document.querySelectorAll(".navlinks a")];
const targets = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
if ("IntersectionObserver" in window && targets.length) {
  const visible = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null);
    // the last section whose head has passed the top third of the viewport
    let current = null;
    for (const t of targets) {
      const top = t.getBoundingClientRect().top;
      if (top < window.innerHeight * 0.35) current = t.id;
    }
    links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${current}`));
  }, { rootMargin: "0px 0px -50% 0px", threshold: [0, 1] });
  targets.forEach((t) => io.observe(t));
  window.addEventListener("scroll", () => {
    let current = null;
    for (const t of targets) if (t.getBoundingClientRect().top < window.innerHeight * 0.35) current = t.id;
    links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${current}`));
  }, { passive: true });
}

const menuBtn = document.querySelector(".menu-btn");
const menu = document.querySelector(".mobile-menu");
menuBtn?.addEventListener("click", () => {
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
});
menu?.addEventListener("click", (e) => {
  if (e.target.closest("a")) { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
});

// ---------------------------------------------------------------- copy buttons

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const src = document.querySelector(btn.getAttribute("data-copy"));
    if (!src) return;
    const text = src.innerText.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const r = document.createRange();
      r.selectNodeContents(src);
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
      try { document.execCommand("copy"); } catch { /* ignore */ }
      s.removeAllRanges();
    }
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = old; }, 1500);
  });
});

// ---------------------------------------------------------------- math

function renderMath() {
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      ignoredClasses: ["no-math"],
    });
  }
}
if (document.readyState === "complete") renderMath();
else window.addEventListener("load", renderMath);

// ---------------------------------------------------------------- reveal

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const ro = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  reveals.forEach((n) => ro.observe(n));
} else reveals.forEach((n) => n.classList.add("in"));

// ---------------------------------------------------------------- figures

const json = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
const data = Promise.all([json("data/paper.json"), json("data/examples.json").catch(() => null)])
  .then(([P, EX]) => ({ P, EX }));

async function start(fig) {
  if (fig.dataset.started) return;
  fig.dataset.started = "1";
  const name = fig.getAttribute("data-fig");
  const body = fig.querySelector(".fig-body");
  try {
    const [mod, ctx] = await Promise.all([import(`./figs/${name}.js`), data]);
    mod.default(fig, ctx);
    fig.setAttribute("data-ready", "true");
  } catch (err) {
    console.error(`figure ${name}:`, err);
    body?.replaceChildren(el("p", { class: "status" },
      "This figure could not be drawn in your browser. The numbers are in the paper and in the run records."));
  }
}

const figs = [...document.querySelectorAll("[data-fig]")];
if ("IntersectionObserver" in window) {
  const fo = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { fo.unobserve(e.target); start(e.target); }
  }, { rootMargin: "600px 0px 600px 0px" });
  figs.forEach((f) => fo.observe(f));
} else figs.forEach(start);

// Deep links to a figure (#fig-...) render it before scrolling there.
if (location.hash.startsWith("#fig-")) {
  const f = document.querySelector(location.hash);
  if (f?.hasAttribute("data-fig")) start(f);
}
