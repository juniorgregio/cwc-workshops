(() => {
  'use strict';

  // ================================================================ constants
  const T_INTRO = 7.2;   // intro build length (s)
  const P = 10;          // live loop period (s); every continuous motion divides it
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ================================================================ math
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    inOutCubic: p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outCubic: p => 1 - Math.pow(1 - p, 3),
    outQuart: p => 1 - Math.pow(1 - p, 4),
    inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  };
  // 0 → 1 → 0 envelope: rise, hold, decay
  const pulse = (u, t0, rise = .18, hold = 0, decay = .6) => {
    if (u < t0) return 0;
    if (u < t0 + rise) return E.outCubic((u - t0) / rise);
    if (u < t0 + rise + hold) return 1;
    return 1 - E.inOutSine(clamp((u - t0 - rise - hold) / decay));
  };
  // short bump (for scale bounces)
  const bump = (u, t0, d = .45) => { const p = prog(u, t0, t0 + d); return p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p) * (1 - p * .35); };
  const mod = (a, n) => ((a % n) + n) % n;
  const r2 = x => Math.round(x * 100) / 100;

  // ================================================================ DOM helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const svgEl = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  const stage = $('#stage');
  const wiresSvg = $('#wires');
  const fxSvg = $('#fx');
  const controls = $('#controls');

  // ================================================================ layouts
  // Cards: [x, y, w, h] in stage px. Wires: orthogonal polylines (rounded at render).
  // Routes: invisible paths packets travel on (extend ~14px under the cards so packets slide in/out).
  const LAYOUTS = {
    l: {
      W: 1920, H: 1080, r: 16,
      cards: {
        apps: [80, 236, 240, 250], obs: [410, 236, 490, 250], collector: [990, 236, 260, 250], repo: [1340, 236, 420, 250],
        monitor: [80, 596, 720, 300], mcp: [900, 596, 860, 300],
      },
      outcomes: [80, 930, 1760, 106],
      wires: {
        a2o: { k: 'data', c: 'blue', pts: [[320, 361], [410, 361]], end: 1 },
        o2c: { k: 'data', c: 'green', pts: [[900, 361], [990, 361]], end: 1 },
        c2r: { k: 'data', c: 'orange', pts: [[1250, 361], [1340, 361]], end: 1 },
        stem: { k: 'data', c: 'cyan', pts: [[1550, 486], [1550, 541]] },
        r2mcp: { k: 'data', c: 'blue', pts: [[1550, 541], [1550, 596]], end: 1 },
        r2mon: { k: 'data', c: 'pink', pts: [[1550, 541], [440, 541], [440, 596]], end: 1 },
        rail: { k: 'fb', pts: [[1760, 746], [1812, 746], [1812, 200], [200, 200], [200, 236]], start: 1, end: 1 },
        fb_obs: { k: 'fb', pts: [[655, 200], [655, 236]], end: 1 },
        fb_col: { k: 'fb', pts: [[1120, 200], [1120, 236]], end: 1 },
        fb_repo: { k: 'fb', pts: [[1550, 200], [1550, 236]], end: 1 },
        link: { k: 'fb', pts: [[800, 746], [900, 746]], start: 1, end: 1 },
      },
      chevrons: [[1812, 610, -90], [1812, 400, -90], [1300, 200, 180], [880, 200, 180]],
      junction: [1550, 541],
      routes: {
        a2o: [[306, 361], [424, 361]],
        o2c: [[886, 361], [1004, 361]],
        c2r: [[1236, 361], [1354, 361]],
        stem: [[1550, 472], [1550, 541]],
        mon: [[1550, 541], [440, 541], [440, 610]],
        mcp: [[1550, 541], [1550, 610]],
        fb_repo: [[1746, 746], [1812, 746], [1812, 200], [1550, 200], [1550, 250]],
        fb_collector: [[1746, 746], [1812, 746], [1812, 200], [1120, 200], [1120, 250]],
        fb_obs: [[1746, 746], [1812, 746], [1812, 200], [655, 200], [655, 250]],
        fb_apps: [[1746, 746], [1812, 746], [1812, 200], [200, 200], [200, 250]],
        link_f: [[786, 746], [914, 746]],
        link_b: [[914, 746], [786, 746]],
      },
      tips: { a2o: [410, 361], o2c: [990, 361], c2r: [1340, 361], mon: [440, 596], mcp: [1550, 596] },
      ack: { apps: [212, 206], obs: [667, 206], collector: [1132, 206], repo: [1562, 206] },
    },
    p: {
      W: 1080, H: 1680, r: 14,
      cards: {
        apps: [48, 170, 642, 130], obs: [48, 344, 642, 240], collector: [48, 628, 642, 112], repo: [48, 784, 642, 160],
        monitor: [48, 1036, 460, 464], mcp: [572, 1036, 460, 464],
      },
      outcomes: [36, 1540, 1008, 110],
      wires: {
        a2o: { k: 'data', c: 'blue', pts: [[369, 300], [369, 344]], end: 1 },
        o2c: { k: 'data', c: 'green', pts: [[369, 584], [369, 628]], end: 1 },
        c2r: { k: 'data', c: 'orange', pts: [[369, 740], [369, 784]], end: 1 },
        stem: { k: 'data', c: 'cyan', pts: [[369, 944], [369, 990]] },
        r2mon: { k: 'data', c: 'pink', pts: [[369, 990], [278, 990], [278, 1036]], end: 1 },
        r2mcp: { k: 'data', c: 'blue', pts: [[369, 990], [802, 990], [802, 1036]], end: 1 },
        rail: { k: 'fb', pts: [[958, 1036], [958, 235], [690, 235]], start: 1, end: 1 },
        fb_obs: { k: 'fb', pts: [[958, 464], [690, 464]], end: 1 },
        fb_col: { k: 'fb', pts: [[958, 684], [690, 684]], end: 1 },
        fb_repo: { k: 'fb', pts: [[880, 1036], [880, 864], [690, 864]], start: 1, end: 1 },
        link: { k: 'fb', pts: [[508, 1268], [572, 1268]], start: 1, end: 1 },
      },
      chevrons: [[958, 350, -90], [958, 575, -90], [958, 880, -90]],
      junction: [369, 990],
      routes: {
        a2o: [[369, 286], [369, 358]],
        o2c: [[369, 570], [369, 642]],
        c2r: [[369, 726], [369, 798]],
        stem: [[369, 930], [369, 990]],
        mon: [[369, 990], [278, 990], [278, 1050]],
        mcp: [[369, 990], [802, 990], [802, 1050]],
        fb_apps: [[958, 1050], [958, 235], [676, 235]],
        fb_obs: [[958, 1050], [958, 464], [676, 464]],
        fb_collector: [[958, 1050], [958, 684], [676, 684]],
        fb_repo: [[880, 1050], [880, 864], [676, 864]],
        link_f: [[494, 1268], [586, 1268]],
        link_b: [[586, 1268], [494, 1268]],
      },
      tips: { a2o: [369, 344], o2c: [369, 628], c2r: [369, 784], mon: [278, 1036], mcp: [802, 1036] },
      ack: { apps: [702, 199], obs: [702, 428], collector: [702, 648], repo: [700, 874] },
    },
  };

  // intro draw windows for wires [t0, t1]
  const DRAW = {
    a2o: [1.05, 1.35], o2c: [2.10, 2.40], c2r: [2.95, 3.25],
    stem: [3.85, 4.00], r2mon: [4.00, 4.40], r2mcp: [4.00, 4.25],
    rail: [5.10, 5.78], fb_repo: [5.42, 5.62], fb_col: [5.52, 5.72], fb_obs: [5.62, 5.82], link: [5.20, 5.50],
  };
  // intro card frame draw windows [t0, t1]
  const CARD_T = {
    apps: [0.50, 1.00], obs: [1.30, 1.80], collector: [2.35, 2.80], repo: [3.20, 3.65],
    monitor: [4.25, 4.75], mcp: [4.25, 4.75],
  };
  const IGNITE = [6.6, 7.2];

  // ================================================================ live-loop script (u in [0, P))
  const SIGNALS = [
    { k: 'logs', color: 'var(--sig-logs)', o: 0 },
    { k: 'metrics', color: 'var(--sig-metrics)', o: .15 },
    { k: 'traces', color: 'var(--sig-traces)', o: .30 },
  ];
  const LEGS = [ // per-signal legs: route, start, duration
    { route: 'a2o', t0: 0.00, d: .60 },
    { route: 'o2c', t0: 1.20, d: .60 },
    { route: 'c2r', t0: 2.30, d: .55 },
  ];
  const CAPS = [ // capability windows
    { id: 'cap1', a: 4.20, b: 5.00 },
    { id: 'cap2', a: 5.00, b: 5.80 },
    { id: 'cap3', a: 5.80, b: 6.60 },
    { id: 'cap4', a: 6.60, b: 7.40 },
  ];
  const FB_START = 6.40, FB_SPEED = 1500; // px/s for feedback action pulses
  const SETTLE = [9.2, 9.8];

  // ================================================================ state
  let layoutKey = 'l', L = LAYOUTS.l, look = 'light';
  let t = 0, playing = true, lastNow = null;
  const flags = parseFlags();
  const W = {};        // built wire records by id
  const routes = {};   // sampled route polylines {pts:[[x,y]..], len}
  const packets = {};  // svg groups
  const ripples = [];
  let junctionDot = null;
  let chevrons = [];

  // ================================================================ element registry
  const cards = {};
  ['apps', 'obs', 'collector', 'repo', 'monitor', 'mcp'].forEach(id => {
    const c = $('#' + id);
    cards[id] = { el: c, bg: $('.bg', c), glow: $('.glow', c), ack: $('.ack', c), frame: $('.frame', c), framePath: $('.frame path', c) };
  });
  const introEls = $$('[data-in]').map(el => ({ el, t0: parseFloat(el.dataset.in), fx: el.dataset.fx || 'up' }));
  const outcomes = $('#outcomes');
  const tiles = { log4j: $('#t-log4j'), bib: $('#t-bib'), otel: $('#t-otel'), loki: $('#t-loki'), dyn: $('#t-dyn') };
  const tileHl = k => $('.hl', tiles[k]);
  const tileIco = k => $('.ico > svg', tiles[k]);
  const part = (root, cls) => $$('.' + cls, root);
  const icons = {
    apps: $('#apps .ico > svg'),
    collector: $('#collector .ico > svg'),
    grafana: $('#cell-grafana .ico > svg'),
    dynM: $('#cell-dyn .ico > svg'),
    wa: $('#cell-wa .ico > svg'),
    teams: $('#cell-teams .ico > svg'),
    brain: $('#mcp .brain > svg'),
    monitorDash: $('#monitor .mhead .ico > svg'),
  };
  const parts = {
    spin: [...part(icons.collector, 'spoke'), ...part(icons.collector, 'node')],
    hub: part(icons.collector, 'hub'),
    swirl: part(icons.grafana, 'swirl'),
    lokiBars: [...part(tileIco('loki'), 'bar'), ...part(tileIco('loki'), 'row')],
    dynFaces: part(tileIco('dyn'), 'face'),
    dynFacesM: part(icons.dynM, 'face'),
    brainNodes: part(icons.brain, 'node'),
    robotEyes: part($('#cap1 .ico > svg'), 'eye'),
    trend: part($('#cap2 .ico > svg'), 'trend'),
    gear: part($('#cap3 .ico > svg'), 'gear'),
    rays: part($('#cap4 .ico > svg'), 'ray'),
    needle: part(icons.monitorDash, 'needle'),
  };
  // rotation pivots (icon user units)
  const pivot = (els, x = 32, y = 32) => els.forEach(e => { e.style.transformBox = 'view-box'; e.style.transformOrigin = `${x}px ${y}px`; });
  pivot(parts.spin); pivot(parts.gear); pivot(parts.swirl, ...swirlCenter());
  parts.robotEyes.forEach(e => { e.style.transformBox = 'fill-box'; e.style.transformOrigin = '50% 50%'; });
  parts.lokiBars.forEach(e => { e.style.transformBox = 'fill-box'; e.style.transformOrigin = '50% 100%'; });
  parts.trend.forEach(e => e.setAttribute('pathLength', '1'));

  function swirlCenter() {
    const s = icons.grafana && $('.swirl', icons.grafana);
    const c = s && s.getAttribute('data-center');
    return c ? c.split(/[ ,]+/).map(Number) : [32, 32];
  }

  const caps = CAPS.map(c => {
    const el = $('#' + c.id), st = $('.st', el);
    return { ...c, el, hl: $('.hl', el), ico: $('.ico > svg', el), st, rest: st.dataset.rest, live: st.dataset.live, lastHtml: null };
  });
  const ocs = [1, 2, 3, 4].map(i => ({ el: $('#oc' + i), hl: $('#oc' + i + ' .hl'), ico: $('#oc' + i + ' .ico > svg') }));
  const alertChip = $('#alert-chip');
  const nbWa = $('#nb-wa'), nbTeams = $('#nb-teams');
  const ackChips = { apps: $('#ack-apps'), obs: $('#ack-obs'), collector: $('#ack-collector'), repo: $('#ack-repo') };
  const liveDot = $('#live-dot');
  const sheen = $('#sheen');

  // ================================================================ geometry
  function roundedPath(pts, r) {
    if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const ax = cx - (cx - px) / l1 * rr, ay = cy - (cy - py) / l1 * rr;
      const bx = cx + (nx - cx) / l2 * rr, by = cy + (ny - cy) / l2 * rr;
      d += `L${r2(ax)} ${r2(ay)}Q${cx} ${cy} ${r2(bx)} ${r2(by)}`;
    }
    const last = pts[pts.length - 1];
    return d + `L${last[0]} ${last[1]}`;
  }
  // shorten a polyline at start/end (so round caps don't poke through arrow tips)
  function trim(pts, a, b) {
    const p = pts.map(q => q.slice());
    const cut = (i, j, d) => {
      const dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], l = Math.hypot(dx, dy) || 1;
      p[i][0] += dx / l * d; p[i][1] += dy / l * d;
    };
    if (a) cut(0, 1, a);
    if (b) cut(p.length - 1, p.length - 2, b);
    return p;
  }
  const angleOf = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
  function roundRectPath(w, h, r) {
    const x0 = 1, y0 = 1, x1 = w - 1, y1 = h - 1;
    return `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
  }
  // sample a rounded route into a dense polyline for fast, deterministic point lookup
  function sampleRoute(pts, r) {
    const p = svgEl('path', { d: roundedPath(pts, r) });
    const g = svgEl('g', { style: 'visibility:hidden' }, wiresSvg);
    g.appendChild(p);
    const len = p.getTotalLength();
    const n = Math.max(24, Math.ceil(len / 6));
    const out = [];
    for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(len * i / n); out.push([q.x, q.y]); }
    g.remove();
    return { pts: out, len };
  }
  function pointAt(rt, f) {
    const n = rt.pts.length - 1, x = clamp(f) * n, i = Math.min(n - 1, Math.floor(x)), k = x - i;
    const a = rt.pts[i], b = rt.pts[i + 1];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  // ================================================================ build (per layout)
  function applyLayout() {
    stage.dataset.layout = layoutKey;
    document.body.dataset.layout = layoutKey;
    stage.style.width = L.W + 'px';
    stage.style.height = L.H + 'px';
    stage.style.setProperty('--r', L.r + 'px');

    for (const id in cards) {
      const [x, y, w, h] = L.cards[id], c = cards[id];
      Object.assign(c.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      c.frame.setAttribute('width', w); c.frame.setAttribute('height', h);
      c.frame.setAttribute('viewBox', `0 0 ${w} ${h}`);
      c.framePath.setAttribute('d', roundRectPath(w, h, L.r - 1));
    }
    const [ox, oy, ow, oh] = L.outcomes;
    Object.assign(outcomes.style, { left: ox + 'px', top: oy + 'px', width: ow + 'px', height: oh + 'px' });
    for (const k in ackChips) {
      const [x, y] = L.ack[k];
      Object.assign(ackChips[k].style, { left: x + 'px', top: y + 'px' });
    }
    buildWires();
    fit();
  }

  function buildWires() {
    for (const s of [wiresSvg, fxSvg]) {
      s.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
      s.setAttribute('width', L.W); s.setAttribute('height', L.H);
      s.textContent = '';
    }
    const defs = svgEl('defs', {}, wiresSvg);
    const lay = svgEl('g', {}, wiresSvg);
    for (const id in W) delete W[id];

    for (const [id, w] of Object.entries(L.wires)) {
      const d = roundedPath(trim(w.pts, w.start ? 9 : 0, w.end ? 9 : 0), 14);
      const dFull = roundedPath(w.pts, 14);
      const color = w.k === 'data' ? `var(--${w.c})` : 'var(--rail)';
      const m = svgEl('mask', { id: 'm-' + id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: L.W, height: L.H }, defs);
      const mp = svgEl('path', { d: dFull, stroke: '#fff', 'stroke-width': 14, fill: 'none' }, m);
      const len = mp.getTotalLength();
      mp.setAttribute('stroke-dasharray', `${len} ${len + 20}`);
      const g = svgEl('g', { mask: `url(#m-${id})` }, lay);
      const rec = { id, k: w.k, len, mask: mp, g, heads: [] };
      if (w.k === 'data') {
        rec.base = svgEl('path', { d, class: 'base', style: `stroke:${color}` }, g);
        rec.flow = svgEl('path', { d, class: 'flow', style: `stroke:${color}` }, g);
      } else {
        rec.rail = svgEl('path', { d, class: 'rail', style: `stroke:${color}` }, g);
      }
      const addHead = (tip, from) => {
        const hg = svgEl('g', { transform: `translate(${tip[0]} ${tip[1]}) rotate(${r2(angleOf(from, tip))})` }, lay);
        const hp = svgEl('path', { d: w.k === 'data' ? 'M1 0L-11 -6.5L-8 0L-11 6.5Z' : 'M1 0L-10 -5.5L-7.5 0L-10 5.5Z', class: 'head', style: `fill:${color}` }, hg);
        rec.heads.push(hp);
      };
      if (w.end) addHead(w.pts[w.pts.length - 1], w.pts[w.pts.length - 2]);
      if (w.start) addHead(w.pts[0], w.pts[1]);
      W[id] = rec;
    }
    // chevrons along the feedback rail
    chevrons = L.chevrons.map(([x, y, a]) => {
      const cg = svgEl('g', { transform: `translate(${x} ${y}) rotate(${a})` }, lay);
      return svgEl('path', { d: 'M-4 -6L3 0L-4 6', style: 'stroke:var(--rail)', 'stroke-width': 2.4, fill: 'none', class: 'chev-line' }, cg);
    });
    // junction dot
    junctionDot = svgEl('circle', { cx: L.junction[0], cy: L.junction[1], r: 5.5, style: 'fill:var(--cyan)' }, lay);

    // packet routes + packets
    for (const k in routes) delete routes[k];
    for (const [k, pts] of Object.entries(L.routes)) routes[k] = sampleRoute(pts, 14);
    const pk = svgEl('g', {}, wiresSvg);
    for (const k in packets) delete packets[k];
    const mk = (id, color, r = 7.5, trail = 3) => {
      const tr = [];
      for (let i = trail; i >= 1; i--) tr.push(svgEl('circle', { r: r2(r * (1 - i * .17)), style: `fill:${color}`, opacity: 0 }, pk));
      const g = svgEl('g', { opacity: 0 }, pk);
      svgEl('circle', { r: r * 2.1, style: `fill:${color}`, opacity: .2 }, g);
      svgEl('circle', { r, style: `fill:${color}` }, g);
      svgEl('circle', { r: r * .38, fill: '#fff', opacity: .9 }, g);
      g._trail = tr.reverse(); // nearest first
      packets[id] = g;
    };
    SIGNALS.forEach(s => LEGS.forEach(l => mk(`${s.k}-${l.route}`, s.color)));
    mk('stem', 'var(--cyan)', 8);
    mk('mon', 'var(--pink)', 8);
    mk('mcp', 'var(--blue)', 8);
    mk('link_f', 'var(--pink)', 5.5, 2);
    mk('link_b', 'var(--blue)', 5.5, 2);
    ['repo', 'collector', 'obs', 'apps'].forEach(k => mk('fb_' + k, 'var(--blue)', 6, 4));

    // ripples (above cards) at arrival tips
    ripples.length = 0;
    const rip = (x, y, color, times) => {
      const c = svgEl('circle', { cx: x, cy: y, r: 4, style: `stroke:${color};fill:none`, 'stroke-width': 2, opacity: 0 }, fxSvg);
      ripples.push({ c, times });
    };
    const T = L.tips;
    rip(T.a2o[0], T.a2o[1], 'var(--blue)', [.60, .75, .90]);
    rip(T.o2c[0], T.o2c[1], 'var(--green)', [1.80, 1.95, 2.10]);
    rip(T.c2r[0], T.c2r[1], 'var(--orange)', [2.85, 3.00, 3.15]);
    rip(T.mon[0], T.mon[1], 'var(--pink)', [4.20]);
    rip(T.mcp[0], T.mcp[1], 'var(--blue)', [3.85]);
  }

  // ================================================================ fit stage to viewport
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / L.W, vh / L.H);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  // ================================================================ render(t) — pure function of t
  function render(time) {
    // ---------- intro elements ----------
    for (const it of introEls) {
      const p = prog(time, it.t0, it.t0 + (it.fx === 'rise' ? .45 : .5));
      const s = it.el.style;
      switch (it.fx) {
        case 'pop': {
          const e = E.outBack(p);
          s.opacity = r2(clamp(p * 2.2));
          s.transform = p >= 1 ? '' : `scale(${r2(lerp(.55, 1, e) * 1000) / 1000})`;
          break;
        }
        case 'slide': {
          const e = E.outCubic(p);
          s.opacity = r2(e);
          s.transform = p >= 1 ? '' : `translateX(${r2((1 - e) * 26)}px)`;
          break;
        }
        case 'fade': s.opacity = r2(E.inOutSine(p)); break;
        case 'rise': {
          const e = E.outCubic(p);
          s.opacity = r2(e);
          s.transform = p >= 1 ? '' : `translateY(${r2((1 - e) * 28)}px)`;
          break;
        }
        default: { // up
          const e = E.outCubic(p);
          s.opacity = r2(e);
          s.transform = p >= 1 ? '' : `translateY(${r2((1 - e) * 16)}px)`;
        }
      }
    }

    // ---------- card frames draw + fill ----------
    for (const id in cards) {
      const [a, b] = CARD_T[id], c = cards[id];
      const p = E.inOutCubic(prog(time, a, b));
      const fp = c.framePath.style;
      if (p >= 1) { fp.strokeDasharray = 'none'; fp.strokeDashoffset = '0'; }
      else { fp.strokeDasharray = '1 1'; fp.strokeDashoffset = String(r2((1 - p) * 1000) / 1000); }
      c.frame.style.opacity = time < a ? '0' : '1';
      const f = E.outCubic(prog(time, a + .2, b + .15));
      c.bg.style.opacity = r2(f);
      c.bg.style.transform = f >= 1 ? '' : `scale(${r2((.985 + .015 * f) * 1000) / 1000})`;
    }

    // ---------- wires draw ----------
    for (const id in W) {
      const w = W[id], [a, b] = DRAW[id] || [0, 0];
      const p = E.inOutCubic(prog(time, a, b));
      w.mask.setAttribute('stroke-dashoffset', r2(w.len * (1 - p)));
      const hp = prog(time, b - .06, b + .24);
      const hs = hp <= 0 ? 0 : hp >= 1 ? 1 : E.outBack(hp);
      w.heads.forEach(h => { h.setAttribute('transform', `scale(${r2(hs)})`); });
    }
    const railP = prog(time, DRAW.rail[0] + .25, DRAW.rail[1] + .1);
    chevrons.forEach((c, i) => {
      const cp = prog(time, DRAW.rail[0] + .3 + i * .08, DRAW.rail[0] + .6 + i * .08);
      c.setAttribute('opacity', r2(cp * (railP > 0 ? 1 : 0)));
    });
    const jp = E.outBack(prog(time, DRAW.stem[1] - .05, DRAW.stem[1] + .25));

    // ---------- ignition: solid → flowing ----------
    const ig = E.inOutSine(prog(time, IGNITE[0], IGNITE[1]));
    const dataOff = -mod(time * 66, 22);   // 66 px/s, dash period 22 → seamless in P
    const railOff = -mod(Math.max(0, time - IGNITE[0]) * 42, 14);
    for (const id in W) {
      const w = W[id];
      if (w.k === 'data') {
        w.base.style.opacity = r2(lerp(1, .26, ig));
        w.flow.style.opacity = r2(ig);
        w.flow.style.strokeDashoffset = r2(dataOff);
      } else {
        w.rail.style.strokeDashoffset = r2(railOff);
      }
    }
    // sheen sweep
    const sp = prog(time, IGNITE[0] - .1, IGNITE[1] - .05);
    sheen.style.opacity = sp <= 0 || sp >= 1 ? '0' : r2(Math.sin(Math.PI * sp));
    sheen.style.transform = `translateX(${r2(lerp(-L.W * .4, L.W * 1.1, E.inOutSine(sp)))}px) skewX(-12deg)`;

    // ---------- live loop ----------
    let u = -1;
    if (time >= T_INTRO) { u = mod(time - T_INTRO, P); if (P - u < 1e-6) u = 0; }
    renderLive(u, time, jp);
  }

  const TRAIL_OP = [.42, .24, .12, .06];
  function setPacket(id, route, f, visible = true) {
    const g = packets[id];
    if (!g) return;
    const hide = !visible || f <= 0 || f >= 1;
    const op = hide ? 0 : r2(Math.min(1, f / .06, (1 - f) / .06));
    g.setAttribute('opacity', op);
    const rt = routes[route];
    if (!hide) {
      const [x, y] = pointAt(rt, f);
      g.setAttribute('transform', `translate(${r2(x)} ${r2(y)})`);
    }
    g._trail.forEach((c, i) => {
      const ft = f - (i + 1) * 11 / rt.len;
      if (hide || ft <= 0) { c.setAttribute('opacity', 0); return; }
      const [x, y] = pointAt(rt, ft);
      c.setAttribute('cx', r2(x)); c.setAttribute('cy', r2(y));
      c.setAttribute('opacity', r2(TRAIL_OP[i] * op));
    });
  }

  function setGlow(id, v) { cards[id].glow.style.opacity = r2(clamp(v)); }
  function setAck(id, v) { cards[id].ack.style.opacity = r2(clamp(v)); }
  const scaleT = v => (Math.abs(v) < .001 ? '' : `scale(${r2((1 + v) * 1000) / 1000})`);

  function renderLive(u, time, jp) {
    const on = u >= 0;
    const U = on ? u : -1; // live time or -1 (everything at rest)

    // badge dot blink (1 s period)
    liveDot.style.opacity = on ? r2(.35 + .65 * (.5 + .5 * Math.cos(2 * Math.PI * u))) : '1';

    // ---- packets along the pipeline
    SIGNALS.forEach(s => LEGS.forEach(l => {
      const f = on ? E.inOutSine(prog(U, l.t0 + s.o, l.t0 + s.o + l.d)) : 0;
      const raw = on ? prog(U, l.t0 + s.o, l.t0 + s.o + l.d) : 0;
      setPacket(`${s.k}-${l.route}`, l.route, raw > 0 && raw < 1 ? f : 0);
    }));
    // branch
    const fStem = on ? prog(U, 3.38, 3.56) : 0;
    const fMon = on ? prog(U, 3.52, 4.22) : 0, fMcp = on ? prog(U, 3.52, 3.87) : 0;
    setPacket('stem', 'stem', fStem > 0 && fStem < 1 ? E.inOutSine(fStem) * .9 + .1 * fStem : 0);
    setPacket('mon', 'mon', fMon > 0 && fMon < 1 ? E.inOutSine(fMon) : 0);
    setPacket('mcp', 'mcp', fMcp > 0 && fMcp < 1 ? E.inOutSine(fMcp) : 0);
    // monitor ↔ mcp exchange
    const fLf = on ? prog(U, 4.80, 5.30) : 0, fLb = on ? prog(U, 5.05, 5.55) : 0;
    setPacket('link_f', 'link_f', fLf > 0 && fLf < 1 ? E.inOutSine(fLf) : 0);
    setPacket('link_b', 'link_b', fLb > 0 && fLb < 1 ? E.inOutSine(fLb) : 0);
    // feedback action pulses (constant speed along the rail → natural cascade)
    const arrive = {};
    ['repo', 'collector', 'obs', 'apps'].forEach(k => {
      const rt = routes['fb_' + k], d = rt.len / FB_SPEED;
      arrive[k] = FB_START + d;
      const f = on ? prog(U, FB_START, FB_START + d) : 0;
      setPacket('fb_' + k, 'fb_' + k, f > 0 && f < 1 ? E.inOutSine(f) : 0);
    });

    // ---- ripples at arrival tips
    ripples.forEach(rp => {
      let best = 0, rr = 4;
      if (on) rp.times.forEach(t0 => { const p = prog(U, t0, t0 + .55); if (p > 0 && p < 1) { const o = (1 - p) * .7; if (o > best) { best = o; rr = 4 + 20 * E.outCubic(p); } } });
      rp.c.setAttribute('opacity', r2(best));
      rp.c.setAttribute('r', r2(rr));
    });
    junctionDot.setAttribute('r', r2(5.5 * jp * (1 + (on ? .7 * bump(U, 3.5, .35) : 0))));
    junctionDot.setAttribute('opacity', r2(clamp(jp * 1.5)));

    // ---- card glows
    const g = {
      apps: on ? pulse(U, 0, .15, .2, .55) : 0,
      obs: on ? pulse(U, .60, .18, .5, .6) : 0,
      collector: on ? pulse(U, 1.80, .18, .55, .6) : 0,
      repo: on ? pulse(U, 2.85, .18, .45, .6) : 0,
      monitor: on ? pulse(U, 4.20, .2, 1.1, .7) : 0,
      mcp: on ? pulse(U, 3.85, .2, 3.4, .8) : 0,
    };
    for (const k in g) setGlow(k, g[k]);
    // feedback acknowledgements
    ['repo', 'collector', 'obs', 'apps'].forEach(k => {
      const a = arrive[k];
      setAck(k, on ? pulse(U, a, .16, .45, .6) : 0);
      const chip = ackChips[k];
      const cv = on ? clamp(prog(U, a - .02, a + .2)) * (1 - prog(U, a + 1.25, a + 1.55)) : 0;
      chip.style.opacity = r2(cv);
      chip.style.transform = cv <= 0 ? 'translateY(6px)' : `translateY(${r2((1 - E.outCubic(clamp(prog(U, a - .02, a + .25)))) * 6)}px)`;
    });

    // ---- Aplicações
    if (icons.apps) icons.apps.style.transform = scaleT(on ? .1 * bump(U, 0, .4) + .08 * bump(U, arrive.apps, .45) : 0);

    // ---- Observabilidade tiles
    const tl = (k, t0) => {
      const v = on ? pulse(U, t0, .15, .25, .5) : 0;
      tileHl(k).style.opacity = r2(v);
      const ic = tileIco(k); if (ic) ic.style.transform = scaleT(on ? .13 * bump(U, t0, .42) : 0);
    };
    tl('log4j', .60); tl('bib', .75); tl('otel', .90);

    // ---- Collector: hub whirl (full turn → seamless)
    const whirl = on ? 360 * E.inOutCubic(prog(U, 1.85, 3.0)) : 0;
    parts.spin.forEach(e => { e.style.transform = whirl % 360 === 0 ? '' : `rotate(${r2(whirl)}deg)`; });
    parts.hub.forEach(e => { e.style.transformBox = 'fill-box'; e.style.transformOrigin = '50% 50%'; e.style.transform = scaleT(on ? .18 * bump(U, 1.85, .5) : 0); });

    // ---- Repositórios
    tl('loki', 2.85); tl('dyn', 3.00);
    parts.lokiBars.forEach((b, i) => { b.style.transform = on && bump(U, 2.85 + i * .045, .3) > 0 ? `translateY(${r2(-4 * bump(U, 2.85 + i * .045, .3))}px)` : ''; });
    const faceShimmer = (faces, t0) => faces.forEach((f, i) => { f.style.opacity = on ? r2(1 - .5 * bump(U, t0 + i * .08, .3)) : ''; });
    faceShimmer(parts.dynFaces, 3.0);

    // ---- Monitoração
    const swirlA = on ? 360 * u / P : 0;
    parts.swirl.forEach(e => { e.style.transform = swirlA === 0 ? '' : `rotate(${r2(swirlA)}deg)`; });
    if (icons.grafana) icons.grafana.style.transform = scaleT(on ? .14 * bump(U, 4.25, .45) : 0);
    faceShimmer(parts.dynFacesM, 4.40);
    if (icons.dynM) icons.dynM.style.transform = scaleT(on ? .1 * bump(U, 4.40, .4) : 0);
    if (icons.monitorDash) icons.monitorDash.style.transform = scaleT(on ? .08 * bump(U, 4.2, .4) : 0);
    const av = on ? E.outCubic(prog(U, 4.35, 4.6)) * (1 - E.inOutSine(prog(U, 5.9, 6.3))) : 0;
    alertChip.style.opacity = r2(av);
    alertChip.style.transform = av <= 0 ? '' : `translateY(${r2((1 - E.outCubic(prog(U, 4.35, 4.65))) * 8)}px)`;
    const badge = (el, ic, t0) => {
      const p = on ? prog(U, t0, t0 + .45) : 0;
      const out = on ? prog(U, 6.0, 6.35) : 0;
      const s = p <= 0 ? 0 : E.outBack(p) * (1 - E.inOutSine(out));
      el.style.opacity = r2(clamp(p * 3) * (1 - out));
      el.style.transform = `scale(${r2(s)})`;
      if (ic) ic.style.transform = scaleT(on ? .12 * bump(U, t0, .4) : 0);
    };
    badge(nbWa, icons.wa, 4.60);
    badge(nbTeams, icons.teams, 4.75);

    // ---- MCP OPS
    if (icons.brain) icons.brain.style.transform = scaleT(on ? .1 * bump(U, 3.85, .5) : 0);
    parts.brainNodes.forEach((n, i) => {
      const v = on ? pulse(U, 3.9 + i * .07, .12, .35, .5) : 0;
      n.style.fill = v > 0 ? 'currentColor' : '';
      n.style.fillOpacity = v > 0 ? r2(v) : '';
    });
    caps.forEach((c, i) => {
      const act = on ? pulse(U, c.a, .2, (c.b - c.a) - .2, .45) : 0;
      c.hl.style.opacity = r2(act);
      if (c.ico) c.ico.style.transform = scaleT(on ? .14 * bump(U, c.a, .45) : 0);
      renderStatus(c, U, on);
    });
    // robot blink
    const blink = on ? Math.max(bump(U, 4.45, .16), bump(U, 4.75, .16)) : 0;
    parts.robotEyes.forEach(e => { e.style.transform = blink > 0 ? `scaleY(${r2(1 - .85 * blink)})` : ''; });
    // insights trend draws in
    const tp = on ? E.inOutCubic(prog(U, 5.05, 5.6)) : 1;
    parts.trend.forEach(e => {
      if (!on || tp >= 1 || U < 5.05) { e.style.strokeDasharray = ''; e.style.strokeDashoffset = ''; }
      else { e.style.strokeDasharray = '1 1'; e.style.strokeDashoffset = String(r2((1 - tp) * 1000) / 1000); }
    });
    // automation gear turns 360°
    const gear = on ? 360 * E.inOutCubic(prog(U, 5.85, 6.9)) : 0;
    parts.gear.forEach(e => { e.style.transform = gear % 360 === 0 ? '' : `rotate(${r2(gear)}deg)`; });
    // recommendation rays flicker
    parts.rays.forEach((r, i) => {
      const w = on && U > 6.6 && U < 7.5 ? .5 + .5 * Math.cos((U - 6.6) * 18 + i * 1.3) : 1;
      r.style.opacity = w >= 1 ? '' : r2(.25 + .75 * w);
    });

    // ---- outcomes
    ocs.forEach((o, i) => {
      const t0 = 7.6 + i * .4;
      o.hl.style.opacity = r2(on ? pulse(U, t0, .2, .35, .5) : 0);
      if (o.ico) o.ico.style.transform = on && bump(U, t0, .5) > 0 ? `translateY(${r2(-5 * bump(U, t0, .5))}px)` : '';
    });
  }

  // typewriter status lines
  function renderStatus(c, U, on) {
    let html, live = false;
    if (!on || U < c.a + .05) html = esc(c.rest);
    else {
      const n = c.live.length;
      const typeEnd = c.a + .05 + Math.min(.62, n * .02);
      const k = Math.floor(n * prog(U, c.a + .05, typeEnd));
      if (U < SETTLE[0]) {
        live = true;
        html = esc(c.live.slice(0, k)) + (k < n || (U < c.b && Math.floor((U - c.a) * 4) % 2 === 0) ? '<i class="caret"></i>' : '');
      } else {
        const out = prog(U, SETTLE[0], SETTLE[0] + .3);
        html = out < 1 ? esc(c.live) : esc(c.rest);
        live = out < 1;
        c.st.style.opacity = out < 1 ? r2(1 - out) : r2(prog(U, SETTLE[0] + .3, SETTLE[1]));
      }
    }
    if (!on || U < SETTLE[0]) c.st.style.opacity = '1';
    if (html !== c.lastHtml) { c.st.innerHTML = html; c.lastHtml = html; }
    c.st.classList.toggle('live', live);
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ================================================================ clock + controls
  function tick(now) {
    if (playing) {
      if (lastNow != null) t += Math.min(.1, (now - lastNow) / 1000);
      lastNow = now;
      render(t);
    } else lastNow = null;
    requestAnimationFrame(tick);
  }

  function setPlaying(v) {
    playing = v;
    controls.classList.toggle('paused', !v);
    $('#lbl-play').textContent = v ? 'Pausar' : 'Continuar';
  }
  function setLayout(k) {
    if (!LAYOUTS[k]) return;
    layoutKey = k; L = LAYOUTS[k];
    applyLayout();
    $('#lbl-layout').textContent = k === 'l' ? 'Vertical' : '16:9';
    render(t);
  }
  function setTheme(k) {
    look = k === 'dark' ? 'dark' : 'light';
    stage.dataset.look = look;
    document.body.dataset.look = look;
    $('#lbl-theme').textContent = look === 'dark' ? 'Claro' : 'Escuro';
  }
  function replay() { t = 0; lastNow = null; render(0); setPlaying(true); }

  function parseFlags() {
    const h = decodeURIComponent((location.hash || '').slice(1)).toLowerCase();
    return new Set(h.split(/[,&+\s-]+/).filter(Boolean));
  }

  $('#btn-replay').addEventListener('click', replay);
  $('#btn-play').addEventListener('click', () => setPlaying(!playing));
  $('#btn-layout').addEventListener('click', () => setLayout(layoutKey === 'l' ? 'p' : 'l'));
  $('#btn-theme').addEventListener('click', () => setTheme(look === 'dark' ? 'light' : 'dark'));
  $('#btn-full').addEventListener('click', () => {
    try {
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen().catch(() => {});
      else d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => {});
    } catch (e) { /* not available in this frame */ }
  });
  window.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); setPlaying(!playing); }
    else if (k === 'r') replay();
    else if (k === 'l' || k === 'v') setLayout(layoutKey === 'l' ? 'p' : 'l');
    else if (k === 't' || k === 'd') setTheme(look === 'dark' ? 'light' : 'dark');
    else if (k === 'f') $('#btn-full').click();
    else if (k === 'arrowright') { t += 1; render(t); }
    else if (k === 'arrowleft') { t = Math.max(0, t - 1); render(t); }
    wake();
  });
  let idleTimer = null;
  function wake() {
    controls.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controls.classList.add('idle'), 2500);
  }
  window.addEventListener('mousemove', wake, { passive: true });
  window.addEventListener('touchstart', wake, { passive: true });
  window.addEventListener('resize', fit);

  // ================================================================ boot
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (flags.has('capture')) document.body.classList.add('capture');
  setTheme(flags.has('dark') ? 'dark' : 'light');
  layoutKey = flags.has('vertical') ? 'p' : flags.has('landscape') ? 'l' : (window.innerHeight > window.innerWidth * 1.05 ? 'p' : 'l');
  L = LAYOUTS[layoutKey];
  $('#lbl-layout').textContent = layoutKey === 'l' ? 'Vertical' : '16:9';
  if (flags.has('loop')) t = T_INTRO;

  window.FLOW = {
    get W() { return L.W; }, get H() { return L.H; },
    T_INTRO, P, ready: false,
    time: () => t,
    seek(v) { t = Math.max(0, +v || 0); lastNow = null; render(t); return t; },
    play() { setPlaying(true); }, pause() { setPlaying(false); }, toggle() { setPlaying(!playing); },
    replay, setLayout, layout: () => layoutKey, setTheme, theme: () => look,
  };

  const start = () => {
    applyLayout();
    if (reduce && !flags.has('play')) { t = T_INTRO; setPlaying(false); }
    else setPlaying(!flags.has('paused'));
    render(t);
    window.FLOW.ready = true;
    wake();
    requestAnimationFrame(tick);
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start, start);
})();
