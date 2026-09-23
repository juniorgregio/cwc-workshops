/* Observabilidade → MCP OPS — deterministic animated flow.
   Every animated value is a pure function of t (seconds). render(t) is the only writer.
   rAF only advances t while playing. No CSS animations/transitions on the stage. */
(() => {
'use strict';

const T_INTRO = 6.6, P = 10;
const IGN = 6.0; // ignition 6.0 → 6.6
const NS = 'http://www.w3.org/2000/svg';
const html = document.documentElement;
const stage = document.getElementById('stage');
const wiresSvg = document.getElementById('wires');
const fxSvg = document.getElementById('fx');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const QM = new Map();
const Q = s => { if (!QM.has(s)) QM.set(s, document.querySelector(s)); return QM.get(s); };
const QA = s => { if (!QM.has('*' + s)) QM.set('*' + s, $$(s)); return QM.get('*' + s); };

/* ------------------------------------------------------------------ math / easing */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const eIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // easeInOutCubic
const eOut = x => 1 - Math.pow(1 - x, 3);
const eSine = x => -(Math.cos(Math.PI * x) - 1) / 2;
const eBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
/* window envelope: ease in over ri from a, hold until b, ease out over fo */
const env = (u, a, b, ri = 0.18, fo = 0.6) => {
  if (b < a + ri) b = a + ri;
  if (u <= a) return 0;
  if (u < a + ri) return eOut((u - a) / ri);
  if (u <= b) return 1;
  if (u < b + fo) return 1 - eIO((u - b) / fo);
  return 0;
};
/* smooth hump 0 → 1 → 0 over [a, a+d] */
const bump = (u, a, d) => { const x = (u - a) / d; return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x); };
const R3 = v => Math.round(v * 1000) / 1000;
const R2 = v => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ cached DOM writers */
function css(el, prop, val) {
  if (!el) return;
  const c = el.__c || (el.__c = {});
  if (c[prop] !== val) { c[prop] = val; el.style.setProperty(prop, val); }
}
function att(el, name, val) {
  if (!el) return;
  const c = el.__a || (el.__a = {});
  if (c[name] !== val) { c[name] = val; el.setAttribute(name, val); }
}
const op = (el, v) => css(el, 'opacity', String(R3(clamp01(v))));
const tf = (el, v) => css(el, 'transform', v);
const vis = (el, on) => css(el, 'visibility', on ? 'visible' : 'hidden');
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
/* SVG transform about a centre */
const sAbout = (cx, cy, s) => `translate(${R2(cx)} ${R2(cy)}) scale(${R3(s)}) translate(${R2(-cx)} ${R2(-cy)})`;
const sxyAbout = (cx, cy, sx, sy) => `translate(${R2(cx)} ${R2(cy)}) scale(${R3(sx)} ${R3(sy)}) translate(${R2(-cx)} ${R2(-cy)})`;
const rAbout = (cx, cy, a) => `rotate(${R2(a)} ${R2(cx)} ${R2(cy)})`;

/* ------------------------------------------------------------------ orthogonal geometry w/ rounded corners */
function geom(pts, R = 14) {
  const segs = [];
  const n = pts.length;
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
  let cur = pts[0];
  let d = `M${R2(cur[0])} ${R2(cur[1])}`;
  const line = (a, b) => { const [dx, dy, l] = dir(a, b); if (l > 0.01) segs.push({ arc: false, x: a[0], y: a[1], dx, dy, len: l }); };
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    if (i < n - 1) {
      const [ix, iy, il] = dir(pts[i - 1], p), [ox, oy, ol] = dir(p, pts[i + 1]);
      const cross = ix * oy - iy * ox;
      if (Math.abs(cross) < 1e-6) continue;
      const r = Math.min(R, i - 1 === 0 ? il : il / 2, i + 1 === n - 1 ? ol : ol / 2);
      const A = [p[0] - ix * r, p[1] - iy * r], B = [p[0] + ox * r, p[1] + oy * r];
      line(cur, A);
      segs.push({ arc: true, cx: A[0] + ox * r, cy: A[1] + oy * r, r, ix, iy, ox, oy, len: Math.PI * r / 2 });
      d += ` L${R2(A[0])} ${R2(A[1])} A${R2(r)} ${R2(r)} 0 0 ${cross > 0 ? 1 : 0} ${R2(B[0])} ${R2(B[1])}`;
      cur = B;
    } else {
      line(cur, p);
      d += ` L${R2(p[0])} ${R2(p[1])}`;
      cur = p;
    }
  }
  let len = 0; for (const s of segs) { s.s0 = len; len += s.len; }
  function at(s) {
    s = Math.max(0, Math.min(len, s));
    let g = segs[segs.length - 1];
    for (const q of segs) { if (s <= q.s0 + q.len) { g = q; break; } }
    const k = s - g.s0;
    if (!g.arc) return { x: g.x + g.dx * k, y: g.y + g.dy * k, dx: g.dx, dy: g.dy };
    const th = (k / g.len) * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
    return {
      x: g.cx + g.r * (-g.ox * c + g.ix * sn), y: g.cy + g.r * (-g.oy * c + g.iy * sn),
      dx: g.ox * sn + g.ix * c, dy: g.oy * sn + g.iy * c,
    };
  }
  return { d, len, at, pts };
}
function trim(pts, a, b) {
  const q = pts.map(p => p.slice());
  const mv = (p, from, k) => { const dx = from[0] - p[0], dy = from[1] - p[1], l = Math.hypot(dx, dy) || 1; p[0] += dx / l * k; p[1] += dy / l * k; };
  if (a) mv(q[0], q[1], a);
  if (b) mv(q[q.length - 1], q[q.length - 2], b);
  return q;
}
function arrowD(tip, dx, dy, L = 11, Wd = 6) {
  const nx = -dy, ny = dx;
  const bx = tip[0] - dx * L, by = tip[1] - dy * L;
  const p = (x, y) => `${R2(x)} ${R2(y)}`;
  return `M${p(tip[0], tip[1])} L${p(bx + nx * Wd, by + ny * Wd)} L${p(tip[0] - dx * (L - 3.2), tip[1] - dy * (L - 3.2))} L${p(bx - nx * Wd, by - ny * Wd)} Z`;
}

