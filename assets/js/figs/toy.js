// A three-dimensional toy of why a fitted compressor specializes. Activations of two
// synthetic domains are flat clouds in different planes. Compressing to rank 2 removes
// one direction: the one along which the calibration activations vary least (for an
// identity layer, the whitened truncation and the best orthogonal projector coincide).
// The meters show the share of each domain's energy that is removed.
import { d3, el, cssVar, rng, gauss, REDUCED, parts, tableView } from "../viz.js";

const N = 170;

function norm(v) { const n = Math.hypot(...v); return v.map((x) => x / n); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function outer(a, s) { return a.map((x) => a.map((y) => s * x * y)); }
function add(...ms) { return ms.reduce((acc, m) => acc.map((r, i) => r.map((x, j) => x + m[i][j]))); }
function trace(m) { return m[0][0] + m[1][1] + m[2][2]; }
function quad(m, u) { return dot(u, [dot(m[0], u), dot(m[1], u), dot(m[2], u)]); }

// Jacobi eigendecomposition of a symmetric 3x3 matrix: [{value, vector}], ascending.
function eig3(M) {
  let A = M.map((r) => r.slice());
  let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (X, Y) => X.map((r) => [0, 1, 2].map((j) => r[0] * Y[0][j] + r[1] * Y[1][j] + r[2] * Y[2][j]));
  const T = (X) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => X[j][i]));
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = A[0][1] ** 2 + A[0][2] ** 2 + A[1][2] ** 2;
    if (off < 1e-20) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-16) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      const J = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      J[p][p] = c; J[q][q] = c; J[p][q] = s; J[q][p] = -s;
      A = mul(mul(T(J), A), J);
      V = mul(V, J);
    }
  }
  return [0, 1, 2].map((i) => ({ value: A[i][i], vector: [V[0][i], V[1][i], V[2][i]] }))
    .sort((a, b) => a.value - b.value);
}

// two domains: flat clouds (pancakes) in planes that meet at an angle
const theta = (68 * Math.PI) / 180;
const A_AXES = [[[1, 0, 0], 1.0], [[0, 1, 0], 0.62], [[0, 0, 1], 0.012]];
const vB = norm([0.18, Math.cos(theta), -Math.sin(theta)]);
const uB = norm([1, -0.12, 0.05]);
const nB = norm(cross(uB, vB));
const B_AXES = [[uB, 0.92], [norm(cross(nB, uB)), 0.62], [nB, 0.012]];
const cov = (axes) => add(...axes.map(([v, s]) => outer(norm(v), s)));
const SIG = { A: cov(A_AXES), B: cov(B_AXES) };
SIG.M = SIG.A.map((r, i) => r.map((x, j) => (x + SIG.B[i][j]) / 2));

function sample(axes, seed) {
  const r = rng(seed);
  return d3.range(N).map(() => {
    const p = [0, 0, 0];
    for (const [v, s] of axes) {
      const z = gauss(r) * Math.sqrt(s);
      const nv = norm(v);
      p[0] += z * nv[0]; p[1] += z * nv[1]; p[2] += z * nv[2];
    }
    return p;
  });
}