/* ------------------------------------------------------------------ layouts */
const RAIL_Y = 214, ROW1 = 254;
const FB_L = x => [[1760, 815], [1812, 815], [1812, RAIL_Y], [x, RAIL_Y], [x, ROW1]];
const LAYOUTS = {
  l: {
    W: 1920, H: 1080, R: 16,
    cards: { apps: [80, 254, 240, 270], obs: [410, 254, 490, 270], collector: [990, 254, 260, 270], repo: [1340, 254, 420, 270],
      monitor: [80, 640, 720, 350], mcp: [900, 640, 860, 350] },
    wires: [
      { id: 'w1', pts: [[320, 389], [410, 389]], c: '--blue', kind: 'data', ah: 'end', draw: [1.05, 1.35] },
      { id: 'w2', pts: [[900, 389], [990, 389]], c: '--green', kind: 'data', ah: 'end', draw: [2.10, 2.40] },
      { id: 'w3', pts: [[1250, 389], [1340, 389]], c: '--orange', kind: 'data', ah: 'end', draw: [2.95, 3.25] },
      { id: 'stem', pts: [[1550, 524], [1550, 582]], c: '--cyan', kind: 'data', ah: null, draw: [3.85, 4.00] },
      { id: 'armM', pts: [[1550, 582], [440, 582], [440, 640]], c: '--pink', kind: 'data', ah: 'end', draw: [4.00, 4.35] },
      { id: 'armC', pts: [[1550, 582], [1550, 640]], c: '--blue', kind: 'data', ah: 'end', draw: [4.00, 4.35] },
      { id: 'rail', pts: FB_L(200), kind: 'rail', ah: 'both', draw: [5.10, 5.80] },
      { id: 'dRepo', pts: [[1550, RAIL_Y], [1550, ROW1]], kind: 'rail', ah: 'end', parent: 'rail' },
      { id: 'dCol', pts: [[1120, RAIL_Y], [1120, ROW1]], kind: 'rail', ah: 'end', parent: 'rail' },
      { id: 'dObs', pts: [[655, RAIL_Y], [655, ROW1]], kind: 'rail', ah: 'end', parent: 'rail' },
      { id: 'link', pts: [[800, 815], [900, 815]], kind: 'link', ah: 'both', draw: [5.45, 5.85] },
    ],
    // direction chevrons on the feedback rail: [x, y, angle] (0 = pointing up, -90 = pointing left)
    chev: [[1812, 640, 0], [1812, 430, 0], [1335, RAIL_Y, -90], [888, RAIL_Y, -90]],
    junction: [1550, 582],
    fb: { repo: FB_L(1550), collector: FB_L(1120), obs: FB_L(655), apps: FB_L(200) },
    emit: [[1760, 815]],
    fbSpeed: 2000, // px/s cruise speed of the MCP OPS action pulses (100 px per frame at 20 fps)
  },
  p: {
    W: 1080, H: 1620, R: 14,
    cards: { apps: [48, 170, 642, 130], obs: [48, 344, 642, 240], collector: [48, 628, 642, 112], repo: [48, 784, 642, 160],
      monitor: [48, 1036, 460, 520], mcp: [572, 1036, 460, 520] },
    wires: [
      { id: 'w1', pts: [[369, 300], [369, 344]], c: '--blue', kind: 'data', ah: 'end', draw: [1.05, 1.35] },
      { id: 'w2', pts: [[369, 584], [369, 628]], c: '--green', kind: 'data', ah: 'end', draw: [2.10, 2.40] },
      { id: 'w3', pts: [[369, 740], [369, 784]], c: '--orange', kind: 'data', ah: 'end', draw: [2.95, 3.25] },
      { id: 'stem', pts: [[369, 944], [369, 990]], c: '--cyan', kind: 'data', ah: null, draw: [3.85, 4.00] },
      { id: 'armM', pts: [[369, 990], [278, 990], [278, 1036]], c: '--pink', kind: 'data', ah: 'end', draw: [4.00, 4.35] },
      { id: 'armC', pts: [[369, 990], [802, 990], [802, 1036]], c: '--blue', kind: 'data', ah: 'end', draw: [4.00, 4.35] },
      { id: 'rail', pts: [[958, 1036], [958, 235], [690, 235]], kind: 'rail', ah: 'both', draw: [5.10, 5.80] },
      { id: 'bObs', pts: [[958, 464], [690, 464]], kind: 'rail', ah: 'end', parent: 'rail' },
      { id: 'bCol', pts: [[958, 684], [690, 684]], kind: 'rail', ah: 'end', parent: 'rail' },
      { id: 'repoLink', pts: [[880, 1036], [880, 864], [690, 864]], kind: 'rail', ah: 'both', draw: [5.15, 5.60] },
      { id: 'link', pts: [[518, 1296], [562, 1296]], kind: 'link', ah: 'both', draw: [5.45, 5.85] },
    ],
    chev: [[958, 574, 0], [958, 350, 0]],
    junction: [369, 990],
    fb: {
      repo: [[880, 1036], [880, 864], [690, 864]],
      collector: [[958, 1036], [958, 684], [690, 684]],
      obs: [[958, 1036], [958, 464], [690, 464]],
      apps: [[958, 1036], [958, 235], [690, 235]],
    },
    emit: [[958, 1036], [880, 1036]],
    fbSpeed: 1400,
  },
};

/* live-loop packets (times in u). Data packets use sine easing; the long pink arm (1168 px in 16:9) cruises at a
   constant ≈2000 px/s between short ramps instead (≈100 px per frame at 20 fps). Feedback pulses: see fbTiming(). */
const FB_START = 6.40, FB_RAMP = 0.15;
const PACKETS = [
  { w: 'w1', c: '--sig-logs', s: 0.00, d: 0.60 },
  { w: 'w1', c: '--sig-metrics', s: 0.15, d: 0.60 },
  { w: 'w1', c: '--sig-traces', s: 0.30, d: 0.60 },
  { w: 'w2', c: '--sig-logs', s: 1.20, d: 0.50 },
  { w: 'w2', c: '--sig-metrics', s: 1.30, d: 0.50 },
  { w: 'w2', c: '--sig-traces', s: 1.40, d: 0.50 },
  { w: 'w3', c: '--sig-logs', s: 2.30, d: 0.45 },
  { w: 'w3', c: '--sig-metrics', s: 2.40, d: 0.45 },
  { w: 'w3', c: '--sig-traces', s: 2.50, d: 0.45 },
  { w: 'stem', c: '--cyan', s: 3.38, d: 0.20, noRip: true },
  { w: 'armM', c: '--pink', s: 3.54, d: 0.74, cruise: true },
  { w: 'armC', c: '--blue', s: 3.54, d: 0.34 },
  { w: 'link', c: '--xchg', s: 4.80, d: 0.45, small: true },
  { w: 'link', c: '--xchg', s: 4.95, d: 0.45, small: true, rev: true },
  { fb: 'repo', c: '--blue', s: FB_START, kind: 'fb' },
  { fb: 'collector', c: '--blue', s: FB_START, kind: 'fb' },
  { fb: 'obs', c: '--blue', s: FB_START, kind: 'fb' },
  { fb: 'apps', c: '--blue', s: FB_START, kind: 'fb' },
];
/* Feedback pulses cruise at the layout's constant speed with short accel/decel ramps, so all four leave MCP OPS
   together, ride the shared rail as one train and peel off at their own drop (natural Repo → Apps cascade).
   Returns [duration, s(τ) position along the route for τ in 0..duration]. */
function fbTiming(len, V) {
  const r = FB_RAMP;
  V = Math.min(V, len / r);                             // very short routes: ramps only
  const cruise = Math.max(0, len / V - r);              // time at full speed
  const d = cruise + 2 * r;
  const a = V / r;                                      // acceleration during the ramps
  const pos = tau => {
    if (tau <= 0) return 0;
    if (tau >= d) return len;
    if (tau < r) return 0.5 * a * tau * tau;
    if (tau < r + cruise) return 0.5 * V * r + V * (tau - r);
    const k = d - tau; return len - 0.5 * a * k * k;
  };
  return [d, pos];
}
const TRAIL = [[0.19, 3, 0.16], [0.11, 5.5, 0.2], [0.05, 8.5, 0.26]]; // [dt, width, opacity]
let ACK = { repo: 6.98, collector: 7.18, obs: 7.39, apps: 7.60 }; // feedback arrival per card (recomputed per layout)

/* ------------------------------------------------------------------ static DOM refs */
const CARD_IDS = ['apps', 'obs', 'collector', 'repo', 'monitor', 'mcp'];
const CARD_T = { // intro border draw / fill windows
  apps: { b: [0.50, 1.00], f: [0.70, 1.00] },
  obs: { b: [1.30, 1.80], f: [1.50, 1.80] },
  collector: { b: [2.35, 2.80], f: [2.55, 2.80] },
  repo: { b: [3.20, 3.65], f: [3.40, 3.65] },
  monitor: { b: [4.25, 4.75], f: [4.45, 4.75] },
  mcp: { b: [4.25, 4.75], f: [4.45, 4.75] },
};
const C = {};
for (const id of CARD_IDS) {
  const el = document.getElementById('c-' + id);
  C[id] = { id, el, glow: $('.glow', el), ack: $('.ack', el), fill: $('.fill', el), border: $('svg.border', el),
    band: $('.sheen i.own', el), gsw: $('.sheen i.gsw', el) };
}
const H = {
  kicker: $('.kicker'), words: $$('.h1 .w'), sub: $('.sub'), badge: $('.badge'), bdot: $('.bdot'), legend: $$('.legend li'),
};
const obsTiles = $$('#c-obs .tile');
const repoTiles = $$('#c-repo .tile');
const monItems = $$('#c-monitor .mi');
const caps = $$('#c-mcp .cap');
const sweepBand = $('.sweep i');
const chipEls = {};
for (const c of $$('#chips .chip')) chipEls[c.dataset.k] = c;
const alertChip = $('.alert-chip');
const nbadges = $$('.nbadge');
const srvDot = $('.srv i');

// a no-break space keeps "· db-orders" together; "a → b" groups are kept on one line by a nowrap span (capHTML)
const CAP_TXT = [
  'correlacionando 1.284 eventos…',
  'causa provável: pool de conexões\u00a0·\u00a0db-orders',
  'runbook: escalar checkout-api 3 → 6 pods',
  'ajustar timeout do pool 30s → 10s',
];
const SETTLE = [9.2, 9.5, 9.8];
const ARROW_SVG = '<svg class="ar" viewBox="0 0 15 10"><path d="M1.5 5H12.5M9 1.8L12.8 5L9 8.2"/></svg>';
/* status-line HTML for the typewriter: chars[0..n) visible, the rest laid out but hidden (.gh), optional caret at n,
   and the "x → y" group wrapped in a nowrap span (the inline svg arrow would otherwise be a line-break opportunity). */
function nwRange(chars) {
  const i = chars.indexOf('→');
  if (i < 0) return null;
  const a = chars.lastIndexOf(' ', i - 2) + 1;
  let b = chars.indexOf(' ', i + 2); if (b < 0) b = chars.length;
  return [a, b];
}
function capHTML(chars, n, caret) {
  const nw = nwRange(chars);
  let out = '', gh = false, inNw = false;
  const closeGh = () => { if (gh) { out += '</span>'; gh = false; } };
  for (let i = 0; i <= chars.length; i++) {
    if (nw && inNw && i === nw[1]) { closeGh(); out += '</span>'; inNw = false; }
    if (i === n && caret) { closeGh(); out += '<span class="cw"></span>'; }
    if (i === chars.length) break;
    if (nw && i === nw[0]) { closeGh(); out += '<span class="nw">'; inNw = true; }
    if (i >= n && !gh) { out += '<span class="gh">'; gh = true; }
    const c = chars[i];
    out += c === '→' ? ARROW_SVG : c === '&' ? '&amp;' : c === '<' ? '&lt;' : c;
  }
  closeGh(); if (inNw) out += '</span>';
  return out;
}

/* ------------------------------------------------------------------ icon rigs (micro-motion hooks) */
const rig = {};
function bboxC(el) { try { const b = el.getBBox(); return [b.x + b.width / 2, b.y + b.height / 2]; } catch (e) { return [32, 32]; } }
function wrapG(el) { const g = document.createElementNS(NS, 'g'); el.parentNode.insertBefore(g, el); g.appendChild(el); return g; }
function overlay(el, col = '#fff') { const c = el.cloneNode(false); c.removeAttribute('class'); c.setAttribute('fill', col); c.setAttribute('opacity', '0'); c.setAttribute('stroke', 'none'); el.parentNode.insertBefore(c, el.nextSibling); return c; }
function setupRigs() {
  const ic = (sel) => $(sel);
  // apps: tiles pulse on emission
  const apps = ic('#c-apps svg.ic-apps');
  rig.appsTiles = apps ? $$('.tile', apps).map(e => ({ e, c: bboxC(e) })) : [];
  rig.appsIcon = $('#c-apps .iw-apps');
  // obs tiles icons
  rig.obsSvg = obsTiles.map(t => $('svg.ic', t));
  rig.repoSvg = repoTiles.map(t => $('svg.ic', t));
  rig.monSvg = monItems.map(t => $('svg.ic', t));
  rig.tints = { obs: obsTiles.map(t => $('.tint', t)), repo: repoTiles.map(t => $('.tint', t)) };
  const otel = ic('#c-obs svg.ic-otel_sdk .tube');
  rig.otelTube = otel ? wrapG(otel) : null;
  // collector: rotating spoke+node group, pulsing hub, spokes draw out in the intro
  const col = ic('#c-collector svg.ic-collector');
  if (col) {
    const g = document.createElementNS(NS, 'g');
    const parts = $$('.spoke, .node', col);
    col.insertBefore(g, col.firstChild);
    parts.forEach(p => g.appendChild(p));
    rig.colRot = g;
    rig.colHub = $('.hub', col);
    rig.colSpokes = $$('.spoke', col); rig.colSpokes.forEach(s => s.setAttribute('pathLength', '1'));
    rig.colNodes = $$('.node', col).map(e => ({ e, c: [+e.getAttribute('cx'), +e.getAttribute('cy')] }));
    if (rig.colHub) col.appendChild(rig.colHub);
  }
  // loki: highlight overlays lit bottom → top
  const loki = ic('#c-repo svg.ic-loki');
  rig.loki = [];
  if (loki) {
    const rows = $$('.row', loki);
    const grp = [];
    if (rows[1]) grp.push($$('.cell', rows[1]));
    if (rows[0]) grp.push($$('.cell', rows[0]));
    grp.push($$('.bar:not(.cap)', loki));
    grp.push($$('.bar.cap', loki));
    rig.loki = grp.map(list => list.map(e => overlay(e)));
  }
  // dynatrace (repo + monitor): faces pulse in sequence
  const dtFaces = svg => ['.face-left', '.face-top', '.face-right', '.face-bottom'].map(s => $(s, svg)).filter(Boolean).map(e => overlay(e));
  const dt1 = ic('#c-repo svg.ic-dynatrace'), dt2 = ic('#c-monitor svg.ic-dynatrace');
  rig.dt1 = dt1 ? dtFaces(dt1) : []; rig.dt2 = dt2 ? dtFaces(dt2) : [];
  rig.dt1Icon = dt1 ? dt1.parentNode : null; rig.dt2Icon = dt2 ? dt2.parentNode : null;
  // grafana: swirl rotation about its own centre
  const gf = ic('#c-monitor svg.ic-grafana');
  rig.grafana = gf ? ($('.swirl', gf) || gf.firstElementChild) : null;
  rig.grafanaC = rig.grafana ? bboxC(rig.grafana) : [32, 32];
  rig.grafanaIcon = gf ? gf.parentNode : null;
  // monitor dash: needle swing, trend redraw
  const md = ic('#c-monitor svg.ic-monitor_dash');
  rig.needle = md ? $('.needle', md) : null;
  rig.mdTrend = md ? $('.trend', md) : null; if (rig.mdTrend) rig.mdTrend.setAttribute('pathLength', '1');
  // mcp brain: nodes light along the traces
  const br = ic('#c-mcp svg.ic-mcp_brain');
  rig.brainNodes = br ? $$('.node', br) : [];
  rig.brainTraces = br ? $$('.trace', br) : [];
  rig.brainNodes.forEach(n => { n.setAttribute('fill', 'currentColor'); n.setAttribute('fill-opacity', '0'); });
  // capabilities
  rig.caps = caps.map((cap, i) => {
    const svg = $('svg.ic', cap);
    const r = { cap, iw: $('.iw', cap), tint: $('.cap-tint', cap), bar: $('.cap-bar', cap), rest: $('.stl .rest', cap), act: $('.stl .act', cap), svg, n: -1 };
    if (svg) {
      if (i === 0) { r.eyes = $$('.eye', svg).map(e => ({ e, c: [+e.getAttribute('cx'), +e.getAttribute('cy')] })); r.antenna = $('.antenna', svg); }
      if (i === 1) { r.trend = $$('.trend path', svg); r.trend.forEach(p => p.setAttribute('pathLength', '1')); r.lens = $('.lens', svg); }
      if (i === 2) { r.gear = $('.gear', svg); r.play = $('.play', svg); }
      if (i === 3) { r.rays = $$('.ray', svg); r.bulb = $('.bulb path', svg); if (r.bulb) { r.bulb.setAttribute('fill', 'currentColor'); r.bulb.setAttribute('fill-opacity', '0'); } }
    }
    return r;
  });
}

/* ------------------------------------------------------------------ scene build (per layout) */
let LY = null, LAY = 'l';
let W = {}, PK = [], RIPS = [], chev = [], jdot = null, jflash = null, emitRings = [], borders = {}, chipSize = {};