export default function init(fig) {
  const { controls, body } = parts(fig);
  const ptsA = sample(A_AXES, 11).map((p) => ({ p, dom: "A" }));
  const ptsB = sample(B_AXES, 29).map((p) => ({ p, dom: "B" }));
  const pts = ptsA.concat(ptsB);

  const removed = (k) => eig3(SIG[k])[0].vector;
  const loss = (u) => ({ A: quad(SIG.A, u) / trace(SIG.A), B: quad(SIG.B, u) / trace(SIG.B) });

  // ---------------------------------------------------------- layout
  const wrap = el("div", { class: "toy" });
  const canvas = el("canvas", { role: "img", "aria-label": "Rotating 3D point clouds of two domains and the plane kept by the compressor" });
  const side = el("div", { class: "toy-side" });
  wrap.append(canvas, side);
  body.replaceChildren(wrap);

  const calib = el("div", { class: "seg", role: "radiogroup", "aria-label": "Calibrate on" });
  const opts = [["A", "Domain A"], ["B", "Domain B"], ["M", "Half A, half B"]];
  let cal = "A";
  const btns = opts.map(([k, label]) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(k === cal) }, label);
    b.addEventListener("click", () => setCal(k));
    calib.append(b);
    return b;
  });
  controls.append(el("div", { class: "control" }, el("span", { class: "control-label", text: "Calibrate on" }), calib));
  const projToggle = el("input", { type: "checkbox" });
  controls.append(el("label", { class: "toggle" }, projToggle, "Show the compressed activations"));

  const meterBox = el("div", { class: "meter" });
  const meterRows = {};
  for (const [k, label] of [["A", "Domain A"], ["B", "Domain B"]]) {
    const fill = el("div", { class: "meter-fill" });
    const val = el("span", { class: "meter-val" });
    meterRows[k] = { fill, val };
    meterBox.append(el("div", { class: "meter-row" },
      el("span", {}, el("span", { class: "sw", style: `--c:var(--s-toy${k})` }), label),
      el("div", { class: "meter-track" }, fill), val));
  }
  const explain = el("p", { style: "margin:0 0 10px" });
  side.append(el("div", { style: "font-weight:650;margin-bottom:2px" }, "Energy removed by compression"),
    el("div", { class: "muted", style: "font-size:12.5px" }, "share of each domain's activation variance in the removed direction"),
    meterBox, explain,
    el("p", { class: "muted", style: "margin:0;font-size:12.5px" },
      "Drag to rotate. Synthetic data: a picture of the mechanism, not of the measurements."));

  // ---------------------------------------------------------- state
  let u = removed(cal);
  let uFrom = u, uTo = u, tU = 1;
  let proj = 0, projTarget = 0;
  let yaw = -0.75, pitch = 0.42;
  let dragging = false, lastX = 0, lastY = 0, idleAt = 0;
  let colors = {};
  const readColors = () => {
    colors = { A: cssVar("--s-toyA"), B: cssVar("--s-toyB"), ink: cssVar("--ink"), ink2: cssVar("--ink-2"),
      axis: cssVar("--axis"), bg: cssVar("--bg") };
  };
  readColors();
  document.addEventListener("themechange", () => { readColors(); });

  function slerp(a, b, t) {
    let d = dot(a, b);
    if (d < 0) { b = b.map((x) => -x); d = -d; }
    if (d > 0.9995) return norm(a.map((x, i) => x + t * (b[i] - x)));
    const w = Math.acos(d), s = Math.sin(w);
    return norm(a.map((x, i) => (Math.sin((1 - t) * w) * x + Math.sin(t * w) * b[i]) / s));
  }

  function setCal(k) {
    cal = k;
    btns.forEach((b, i) => b.setAttribute("aria-checked", String(opts[i][0] === k)));
    uFrom = u; uTo = removed(k); tU = REDUCED ? 1 : 0;
    updateSide();
  }
  projToggle.addEventListener("change", () => { projTarget = projToggle.checked ? 1 : 0; if (REDUCED) proj = projTarget; });

  function updateSide() {
    const l = loss(removed(cal));
    for (const k of ["A", "B"]) {
      meterRows[k].fill.style.width = `${Math.max(1.5, 100 * l[k] / 0.4)}%`;
      meterRows[k].fill.style.background = `var(--s-toy${k})`;
      meterRows[k].val.textContent = `${(100 * l[k]).toFixed(1)}%`;
    }
    const txt = {
      A: "Calibrated on domain A, the compressor keeps A's plane: A loses almost nothing, B loses a third of its energy.",
      B: "Calibrated on domain B, the roles swap: B is preserved and A pays.",
      M: "Calibrated on half of each, it keeps a compromise plane: neither domain is preserved perfectly, neither pays much. Mixtures are more uniform.",
    }[cal];
    explain.textContent = txt;
  }
  updateSide();

  // ---------------------------------------------------------- render
  const ctx = canvas.getContext("2d");
  let Wc = 0, Hc = 0, dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wc = r.width; Hc = r.width * 0.75;
    canvas.width = Math.round(Wc * dpr); canvas.height = Math.round(Hc * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function rot(p) {
    // yaw around the vertical (y) axis, then pitch around x; world z points up on screen
    const [x0, y0, z0] = p;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = cy * x0 - sy * y0, y1 = sy * x0 + cy * y0;
    const z2 = cp * z0 - sp * y1, y2 = sp * z0 + cp * y1;
    return [x1, z2, y2]; // screen x, screen up, depth (toward viewer)
  }
  function toScreen(q) {
    const s = Math.min(Wc, Hc) * 0.2;
    const persp = 1 / (1 - q[2] * 0.08);
    return [Wc / 2 + q[0] * s * persp, Hc / 2 - q[1] * s * persp, persp];
  }
  function alpha(c, a) { const d = d3.color(c); if (!d) return c; d.opacity = a; return d.formatRgb(); }

  function frame() {
    if (!dragging && !REDUCED && performance.now() - idleAt > 2500) yaw += 0.0026;
    if (tU < 1) { tU = Math.min(1, tU + 0.022); u = slerp(uFrom, uTo, d3.easeCubicInOut(tU)); }
    proj += (projTarget - proj) * 0.08;
    if (Math.abs(projTarget - proj) < 0.002) proj = projTarget;
    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    ctx.clearRect(0, 0, Wc, Hc);
    // kept plane: orthonormal basis of the complement of u
    const ref = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const k1 = norm(cross(u, ref)), k2 = norm(cross(u, k1));
    const R = 2.35;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) =>
      toScreen(rot(k1.map((x, i) => R * (a * x + b * k2[i])))));
    // axes
    ctx.lineWidth = 1;
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const a = toScreen(rot(ax.map((x) => -2.4 * x))), b = toScreen(rot(ax.map((x) => 2.4 * x)));
      ctx.strokeStyle = alpha(colors.axis, 0.9);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // plane
    ctx.beginPath();
    corners.forEach(([sx, sy], i) => (i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy)));
    ctx.closePath();
    ctx.fillStyle = alpha(colors.ink, 0.06);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.ink, 0.28);
    ctx.stroke();
    // points, back to front
    const items = pts.map((d) => {
      const along = dot(d.p, u);
      const q = d.p.map((x, i) => x - proj * along * u[i]);
      const r = rot(q);
      const s = toScreen(r);
      const foot = toScreen(rot(d.p.map((x, i) => x - along * u[i])));
      return { d, r, s, foot, along };
    }).sort((a, b) => a.r[2] - b.r[2]);
    for (const it of items) {
      if (proj < 0.98 && Math.abs(it.along) > 0.05) {
        ctx.strokeStyle = alpha(colors[it.d.dom], 0.18 * (1 - proj));
        ctx.beginPath(); ctx.moveTo(it.s[0], it.s[1]); ctx.lineTo(it.foot[0], it.foot[1]); ctx.stroke();
      }
      const a = 0.45 + 0.5 * Math.min(1, Math.max(0, (it.r[2] + 2) / 4));
      ctx.fillStyle = alpha(colors[it.d.dom], a);
      ctx.beginPath(); ctx.arc(it.s[0], it.s[1], 2.7 * it.s[2], 0, 2 * Math.PI); ctx.fill();
    }
    // removed direction
    const o = toScreen(rot([0, 0, 0])), tip = toScreen(rot(u.map((x) => 1.9 * x)));
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    const ang = Math.atan2(tip[1] - o[1], tip[0] - o[0]);
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - 9 * Math.cos(ang - 0.4), tip[1] - 9 * Math.sin(ang - 0.4));
    ctx.lineTo(tip[0] - 9 * Math.cos(ang + 0.4), tip[1] - 9 * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("removed direction", tip[0] + 8, tip[1] - 6);
    ctx.fillStyle = colors.ink2;
    ctx.fillText("kept plane (rank 2)", corners[0][0] + 6, corners[0][1]);
    ctx.lineWidth = 1;
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.008;
    pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - lastY) * 0.008));
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { dragging = false; idleAt = performance.now(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    const step = 0.12;
    if (e.key === "ArrowLeft") yaw -= step;
    else if (e.key === "ArrowRight") yaw += step;
    else if (e.key === "ArrowUp") pitch = Math.max(-1.3, pitch - step);
    else if (e.key === "ArrowDown") pitch = Math.min(1.3, pitch + step);
    else return;
    e.preventDefault(); idleAt = performance.now();
  });
  requestAnimationFrame(frame);

  tableView(fig, () => {
    const rows = [["Domain A", "A"], ["Domain B", "B"], ["Half A, half B", "M"]].map(([label, k]) => {
      const l = loss(removed(k));
      return [label, `${(100 * l.A).toFixed(1)}%`, `${(100 * l.B).toFixed(1)}%`];
    });
    return { caption: "Share of each domain's energy removed, by calibration data (toy).",
      columns: ["Calibrated on", "Domain A loses", "Domain B loses"], rows };
  });
}