function buildCardsBorders() {
  for (const id of CARD_IDS) {
    const [x, y, w, h] = LY.cards[id];
    const c = C[id];
    css(c.el, 'left', x + 'px'); css(c.el, 'top', y + 'px'); css(c.el, 'width', w + 'px'); css(c.el, 'height', h + 'px');
    const svg = c.border;
    svg.innerHTML = '';
    att(svg, 'width', w); att(svg, 'height', h); att(svg, 'viewBox', `0 0 ${w} ${h}`);
    const r = LY.R - 1, x0 = 1, y0 = 1, x1 = w - 1, y1 = h - 1, cx = w / 2;
    let stroke = `var(${id === 'apps' || id === 'mcp' ? '--blue' : id === 'obs' ? '--green' : id === 'collector' ? '--orange' : id === 'repo' ? '--cyan' : '--pink'})`;
    if (id === 'obs') {
      const defs = svgEl('defs', null, svg);
      const lg = svgEl('linearGradient', { id: 'obs-border-grad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: w, y2: 0 }, defs);
      svgEl('stop', { offset: '0', style: 'stop-color:var(--green)' }, lg);
      svgEl('stop', { offset: '.5', style: 'stop-color:var(--green)' }, lg);
      svgEl('stop', { offset: '.6', style: 'stop-color:var(--purple)' }, lg);
      svgEl('stop', { offset: '1', style: 'stop-color:var(--purple)' }, lg);
      stroke = 'url(#obs-border-grad)';
    }
    const dR = `M${cx} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} H${cx}`;
    const dL = `M${cx} ${y0} H${x0 + r} A${r} ${r} 0 0 0 ${x0} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 0 ${x0 + r} ${y1} H${cx}`;
    const b1 = svgEl('path', { d: dR, pathLength: 1, 'stroke-dasharray': '1 1', style: `stroke:${stroke}` }, svg);
    const b2 = svgEl('path', { d: dL, pathLength: 1, 'stroke-dasharray': '1 1', style: `stroke:${stroke}` }, svg);
    const sp = [0, 1].map(() => ({ h: svgEl('circle', { class: 'spark-h', r: 8 }, svg), c: svgEl('circle', { class: 'spark', r: 3.2 }, svg) }));
    // geometry for the sparks (same shape as the paths, measured analytically)
    const halfLen = (x1 - cx - r) + (Math.PI * r / 2) + (y1 - y0 - 2 * r) + (Math.PI * r / 2) + (x1 - r - cx);
    const gR = geom([[cx, y0], [x1, y0], [x1, y1], [cx, y1]], r), gL = geom([[cx, y0], [x0, y0], [x0, y1], [cx, y1]], r);
    borders[id] = { b1, b2, sp, gR, gL, halfLen };
  }
}

function buildWires() {
  const { W: SW, H: SH } = LY;
  for (const s of [wiresSvg, fxSvg]) { s.innerHTML = ''; att(s, 'width', SW); att(s, 'height', SH); att(s, 'viewBox', `0 0 ${SW} ${SH}`); }
  const defs = svgEl('defs', null, wiresSvg);
  const gTrack = svgEl('g', null, wiresSvg), gRail = svgEl('g', null, wiresSvg), gDraw = svgEl('g', null, wiresSvg),
    gFlow = svgEl('g', null, wiresSvg), gArrow = svgEl('g', null, wiresSvg), gHead = svgEl('g', null, wiresSvg),
    gPk = svgEl('g', null, wiresSvg);
  W = {};
  const AL = 11;
  for (const def of LY.wires) {
    const full = geom(def.pts, 14);
    const tA = def.ah === 'both' ? AL - 3 : 0, tB = def.ah ? AL - 3 : 0;
    const trimmed = geom(trim(def.pts, tA, tB), 14);
    const w = { def, full, trimmed, tA, arrows: [] };
    const col = def.c ? `var(${def.c})` : 'var(--rail)';
    if (def.kind === 'data') {
      w.track = svgEl('path', { class: 'w-track', d: trimmed.d, style: `stroke:${col}` }, gTrack);
      w.draw = svgEl('path', { class: 'w-draw', d: trimmed.d, style: `stroke:${col}` }, gDraw);
      w.flow = svgEl('path', { class: 'w-flow', d: trimmed.d, style: `stroke:${col}` }, gFlow);
      w.headH = svgEl('circle', { r: 9, style: `fill:${col}`, opacity: 0 }, gHead);
      w.head = svgEl('circle', { r: 4, style: `fill:${col}`, opacity: 0 }, gHead);
    } else {
      const mid = 'm-' + def.id;
      const m = svgEl('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: SW + 40, height: SH + 40 }, defs);
      w.mask = svgEl('path', { d: full.d, stroke: '#fff', 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'butt' }, m);
      w.rail = svgEl('path', { class: def.kind === 'link' ? 'w-link' : 'w-rail', d: trimmed.d, mask: `url(#${mid})` }, gRail);
    }
    const acol = def.kind === 'data' ? col : 'var(--rail)';
    const aL = def.kind === 'data' ? 11 : 10, aW = def.kind === 'data' ? 6 : 5.5;
    if (def.ah) {
      const e = full.at(full.len);
      w.arrows.push({ tip: [e.x, e.y], el: svgEl('path', { class: 'w-arrow', d: arrowD([e.x, e.y], e.dx, e.dy, aL, aW), style: `fill:${acol}` }, gArrow), end: 1 });
    }
    if (def.ah === 'both') {
      const s = full.at(0);
      w.arrows.push({ tip: [s.x, s.y], el: svgEl('path', { class: 'w-arrow', d: arrowD([s.x, s.y], -s.dx, -s.dy, aL, aW), style: `fill:${acol}` }, gArrow), end: 0 });
    }
    W[def.id] = w;
  }
  // children of the rail (drops / branches): reveal after the parent passes their junction
  for (const id in W) {
    const w = W[id];
    if (!w.def.parent) continue;
    const p = W[w.def.parent];
    const j = w.def.pts[0];
    // arc-length of the junction along the parent (search)
    let best = 0, bd = 1e9;
    for (let s = 0; s <= p.full.len; s += 1) { const q = p.full.at(s); const dd = Math.hypot(q.x - j[0], q.y - j[1]); if (dd < bd) { bd = dd; best = s; } }
    w.sj = best;
    const frac = best / p.full.len;
    // invert eIO to find when the parent's reveal passes the junction
    let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (eIO(m) < frac) lo = m; else hi = m; }
    const [a, b] = p.def.draw;
    w.def = Object.assign({}, w.def, { draw: [a + (b - a) * lo, a + (b - a) * lo + 0.14] });
    w.phase = best - p.tA; // dash phase continuity with the parent
  }
  // chevrons on the vertical part of the rail
  chev = LY.chev.map(([x, y, ang]) => {
    const rail = W.rail; let best = 0, bd = 1e9;
    for (let s = 0; s <= rail.full.len; s += 1) { const q = rail.full.at(s); const dd = Math.hypot(q.x - x, q.y - y); if (dd < bd) { bd = dd; best = s; } }
    let lo = 0, hi = 1; const frac = best / rail.full.len;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (eIO(m) < frac) lo = m; else hi = m; }
    const [a, b] = rail.def.draw;
    const g = svgEl('g', { transform: `translate(${x} ${y}) rotate(${ang || 0})` }, gArrow);
    const el = svgEl('path', { class: 'w-chev', d: 'M-6 4L0 -3L6 4' }, g);
    // unit vector the chevron points to (used for its little "push" when the action pulses pass)
    const rad = (ang || 0) * Math.PI / 180;
    return { el, x, y, ux: Math.sin(rad), uy: -Math.cos(rad), t0: a + (b - a) * lo };
  });
  // junction dot
  const [jx, jy] = LY.junction;
  jdot = svgEl('circle', { class: 'jdot', cx: jx, cy: jy, r: 5 }, gArrow);
  jflash = svgEl('circle', { class: 'rip', cx: jx, cy: jy, r: 5, style: 'stroke:var(--cyan)', opacity: 0 }, fxSvg);
  emitRings = LY.emit.map(([x, y]) => svgEl('circle', { class: 'rip', cx: x, cy: y, r: 5, style: 'stroke:var(--blue)', opacity: 0 }, fxSvg));

  // packets
  ACK = {};
  PK = PACKETS.map(def => {
    let g, pos = null;
    if (def.fb) {
      g = geom(LY.fb[def.fb], 14);
      const [d, f] = fbTiming(g.len, LY.fbSpeed);
      def = Object.assign({}, def, { d });
      pos = f;
      ACK[def.fb] = R3(def.s + d);
    } else {
      const w = W[def.w]; g = def.rev ? geom(w.def.pts.slice().reverse(), 14) : w.full;
      // same duration, constant cruise speed: only when that lowers the peak speed below the sine's
      if (def.cruise && g.len / (def.d - FB_RAMP) < g.len * Math.PI / (2 * def.d)) pos = fbTiming(g.len, g.len / (def.d - FB_RAMP))[1];
    }
    const col = `var(${def.c})`;
    const grp = svgEl('g', { opacity: 0 }, gPk);
    const trails = TRAIL.map(([dt, sw, o]) => ({ dt, el: svgEl('path', { class: 'pk-trail', d: g.d, 'stroke-width': sw, opacity: o, style: `stroke:${col}` }, grp) }));
    const small = def.small;
    const halo = svgEl('circle', { r: small ? 8 : 13, opacity: .25, style: `fill:${col}` }, grp);
    const ring = def.kind === 'fb' ? svgEl('circle', { class: 'fb-ring', r: 9, opacity: .7 }, grp) : null;
    const core = svgEl('circle', { class: 'pk-core', r: small ? 4.2 : def.kind === 'fb' ? 4.8 : 6.5, style: `fill:${col}` }, grp);
    const end = g.at(g.len);
    const rip = def.noRip ? null : svgEl('circle', { class: 'rip', cx: R2(end.x), cy: R2(end.y), r: 5, opacity: 0, style: `stroke:${col}` }, fxSvg);
    // s(u): arc-length position at live time u
    const sAt = pos ? (u => pos(u - def.s)) : (u => g.len * eSine(prog(u, def.s, def.s + def.d)));
    return { def, g, grp, trails, halo, ring, core, rip, sAt };
  });
  // when does the action-pulse train (longest route = apps, same start as the rail) pass each chevron?
  const lead = PK.find(k => k.def.fb === 'apps');
  for (const ch of chev) {
    let best = 0, bd = 1e9;
    for (let s = 0; s <= lead.g.len; s += 1) { const q = lead.g.at(s); const dd = Math.hypot(q.x - ch.x, q.y - ch.y); if (dd < bd) { bd = dd; best = s; } }
    let lo = lead.def.s, hi = lead.def.s + lead.def.d;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (lead.sAt(m) < best) lo = m; else hi = m; }
    ch.tp = R3(lo);
  }
}

function measureChips() {
  chipSize = {};
  for (const k in chipEls) { const e = chipEls[k]; chipSize[k] = [e.offsetWidth, e.offsetHeight]; }
}

/* ------------------------------------------------------------------ intro helpers */
function introPop(el, t, a, d = 0.3, from = 0.6) {
  if (!el) return;
  const p = prog(t, a, a + d);
  op(el, eOut(clamp01(p * 1.8)));
  tf(el, p >= 1 ? 'none' : `scale(${R3(from + (1 - from) * eBack(p))})`);
}
function introUp(el, t, a, d = 0.35, dy = 14) {
  if (!el) return;
  const p = prog(t, a, a + d);
  op(el, eOut(p));
  tf(el, p >= 1 ? 'none' : `translateY(${R2(dy * (1 - eOut(p)))}px)`);
}
function introSlide(el, t, a, d = 0.35, dx = 24) {
  if (!el) return;
  const p = prog(t, a, a + d);
  op(el, eOut(p));
  tf(el, p >= 1 ? 'none' : `translateX(${R2(dx * (1 - eOut(p)))}px)`);
}
function introFade(el, t, a, d = 0.3) { if (el) op(el, eIO(prog(t, a, a + d))); }

/* ------------------------------------------------------------------ render(t) */
let T = 0;
function render(t) {
  t = Math.max(0, +t || 0);
  const live = t >= T_INTRO;
  let u = live ? (t - T_INTRO) % P : -50;
  u = Math.round(u * 1e6) / 1e6; if (u >= P) u = 0;
  // flow clock: 0 before ignition, accelerating during 6.6→7.2, then 1 s per s (continuous)
  const ft = t < IGN ? 0 : t < T_INTRO ? Math.pow(t - IGN, 2) / (2 * (T_INTRO - IGN)) : (t - T_INTRO) + (T_INTRO - IGN) / 2;
  const ign = eIO(prog(t, IGN, T_INTRO));

  renderHeader(t);
  renderCards(t, u);
  renderWires(t, u, ft, ign);
  renderPackets(u);
  renderChips(u);
  renderMicro(t, u);
  renderCaps(t, u);

  // ignition sweep (once) and the "resolved" sweep of the loop
  const sp = prog(t, SWEEP_IGN[0], SWEEP_IGN[1]), lp = prog(u, 8.0, 8.75);
  renderSweep(sp > 0 && sp < 1 ? [sp, 1] : lp > 0 && lp < 1 ? [lp, 0.75] : null);
}

/* The sweep band lives UNDER the cards (it never veils text). Each card replays the same band, aligned to the
   global one, between its white fill and its content, so the light still visibly crosses the cards. */
const SWEEP_IGN = [5.85, 6.6], SWEEP_BW = 300, SKEW = -18, TSK = Math.tan(SKEW * Math.PI / 180);
function renderSweep(sw) {
  if (!sw) { op(sweepBand, 0); for (const id of CARD_IDS) op(C[id].gsw, 0); return; }
  const { W: SW, H: SH } = LY;
  const X = lerp(-SWEEP_BW - 0.3 * SH, SW + 0.3 * SH, eSine(sw[0]));
  const o = sw[1] * Math.min(1, 3 * Math.sin(Math.PI * sw[0]));
  op(sweepBand, o);
  tf(sweepBand, `translateX(${R2(X)}px) skewX(${SKEW}deg)`);
  for (const id of CARD_IDS) {
    const [cx, cy, cw, chh] = LY.cards[id];
    const tx = X - cx + TSK * (cy + chh / 2 - SH / 2);
    const inView = tx + SWEEP_BW + 0.4 * chh > 0 && tx - 0.4 * chh < cw;
    op(C[id].gsw, inView ? o : 0);
    if (inView) tf(C[id].gsw, `translateX(${R2(tx)}px) skewX(${SKEW}deg)`);
  }
}

function renderHeader(t) {
  introUp(H.kicker, t, 0.00, 0.35, 12);
  H.words.forEach((w, i) => introUp(w, t, 0.10 + 0.12 * i, 0.42, 16));
  introUp(H.sub, t, 0.40, 0.4, 12);
  introPop(H.badge, t, 0.50, 0.35, 0.7);
  H.legend.forEach((li, i) => introUp(li, t, 0.60 + 0.1 * i, 0.3, 8));
  // live dot: steady until ignition, then a 1 s blink (period divides P)
  const blink = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(2 * Math.PI * t));
  op(H.bdot, lerp(1, blink, prog(t, IGN, IGN + 0.4)));
  if (srvDot) op(srvDot, 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(Math.PI * t)));
}

function cardGlow(id, u) {
  switch (id) {
    case 'apps': return env(u, 0.0, 0.28);
    case 'obs': return env(u, 0.60, 1.25);
    case 'collector': return env(u, 1.72, 2.45);
    case 'repo': return env(u, 2.78, 3.50);
    case 'mcp': return Math.max(env(u, 3.90, 4.40), 0.75 * env(u, 6.30, 6.52, 0.12, 0.45));
    case 'monitor': return env(u, 4.26, 5.60);
  }
  return 0;
}
const SHEEN = { apps: 0.0, obs: 0.60, collector: 1.72, repo: 2.78, mcp: 3.90, monitor: 4.26 };

function renderCards(t, u) {
  for (const id of CARD_IDS) {
    const c = C[id], T0 = CARD_T[id], bd = borders[id];
    const [, , w, h] = LY.cards[id];
    // border draw-on (both halves from the top centre) + sparks at the drawing heads
    const bp = eIO(prog(t, T0.b[0], T0.b[1]));
    for (const [k, path, g] of [[0, bd.b1, bd.gR], [1, bd.b2, bd.gL]]) {
      vis(path, bp > 0.001);
      att(path, 'stroke-dashoffset', String(R3(1 - bp)));
      const s = bd.sp[k];
      const on = bp > 0 && bp < 1;
      const a = on ? Math.sin(Math.PI * bp) : 0;
      if (on) { const q = g.at(g.len * bp); att(s.c, 'cx', R2(q.x)); att(s.c, 'cy', R2(q.y)); att(s.h, 'cx', R2(q.x)); att(s.h, 'cy', R2(q.y)); }
      op(s.c, a); op(s.h, a * 0.28);
    }
    op(c.fill, eIO(prog(t, T0.f[0], T0.f[1])));
    // live: own-colour arrival glow, blue ack ring, lift
    const g = cardGlow(id, u);
    const a = ACK[id] != null ? env(u, ACK[id], ACK[id] + 0.7, 0.15, 0.55) : 0;
    op(c.glow, g); op(c.ack, a);
    const lift = Math.max(g, a * 0.7);
    tf(c.el, lift > 0.001 ? `translateY(${R2(-2 * lift)}px)` : 'none');
    // light sweep across the card on arrival
    const sp = prog(u, SHEEN[id], SHEEN[id] + 0.8);
    if (sp > 0 && sp < 1) {
      op(c.band, Math.min(1, 3 * Math.sin(Math.PI * sp)));
      tf(c.band, `translateX(${R2(lerp(-130 - 0.3 * h, w + 0.3 * h, eSine(sp)))}px) skewX(${SKEW}deg)`);
    } else op(c.band, 0);
  }

  // --- intro content
  introPop(Q('#c-apps .iw-apps'), t, 0.80, 0.30);
  introUp(Q('#c-apps .txt'), t, 0.90, 0.30);
  introUp(Q('#c-obs .t-obs'), t, 1.48, 0.32);
  obsTiles.forEach((tile, i) => { introPop($('.iw', tile), t, 1.60 + 0.15 * i, 0.32); introUp($('.lbl', tile), t, 1.66 + 0.15 * i, 0.3, 8); });
  QA('#c-obs .vdiv').forEach((v, i) => introFade(v, t, 1.72 + 0.15 * i));
  introPop(Q('#c-collector .iw-col'), t, 2.60, 0.32, 0.75);
  introUp(Q('#c-collector .txt'), t, 2.70, 0.30);
  introUp(Q('#c-repo .t-repo'), t, 3.38, 0.32);
  repoTiles.forEach((tile, i) => { introPop($('.iw', tile), t, 3.45 + 0.15 * i, 0.32); introUp($('.lbl', tile), t, 3.50 + 0.15 * i, 0.3, 8); });
  introFade(Q('#c-repo .vdiv'), t, 3.55);
  introUp(Q('#c-monitor .mhead'), t, 4.42, 0.35);
  QA('#c-monitor .dotdiv').forEach((d, i) => {
    const p = eIO(prog(t, 4.50 + 0.17 * i, 4.85 + 0.17 * i));
    op(d, p > 0 ? 0.85 : 0); tf(d, p >= 1 ? 'none' : `scaleX(${R3(p)})`); css(d, 'transform-origin', '0 50%');
  });
  monItems.forEach((mi, i) => { introPop($('.iw', mi), t, 4.55 + (0.35 / 3) * i, 0.32); introUp($('.lbl', mi), t, 4.60 + (0.35 / 3) * i, 0.3, 8); });
  QA('#c-monitor .vdiv').forEach((v, i) => introFade(v, t, 4.62 + 0.17 * i));
  introUp(Q('#c-mcp .mhead'), t, 4.42, 0.35);
  caps.forEach((cap, i) => introSlide(cap, t, 4.60 + 0.15 * i, 0.38, 24));
}

function renderWires(t, u, ft, ign) {
  const dataOff = -((ft * 66) % 22);
  const railOff = -((ft * 42) % 14);
  for (const id in W) {
    const w = W[id], def = w.def;
    const [a, b] = def.draw;
    const p = eIO(prog(t, a, b));
    const len = w.trimmed.len;
    if (def.kind === 'data') {
      // reveal: track + solid draw copy; flow dashes fade in at ignition while the solid copy fades out
      const rv = `${R2(len * p)} ${R2(len + 20)}`;
      att(w.track, 'stroke-dasharray', rv); att(w.draw, 'stroke-dasharray', rv);
      vis(w.track, p > 0); vis(w.draw, p > 0);
      op(w.draw, 1 - ign);
      op(w.flow, ign);
      att(w.flow, 'stroke-dashoffset', String(R2(dataOff)));
      // glowing drawing head
      const on = p > 0 && p < 1;
      if (on) { const q = w.full.at(w.full.len * p); for (const e of [w.head, w.headH]) { att(e, 'cx', R2(q.x)); att(e, 'cy', R2(q.y)); } }
      const ho = on ? Math.min(1, Math.sin(Math.PI * p) * 1.6) : 0;
      op(w.head, ho); op(w.headH, ho * 0.3);
    } else {
      const fl = w.full.len;
      att(w.mask, 'stroke-dasharray', `${R2(fl * p)} ${R2(fl + 40)}`);
      vis(w.rail, p > 0);
      if (def.kind === 'rail') {
        const off = w.phase != null ? railOff + w.phase : railOff;
        att(w.rail, 'stroke-dashoffset', String(R2(((off % 14) + 14) % 14 - 14)));
      }
    }
    // arrowheads pop when the reveal reaches their end
    for (const ar of w.arrows) {
      const t0 = ar.end ? b - 0.04 : a;
      const q = prog(t, t0, t0 + 0.24);
      op(ar.el, eOut(clamp01(q * 2)));
      att(ar.el, 'transform', q >= 1 ? '' : sAbout(ar.tip[0], ar.tip[1], 0.3 + 0.7 * eBack(q)));
    }
  }
  for (const ch of chev) {
    const q = prog(t, ch.t0, ch.t0 + 0.26);
    const push = bump(u, ch.tp - 0.12, 0.4);
    op(ch.el, eOut(clamp01(q * 2)));
    // local frame: the chevron points to -y, so the push nudges it along its direction as the pulses pass
    att(ch.el, 'transform', q >= 1 ? (push > 0 ? `translate(0 ${R2(-4 * push)})` : '') : `scale(${R3(0.3 + 0.7 * eBack(q))})`);
  }
  // junction dot: pops with the branch, flashes when the stream splits
  const jq = prog(t, 3.98, 4.24);
  op(jdot, eOut(clamp01(jq * 2)));
  const [jx, jy] = LY.junction;
  att(jdot, 'transform', sAbout(jx, jy, (jq < 1 ? 0.3 + 0.7 * eBack(jq) : 1) * (1 + 0.45 * bump(u, 3.52, 0.34))));
  const jf = prog(u, 3.54, 4.10);
  if (jf > 0 && jf < 1) { op(jflash, 0.8 * (1 - jf)); att(jflash, 'r', R2(5 + 26 * eOut(jf))); att(jflash, 'stroke-width', R2(3 * (1 - jf) + 0.5)); } else op(jflash, 0);
  // MCP emits the actions
  const ef = prog(u, 6.36, 6.95);
  for (const r of emitRings) {
    if (ef > 0 && ef < 1) { op(r, 0.75 * (1 - ef)); att(r, 'r', R2(5 + 28 * eOut(ef))); att(r, 'stroke-width', R2(3 * (1 - ef) + 0.5)); } else op(r, 0);
  }
}

function renderPackets(u) {
  for (const k of PK) {
    const { def, g } = k;
    const endT = def.s + def.d;
    const on = u >= def.s && u <= endT + 0.22;
    if (!on) { op(k.grp, 0); for (const tr of k.trails) vis(tr.el, false); } else {
      const sAt = k.sAt;
      const s = sAt(u);
      const q = g.at(s);
      op(k.grp, clamp01((u - def.s) / 0.05));
      for (const e of [k.halo, k.core, k.ring]) if (e) { att(e, 'cx', R2(q.x)); att(e, 'cy', R2(q.y)); }
      if (k.ring) att(k.ring, 'r', R2(8 + 2.5 * Math.sin(Math.PI * prog(u, def.s, endT))));
      for (const tr of k.trails) {
        const s0 = sAt(u - tr.dt);
        const seg = s - s0;
        if (seg < 0.6) { vis(tr.el, false); continue; }
        vis(tr.el, true);
        att(tr.el, 'stroke-dasharray', `${R2(seg)} ${R2(g.len + 60)}`);
        att(tr.el, 'stroke-dashoffset', String(R2(-s0)));
      }
    }
    if (k.rip) {
      const rp = prog(u, endT - 0.02, endT + 0.55);
      if (rp > 0 && rp < 1) {
        op(k.rip, (def.small ? 0.5 : 0.8) * (1 - rp));
        att(k.rip, 'r', R2(4 + (def.small ? 12 : 22) * eOut(rp)));
        att(k.rip, 'stroke-width', R2(2.8 * (1 - rp) + 0.4));
      } else op(k.rip, 0);
    }
  }
}

function placeChip(el, k, x, y, o, s = 1) {
  const [w, h] = chipSize[k] || [60, 20];
  op(el, o);
  tf(el, `translate(${R2(x - w / 2)}px, ${R2(y - h / 2)}px) scale(${R3(s)})`);
}
function renderChips(u) {
  const L = LAY === 'l';
  // telemetry chips: logs / métricas / traces pop, one per packet, as each packet leaves Aplicações.
  // 16:9: a single row in the Aplicações card footer (keeps the 90 px wire gap clean); vertical: a row beside the wire.
  const keys = ['c-logs', 'c-met', 'c-tr'], GAP = 8;
  const ws = keys.map(k => (chipSize[k] || [60, 26])[0]);
  let x, y;
  if (L) { const [ax, ay, aw, ah] = LY.cards.apps; x = ax + aw / 2 - (ws[0] + ws[1] + ws[2] + 2 * GAP) / 2; y = ay + ah - 36; }
  else { x = 383; y = 322; }
  keys.forEach((k, i) => {
    const e = 0.15 * i;
    const pin = prog(u, e, e + 0.26), pout = prog(u, 1.10 + 0.06 * i, 1.38 + 0.06 * i);
    const o = eOut(clamp01(pin * 1.6)) * (1 - eIO(pout));
    placeChip(chipEls[k], k, x + ws[i] / 2, y + 5 * (1 - eOut(pin)), o, 0.75 + 0.25 * eBack(pin));
    x += ws[i] + GAP;
  });
  // ack chips on feedback arrival (~1.2 s)
  for (const id of ['apps', 'obs', 'collector', 'repo']) {
    const k = 'a-' + id, a = ACK[id];
    const pin = prog(u, a, a + 0.3), pout = prog(u, a + 1.2, a + 1.5);
    const o = eOut(clamp01(pin * 1.6)) * (1 - eIO(pout));
    const [w] = chipSize[k] || [120, 20];
    let x, y;
    if (L) { const [cx, , cw] = LY.cards[id]; x = cx + cw / 2 + 14 + w / 2; y = (RAIL_Y + ROW1) / 2; }
    else { const tip = LY.fb[id][LY.fb[id].length - 1]; x = 704 + w / 2; y = tip[1] - 24; }
    placeChip(chipEls[k], k, x, y + 6 * (1 - eOut(pin)), o, 0.8 + 0.2 * eBack(pin));
  }
}

function renderMicro(t, u) {
  // apps: tiles pulse in sequence as the telemetry leaves
  rig.appsTiles.forEach((tile, i) => att(tile.e, 'transform', sAbout(tile.c[0], tile.c[1], 1 + 0.16 * bump(u, 0.0 + 0.06 * i, 0.32))));
  // obs tiles: tint + icon bump
  const obsA = [0.62, 0.77, 0.92];
  obsTiles.forEach((tile, i) => {
    op(rig.tints.obs[i], env(u, obsA[i], obsA[i] + 0.35, 0.15, 0.5));
    const s = 1 + 0.12 * bump(u, obsA[i], 0.42);
    tf(rig.obsSvg[i], s > 1.0005 ? `scale(${R3(s)})` : 'none');
  });
  if (rig.otelTube) att(rig.otelTube, 'transform', rAbout(34, 35.5, -7 * bump(u, 0.92, 0.6)));
  // collector: hub pulse per packet, 60° turn on data, turn back on the MCP action (ack)
  if (rig.colRot) {
    // wind 60° as the packets pass, spring back to the reference pose; small twist when the MCP action lands
    const ac = ACK.collector;
    const ang = 60 * eIO(prog(u, 1.90, 2.60)) - 60 * eIO(prog(u, 2.62, 3.40)) + 18 * Math.sin(2 * Math.PI * prog(u, ac, ac + 0.6)) * (1 - prog(u, ac, ac + 0.6));
    att(rig.colRot, 'transform', rAbout(32, 32, ang));
    const hub = 1 + 0.2 * Math.max(bump(u, 1.68, 0.26), bump(u, 1.78, 0.26), bump(u, 1.88, 0.26), bump(u, ac - 0.02, 0.3));
    att(rig.colHub, 'transform', sAbout(32, 32, hub));
    // intro: spokes draw out from the hub, nodes pop
    const sp = eIO(prog(t, 2.62, 2.92));
    rig.colSpokes.forEach(s => { att(s, 'stroke-dasharray', '1 1'); att(s, 'stroke-dashoffset', String(R3(1 - sp))); });
    rig.colNodes.forEach((n, i) => {
      const q = prog(t, 2.78 + 0.03 * i, 3.06 + 0.03 * i);
      att(n.e, 'transform', q >= 1 ? '' : sAbout(n.c[0], n.c[1], Math.max(0.001, eBack(q))));
    });
  }
  // repo tiles
  const repoA = [2.90, 3.05];
  repoTiles.forEach((tile, i) => {
    op(rig.tints.repo[i], env(u, repoA[i], repoA[i] + 0.4, 0.15, 0.5));
    const s = 1 + 0.12 * bump(u, repoA[i], 0.42);
    tf(rig.repoSvg[i], s > 1.0005 ? `scale(${R3(s)})` : 'none');
  });
  rig.loki.forEach((grp, i) => grp.forEach(e => att(e, 'opacity', R3(0.6 * bump(u, 2.90 + 0.08 * i, 0.36)))));
  rig.dt1.forEach((e, i) => att(e, 'opacity', R3(0.55 * bump(u, 3.05 + 0.07 * i, 0.34))));
  rig.dt2.forEach((e, i) => att(e, 'opacity', R3(0.55 * bump(u, 4.36 + 0.07 * i, 0.34))));
  // monitor: grafana swirl (10 s turn) + bump on alert, needle swing, badges, alert chip
  if (rig.grafana) {
    const [gx, gy] = rig.grafanaC;
    const rot = (36 * t) % 360;
    att(rig.grafana, 'transform', `${rAbout(gx, gy, rot)}`);
  }
  const monA = [4.28, 4.38, 4.60, 4.75];
  rig.monSvg.forEach((ic, i) => {
    const s = 1 + (i === 0 ? 0.16 : 0.1) * bump(u, monA[i], 0.42) + (i === 0 ? 0.1 * bump(u, ACK.apps + 0.06, 0.4) : 0);
    tf(ic, s > 1.0005 ? `scale(${R3(s)})` : 'none');
  });
  if (rig.needle) {
    const x = prog(u, 4.26, 5.16);
    const ang = x > 0 && x < 1 ? -42 * Math.sin(2 * Math.PI * x * 1.5) * (1 - x) : 0;
    att(rig.needle, 'transform', rAbout(23, 38, ang));
  }
  if (rig.mdTrend) {
    const x = prog(u, 4.28, 4.81);
    att(rig.mdTrend, 'stroke-dasharray', '1 1');
    att(rig.mdTrend, 'stroke-dashoffset', String(R3(x > 0 && x < 1 ? 1 - eIO(x) : 0)));
  }
  // the alert (and the WhatsApp/Teams badges) hold until the MCP OPS actions have landed, then clear
  const ra = ACK.apps + 0.08; // resolved: just after the last MCP OPS action lands
  const monOut = 1 - eIO(prog(u, ra, ra + 0.3));
  if (alertChip) {
    const q = prog(u, 4.32, 4.64);
    op(alertChip, eOut(clamp01(q * 1.6)) * monOut);
    const k = (0.8 + 0.2 * eBack(q)) * (1 - 0.06 * eIO(prog(u, ra, ra + 0.3)));
    tf(alertChip, q >= 1 && monOut >= 1 ? 'none' : `translateY(${R2(6 * (1 - eOut(q)))}px) scale(${R3(k)})`);
    css(alertChip, 'transform-origin', '100% 50%');
  }
  nbadges.forEach((b, i) => {
    const a = i === 0 ? 4.60 : 4.75;
    const q = prog(u, a, a + 0.32);
    op(b, eOut(clamp01(q * 2)) * monOut);
    tf(b, `scale(${R3(q > 0 ? 0.2 + 0.8 * eBack(q) : 0.2)})`);
  });
  // MCP brain: nodes light in sequence along the traces
  rig.brainNodes.forEach((n, i) => att(n, 'fill-opacity', R3(env(u, 3.95 + 0.08 * i, 4.15 + 0.08 * i, 0.1, 0.45) * 0.95)));
  rig.brainTraces.forEach((tr, i) => att(tr, 'stroke-width', R2(3 + 1.2 * bump(u, 3.93 + 0.1 * i, 0.3))));
}

function renderCaps(t, u) {
  rig.caps.forEach((r, i) => {
    const a = 4.2 + 0.8 * i, b = a + 0.8;
    const active = env(u, a, b - 0.08, 0.18, 0.35);
    op(r.tint, active);
    op(r.bar, active);
    tf(r.bar, `scaleY(${R3(0.3 + 0.7 * eOut(prog(u, a, a + 0.3)))})`);
    const s = 1 + 0.1 * bump(u, a, 0.5);
    tf(r.iw, s > 1.0005 ? `scale(${R3(s)})` : 'none');
    // status line. The two texts never share the box: rest fades out (a → a+0.1) before typing starts;
    // settle = live text fades out 9.2 → 9.5, THEN the rest text fades in 9.5 → 9.8.
    const chars = Array.from(CAP_TXT[i]);
    const t0 = a + 0.1;
    const typeD = Math.min(0.62, chars.length * 0.016);
    const tp = prog(u, t0, t0 + typeD);
    const n = u < t0 ? 0 : Math.round(chars.length * tp);
    let restO, actO;
    if (u < a) { restO = 1; actO = 0; }
    else if (u < SETTLE[0]) { restO = 1 - eOut(prog(u, a, t0)); actO = u < t0 ? 0 : 1; }
    else { actO = 1 - eIO(prog(u, SETTLE[0], SETTLE[1])); restO = eIO(prog(u, SETTLE[1], SETTLE[2])); }
    op(r.rest, restO);
    op(r.act, actO);
    const caretOn = actO > 0 && u < b + 0.15 && (tp < 1 || Math.floor((u - t0) * 4) % 2 === 0);
    const key = n + (caretOn ? 'c' : '');
    if (r.n !== key) {
      r.n = key;
      // the untyped rest is laid out but hidden, so line breaks are those of the full text from the first char
      r.act.innerHTML = capHTML(chars, n, caretOn);
    }
    // icon specifics
    if (r.eyes) r.eyes.forEach(e => att(e.e, 'transform', sxyAbout(e.c[0], e.c[1], 1, 1 - 0.85 * Math.max(bump(u, a + 0.18, 0.16), bump(u, a + 0.52, 0.16)))));
    if (r.antenna) att(r.antenna, 'transform', rAbout(32, 17, 14 * Math.sin(2 * Math.PI * prog(u, a, a + 0.6)) * (1 - prog(u, a, a + 0.6))));
    if (r.trend) {
      const x = prog(u, a, a + 0.6);
      const p = x <= 0 || x >= 1 ? 1 : x < 0.18 ? 1 - eIO(x / 0.18) : eIO((x - 0.18) / 0.82);
      r.trend.forEach(pth => { att(pth, 'stroke-dasharray', '1 1'); att(pth, 'stroke-dashoffset', String(R3(1 - p))); });
    }
    if (r.lens) att(r.lens, 'transform', sAbout(28.5, 28, 1 + 0.06 * bump(u, a + 0.1, 0.5)));
    if (r.gear) att(r.gear, 'transform', rAbout(32, 32, 90 * eIO(prog(u, a + 0.05, a + 0.75))));
    if (r.play) att(r.play, 'transform', sAbout(33, 32, 1 + 0.15 * bump(u, a + 0.2, 0.4)));
    if (r.rays) r.rays.forEach((ray, j) => {
      const win = u > a && u < b;
      const f = win ? 0.5 + 0.5 * Math.sin(u * (38 + 9 * j) + j * 1.9) : 1;
      att(ray, 'opacity', R3(win ? 0.25 + 0.75 * (f > 0.35 ? 1 : f) : 1));
    });
    if (r.bulb) att(r.bulb, 'fill-opacity', R3(0.18 * env(u, a, b - 0.1, 0.2, 0.4)));
  });
}

/* ------------------------------------------------------------------ layout / theme / clock */
let userLayout = false;
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / LY.W, vh / LY.H);
  const x = (vw - LY.W * s) / 2, y = (vh - LY.H * s) / 2;
  css(stage, 'width', LY.W + 'px'); css(stage, 'height', LY.H + 'px');
  css(stage, 'transform', `translate(${R2(x)}px, ${R2(y)}px) scale(${s})`);
}
function setLayout(l) {
  l = l === 'p' ? 'p' : 'l';
  LAY = l; LY = LAYOUTS[l];
  stage.dataset.layout = l;
  buildCardsBorders();
  buildWires();
  measureChips();
  for (const r of rig.caps || []) r.n = -1;
  fit();
  syncControls();
  render(T);
}
function setTheme(th) {
  th = th === 'dark' ? 'dark' : 'light';
  html.dataset.look = th;
  syncControls();
  render(T);
}

let playing = true, clockBase = 0, clockT0 = 0, raf = 0;
function tick(now) {
  if (!playing) return;
  T = clockT0 + (now - clockBase) / 1000;
  render(T);
  raf = requestAnimationFrame(tick);
}
function play() {
  if (playing) return;
  playing = true; clockT0 = T; clockBase = performance.now();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  syncControls();
}
function pause() { playing = false; cancelAnimationFrame(raf); syncControls(); }
let invN = 0;
function seek(t) {
  T = Math.max(0, +t || 0); clockT0 = T; clockBase = performance.now(); render(T);
  // Chrome re-rasters only the rects that changed; blurred shadows re-rastered in a partial rect can differ by a few
  // levels from a full raster. Flipping the stage background between two pixel-identical values invalidates the
  // whole stage so every seek(t) rasters like a fresh page: no forced layout, no synchronous cost.
  stage.dataset.inv = (++invN) & 1;
}

const FLOW = window.FLOW = {
  get W() { return LY ? LY.W : LAYOUTS.l.W; },   // read-only: always the current layout's stage size
  get H() { return LY ? LY.H : LAYOUTS.l.H; },
  T_INTRO, P, ready: false,
  time: () => T,
  seek: t => { seek(t); return T; },
  play, pause,
  toggle: () => (playing ? pause() : play()),
  replay: () => { seek(0); play(); },
  setLayout: l => { userLayout = true; setLayout(l); },
  layout: () => LAY,
  setTheme, theme: () => html.dataset.look,
};

/* ------------------------------------------------------------------ controls */
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const ctr = document.getElementById('controls');
function syncControls() {
  if (!ctr) return;
  ctr.classList.toggle('paused', !playing);
  const lt = $('.lbl-toggle', ctr); if (lt) lt.textContent = playing ? 'Pausar' : 'Continuar';
  $$('.seg b', ctr).forEach(b => b.classList.toggle('on', b.dataset.v === LAY || b.dataset.v === html.dataset.look));
}
function fullscreen() {
  try {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* not allowed here */ }
}
const ACTIONS = {
  replay: () => FLOW.replay(),
  toggle: () => FLOW.toggle(),
  layout: () => FLOW.setLayout(LAY === 'l' ? 'p' : 'l'),
  theme: () => setTheme(html.dataset.look === 'dark' ? 'light' : 'dark'),
  fullscreen,
};
if (ctr) {
  ctr.addEventListener('click', e => { const b = e.target.closest('button'); if (b && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act](); });
  let idleT = 0;
  const wake = () => { ctr.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (playing || !reduceMotion()) ctr.classList.add('idle'); }, 2500); };
  window.addEventListener('mousemove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  wake();
}
const isSpace = e => e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space';
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  // Space / K always pause-resume, whatever control has focus (the button's own Space activation is suppressed)
  if (isSpace(e) || k === 'k') { e.preventDefault(); if (!e.repeat) FLOW.toggle(); }
  else if (k === 'r') FLOW.replay();
  else if (k === 'l' || k === 'v') ACTIONS.layout();
  else if (k === 't' || k === 'd') ACTIONS.theme();
  else if (k === 'f') fullscreen();
  else if (k === 'arrowright' || k === 'arrowleft') { e.preventDefault(); FLOW.seek(T + (k === 'arrowright' ? 1 : -1)); }
}, true);
window.addEventListener('keyup', e => { if (isSpace(e)) e.preventDefault(); }, true);
window.addEventListener('resize', () => {
  if (!LY) return;
  if (!userLayout) { const want = window.innerHeight > window.innerWidth ? 'p' : 'l'; if (want !== LAY) { setLayout(want); return; } }
  fit();
});

/* ------------------------------------------------------------------ boot + hash flags (#capture,dark,vertical,loop,paused) */
const readFlags = () => new Set(decodeURIComponent(location.hash.replace(/^#/, '')).toLowerCase().split(/[-,&+ ]+/).filter(Boolean));
let flags = readFlags();
if (flags.has('capture')) html.classList.add('capture');
html.dataset.look = flags.has('dark') ? 'dark' : (html.dataset.look || 'light');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let initLayout = 'l';
if (flags.has('vertical')) { initLayout = 'p'; userLayout = true; }
else if (window.innerHeight > window.innerWidth) initLayout = 'p';

// the hash is also honoured when it changes at runtime
window.addEventListener('hashchange', () => {
  if (!FLOW.ready) return;
  const prev = flags; flags = readFlags();
  html.classList.toggle('capture', flags.has('capture'));
  if (flags.has('dark') !== prev.has('dark')) setTheme(flags.has('dark') ? 'dark' : 'light');
  if (flags.has('vertical') && LAY !== 'p') FLOW.setLayout('p');
  else if (!flags.has('vertical') && prev.has('vertical')) FLOW.setLayout('l');
  if (flags.has('loop') && !prev.has('loop')) seek(T_INTRO);
  if (flags.has('paused')) pause(); else if (prev.has('paused')) play();
  fit();
});

playing = false;
const boot = () => {
  setupRigs();
  setLayout(initLayout);
  userLayout = flags.has('vertical');
  const start = flags.has('loop') || reduce ? T_INTRO : 0;
  seek(start);
  FLOW.ready = true;
  if (!(flags.has('paused') || reduce)) play();
  else syncControls();
};
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot, boot);
})();
