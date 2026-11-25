/* Axolotl tank for the homelab start page (served as i/tank.js, loaded by cluster/start/index.html).
   Two axolotls, one per Pi: pink = Pi 5 (raspberrypi), black = Pi 4 (pi2).

   How it works
   - One <canvas>. The tank is a small 3D box: x across, y down, z from the front glass (0) to the
     back wall (D). Points are projected with a little perspective, so farther things are smaller and
     sit nearer the middle; the sand and the water surface show as planes. Everything is drawn back to
     front each frame (plants, rocks and axolotls sorted by depth), so they swim behind and in front of
     the scenery.
   - Each axolotl is a chain of 16 spine points that follows its head, so the body bends through
     turns and the tail drags and drapes over rocks. On top of that: a swimming wave that grows with
     thrust, a 3D head (two ellipsoids) with eyes and a smile, six feathery gills that flutter on their
     own, four legs placed with two-bone IK (tucked when swimming fast, paddling when hovering,
     walking and planted on the sand), and a see-through tail fin.
   - Movement: steering toward a goal with a turn-rate limit (smooth arcs, never a flip), burst-and-
     glide swimming, slow sinking when idle, and avoidance of the glass, the floor and each other.
   - Behaviour: each one has a personality and keeps picking something to do (cruise, explore the
     bottom, rest on the rock, hover, go up for air, come to the glass to look at you, look around).
     Now and then they do something together: inspect each other, follow, swim side by side, rest
     next to each other.
   - Dashboard hooks kept from the jelly tank: a busier CPU makes that Pi's axolotl more active; a
     node that isn't ready lies on the sand, grey; the water goes red while an app is down (CSS);
     tap the water to drop food; tap an axolotl to make it dart away.
     window.homelabTank.sync(nodes) and .alarm(count) are what the page calls.
   - Pauses when the tank is off screen or the tab is hidden; one still frame for reduced motion. */
(() => {
  "use strict";
  const box = document.getElementById("tank");
  if (!box) return;
  const moodEl = document.getElementById("tank-mood"), fedEl = document.getElementById("tank-fed");
  const still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  /* ---------- maths ---------- */
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const wrapA = (a) => { a = (a + PI) % TAU; return a < 0 ? a + PI : a - PI; };
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const V = (x, y, z) => ({ x, y, z });
  const cp = (a) => V(a.x, a.y, a.z);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, k) => V(a.x * k, a.y * k, a.z * k);
  const madd = (a, b, k) => V(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.hypot(a.x, a.y, a.z);
  const norm = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  // lin(v1, k1, v2, k2, ...) = v1*k1 + v2*k2 + ...
  const lin = (...q) => { let x = 0, y = 0, z = 0; for (let i = 0; i < q.length; i += 2) { const v = q[i], k = q[i + 1]; x += v.x * k; y += v.y * k; z += v.z * k; } return V(x, y, z); };
  // sideways direction for a segment, kept on the same side as the head's so it never flips when the
  // segment points nearly straight up or down
  const sidePerp = (f, ref) => { const h = Math.hypot(f.x, f.z); if (h < 1e-3) return ref; let l = V(-f.z / h, 0, f.x / h); if (l.x * ref.x + l.z * ref.z < 0) l = V(-l.x, 0, -l.z); const w = clamp(h / 0.35, 0, 1); return w < 1 ? norm(V(lerp(ref.x, l.x, w), 0, lerp(ref.z, l.z, w))) : l; };
  const flatPerp = (f, fallback) => { const l = Math.hypot(f.x, f.z); return l < 1e-3 ? fallback : V(-f.z / l, 0, f.x / l); };
  const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixHex = (h, g, t) => { const a = hexRGB(h), b = hexRGB(g); return "#" + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, "0")).join(""); };

  /* ---------- the tank's space ---------- */
  const WH = 200, D = 110, SURF = 15, VY = 76, PERSP = 0.24;
  let WW = 260, VX = 130;
  const sOf = (z) => 1 - (PERSP * z) / D;
  const proj = (p) => { const s = sOf(p.z); return [VX + (p.x - VX) * s, VY + (p.y - VY) * s, s]; };
  const unprojX = (sx, z) => VX + (sx - VX) / sOf(z);
  const unprojY = (sy, z) => VY + (sy - VY) / sOf(z);
  const sandY = (x, z) => 182 - (12 * z) / D + 1.4 * Math.sin(x * 0.045 + z * 0.06) + 0.8 * Math.sin(x * 0.12 - z * 0.11);
  let rocks = [];
  // the little house at the back: cream stone walls, a tiled roof, an arched door, a chimney
  let house = null, houseImgs = null;
  const roofY = (x) => house.top - house.peak * Math.max(0, 1 - Math.abs(x - house.x) / (house.w / 2 + 4));
  const inHouseBox = (q, pad = 0) => !!house && q.x > house.x0 - 4 - pad && q.x < house.x1 + 4 + pad && q.z > house.zf - 3 - pad && q.z < house.zb + 3 + pad && q.y > roofY(q.x) - pad;
  const night = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
  const rockH = (r, x, z) => {
    const q = ((x - r.x) / r.rx) ** 2 + ((z - r.z) / r.rz) ** 2;
    return q >= 1 ? 0 : r.h * sm((1 - q) / 0.55) * (1 + 0.06 * Math.sin(x * 0.31 + r.seed) * Math.cos(z * 0.27 - r.seed));
  };
  const ground = (x, z) => { let y = sandY(x, z); for (const r of rocks) { const h = rockH(r, x, z); if (h > 0) y = Math.min(y, r.base - h); } return y; };
  const current = (x, y, t) => 0.6 * Math.sin(t * 0.21 + y * 0.02) + 0.4 * Math.sin(t * 0.37 + x * 0.015 + 1.3);

  /* ---------- the two of them ---------- */
  const NSEG = 16, SEG = 3.5;
  const RAD = [5.2, 5.8, 6.1, 6.2, 6.1, 5.8, 5.3, 4.7, 4.1, 3.5, 2.9, 2.3, 1.8, 1.3, 0.9, 0.5];
  const FINT = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.9, 2.4, 3.0, 3.6, 4.0, 4.2, 4.0, 3.4, 2.4, 0.6];
  const FINB = [0, 0, 0, 0, 0, 0, 0, 0.2, 0.9, 1.8, 2.6, 3.0, 3.0, 2.6, 1.8, 0.5];
  const PAL = {
    pink: { line: "#c47386", body: "#f7c4cd", belly: "#fde5e9", back: "#f2b0bd", shine: "#ffffff", shineA: 0.42, freckle: "#c58a98",
      fin: "#fbc8d2", finA: 0.78, finEdge: "#ec8aa0", stalk: "#f3a3b4", filA: "#ff3f6c", filB: "#ff8eaa", eye: "#120d10", ring: "#c47386",
      mouth: "#a65468", inner: "#7a2a3c", cheek: "#ff8aa5", cheekA: 0.3, legFar: "#e2a2b0" },
    black: { line: "#060607", body: "#29282e", belly: "#322f37", back: "#3e3f4a", shine: "#b4bfd6", shineA: 0.22, freckle: null,
      fin: "#2d2b33", finA: 0.72, finEdge: "#6d6878", stalk: "#3a222c", filA: "#6c2035", filB: "#a8395a", eye: "#020203", ring: "#7d7886",
      mouth: "#55505c", inner: "#000000", cheek: null, cheekA: 0, legFar: "#1d1c21" },
  };
  const SICKMIX = (p) => { const o = {}; for (const [k, v] of Object.entries(p)) o[k] = typeof v === "string" && v[0] === "#" ? mixHex(v, "#8d939c", 0.62) : v; return o; };
  const PERS = {
    // pink: the curious explorer. black: the homebody who loves the flat rock.
    pink: { speed: 1.05, activity: 0.7, curious: 0.9, social: 0.65, restful: 0.35, zone: "mid", rock: 0.25, notice: [0.2, 0.8] },
    black: { speed: 0.9, activity: 0.45, curious: 0.5, social: 0.55, restful: 0.8, zone: "low", rock: 0.85, notice: [0.9, 2.4] },
  };
  const LEGS = [{ seg: 1, side: 1, front: true }, { seg: 1, side: -1, front: true }, { seg: 6, side: 1, front: false }, { seg: 6, side: -1, front: false }];

  const makeAxo = (kind) => {
    const size = kind === "black" ? 1.2 : 1.12;
    const a = {
      kind, size, pal: PAL[kind], sickPal: SICKMIX(PAL[kind]), pers: PERS[kind], clear: 5.4 * size, name: kind === "pink" ? "raspberrypi" : "pi2",
      p: V(0, 0, 0), yaw: 0, pitch: 0, yawV: 0, pitchV: 0, speed: 0, vy: 0, F: V(1, 0, 0), L: V(0, 0, 1), U: V(0, -1, 0),
      pts: [], burst: 0, thrust: 0, amp: 0.5, beat: rnd(0, TAU), gait: 0, walkAmp: 0, pad: rnd(0, TAU), gp: rnd(0, TAU),
      flare: 0, flareT: 0, exert: 0, gulp: 0, lunge: 0, nod: 0, lookYaw: 0, lookPitch: 0, look: null, glance: null, glanceT: rnd(1, 3),
      curl: 0, curlT: 0, wTuck: 0, wFloor: 0, wBrake: 0, brake: 0, creep: 0, onFloor: false, away: false, seed: rnd(0, 100),
      mode: "hover", goal: null, vs: 0, arrive: 4, face: null, align: null,
      legs: LEGS.map((l) => ({ ...l, adjF: 0, adjL: 0, lift: 0 })), legT: rnd(2, 5), bubbleAt: 0,
      cpu: 10, sick: false, b: { kind: "none", t: 0 }, lastKind: "", cd: { float: rnd(15, 40), glass: rnd(8, 25), social: rnd(6, 15), house: rnd(25, 70) }, sleep: false, noticeAt: 0,
      Q: null, RR: null,
    };
    return a;
  };
  const axos = [makeAxo("pink"), makeAxo("black")];
  const other = (a) => axos[0] === a ? axos[1] : axos[0];
  const activity = (a) => a.pers.activity + (a.cpu / 100) * 0.55 + (alarm ? 0.15 : 0);
  const fwd = (yaw, pitch) => V(Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  const setFrame = (a) => { a.F = fwd(a.yaw, a.pitch); a.L = flatPerp(a.F, a.L); a.U = cross(a.F, a.L); };
  const layBody = (a) => { setFrame(a); a.pts = []; for (let i = 0; i < NSEG; i++) a.pts.push(madd(a.p, a.F, -i * SEG * a.size)); };
  const headFrame = (a, N0) => {
    const ly = a.lookYaw - 0.045 * a.amp * Math.sin(a.beat + 0.4), lp = a.lookPitch + a.nod;
    let f = norm(lin(a.F, Math.cos(ly), a.L, Math.sin(ly)));
    let l = flatPerp(f, a.L), u = cross(f, l);
    f = norm(lin(f, Math.cos(lp), u, Math.sin(lp)));
    l = flatPerp(f, l); u = cross(f, l);
    return { F: f, L: l, U: u, N: N0 || a.pts[0] };
  };
  const mouthPos = (a) => { const h = headFrame(a); return lin(h.N, 1, h.F, 12.6 * a.size, h.U, -1.1 * a.size); };
  const headPos = (a) => madd(a.pts[0] || a.p, a.F, 6 * a.size);

  /* ---------- places to go ---------- */
  const inside = (p, a, lift = 0) => {
    const x = clamp(p.x, 26, WW - 26), z = clamp(p.z, 14, D - 12);
    return V(x, clamp(p.y, SURF + 16, ground(x, z) - a.clear - lift), z);
  };
  const waterPoint = (a, zone) => {
    const x = rnd(30, WW - 30), z = rnd(14, D - 14), g = ground(x, z) - a.clear - 4, top = SURF + 18;
    zone = zone || (Math.random() < 0.6 ? a.pers.zone : pick(["low", "mid", "high"]));
    const y = zone === "low" ? rnd(g - 32, g) : zone === "high" ? rnd(top, top + 40) : rnd(top + 14, g - 10);
    const p = V(x, clamp(y, top, g), z);
    if (inHouseBox(p, 12)) p.y = roofY(p.x) - 16;
    return p;
  };
  const floorPoint = (a, x, z) => { x = clamp(x, 26, WW - 26); z = clamp(z, 12, D - 14); if (inHouseBox(V(x, ground(x, z), z), 12)) z = house.zf - rnd(16, 26); return V(x, ground(x, z) - a.clear, z); };
  const yawTo = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
  const ctl = (a, goal, mode, vs, arrive, face) => { a.goal = goal; a.mode = mode; a.vs = vs * a.pers.speed; a.arrive = arrive == null ? 4 : arrive; a.face = face == null ? null : face; };
  const livePellets = () => pellets.filter((p) => !p.gone);
  const housing = (a) => a.b.kind === "house" && a.b.ph >= 1;
  const onRock = (p) => rocks.length && rockH(rocks[0], p.x, p.z) > 4;

  /* ---------- behaviours. start(a, opt) sets up; tick(a, dt) steers and returns true when done ---------- */
  const B = {
    cruise: {
      start(a) { a.b.wps = Array.from({ length: 1 + ((Math.random() * 3) | 0) }, () => waterPoint(a)); a.b.vs = rnd(12, 19); },
      tick(a) {
        const w = a.b.wps[0];
        if (!w) return true;
        ctl(a, w, "swim", a.b.vs * (0.75 + 0.45 * activity(a)), 9);
        if (dist(a.p, w) < 11) a.b.wps.shift();
        return !a.b.wps.length || a.b.t > 40;
      },
    },
    explore: {
      start(a) { a.b.steps = 2 + ((Math.random() * 3) | 0); a.b.spot = floorPoint(a, a.p.x + rnd(-60, 60), a.p.z + rnd(-30, 30)); a.b.pause = 0; a.b.wv = rnd(4.5, 7); },
      tick(a, dt) {
        if (a.b.pause > 0) {
          a.b.pause -= dt;
          ctl(a, a.b.hold, "rest", 0, 3);
          a.look = madd(madd(a.p, a.F, 16), V(0, 1, 0), 6 + 3 * Math.sin(a.b.t * 2));
          if (a.b.pause <= 0) {
            if (--a.b.steps <= 0) return true;
            a.b.spot = floorPoint(a, a.p.x + rnd(-55, 55), a.p.z + rnd(-30, 30));
          }
          return false;
        }
        const d = dist(a.p, a.b.spot);
        if (!a.onFloor && d > 16) ctl(a, V(a.b.spot.x, a.b.spot.y - 4, a.b.spot.z), "swim", 11, 8);
        else ctl(a, a.b.spot, "walk", a.b.wv, 3);
        a.look = madd(madd(a.p, a.F, 18), V(0, 1, 0), 7);
        if (d < 5) { a.b.pause = rnd(1, 2.6); a.b.hold = cp(a.p); }
        return a.b.t > 45;
      },
    },
    rest: {
      start(a, opt) {
        let spot = opt && opt.spot;
        if (!spot) {
          const r = rocks[0], o = other(a);
          const rockFree = !(o.b.kind === "rest" && o.b.spot && onRock(o.b.spot));
          if (r && rockFree && Math.random() < a.pers.rock) spot = floorPoint(a, r.x + rnd(-r.rx * 0.3, r.rx * 0.3), r.z + rnd(-r.rz * 0.25, r.rz * 0.25));
          else for (let k = 0; k < 8; k++) { spot = floorPoint(a, rnd(30, WW - 30), rnd(14, D - 24)); if (!onRock(spot) && dist(spot, o.p) > 34) break; }
        }
        a.b.spot = spot; a.b.settled = false;
        a.b.dur = rnd(9, 22) * (0.6 + a.pers.restful) * (1 - a.cpu / 250) * ((opt && opt.long) || 1);
      },
      tick(a) {
        const sp = a.b.spot;
        if (!a.b.settled) {
          const d = dist(a.p, sp), dh = Math.hypot(a.p.x - sp.x, a.p.z - sp.z);
          if (dh > 16) ctl(a, a.onFloor && !onRock(sp) ? sp : V(sp.x, sp.y - 12, sp.z), a.onFloor && !onRock(sp) ? "walk" : "swim", 11, 7);
          else ctl(a, sp, a.onFloor ? "walk" : "hover", 5, 2);
          if ((a.onFloor && dh < 5) || d < 3) { a.b.settled = true; a.b.t0 = a.b.t; a.curlT = rnd(0.5, 1) * (Math.random() < 0.5 ? -1 : 1); a.b.spot = cp(a.p); }
          return a.b.t > 30;
        }
        ctl(a, a.b.spot, "rest", 0, 3);
        return a.b.t - a.b.t0 > a.b.dur;
      },
    },
    hover: {
      start(a) { a.b.dur = rnd(3, 8); a.b.hold = inside(V(a.p.x, Math.min(a.p.y, ground(a.p.x, a.p.z) - a.clear - 8), a.p.z), a); a.b.face = Math.random() < 0.5 ? wrapA(a.yaw + rnd(-1.3, 1.3)) : null; },
      tick(a) { ctl(a, a.b.hold, "hover", 0, 3, a.b.face); return a.b.t > a.b.dur; },
    },
    look: {
      start(a) { a.b.dur = rnd(1.8, 4); a.b.hold = cp(a.p); a.glanceT = 0; },
      tick(a) { ctl(a, a.b.hold, a.onFloor ? "rest" : "hover", 0, 3); return a.b.t > a.b.dur; },
    },
    float: {
      // swim up for a gulp of air, then sink back down with the legs spread
      start(a) { a.cd.float = clock + rnd(45, 80); a.b.ph = 0; a.b.top = V(clamp(a.p.x + rnd(-30, 30), 30, WW - 30), SURF + 7, clamp(a.p.z + rnd(-15, 15), 16, D - 14)); },
      tick(a) {
        if (a.b.ph === 0) { ctl(a, a.b.top, "swim", 12, 6); a.look = V(a.b.top.x, SURF - 10, a.b.top.z); if (dist(a.p, a.b.top) < 9) { a.b.ph = 1; a.b.t1 = a.b.t; a.gulp = 1; a.bubbleAt = clock + rnd(2, 4.5); } }
        else if (a.b.ph === 1) { ctl(a, a.b.top, "hover", 0, 3); if (a.b.t - a.b.t1 > 1.3) { a.b.ph = 2; a.b.t1 = a.b.t; } }
        else { ctl(a, null, "sink", 0); a.flareT = 0.7; return a.p.y > ground(a.p.x, a.p.z) - 40 || a.b.t - a.b.t1 > 8; }
        return a.b.t > 25;
      },
    },
    glass: {
      // come right up to the front glass and look at whoever is there
      start(a) { a.cd.glass = clock + rnd(35, 60); a.b.ph = 0; const x = clamp(a.p.x + rnd(-50, 50), 40, WW - 40); a.b.spot = V(x, clamp(rnd(SURF + 45, 150), SURF + 30, ground(x, 18) - 14), 17 * a.size); a.b.dur = rnd(4, 8); },
      tick(a) {
        if (a.b.ph === 0) { ctl(a, a.b.spot, "swim", 13, 7); if (dist(a.p, a.b.spot) < 9) { a.b.ph = 1; a.b.t1 = a.b.t; } return a.b.t > 20; }
        const t = a.b.t - a.b.t1;
        ctl(a, a.b.spot, "hover", 0, 3, -PI / 2);
        a.look = V(a.b.spot.x + 34 * Math.sin(t * 0.8), a.b.spot.y - 4 + 6 * Math.sin(t * 0.53), -60);
        a.flareT = 0.9;
        return t > a.b.dur;
      },
    },
    inspect: {
      start(a, opt) { const o = opt || other(a); a.b.o = o; a.b.ph = 0; o.attn = { by: a, until: clock + 10 }; socialCD = clock + rnd(20, 38); a.cd.social = clock + rnd(10, 20); },
      tick(a) {
        const o = a.b.o, hd = headPos(o);
        if (housing(o)) return true;
        const front = inside(lin(hd, 1, o.F, 19 * o.size, V(0, -1, 0), 3), a);
        if (a.b.ph === 0) {
          ctl(a, front, a.onFloor && o.onFloor ? "walk" : "swim", 11, 6); a.look = hd;
          if (dist(a.p, front) < 8) { a.b.ph = 1; a.b.t1 = a.b.t; a.b.dur = rnd(2.5, 4.5); a.b.hold = cp(a.p); }
          return a.b.t > 16;
        }
        ctl(a, a.b.hold, a.onFloor ? "rest" : "hover", 0, 3, yawTo(a.p, hd));
        a.look = hd; a.flareT = 0.8;
        if (a.b.t - a.b.t1 > a.b.dur) {
          // part ways; sometimes the other one follows
          if (!o.sick && Math.random() < 0.35 && o.b.kind !== "eat") { setTimeout(() => { if (o.b.kind !== "eat" && !o.sick) startB(o, "follow", a); }, 600); }
          a.next = "cruise";
          return true;
        }
        return false;
      },
    },
    follow: {
      start(a, opt) { a.b.o = opt || other(a); a.b.dur = rnd(6, 11); socialCD = clock + rnd(20, 38); a.cd.social = clock + rnd(10, 20); },
      tick(a) {
        if (housing(a.b.o)) return true;
        const o = a.b.o, tail = o.pts[NSEG - 1], tdir = norm(sub(o.pts[NSEG - 1], o.pts[NSEG - 5]));
        ctl(a, inside(madd(tail, tdir, 9), a), "swim", clamp(o.speed * 1.15 + 3, 8, 30), 5);
        a.look = headPos(o);
        if (o.b.kind === "rest" && o.b.settled) { a.next = "restNear"; return true; }
        if ((o.b.kind === "hover" || o.b.kind === "look") && dist(a.p, headPos(o)) < 28) { a.next = "inspect"; return true; }
        return a.b.t > a.b.dur;
      },
    },
    alongside: {
      start(a, opt) {
        const o = (a.b.o = opt || other(a));
        a.b.side = dot(sub(a.p, o.p), o.L) > 0 ? 1 : -1; a.b.dur = rnd(8, 14);
        if (o.b.kind === "cruise") for (let k = 0; k < 2; k++) o.b.wps.push(waterPoint(o, "mid"));
        socialCD = clock + rnd(20, 38); a.cd.social = clock + rnd(10, 20);
      },
      tick(a) {
        const o = a.b.o;
        if (housing(o)) return true;
        let g = lin(o.p, 1, o.L, a.b.side * 14 * o.size, o.F, 3, V(0, -1, 0), 9);
        if (g.x < 26 || g.x > WW - 26 || g.z < 14 || g.z > D - 12) { a.b.side *= -1; g = lin(o.p, 1, o.L, a.b.side * 14 * o.size, o.F, 3, V(0, -1, 0), 9); }
        g = inside(g, a);
        const d = dist(a.p, g);
        ctl(a, g, "swim", o.speed + clamp(d * 0.6, 0, 10), 3);
        a.align = o.F;
        if (Math.random() < 0.01) a.glance = { at: headPos(o), until: clock + 1 };
        if (o.b.kind !== "cruise" && o.b.kind !== "alongside") return true;
        return a.b.t > a.b.dur;
      },
    },
    restNear: {
      start(a) {
        const o = other(a); let spot = null;
        for (const s of [1, -1]) { const c = floorPoint(a, o.p.x + o.L.x * s * 16, o.p.z + o.L.z * s * 16); if (!spot || Math.abs(c.y - o.p.y) < Math.abs(spot.y - o.p.y)) spot = c; }
        startB(a, "rest", { spot, long: 1.3 });
        a.lastKind = "restNear"; socialCD = clock + rnd(25, 40);
      },
      tick() { return true; },
    },
    eat: {
      start(a) { a.b.chew = 0; a.b.target = null; },
      tick(a, dt) {
        if (a.b.chew > 0) {
          a.b.chew -= dt; ctl(a, a.b.hold, a.onFloor ? "rest" : "hover", 0, 3);
          a.nod = 0.08 * Math.sin(a.b.chew * 18) * sm(a.b.chew * 3);
          if (a.b.chew <= 0) { a.nod = 0; if (!livePellets().length) return true; }
          return false;
        }
        const o = other(a), live = livePellets();
        if (!live.length) return true;
        const theirs = o.b.kind === "eat" ? o.b.target : null;
        let best = null, bd = 1e9;
        for (const p of live) { const d = dist(p, a.p) + (p === theirs ? 35 : 0); if (d < bd) { bd = d; best = p; } }
        a.b.target = best;
        const to = sub(best, a.p), dP = len(to);
        let goal = madd(best, norm(to), -11.5 * a.size);
        goal = V(clamp(goal.x, 8, WW - 8), Math.min(goal.y, ground(goal.x, goal.z) - a.clear), clamp(goal.z, 6, D - 6));
        ctl(a, goal, best.landed && a.onFloor ? "walk" : "swim", dP > 40 ? 16 : 9, 1.5);
        a.look = best; a.flareT = 0.6;
        const m = mouthPos(a), dm = dist(m, best);
        if (dm < 9 * a.size) { const k = damp(7, dt); best.x += (m.x - best.x) * k; best.y += (m.y - best.y) * k; best.z += (m.z - best.z) * k; }
        if (dm < 4.5 * a.size) { best.gone = true; a.gulp = 1; a.lunge = 0.18; a.b.chew = rnd(0.6, 1.1); a.b.hold = cp(a.p); ate(best.pinch); }
        return a.b.t > 30;
      },
    },
    dart: {
      start(a) {
        let best = null;
        for (let k = 0; k < 6; k++) { const c = waterPoint(a, "mid"); if (!best || dist(c, a.p) > dist(best, a.p)) best = c; }
        a.b.spot = best; a.burst = 0.9; a.speed = Math.max(a.speed, 16); a.flareT = 0;
      },
      tick(a) { ctl(a, a.b.spot, "swim", 38, 10); return dist(a.p, a.b.spot) < 14 || a.b.t > 3.5; },
    },
    house: {
      // go home for a nap: in through the door, turn round, sleep with the head in the doorway
      start(a) {
        const o = other(a), taken = o.b.kind === "house" ? o.b.slot : null;
        a.b.slot = taken == null ? (Math.random() < 0.5 ? -1 : 1) : -taken;
        a.b.sx = house.x + a.b.slot * 12.5; a.b.ph = 0;
        a.b.dur = rnd(25, 50) * (night() ? 2 : 1);
        if (housing(o)) o.b.dur = Math.max(o.b.dur, o.b.t - (o.b.t1 || 0) + rnd(30, 45));
        a.cd.house = clock + rnd(70, 140);
      },
      tick(a) {
        const H = house, sx = a.b.sx, at = (z) => V(sx, ground(sx, z) - a.clear, z);
        if (a.b.ph === 0) {
          const door = at(H.zf - 16), d = dist(a.p, door);
          ctl(a, d > 22 ? V(door.x, door.y - 8, door.z) : door, a.onFloor && d < 30 ? "walk" : "swim", 10, 4);
          if (d < 6) a.b.ph = 1;
          return a.b.t > 40;
        }
        if (a.b.ph === 1) { ctl(a, at(H.zb - 8), "walk", 4.5, 2); if (a.p.z > H.zf + H.d * 0.5) { a.b.ph = 2; a.b.t1 = a.b.t; } return false; }
        if (a.b.ph === 2) {
          ctl(a, cp(a.p), "rest", 0, 3, -PI / 2);
          if (Math.abs(wrapA(a.yaw + PI / 2)) < 0.35 || a.b.t - a.b.t1 > 7) {
            a.b.ph = 3; a.b.t1 = a.b.t; a.curlT = a.b.slot * 0.9;
            // often the other one comes to join a few seconds later
            const o = other(a);
            if (!housing(o) && !o.sick && Math.random() < 0.5 * (0.6 + o.pers.social)) o.joinAt = clock + rnd(3, 10);
          }
          return false;
        }
        if (a.b.ph === 3) {
          ctl(a, at(H.zf + 7), "rest", 0, 3, -PI / 2);
          a.sleep = a.b.t - a.b.t1 > 2.5;
          a.look = V(sx, ground(sx, H.zf) + 6, H.zf - 40);
          if (a.b.t - a.b.t1 > a.b.dur && !a.sick) { a.b.ph = 4; a.sleep = false; }
          return false;
        }
        a.sleep = false;
        // out of the door, then off to the side so the whole body comes out after the head
        const outside = a.p.z < H.zf - 8, side = clamp(H.x + a.b.slot * (H.w / 2 + 30), 26, WW - 26);
        const g = outside ? V(side, ground(side, H.zf - 14) - a.clear, H.zf - 14) : at(H.zf - 14);
        ctl(a, g, "walk", 5, 3);
        const clear = !a.pts.some((q) => q.x > H.x0 - 2 && q.x < H.x1 + 2 && q.z > H.zf - 1);
        return (clear && a.b.t > 1) || a.b.t > 300;
      },
    },
    sick: {
      start(a) { a.curlT = 0.8; },
      tick(a) { if (!a.onFloor) ctl(a, null, "sink", 0); else ctl(a, a.p, "rest", 0, 3); return false; },
    },
  };
  let socialCD = 12;
  const startB = (a, kind, opt) => {
    a.b = { kind, t: 0 }; a.next = null; a.flareT = 0; a.align = null;
    B[kind].start(a, opt);
    if (a.b.kind === kind) a.lastKind = kind;
  };
  const choose = (a) => {
    if (a.next) { const n = a.next; a.next = null; return startB(a, n, n === "inspect" ? other(a) : undefined); }
    const o = other(a), act = activity(a), w = [];
    w.push(["cruise", 3 * act]);
    w.push(["explore", 2 * (a.pers.zone === "low" ? 1.4 : 0.8)]);
    w.push(["rest", 2.4 * a.pers.restful * Math.max(0.2, 1.25 - act)]);
    w.push(["hover", 1.2]);
    w.push(["look", 0.8]);
    if (house && clock > a.cd.house) w.push(["house", (housing(o) ? 3.5 * a.pers.social : 0.9 * a.pers.restful) * (night() ? 3 : 1)]);
    if (clock > a.cd.float) w.push(["float", 0.6]);
    if (clock > a.cd.glass) w.push(["glass", 1.2 * a.pers.curious]);
    if (!o.sick && clock > socialCD && clock > a.cd.social) {
      const k = o.b.kind, s = a.pers.social;
      if (k === "cruise") w.push([Math.random() < 0.5 ? "follow" : "alongside", 4.5 * s]);
      else if (k === "rest" && o.b.settled) w.push([Math.random() < 0.6 ? "restNear" : "inspect", 1.8 * s]);
      else if (k === "hover" || k === "look" || k === "explore" || k === "glass") w.push(["inspect", 2 * s]);
    }
    for (const x of w) if (x[0] === a.lastKind) x[1] *= 0.35;
    let r = Math.random() * w.reduce((t, x) => t + x[1], 0), kind = "cruise";
    for (const [k, v] of w) if ((r -= v) <= 0) { kind = k; break; }
    if (["cruise", "explore", "float", "dart", "eat"].includes(a.lastKind) && kind !== "look" && Math.random() < 0.3) kind = "look";
    startB(a, kind, kind === "inspect" || kind === "follow" || kind === "alongside" ? o : undefined);
  };

  /* ---------- thinking: what to look at, when to eat, what to do next ---------- */
  const think = (a, dt) => {
    a.b.t += dt; a.look = null; a.align = null;
    const home = housing(a);
    if (a.sick && home) a.b.dur = 1e9;
    else if (a.sick && a.b.kind !== "sick") startB(a, "sick");
    else if (!a.sick && a.b.kind === "sick") startB(a, "look");
    else if (!a.sick && a.b.kind !== "eat" && a.b.kind !== "dart" && livePellets().length) {
      if (!a.noticeAt) a.noticeAt = clock + rnd(a.pers.notice[0], a.pers.notice[1]);
      else if (clock > a.noticeAt) { if (home) { if (a.b.ph < 4) { a.b.ph = 4; a.sleep = false; } } else { a.noticeAt = 0; startB(a, "eat"); } }
    }
    if (a.joinAt && clock > a.joinAt) {
      a.joinAt = 0;
      const o = other(a);
      if (housing(o) && o.b.ph === 3 && !a.sick && !housing(a) && a.b.kind !== "eat" && a.b.kind !== "dart") startB(a, "house");
    }
    if (B[a.b.kind].tick(a, dt)) choose(a);
    if (a.b.kind === "none") choose(a);
    // the other one turns to look when it's being inspected
    if (a.attn && clock < a.attn.until && a.attn.by.b.kind === "inspect") {
      const hd = headPos(a.attn.by);
      if (!a.look) a.look = hd;
      if ((a.mode === "hover" || a.mode === "rest") && dist(a.p, hd) < 34 && !a.sick) a.face = yawTo(a.p, hd);
    }
    // idle glances: the other axolotl, you, the plants, a passing bubble
    a.glanceT -= dt;
    if (a.glanceT <= 0) {
      a.glanceT = a.b.kind === "look" ? rnd(0.6, 1.3) : rnd(1.5, 4.5);
      const o = other(a), r = Math.random();
      a.glance = r < 0.3 * (0.5 + a.pers.social) && dist(a.p, o.p) < 90 ? { at: headPos(o), until: clock + rnd(0.8, 1.8) }
        : r < 0.5 && a.pers.curious > 0.6 ? { at: V(a.p.x + rnd(-20, 20), a.p.y - 5, -50), until: clock + rnd(0.8, 1.6) }
        : r < 0.85 ? { at: lin(a.p, 1, a.F, 20, a.L, rnd(-20, 20), V(0, 1, 0), rnd(-10, 12)), until: clock + rnd(0.6, 1.4) } : null;
    }
    if (!a.look && a.glance && clock < a.glance.until && a.thrust < 0.5) a.look = a.glance.at;
  };

  /* ---------- moving: steering, burst-and-glide swimming, the spine ---------- */
  const GLIDE = 0.85;
  const move = (a, dt) => {
    const p = a.p, g = a.goal;
    let dx = 0, dy = 0, dz = 0, d = 0;
    if (g) { dx = g.x - p.x; dy = g.y - p.y; dz = g.z - p.z; d = Math.hypot(dx, dy, dz); }
    const gy = ground(p.x, p.z) - a.clear;
    a.onFloor = p.y >= gy - 1.2;
    const flat = a.mode === "walk" || a.mode === "rest";
    let ux, uy, uz;
    if (d > 0.5) { ux = dx / d; uy = dy / d; uz = dz / d; } else { ux = a.F.x; uy = 0; uz = a.F.z; }
    if (a.align && d < 10) { const k = 1 - d / 10; ux = lerp(ux, a.align.x, k); uy = lerp(uy, a.align.y, k); uz = lerp(uz, a.align.z, k); }
    // look ahead and turn away from the glass before getting there
    const la = 8 + a.speed * 0.9, ax = p.x + a.F.x * la, ay = p.y + a.F.y * la, az = p.z + a.F.z * la, M = 22;
    if (ax < M) ux += ((M - ax) / M) * 1.6;
    if (ax > WW - M) ux -= ((ax - WW + M) / M) * 1.6;
    if (az < 18) uz += ((18 - az) / 18) * 1.6;
    if (az > D - 12) uz -= ((az - D + 12) / 12) * 1.6;
    if (ay < SURF + 10) uy += (SURF + 10 - ay) / 10;
    const home = housing(a);
    if (house && !home && inHouseBox(V(ax, ay, az), 6)) { uy -= 1.4; ux += Math.sign(ax - house.x || 1) * 0.5; }
    // give the other one room (less when they're meant to be close)
    const o = other(a);
    for (let k = 0; k < NSEG && !(home && housing(o)); k += 3) {
      const q = o.pts[k]; if (!q) break;
      const ex = p.x - q.x, ey = p.y - q.y, ez = p.z - q.z, e = Math.hypot(ex, ey, ez) || 1;
      const min = (k < 7 ? 12 : 8) * ((a.size + o.size) / 2) * (a.b.o === o || o.b.o === a ? 0.95 : 1);
      if (e < min) {
        const f = (min - e) / min;
        ux += (ex / e) * f * 2; uy += (ey / e) * f; uz += (ez / e) * f * 2;
        p.x += (ex / e) * f * 7 * dt; p.y += (ey / e) * f * 4 * dt; p.z += (ez / e) * f * 7 * dt;
      }
    }
    let wantYaw = Math.atan2(uz, ux);
    let wantPitch = flat ? 0 : clamp(Math.atan2(-uy, Math.hypot(ux, uz)), -0.6, 0.6);
    if (a.onFloor && wantPitch < 0) wantPitch = 0;
    if (a.face != null && (!g || d < a.arrive + 4)) wantYaw = a.face;
    else if (d < 1.5 && a.face == null) wantYaw = a.yaw;
    if ((a.mode === "hover" || a.mode === "rest" || a.mode === "sink") && d < a.arrive + 2) wantPitch = a.mode === "sink" ? -0.08 : 0;
    const err = wrapA(wantYaw - a.yaw), maxW = 0.9 + 0.055 * a.speed;
    a.yawV += (err * 5.5 - a.yawV * 4.2) * dt; a.yawV = clamp(a.yawV, -maxW, maxW);
    a.yaw = wrapA(a.yaw + a.yawV * dt);
    a.pitchV += ((wantPitch - a.pitch) * 6 - a.pitchV * 5) * dt;
    a.pitch = clamp(a.pitch + a.pitchV * dt, -0.65, 0.65);

    const turnSlow = 1 - 0.5 * Math.min(1, Math.abs(err) / 1.8);
    let thrustT = 0; a.brake = 0; a.creep = 0;
    if (a.mode === "swim") {
      const vt = a.vs * turnSlow, stop = a.speed / GLIDE;
      if (a.burst > 0) {
        a.burst -= dt; a.speed += (Math.max(vt * 1.3, 6) - a.speed) * damp(3.2, dt); thrustT = 1; a.exert = Math.min(1, a.exert + dt * 0.25);
        if (stop > d + 2 && d < 30) a.burst = 0;
      } else {
        a.speed *= Math.exp(-GLIDE * dt); thrustT = 0.06;
        if (d > a.arrive && a.speed < vt * 0.8 && stop < d - 2) a.burst = rnd(0.45, 0.85) * clamp(vt / 16, 0.6, 1.3);
        if (stop > d + 5) { a.speed *= Math.exp(-2 * dt); a.brake = 1; }
        if (d < a.arrive + 6 && d > 0.8) { a.speed = Math.max(a.speed, Math.min(5, d * 0.8) * turnSlow); a.creep = 1; }
      }
    } else if (a.mode === "walk") {
      const vt = a.vs * turnSlow * sm(d / 6);
      a.speed += (vt - a.speed) * damp(2.4, dt); thrustT = 0.12;
    } else {
      const vt = g && d > a.arrive ? Math.min(5, d * 0.6) * turnSlow : 0;
      a.speed += (vt - a.speed) * damp(a.speed > vt ? 1.8 : 2.5, dt);
      if (vt > 0) a.creep = 1;
    }
    if (a.lunge > 0) { a.lunge -= dt; a.speed += 30 * dt; }
    a.thrust += (thrustT - a.thrust) * damp(a.burst > 0 ? 9 : 3, dt);
    a.exert = Math.max(0, a.exert - dt * 0.05);
    setFrame(a);

    let vyT = 0;
    if (a.mode === "sink") vyT = 4.5;
    else if (a.mode === "hover") vyT = (g ? clamp((g.y - p.y) * 0.5, -4, 4) : 0) + Math.sin(clock * 1.1 + a.seed) * 0.9;
    else if (a.mode === "swim" && a.burst <= 0 && a.speed < 8) vyT = 1.2;
    else if (flat && !a.onFloor) vyT = g ? clamp((g.y - p.y) * 0.6, -3, 5) : 3;
    a.vy += (vyT - a.vy) * damp(1.6, dt);
    p.x += a.F.x * a.speed * dt; p.y += a.F.y * a.speed * dt + a.vy * dt; p.z += a.F.z * a.speed * dt;
    const gy2 = ground(p.x, p.z) - a.clear;
    if (flat && a.onFloor) p.y += clamp((gy2 - p.y) * damp(8, dt), -18 * dt, 18 * dt);
    // climb onto a rock smoothly instead of snapping up its edge
    if (p.y > gy2) { p.y = Math.max(gy2, p.y - 18 * dt); if (a.vy > 0) a.vy = 0; }
    if (p.y < SURF + 6) { p.y = SURF + 6; a.vy = Math.max(0, a.vy); }
    // keep the snout inside the glass too
    const sn = 13 * a.size, sx = p.x + a.F.x * sn, sz = p.z + a.F.z * sn;
    if (sx < 3) p.x += 3 - sx;
    if (sx > WW - 3) p.x -= sx - (WW - 3);
    if (sz < 2) p.z += 2 - sz;
    if (sz > D - 2) p.z -= sz - (D - 2);
    p.x = clamp(p.x, 6, WW - 6); p.z = clamp(p.z, 4, D - 4);
    if (house) {
      if (home) { if (p.z > house.zf - 3) { p.x = clamp(p.x, house.x0 + 7, house.x1 - 7); p.y = Math.max(p.y, house.top + 8); } p.z = Math.min(p.z, house.zb - 7); }
      else if (inHouseBox(p, 2)) p.y = Math.max(roofY(p.x) - 5, p.y - 30 * dt);
    }

    // spine: each point follows the one in front, stiff in the trunk and loose in the tail
    const pts = a.pts, resting = a.mode === "rest" && a.onFloor;
    a.curl += ((resting ? a.curlT : 0) - a.curl) * damp(0.8, dt);
    pts[0] = cp(p);
    let prev = mul(a.F, -1), side = a.L;
    for (let i = 1; i < NSEG; i++) {
      const q = pts[i], o0 = pts[i - 1];
      let dir = sub(q, o0); const l = len(dir);
      dir = l < 1e-4 ? prev : mul(dir, 1 / l);
      const k = Math.min(1, damp(i < 7 ? 14 : i < 11 ? 5 : 2.2, dt) * (i === 1 ? 2 : 1));
      dir = norm(lin(dir, 1 - k, prev, k));
      if (i > 6) {
        dir.y += (1 - a.thrust) * 0.9 * dt * (a.onFloor ? 2 : 0.6);
        if (a.curl) { const lt = (side = sidePerp(dir, side)); dir.x += lt.x * a.curl * 0.9 * dt; dir.z += lt.z * a.curl * 0.9 * dt; }
        dir = norm(dir);
      }
      // joints only bend so far, so the body never folds or kinks
      const lim = i < 7 ? 0.3 : 0.42, c = dot(dir, prev);
      if (c < Math.cos(lim)) { const perp = norm(madd(dir, prev, -c)); dir = norm(lin(prev, Math.cos(lim), perp, Math.sin(lim))); }
      const n = madd(o0, dir, SEG * a.size);
      n.x = clamp(n.x, 3, WW - 3); n.z = clamp(n.z, 3, D - 3);
      n.y = clamp(n.y, SURF + 2, ground(n.x, n.z) - RAD[i] * a.size * 0.85);
      if (house) {
        if (home) { if (n.z > house.zf - 1) { n.x = clamp(n.x, house.x0 + 3, house.x1 - 3); n.z = Math.min(n.z, house.zb - 3); n.y = Math.max(n.y, house.top + RAD[i] * a.size + 2); } }
        else if (inHouseBox(n)) n.y = Math.min(n.y, roofY(n.x) - RAD[i] * a.size * 0.85);
      }
      pts[i] = n;
      prev = norm(sub(n, o0));
    }

    // secondary motion
    a.beat += dt * TAU * (0.35 + 2.3 * a.thrust);
    const ampT = (a.sleep ? 0.35 : 1) * (0.5 + 5 * a.thrust + Math.min(1.5, Math.abs(a.yawV) * 1.2)) * (resting ? 0.45 : 1) * (a.sick ? 0.4 : 1);
    a.amp += (ampT - a.amp) * damp(4, dt);
    const walking = a.onFloor && a.speed > 0.4 && a.thrust < 0.4;
    a.walkAmp += ((walking ? clamp(a.speed / 6, 0, 1) : 0) - a.walkAmp) * damp(4, dt);
    a.gait += (walking ? (a.speed * dt) / (3.2 * a.size) : 0) * PI;
    a.pad += dt * TAU * (a.creep || a.mode === "hover" ? 0.9 : 0.45);
    a.flare += (a.flareT - a.flare) * damp(2, dt);
    a.gp += dt * TAU * (a.sleep ? 0.45 : 1) * ((a.sick ? 0.3 : 0.5) + 0.45 * a.flare + 0.4 * a.exert);
    a.gulp = Math.max(0, a.gulp - dt * 2.6);
    const tuckT = a.burst > 0 ? 1 : !a.onFloor && a.mode === "swim" && !a.creep ? clamp((a.speed - 7) / 8, 0, 1) : 0;
    const floorT = clamp(1 - (gy2 - p.y) / 6, 0, 1);
    a.wTuck += (tuckT - a.wTuck) * damp(5, dt);
    a.wFloor += (floorT - a.wFloor) * damp(4, dt);
    a.wBrake += (a.brake - a.wBrake) * damp(4, dt);
    // little leg adjustments while still
    a.legT -= dt;
    if (a.legT <= 0) { a.legT = rnd(2.5, 6); const l = pick(a.legs); l.lift = 1; l.tF = rnd(-1, 1) * a.size; l.tL = rnd(-0.8, 0.8) * a.size; }
    for (const l of a.legs) { l.lift = Math.max(0, l.lift - dt * 2.2); if (l.lift < 0.5 && l.tF != null) { l.adjF += (l.tF - l.adjF) * damp(8, dt); l.adjL += (l.tL - l.adjL) * damp(8, dt); } }
    // head
    let ty = 0, tp = 0;
    if (a.look) {
      const v = sub(a.look, headPos(a)), fx = dot(v, a.F), lx = dot(v, a.L), ux2 = dot(v, a.U);
      ty = clamp(Math.atan2(lx, Math.max(fx, 2)), -0.8, 0.8);
      tp = clamp(Math.atan2(ux2, Math.hypot(fx, lx)), -0.45, 0.4);
    }
    const calm = 1 - a.thrust * 0.8;
    a.lookYaw += (ty * calm - a.lookYaw) * damp(4, dt);
    a.lookPitch += (tp * calm + (a.sick ? -0.15 : 0) - a.lookPitch) * damp(4, dt);
    // the odd bubble: after a gulp of air, and now and then while resting
    if (a.bubbleAt && clock > a.bubbleAt) { a.bubbleAt = 0; const m = mouthPos(a); for (let k = 0; k < 2; k++) bubbles.push({ x: m.x - a.F.x * 8, y: m.y - 3, z: m.z, r: rnd(1, 1.8), vy: rnd(14, 20), ph: rnd(0, TAU), t: -k * 0.25 }); }
    if (resting && Math.random() < dt / 40) a.bubbleAt = clock + 0.1;
  };

  /* ---------- food ---------- */
  let pellets = [], pinch = 0, counted = new Set();
  const today = () => new Date().toDateString();
  const fedGet = () => { const [d, n] = (store.get("homelab-axolotl-fed") || "").split("|"); return d === today() ? +n || 0 : 0; };
  const showFed = () => { if (!fedEl) return; const n = fedGet(); fedEl.textContent = n ? `fed ${n}× today` : ""; };
  const ate = (id) => { if (counted.has(id)) return; counted.add(id); store.set("homelab-axolotl-fed", `${today()}|${fedGet() + 1}`); showFed(); };
  showFed();
  const stepFood = (dt) => {
    pellets = pellets.filter((p) => {
      if (p.gone) return false;
      const gy = inHouseBox(V(p.x, 1e4, p.z)) ? roofY(p.x) - 1 : ground(p.x, p.z) - 1;
      if (!p.landed) { p.ph += dt * 2.3; p.y += p.vy * dt; p.x += Math.sin(p.ph) * 2.5 * dt + current(p.x, p.y, clock) * 0.8 * dt; if (p.y >= gy) { p.y = gy; p.landed = clock; } }
      return !(p.landed && clock - p.landed > 30);
    });
  };

  /* ---------- scenery ---------- */
  let plants = [], bubbles = [], motes = [], caustics = [], rays = [], bubbler = { on: false, t: 3 };
  let cv, ctx, dpr = 1, k = 1, bg = null, vign = null, moss = null, rockImgs = [], blob = null, cw = 0, ch = 0;
  const offscreen = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  const buildScene = () => {
    const R = seeded(1234);
    const rr = (a, b) => a + R() * (b - a);
    rocks = [
      { x: WW * 0.7, z: 50, rx: 30, rz: 19, h: 17, seed: 3, tone: ["#9a9c9c", "#6a6e70", "#3e4245"] },
      { x: WW * 0.16, z: 90, rx: 21, rz: 12, h: 31, seed: 7, tone: ["#8d8a80", "#5e5c55", "#36352f"] },
      { x: WW * 0.44, z: 22, rx: 7, rz: 5, h: 5, seed: 11, tone: ["#a49a8a", "#766d5f", "#4a443b"] },
    ];
    for (const r of rocks) r.base = sandY(r.x, r.z) + 1.5;
    {
      const w = 74, d = 36, x = WW * 0.45, z = 80;
      house = { x, z, w, d, wall: 28, peak: 16, x0: x - w / 2, x1: x + w / 2, zf: z - d / 2, zb: z + d / 2, door: 21 };
      house.base = sandY(x, house.zf) + 1.5; house.top = house.base - house.wall; house.ridge = house.top - house.peak;
      const cx = x + 15, cz = house.zb - 7;
      house.chim = V(cx, roofY(cx) - 10, cz);
    }
    const vallis = (x, z, n, h0, h1, w, col, col2) => {
      const blades = [];
      for (let i = 0; i < n; i++) blades.push({ dx: rr(-6, 6), h: rr(h0, h1), w: w * rr(0.8, 1.15), ph: rr(0, TAU), lean: rr(-0.25, 0.25), tw: rr(1.2, 2.6), push: 0, pv: 0, col: R() < 0.5 ? col : col2 });
      return { kind: "vallis", x, z, blades };
    };
    plants = [
      vallis(0, 104, 0, 0, 0, 0, "", ""),
      vallis(WW * 0.07, 66, 7, 90, 150, 3.2, "#3f9a57", "#4fae64"),
      vallis(WW * 0.92, 80, 6, 85, 130, 3.0, "#3a8f50", "#47a35c"),
      vallis(WW * 0.37, 60, 7, 12, 22, 1.6, "#5cb867", "#4ea95a"),
      vallis(WW * 0.56, 30, 6, 10, 18, 1.5, "#62bd6c", "#52ad5e"),
      vallis(WW * 0.86, 36, 5, 11, 20, 1.5, "#5cb867", "#4ea95a"),
      vallis(WW * 0.985, 5, 4, 70, 108, 3.6, "#3c9152", "#4aa660"),
      { kind: "anubias", x: rocks[1].x, z: rocks[1].z - 2, leaves: [-0.9, -0.45, 0.05, 0.5, 0.95].map((ang) => ({ ang: ang + rr(-0.1, 0.1), len: rr(13, 18), wid: rr(5, 6.5), ph: rr(0, TAU) })) },
      { kind: "moss", x: WW * 0.13, z: 14, r: 8.5 },
    ];
    // the back row: lots of tall, dim blades along the back wall
    const back = plants[0];
    for (let x = 6; x < WW - 4; x += rr(6, 11)) back.blades.push({ dx: x, h: rr(45, 115), w: rr(2.4, 3.4), ph: rr(0, TAU), lean: rr(-0.2, 0.2), tw: rr(1.2, 2.4), push: 0, pv: 0, col: R() < 0.5 ? "#2b6f4c" : "#327a52" });
    motes = Array.from({ length: 34 }, () => ({ x: rr(0, WW), y: rr(SURF, 185), z: rr(0, D), r: rr(0.4, 1.1), a: rr(0.15, 0.45), ph: rr(0, TAU) }));
    caustics = Array.from({ length: 16 }, () => ({ x: rr(0, WW), z: rr(0, D), r: rr(10, 22), ph: rr(0, TAU), sp: rr(0.15, 0.35) }));
    rays = [0.18, 0.46, 0.74].map((f) => ({ x: WW * f, w: rr(16, 26), ph: rr(0, TAU) }));
  };

  const paintBg = () => {
    bg = offscreen(cw * dpr, ch * dpr);
    const g = bg.getContext("2d"), R = seeded(99), rr = (a, b) => a + R() * (b - a);
    g.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    let gr = g.createLinearGradient(0, 0, 0, WH);
    gr.addColorStop(0, "#4b9fae"); gr.addColorStop(0.4, "#27707f"); gr.addColorStop(1, "#14404f");
    g.fillStyle = gr; g.fillRect(0, 0, WW, WH);
    // back wall and side walls
    const bl = proj(V(0, SURF, D)), br = proj(V(WW, SURF, D)), bbl = proj(V(0, sandY(0, D), D)), bbr = proj(V(WW, sandY(WW, D), D));
    gr = g.createLinearGradient(0, bl[1], 0, bbl[1]);
    gr.addColorStop(0, "rgba(22,82,98,.55)"); gr.addColorStop(1, "rgba(12,48,60,.75)");
    g.fillStyle = gr; g.fillRect(bl[0], bl[1], br[0] - bl[0], bbl[1] - bl[1]);
    g.fillStyle = "rgba(4,22,32,.22)";
    g.beginPath(); g.moveTo(0, SURF); g.lineTo(bl[0], bl[1]); g.lineTo(bbl[0], bbl[1]); g.lineTo(0, sandY(0, 0)); g.fill();
    g.beginPath(); g.moveTo(WW, SURF); g.lineTo(br[0], br[1]); g.lineTo(bbr[0], bbr[1]); g.lineTo(WW, sandY(WW, 0)); g.fill();
    g.strokeStyle = "rgba(190,235,240,.10)"; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(bl[0], bl[1]); g.lineTo(bbl[0], bbl[1]); g.moveTo(br[0], br[1]); g.lineTo(bbr[0], bbr[1]); g.stroke();
    // the underside of the water surface, and air above the front water line
    g.beginPath(); g.moveTo(0, SURF);
    for (let x = 0; x <= WW; x += 8) g.lineTo(x, SURF);
    for (let x = WW; x >= 0; x -= 8) { const q = proj(V(x, SURF, D)); g.lineTo(q[0], q[1]); }
    g.lineTo(0, SURF);
    gr = g.createLinearGradient(0, SURF, 0, bl[1]); gr.addColorStop(0, "rgba(170,225,230,.45)"); gr.addColorStop(1, "rgba(120,190,200,.12)");
    g.fillStyle = gr; g.fill();
    gr = g.createLinearGradient(0, 0, 0, SURF); gr.addColorStop(0, "rgba(10,30,38,.55)"); gr.addColorStop(1, "rgba(150,200,205,.25)");
    g.fillStyle = gr; g.fillRect(0, 0, WW, SURF);
    g.fillStyle = "rgba(220,250,250,.55)"; g.fillRect(0, SURF - 0.6, WW, 0.9);
    // sand plane
    g.beginPath();
    for (let x = 0; x <= WW; x += 4) g.lineTo(x, sandY(x, 0));
    for (let x = WW; x >= 0; x -= 4) { const q = proj(V(x, sandY(x, D), D)); g.lineTo(q[0], q[1]); }
    g.closePath();
    gr = g.createLinearGradient(0, bbl[1], 0, 184); gr.addColorStop(0, "#9c8e74"); gr.addColorStop(1, "#d8c197");
    g.fillStyle = gr; g.fill();
    const specks = ["#ead8b0", "#b5976a", "#8f7752", "#f4e8cc", "#6f5e45", "#c9b28a"];
    for (let i = 0; i < 1100; i++) {
      const x = rr(0, WW), z = rr(0, D), q = proj(V(x, sandY(x, z), z));
      g.globalAlpha = rr(0.35, 0.85) * (0.55 + 0.45 * q[2]); g.fillStyle = specks[(R() * specks.length) | 0];
      g.fillRect(q[0], q[1], rr(0.5, 1.3) * q[2], rr(0.4, 0.9) * q[2]);
    }
    const pebbles = Array.from({ length: 80 }, () => ({ x: rr(0, WW), z: rr(0, D), r: rr(1, 3), c: ["#8d8a86", "#a39a8c", "#6f6b66", "#b5aa98", "#7a6e60"][(R() * 5) | 0] })).sort((a, b) => b.z - a.z);
    for (const pb of pebbles) {
      const q = proj(V(pb.x, sandY(pb.x, pb.z), pb.z)), r = pb.r * q[2];
      g.globalAlpha = 0.45; g.fillStyle = "#3d3326"; g.beginPath(); g.ellipse(q[0] + 0.3, q[1] + 0.4, r * 1.1, r * 0.45, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.95; g.fillStyle = pb.c; g.beginPath(); g.ellipse(q[0], q[1] - r * 0.25, r, r * 0.6, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.35; g.fillStyle = "#fff"; g.beginPath(); g.ellipse(q[0] - r * 0.25, q[1] - r * 0.5, r * 0.4, r * 0.2, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // the substrate seen through the front glass
    g.beginPath(); g.moveTo(0, WH);
    for (let x = 0; x <= WW; x += 4) g.lineTo(x, sandY(x, 0));
    g.lineTo(WW, WH); g.closePath();
    gr = g.createLinearGradient(0, 178, 0, WH); gr.addColorStop(0, "#b89b6c"); gr.addColorStop(0.5, "#8e7450"); gr.addColorStop(1, "#5a4630");
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 260; i++) {
      const x = rr(0, WW), y = rr(178, WH), r = rr(0.6, 2.4);
      g.globalAlpha = rr(0.4, 0.9); g.fillStyle = ["#d9c39a", "#a68a5d", "#7a6243", "#c7b79b", "#5f4e38", "#9a948a"][(R() * 6) | 0];
      g.beginPath(); g.ellipse(x, y, r, r * rr(0.55, 0.85), rr(0, PI), 0, TAU); g.fill();
    }
    g.restore(); g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,240,210,.35)"; g.lineWidth = 0.6; g.beginPath();
    for (let x = 0; x <= WW; x += 4) g.lineTo(x, sandY(x, 0));
    g.stroke();

    // vignette
    vign = offscreen(cw * dpr, ch * dpr);
    const v = vign.getContext("2d");
    v.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    const vg = v.createRadialGradient(WW / 2, WH * 0.45, WH * 0.35, WW / 2, WH * 0.5, Math.max(WW, WH) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,12,20,.42)");
    v.fillStyle = vg; v.fillRect(0, 0, WW, WH);

    // soft light blob (caustics, shadows)
    blob = offscreen(64, 64);
    const bgc = blob.getContext("2d"), bgr = bgc.createRadialGradient(32, 32, 0, 32, 32, 32);
    bgr.addColorStop(0, "rgba(255,255,255,1)"); bgr.addColorStop(1, "rgba(255,255,255,0)");
    bgc.fillStyle = bgr; bgc.fillRect(0, 0, 64, 64);

    // rocks, each pre-drawn into its own sprite so it can be sorted by depth
    rockImgs = rocks.map((r) => {
      const top = [], bot = [], N = 30;
      for (let i = 0; i <= N; i++) {
        const u = -1 + (2 * i) / N, x = r.x + u * r.rx * 0.999, sq = Math.sqrt(Math.max(0, 1 - u * u));
        const zf = r.z - r.rz * sq;
        bot.push(proj(V(x, sandY(x, zf) + 1.2, zf)));
        let best = null;
        for (let j = 0; j <= 12; j++) { const zz = r.z + (-1 + j / 6) * r.rz * sq, q = proj(V(x, ground(x, zz), zz)); if (!best || q[1] < best[1]) best = q; }
        top.push(best);
      }
      const xs = [...top, ...bot].map((q) => q[0]), ys = [...top, ...bot].map((q) => q[1]);
      const bx = Math.min(...xs) - 2, by = Math.min(...ys) - 2, bw = Math.max(...xs) - bx + 2, bh = Math.max(...ys) - by + 3;
      const c = offscreen(bw * k * dpr, bh * k * dpr), g2 = c.getContext("2d");
      g2.setTransform(k * dpr, 0, 0, k * dpr, -bx * k * dpr, -by * k * dpr);
      const path = () => { g2.beginPath(); bot.forEach((q, i) => (i ? g2.lineTo(q[0], q[1]) : g2.moveTo(q[0], q[1]))); for (let i = top.length - 1; i >= 0; i--) g2.lineTo(top[i][0], top[i][1]); g2.closePath(); };
      // contact shadow on the sand
      g2.fillStyle = "rgba(40,30,20,.35)"; g2.beginPath(); g2.ellipse((bot[0][0] + bot[N][0]) / 2, bot[N >> 1][1] - 0.5, (bot[N][0] - bot[0][0]) * 0.55, 2.6, 0, 0, TAU); g2.fill();
      path();
      const tg = g2.createLinearGradient(0, by, 0, by + bh); tg.addColorStop(0, r.tone[0]); tg.addColorStop(0.45, r.tone[1]); tg.addColorStop(1, r.tone[2]);
      g2.fillStyle = tg; g2.fill();
      g2.save(); path(); g2.clip();
      const R2 = seeded(r.seed * 31);
      for (let i = 0; i < 90; i++) { g2.globalAlpha = 0.18 + R2() * 0.25; g2.fillStyle = R2() < 0.5 ? "#2b2d2f" : "#c9c6bd"; g2.beginPath(); g2.ellipse(bx + R2() * bw, by + R2() * bh, 0.4 + R2() * 1.3, 0.3 + R2() * 0.7, R2() * PI, 0, TAU); g2.fill(); }
      // lit top face, darker underside
      g2.globalAlpha = 0.35; g2.fillStyle = "#e4ece6"; g2.beginPath();
      top.forEach((q, i) => (i ? g2.lineTo(q[0], q[1]) : g2.moveTo(q[0], q[1])));
      for (let i = N; i >= 0; i--) g2.lineTo(top[i][0], top[i][1] + 2.4 * top[i][2] + 1.2 * Math.sin(i * 0.9));
      g2.fill();
      g2.globalAlpha = 0.3; g2.fillStyle = "#151719"; g2.beginPath();
      bot.forEach((q, i) => (i ? g2.lineTo(q[0], q[1]) : g2.moveTo(q[0], q[1])));
      for (let i = N; i >= 0; i--) g2.lineTo(bot[i][0], bot[i][1] - 4 * bot[i][2]);
      g2.fill();
      g2.restore(); g2.globalAlpha = 1;
      g2.strokeStyle = "rgba(20,22,24,.5)"; g2.lineWidth = 0.5; path(); g2.stroke();
      return { img: c, x: bx, y: by, w: bw, h: bh, key: r.z + r.rz * 0.5 };
    });

    houseImgs = paintHouse();

    // moss ball
    const m = plants.find((p) => p.kind === "moss"), mq = proj(V(m.x, sandY(m.x, m.z) - m.r * 0.85, m.z)), mr = m.r * mq[2];
    moss = { img: offscreen((mr * 2 + 6) * k * dpr, (mr * 2 + 6) * k * dpr), x: mq[0] - mr - 3, y: mq[1] - mr - 3, w: mr * 2 + 6, key: m.z };
    const mg = moss.img.getContext("2d");
    mg.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    const c0 = mr + 3, R3 = seeded(5);
    mg.fillStyle = "rgba(30,40,20,.4)"; mg.beginPath(); mg.ellipse(c0, c0 + mr * 0.95, mr * 1.05, mr * 0.25, 0, 0, TAU); mg.fill();
    const mgr = mg.createRadialGradient(c0 - mr * 0.3, c0 - mr * 0.35, mr * 0.1, c0, c0, mr);
    mgr.addColorStop(0, "#6fae4d"); mgr.addColorStop(0.7, "#3f7a31"); mgr.addColorStop(1, "#28561f");
    mg.fillStyle = mgr; mg.beginPath(); mg.arc(c0, c0, mr, 0, TAU); mg.fill();
    mg.lineWidth = 0.35; mg.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const a = R3() * TAU, rr2 = mr * Math.sqrt(R3()), x = c0 + Math.cos(a) * rr2, y = c0 + Math.sin(a) * rr2, l = 0.6 + R3() * 1.1, b = R3() * TAU;
      mg.strokeStyle = R3() < 0.5 ? "rgba(140,200,100,.55)" : "rgba(30,70,25,.6)";
      mg.beginPath(); mg.moveTo(x, y); mg.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); mg.stroke();
    }
  };

  /* the house is drawn once into two sprites: its dark inside (behind a sleeping axolotl) and its
     front wall and roof (in front of it). Anything inside only shows through the door. */
  const paintHouse = () => {
    const H = house, P = (x, y, z) => proj(V(x, y, z)), R = seeded(77);
    const ez0 = H.zf - 3, ez1 = H.zb + 3, ex0 = H.x0 - 4, ex1 = H.x1 + 4, ey = H.top + 1;
    const pts = [P(ex0, ey, ez0), P(ex1, ey, ez0), P(H.x, H.ridge, ez1), P(H.x, H.ridge - 1, ez0), P(H.x0 - 6, H.base + 3, H.zf - 8), P(H.x1 + 6, H.base + 3, H.zf - 8), P(H.chim.x, H.chim.y - 3, H.chim.z)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const bx = Math.min(...xs) - 4, by = Math.min(...ys) - 4, bw = Math.max(...xs) - bx + 4, bh = Math.max(...ys) - by + 4;
    const sprite = (fn) => { const c = offscreen(bw * k * dpr, bh * k * dpr), g = c.getContext("2d"); g.setTransform(k * dpr, 0, 0, k * dpr, -bx * k * dpr, -by * k * dpr); g.lineCap = g.lineJoin = "round"; fn(g); return { img: c, x: bx, y: by, w: bw, h: bh }; };
    const door = (g) => {
      const r = H.door, yb = H.base, ys2 = yb - 6, z = H.zf;
      let q = P(H.x - r, yb, z); g.moveTo(q[0], q[1]);
      q = P(H.x - r, ys2, z); g.lineTo(q[0], q[1]);
      for (let i = 0; i <= 16; i++) { const t = PI + (PI * i) / 16; q = P(H.x + Math.cos(t) * r, ys2 + Math.sin(t) * r, z); g.lineTo(q[0], q[1]); }
      q = P(H.x + r, yb, z); g.lineTo(q[0], q[1]); g.closePath();
    };
    const inner = sprite((g) => {
      // soft shadow of the house on the sand
      const c = P(H.x, H.base, H.z), cs = c[2];
      g.fillStyle = "rgba(35,26,16,.35)"; g.beginPath(); g.ellipse(c[0], c[1] + 1, (H.w / 2 + 8) * cs, 6 * cs, 0, 0, TAU); g.fill();
      g.save(); g.beginPath(); door(g); g.clip();
      const t = P(H.x, H.base - 30, H.zf), b = P(H.x, H.base, H.zf);
      let gr = g.createLinearGradient(0, t[1], 0, b[1]); gr.addColorStop(0, "#120b07"); gr.addColorStop(1, "#2a1c12");
      g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
      // the floor inside, fading into the dark
      const f0 = P(H.x0, H.base, H.zf), f1 = P(H.x1, H.base, H.zf), f2 = P(H.x1, H.base, H.zb), f3 = P(H.x0, H.base, H.zb);
      gr = g.createLinearGradient(0, f2[1], 0, f0[1]); gr.addColorStop(0, "rgba(70,56,38,0)"); gr.addColorStop(1, "rgba(120,98,66,.85)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(f2[0], f2[1]); g.lineTo(f3[0], f3[1]); g.fill();
      g.restore();
    });
    const outer = sprite((g) => {
      // stepping stones in front of the door
      for (let i = 0; i < 3; i++) { const q = P(H.x + (i - 1) * 7 + R() * 2, sandY(H.x, H.zf - 6 - i * 5) + 0.6, H.zf - 6 - i * 5), r = (3 + R() * 1.2) * q[2]; g.fillStyle = "rgba(40,30,20,.35)"; g.beginPath(); g.ellipse(q[0] + 0.3, q[1] + 0.5, r * 1.05, r * 0.38, 0, 0, TAU); g.fill(); g.fillStyle = ["#b9b2a4", "#a89f8f", "#c5beb0"][i]; g.beginPath(); g.ellipse(q[0], q[1], r, r * 0.34, 0, 0, TAU); g.fill(); }
      // front wall with a gable and the door cut out
      const fw = [P(H.x0, H.base, H.zf), P(H.x0, H.top, H.zf), P(H.x, H.ridge + 1, H.zf), P(H.x1, H.top, H.zf), P(H.x1, H.base, H.zf)];
      const wall = () => { g.beginPath(); fw.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); door(g); };
      let gr = g.createLinearGradient(0, fw[2][1], 0, fw[0][1]); gr.addColorStop(0, "#f1e2c4"); gr.addColorStop(1, "#cdb48e");
      wall(); g.fillStyle = gr; g.fill("evenodd");
      g.save(); wall(); g.clip("evenodd");
      // stones and mortar
      for (let row = 0; row < 9; row++) {
        const y = H.base - 2 - row * 4.4;
        let x = H.x0 - (row % 2) * 4;
        while (x < H.x1) { const w2 = 6 + R() * 4, q0 = P(x + 0.4, y, H.zf), q1 = P(x + w2 - 0.4, y - 3.6, H.zf); g.fillStyle = R() < 0.5 ? "rgba(255,248,230,.35)" : "rgba(120,95,60,.14)"; g.beginPath(); g.roundRect ? g.roundRect(q0[0], q1[1], q1[0] - q0[0], q0[1] - q1[1], 1.2) : g.rect(q0[0], q1[1], q1[0] - q0[0], q0[1] - q1[1]); g.fill(); x += w2; }
      }
      // a little moss creeping up from the sand
      for (let i = 0; i < 26; i++) { const xx = H.x0 + R() * H.w, q = P(xx, H.base - R() * R() * 7, H.zf); if (Math.abs(xx - H.x) < H.door) continue; g.fillStyle = R() < 0.5 ? "rgba(80,140,60,.55)" : "rgba(50,105,45,.55)"; g.beginPath(); g.arc(q[0], q[1], (0.8 + R() * 1.4) * q[2], 0, TAU); g.fill(); }
      g.restore();
      g.strokeStyle = "rgba(90,66,40,.55)"; g.lineWidth = 0.6; wall(); g.stroke();
      // wooden door frame
      g.strokeStyle = "#6b4630"; g.lineWidth = 2.2 * fw[0][2]; g.beginPath(); door(g); g.stroke();
      g.strokeStyle = "rgba(255,220,170,.25)"; g.lineWidth = 0.6; g.beginPath(); door(g); g.stroke();
      // round window in the gable
      const wq = P(H.x, H.top - 4.5, H.zf), wr = 3.4 * wq[2];
      g.fillStyle = "#6b4630"; g.beginPath(); g.arc(wq[0], wq[1], wr + 1, 0, TAU); g.fill();
      g.fillStyle = "#1d2b30"; g.beginPath(); g.arc(wq[0], wq[1], wr, 0, TAU); g.fill();
      g.strokeStyle = "#6b4630"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(wq[0] - wr, wq[1]); g.lineTo(wq[0] + wr, wq[1]); g.moveTo(wq[0], wq[1] - wr); g.lineTo(wq[0], wq[1] + wr); g.stroke();
      g.fillStyle = "rgba(200,240,255,.35)"; g.beginPath(); g.arc(wq[0] - wr * 0.4, wq[1] - wr * 0.4, wr * 0.3, 0, TAU); g.fill();
      // roof: two tiled slopes, seen a little from above
      const slope = (ex, light) => {
        const a0 = P(ex, ey, ez0), a1 = P(H.x, H.ridge, ez0), a2 = P(H.x, H.ridge, ez1), a3 = P(ex, ey, ez1);
        const sg = g.createLinearGradient(a0[0], a0[1], a1[0], a1[1]); sg.addColorStop(0, light ? "#b9583a" : "#9c4630"); sg.addColorStop(1, light ? "#d0704c" : "#b25a3c");
        g.fillStyle = sg; g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.lineTo(a3[0], a3[1]); g.closePath(); g.fill();
        g.strokeStyle = "rgba(70,25,15,.45)"; g.lineWidth = 0.5;
        for (let i = 1; i < 5; i++) { const t = i / 5, b0 = P(lerp(ex, H.x, t), lerp(ey, H.ridge, t), ez0), b1 = P(lerp(ex, H.x, t), lerp(ey, H.ridge, t), ez1); g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke(); }
        // the scalloped front edge of the tiles
        g.fillStyle = light ? "#a64e33" : "#8d3f2a";
        for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 1) / 6, q0 = P(lerp(ex, H.x, t0), lerp(ey, H.ridge, t0), ez0), q1 = P(lerp(ex, H.x, t1), lerp(ey, H.ridge, t1), ez0); g.beginPath(); g.moveTo(q0[0], q0[1]); g.quadraticCurveTo((q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2 + 1.6 * q0[2], q1[0], q1[1]); g.lineTo(q1[0], q1[1] - 1.2); g.lineTo(q0[0], q0[1] - 1.2); g.fill(); }
      };
      slope(ex0, false); slope(ex1, true);
      const r0 = P(H.x, H.ridge, ez0), r1 = P(H.x, H.ridge, ez1);
      g.strokeStyle = "#7c3522"; g.lineWidth = 1.6 * r0[2]; g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
      // moss on the roof edge
      for (let i = 0; i < 18; i++) { const t = R(), ex = R() < 0.5 ? ex0 : ex1, q = P(lerp(ex, H.x, t * 0.35), lerp(ey, H.ridge, t * 0.35), ez0 + R() * 6); g.fillStyle = R() < 0.5 ? "rgba(96,150,70,.7)" : "rgba(60,112,50,.7)"; g.beginPath(); g.arc(q[0], q[1], (0.7 + R()) * q[2], 0, TAU); g.fill(); }
      // chimney
      const c = H.chim, cw2 = 3, cd2 = 2.5, cb = roofY(c.x) + 1;
      const f0 = P(c.x - cw2, cb, c.z - cd2), f1 = P(c.x + cw2, cb, c.z - cd2), f2 = P(c.x + cw2, c.y, c.z - cd2), f3 = P(c.x - cw2, c.y, c.z - cd2);
      g.fillStyle = "#c9b38f"; g.beginPath(); g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(f2[0], f2[1]); g.lineTo(f3[0], f3[1]); g.fill();
      const t0 = P(c.x - cw2, c.y, c.z - cd2), t1 = P(c.x + cw2, c.y, c.z - cd2), t2 = P(c.x + cw2, c.y, c.z + cd2), t3 = P(c.x - cw2, c.y, c.z + cd2);
      g.fillStyle = "#3b2a20"; g.beginPath(); g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]); g.lineTo(t2[0], t2[1]); g.lineTo(t3[0], t3[1]); g.fill();
      g.strokeStyle = "#8e7656"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]); g.lineTo(t2[0], t2[1]); g.lineTo(t3[0], t3[1]); g.closePath(); g.stroke();
    });
    return [inner, outer];
  };

  const drawBlades = (pl) => {
    for (const b of pl.blades) {
      const x0 = pl.kind === "vallis" && pl === plants[0] ? b.dx : pl.x + b.dx;
      const B0 = proj(V(x0, sandY(x0, pl.z) + 1, pl.z)), s = B0[2], H = b.h * s;
      const sway = b.lean + 0.1 * Math.sin(clock * 0.6 + b.ph) + 0.05 * Math.sin(clock * 1.3 + b.ph * 2) + 0.05 * current(x0, 100, clock) + b.push;
      const L = [], Rr = [];
      for (let i = 0; i <= 9; i++) {
        const t = i / 9, cx = B0[0] + sway * H * Math.pow(t, 1.5) * 0.55, cy = B0[1] - H * t * (1 - 0.08 * sway * sway);
        const w = b.w * s * (1 - 0.55 * t) * (0.35 + 0.65 * Math.abs(Math.cos(b.tw * t * PI + b.ph))) * 0.5;
        L.push([cx - w, cy]); Rr.push([cx + w, cy]);
      }
      ctx.fillStyle = b.col;
      ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
      for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
      ctx.fill();
    }
  };
  const pushPlants = (dt) => {
    for (const pl of plants) {
      if (!pl.blades || pl === plants[0]) continue;
      for (const b of pl.blades) {
        const x0 = pl.x + b.dx;
        let f = 0;
        for (const a of axos) {
          if (Math.abs(a.p.z - pl.z) > 14) continue;
          for (let i = 0; i < NSEG; i += 5) { const q = a.pts[i]; if (!q) continue; const dx = q.x - x0, hy = sandY(x0, pl.z) - q.y; if (Math.abs(dx) < 9 && hy > 0 && hy < b.h) f += -Math.sign(dx || 1) * a.speed * 0.004 + (a.F.x * a.speed * 0.003); }
        }
        b.pv += (f - b.push * 5 - b.pv * 2.2) * dt * 4; b.push = clamp(b.push + b.pv * dt, -0.5, 0.5);
      }
    }
  };
  const drawAnubias = (pl) => {
    const r = rocks[1], base = V(pl.x, ground(pl.x, pl.z) + 2, pl.z), B0 = proj(base), s = B0[2];
    for (const lf of pl.leaves) {
      const a = lf.ang + 0.06 * Math.sin(clock * 0.7 + lf.ph) - PI / 2, l = lf.len * s, w = lf.wid * s;
      const px = B0[0] + Math.cos(a) * l * 0.35, py = B0[1] + Math.sin(a) * l * 0.35;
      ctx.strokeStyle = "#2c5c30"; ctx.lineWidth = 0.9 * s; ctx.beginPath(); ctx.moveTo(B0[0], B0[1]); ctx.lineTo(px, py); ctx.stroke();
      const tx = px + Math.cos(a) * l, ty = py + Math.sin(a) * l, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const mx = (px + tx) / 2, my = (py + ty) / 2;
      const gr = ctx.createLinearGradient(px, py, tx, ty); gr.addColorStop(0, "#2a6233"); gr.addColorStop(1, "#3f8446");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty); ctx.quadraticCurveTo(mx - nx, my - ny, px, py); ctx.fill();
      ctx.strokeStyle = "rgba(170,220,150,.35)"; ctx.lineWidth = 0.45 * s; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    }
    void r;
  };

  /* ---------- drawing one axolotl ---------- */
  const projEll = (C, A, Bv, Cv) => {
    const c = proj(C);
    const pa = (v) => { const p1 = proj(madd(C, v, 1)), p2 = proj(madd(C, v, -1)); return [(p1[0] - p2[0]) / 2, (p1[1] - p2[1]) / 2]; };
    const a = pa(A), b = pa(Bv), e = pa(Cv);
    const m11 = a[0] * a[0] + b[0] * b[0] + e[0] * e[0], m22 = a[1] * a[1] + b[1] * b[1] + e[1] * e[1], m12 = a[0] * a[1] + b[0] * b[1] + e[0] * e[1];
    const tr = (m11 + m22) / 2, df = Math.sqrt(((m11 - m22) / 2) ** 2 + m12 * m12);
    return { x: c[0], y: c[1], rx: Math.sqrt(Math.max(0.01, tr + df)), ry: Math.sqrt(Math.max(0.01, tr - df)), rot: 0.5 * Math.atan2(2 * m12, m11 - m22), s: c[2] };
  };
  const ell = (e, grow = 0) => ctx.ellipse(e.x, e.y, e.rx + grow, e.ry + grow, e.rot, 0, TAU);
  const ik = (root, foot, l1, l2, pole) => {
    let d = sub(foot, root), L = len(d);
    const maxL = (l1 + l2) * 0.98;
    if (L > maxL) { foot = madd(root, d, maxL / L); d = sub(foot, root); L = maxL; }
    L = Math.max(L, 0.5);
    const u = mul(d, 1 / L), a1 = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a1 * a1));
    const pp = norm(sub(pole, mul(u, dot(pole, u))));
    return [madd(madd(root, u, a1), pp, h), foot];
  };
  const line2 = (A, Bq) => { ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); };

  const drawAxo = (a) => {
    const P = a.sick ? a.sickPal : a.pal, sz = a.size, n = NSEG;
    const Rp = [], Fd = [], Ld = [], Ud = [], Q = [], rr = [], Uq = [];
    for (let i = 0; i < n; i++) {
      const p = a.pts[i], prv = a.pts[Math.max(0, i - 1)], nxt = a.pts[Math.min(n - 1, i + 1)];
      const f = i === 0 ? a.F : norm(sub(prv, nxt));
      // sideways and up for this segment, kept continuous with last frame so nothing flips for a frame
      const pl = a.pL && a.pL[i], pu = a.pU && a.pU[i];
      const l = sidePerp(f, pl || (i === 0 ? a.L : Ld[i - 1]));
      let u = cross(f, l);
      if (dot(u, pu || a.U) < 0) u = mul(u, -1);
      const env = 0.06 + 0.94 * Math.pow(i / (n - 1), 1.6);
      const w = a.amp * env * Math.sin(a.beat - i * 0.62) + a.walkAmp * 1.5 * Math.sin(a.gait) * Math.cos(i * 0.42 + 0.3) * (i < 10 ? 1 : 0.5);
      const rp = madd(p, l, w * sz);
      rp.x = clamp(rp.x, 2, WW - 2); rp.z = clamp(rp.z, 2, D - 2);
      Rp.push(rp); Fd.push(f); Ld.push(l); Ud.push(u);
      const q = proj(rp); Q.push(q); rr.push(RAD[i] * sz * q[2]);
      const qu = proj(madd(rp, u, 1)); Uq.push([qu[0] - q[0], qu[1] - q[1]]);
    }
    a.Q = Q; a.RR = rr; a.Ld = Ld; a.Fd = Fd; a.pL = Ld; a.pU = Ud;
    const hf = headFrame(a, Rp[0]);
    const nearSide = (vec) => (vec.z < 0 ? 1 : -1);
    const hNear = nearSide(hf.L);
    if (a.F.z > 0.35) a.away = true; else if (a.F.z < 0.15) a.away = false;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    const gills = (sigma) => {
      const { F: Fh, L: Lh, U: Uh } = hf;
      const C1 = lin(hf.N, 1, Fh, 4.2 * sz, Uh, 0.2 * sz);
      const sweep = clamp(a.speed / 40, 0, 0.5), fl = a.sick ? 0.35 : 1;
      const stalks = new Path2D(), filA = new Path2D(), filB = new Path2D();
      let sAvg = 0;
      for (let kq = 0; kq < 3; kq++) {
        const sd = a.seed + kq * 1.7 + (sigma > 0 ? 0 : 3.1), w = [1, 1.13, 0.91][kq];
        const root = lin(C1, 1, Fh, -3.6 * sz, Lh, sigma * (6.3 - kq * 0.5) * sz, Uh, (2.8 - kq * 2.3) * sz);
        let dir = norm(lin(Fh, -0.38, Lh, sigma * 0.78, Uh, 1.2 - kq * 0.95));
        dir = norm(lin(dir, 1, Uh, 0.16 * Math.sin(a.gp * w + sd) * fl - (a.sick ? 0.45 : 0), Fh, -sweep + 0.08 * Math.sin(a.gp * 0.8 * w + sd * 2), Lh, sigma * (a.flare * 0.28 - sweep * 0.3)));
        let bv = sub(mul(Fh, -1), mul(dir, -dot(dir, Fh)));
        bv = len(bv) < 0.05 ? Uh : norm(bv);
        let pv = cross(dir, Fh); pv = len(pv) < 0.05 ? Uh : norm(pv);
        const gl = [13.5, 12.2, 10.4][kq] * sz * (a.sick ? 0.9 : 1);
        const S = (u) => lin(root, 1, dir, gl * u, bv, gl * 0.25 * u * u, Uh, 0.35 * sz * Math.sin(a.gp * 1.7 * w - u * 3 + sd) * u);
        let q0 = proj(root); sAvg += q0[2];
        stalks.moveTo(q0[0], q0[1]);
        for (let j = 1; j <= 7; j++) { const q = proj(S(j / 7)); stalks.lineTo(q[0], q[1]); }
        for (let j = 1; j <= 11; j++) {
          const u = 0.1 + (0.9 * j) / 11, sb = S(u), qb = proj(sb);
          const wig = Math.sin(a.gp * 2.4 + j * 0.9 + kq * 1.3);
          const flen = sz * (1.3 + 3.0 * Math.sin(Math.min(1, u * 1.05) * PI * 0.88)) * (0.85 + 0.15 * a.flare);
          // fringes fan out on both sides of the stalk, so the gills look feathery from the side and from the front
          const d1 = norm(lin(bv, 0.55, pv, 0.6, dir, 0.2, Uh, 0.28 * wig * fl)), d2 = norm(lin(bv, 0.25, pv, -0.65, dir, 0.25, Uh, 0.22 * wig * fl));
          const m1 = proj(madd(sb, d1, flen * 0.5)), e1 = proj(madd(sb, d1, flen)), m2 = proj(madd(sb, d2, flen * 0.35)), e2 = proj(madd(sb, d2, flen * 0.7));
          filA.moveTo(qb[0], qb[1]); filA.lineTo(m1[0], m1[1]); filB.moveTo(m1[0], m1[1]); filB.lineTo(e1[0], e1[1]);
          filA.moveTo(qb[0], qb[1]); filA.lineTo(m2[0], m2[1]); filB.moveTo(m2[0], m2[1]); filB.lineTo(e2[0], e2[1]);
        }
      }
      const s = sAvg / 3;
      ctx.strokeStyle = P.stalk; ctx.lineWidth = 1.5 * s * sz; ctx.stroke(stalks);
      ctx.strokeStyle = P.filA; ctx.lineWidth = 0.7 * s * sz; ctx.stroke(filA);
      ctx.strokeStyle = P.filB; ctx.lineWidth = 0.55 * s * sz; ctx.stroke(filB);
    };

    const legs = (near) => {
      const l1 = 3.8 * sz, l2 = 3.4 * sz;
      for (const lg of a.legs) {
        const i = lg.seg, f = Fd[i], l = Ld[i], u = Ud[i], r = RAD[i] * sz, sg = lg.side;
        if ((nearSide(mul(l, sg)) > 0) !== near) continue;
        const root = lin(Rp[i], 1, l, sg * r * 0.62, u, -r * 0.3), reach = l1 + l2;
        const tuck = lin(root, 1, f, -reach * 0.72, l, sg * 1.8, u, -reach * 0.38);
        const ph = a.pad + (lg.front ? 0 : PI) + (sg > 0 ? 0 : PI), sw = Math.sin(ph) * 0.6;
        const pad = lin(root, 1, f, (sw * 0.6 + (lg.front ? 0.15 : -0.25)) * reach, l, sg * reach * 0.62, u, -reach * 0.45);
        const gph = a.gait + (lg.front ? 0 : PI) + (sg > 0 ? 0 : PI);
        const stride = 2.1 * sz * Math.sin(gph) * clamp(a.walkAmp * 2, 0, 1), lift = Math.max(0, Math.cos(gph)) * 1.6 * sz * clamp(a.walkAmp, 0, 1);
        const fl = lin(root, 1, f, (lg.front ? 1.4 : -1.0) * sz + stride + lg.adjF, l, sg * (4.4 * sz + lg.adjL), u, 0);
        fl.y = ground(fl.x, fl.z) - 0.3 - lift - lg.lift * 1.6 * sz;
        const brk = lin(root, 1, f, reach * 0.5, l, sg * reach * 0.6, u, -reach * 0.3);
        const wF = clamp(a.wFloor, 0, 1), wT = a.wTuck * (1 - wF), wB = a.wBrake * (1 - wF) * (1 - wT), wP = Math.max(0, 1 - wF - wT - wB), ws = wF + wT + wB + wP;
        const foot = lin(fl, wF / ws, tuck, wT / ws, brk, wB / ws, pad, wP / ws);
        const pole = lin(l, sg, u, 0.2, f, lg.front ? -0.7 : 0.7);
        const [knee, ft] = ik(root, foot, l1, l2, pole);
        const planted = norm(lin(f, lg.front ? 0.8 : 0.2, l, sg * 0.8));
        const hd = norm(lin(norm(sub(ft, knee)), 1 - wF, planted, wF));
        let sa = cross(hd, u); sa = len(sa) < 0.05 ? f : norm(sa);
        const nd = lg.front ? 4 : 5, qr = proj(root), qk = proj(knee), qf = proj(ft), s = qr[2];
        const digits = new Path2D();
        for (let m = 0; m < nd; m++) { const dd = norm(lin(hd, 1, sa, (m - (nd - 1) / 2) * 0.5)), e = proj(madd(ft, dd, 1.5 * sz * (m === 0 || m === nd - 1 ? 0.8 : 1))); digits.moveTo(qf[0], qf[1]); digits.lineTo(e[0], e[1]); }
        const limb = new Path2D(); limb.moveTo(qr[0], qr[1]); limb.lineTo(qk[0], qk[1]); limb.lineTo(qf[0], qf[1]);
        ctx.strokeStyle = P.line; ctx.lineWidth = 2.5 * sz * s; ctx.stroke(limb); ctx.lineWidth = 1.05 * sz * s; ctx.stroke(digits);
        ctx.strokeStyle = near ? P.body : P.legFar; ctx.lineWidth = 1.9 * sz * s; ctx.stroke(limb); ctx.lineWidth = 0.6 * sz * s; ctx.stroke(digits);
      }
    };

    const fin = () => {
      const top = [], bot = [];
      for (let i = 1; i < n; i++) top.push(proj(madd(Rp[i], Ud[i], (RAD[i] + FINT[i] * (1 + 0.08 * Math.sin(clock * 3.1 - i * 0.7))) * sz)));
      for (let i = n - 1; i >= 7; i--) bot.push(proj(madd(Rp[i], Ud[i], -(RAD[i] + FINB[i] * (1 + 0.08 * Math.sin(clock * 2.7 - i * 0.6))) * sz)));
      const tip = proj(madd(Rp[n - 1], Fd[n - 1], -1.6 * sz));
      const path = new Path2D();
      path.moveTo(Q[1][0], Q[1][1]);
      for (let i = 0; i < top.length - 1; i++) path.quadraticCurveTo(top[i][0], top[i][1], (top[i][0] + top[i + 1][0]) / 2, (top[i][1] + top[i + 1][1]) / 2);
      path.lineTo(tip[0], tip[1]);
      for (let i = 0; i < bot.length - 1; i++) path.quadraticCurveTo(bot[i][0], bot[i][1], (bot[i][0] + bot[i + 1][0]) / 2, (bot[i][1] + bot[i + 1][1]) / 2);
      for (let i = 7; i >= 1; i--) path.lineTo(Q[i][0], Q[i][1]);
      path.closePath();
      ctx.globalAlpha = P.finA; ctx.fillStyle = P.fin; ctx.fill(path);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = P.finEdge; ctx.lineWidth = 0.45 * Q[8][2]; ctx.stroke(path);
      ctx.globalAlpha = 0.14; ctx.beginPath();
      for (let i = 3; i < n - 1; i += 1) { const t2 = top[i - 1]; line2(Q[i], t2); }
      ctx.stroke(); ctx.globalAlpha = 1;
    };

    const body = () => {
      const seg = (w0, color, off) => {
        ctx.strokeStyle = color;
        for (let i = 0; i < n - 1; i++) {
          const o0 = off ? RAD[i] * sz * off : 0, o1 = off ? RAD[i + 1] * sz * off : 0;
          ctx.lineWidth = w0(i); ctx.beginPath();
          ctx.moveTo(Q[i][0] + Uq[i][0] * o0, Q[i][1] + Uq[i][1] * o0); ctx.lineTo(Q[i + 1][0] + Uq[i + 1][0] * o1, Q[i + 1][1] + Uq[i + 1][1] * o1); ctx.stroke();
        }
      };
      seg((i) => rr[i] + rr[i + 1] + 1.0 * Q[i][2], P.line, 0);
      seg((i) => rr[i] + rr[i + 1], P.body, 0);
      seg((i) => (rr[i] + rr[i + 1]) * 0.5, P.belly, -0.42);
      seg((i) => (rr[i] + rr[i + 1]) * 0.36, P.back, 0.45);
      ctx.globalAlpha = P.shineA; ctx.strokeStyle = P.shine; ctx.lineWidth = rr[3] * 0.22; ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const o = RAD[i] * sz * 0.66, x = Q[i][0] + Uq[i][0] * o, y = Q[i][1] + Uq[i][1] * o; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    };

    const head = () => {
      const { F: Fh, L: Lh, U: Uh, N } = hf;
      const C1 = lin(N, 1, Fh, 4.2 * sz, Uh, 0.2 * sz), C2 = lin(N, 1, Fh, 8.6 * sz, Uh, -0.5 * sz);
      const E1 = projEll(C1, mul(Fh, 7.0 * sz), mul(Lh, 7.4 * sz), mul(Uh, 4.9 * sz)), E2 = projEll(C2, mul(Fh, 4.6 * sz), mul(Lh, 6.2 * sz), mul(Uh, 3.7 * sz));
      const s = E1.s, o = 0.55 * s;
      ctx.fillStyle = P.line; ctx.beginPath(); ell(E1, o); ctx.fill(); ctx.beginPath(); ell(E2, o); ctx.fill();
      ctx.fillStyle = P.body; ctx.beginPath(); ell(E1); ctx.fill(); ctx.beginPath(); ell(E2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ell(E1); ell(E2); ctx.clip("nonzero");
      ctx.globalAlpha = 0.9; ctx.fillStyle = P.belly; ctx.beginPath(); ell(projEll(lin(C2, 1, Uh, -3.4 * sz, Fh, -1.5 * sz), mul(Fh, 7 * sz), mul(Lh, 7 * sz), mul(Uh, 2.4 * sz))); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = P.back; ctx.beginPath(); ell(projEll(lin(C1, 1, Uh, 3.6 * sz, Fh, 0.8 * sz), mul(Fh, 5.6 * sz), mul(Lh, 5 * sz), mul(Uh, 1.8 * sz))); ctx.fill();
      ctx.globalAlpha = P.shineA; ctx.fillStyle = P.shine; ctx.beginPath(); ell(projEll(lin(C1, 1, Uh, 4.3 * sz, Fh, 1.6 * sz, Lh, hNear * 1.6 * sz), mul(Fh, 2.4 * sz), mul(Lh, 1.6 * sz), mul(Uh, 0.6 * sz))); ctx.fill();
      if (P.cheek) for (const sg of [1, -1]) { const c = lin(C2, 1, Lh, sg * 4.6 * sz, Uh, -0.9 * sz, Fh, -0.8 * sz); if (c.z - C2.z > 0.5 * sz) continue; ctx.globalAlpha = P.cheekA; ctx.fillStyle = P.cheek; ctx.beginPath(); ell(projEll(c, mul(Fh, 1.8 * sz), mul(Lh, 1.2 * sz), mul(Uh, 1.2 * sz))); ctx.fill(); }
      if (P.freckle) { ctx.globalAlpha = 0.55; ctx.fillStyle = P.freckle; for (const [ff, ll, uu] of [[2.2, 2.4, 4.4], [0.2, -1.6, 4.7], [4.2, 0.6, 3.7], [-1.6, 3.3, 3.9], [1.2, -3.6, 4.0]]) { const q = proj(lin(C1, 1, Fh, ff * sz, Lh, ll * sz, Uh, uu * sz)); ctx.beginPath(); ctx.arc(q[0], q[1], 0.42 * s * sz, 0, TAU); ctx.fill(); } }
      ctx.restore(); ctx.globalAlpha = 1;
      // the smile, and the mouth opening when it gulps
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = -1 + i / 6, ph = t * 1.25;
        const m = lin(C2, 1, Fh, 4.4 * sz * Math.cos(ph), Lh, 6.0 * sz * Math.sin(ph), Uh, -(0.5 + 0.9 * (1 - t * t)) * sz);
        const nn = norm(lin(Fh, Math.cos(ph) * 0.9, Lh, Math.sin(ph), Uh, -0.2));
        pts.push(nn.z < 0.05 ? proj(m) : null);
      }
      const open = a.gulp > 0 ? Math.sin((1 - a.gulp) * PI) : 0;
      // the smile fades out as the mouth opens into a round "O" for the gulp, and comes back after
      const smileA = clamp(1 - open * 5, 0, 1);
      if (smileA > 0) {
        ctx.globalAlpha = smileA; ctx.strokeStyle = P.mouth; ctx.lineWidth = 0.62 * s * sz; ctx.beginPath();
        let pen = false;
        for (const q of pts) { if (!q) { pen = false; continue; } pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (open > 0.02) {
        const mc = lin(C2, 1, Fh, 4.3 * sz, Uh, -1.2 * sz), me = projEll(mc, mul(Fh, 0.6 * sz), mul(Lh, 2.6 * sz * open), mul(Uh, 1.9 * sz * open));
        ctx.fillStyle = P.inner; ctx.beginPath(); ell(me); ctx.fill();
        ctx.strokeStyle = P.mouth; ctx.lineWidth = 0.5 * s * sz; ctx.beginPath(); ell(me, 0.2 * s); ctx.stroke();
      }
      // eyes: small, black, glossy, and no eyelids
      for (const sg of [1, -1]) {
        const ep = lin(C1, 1, Fh, 2.2 * sz, Lh, sg * 5.6 * sz, Uh, 2.3 * sz), nn = norm(lin(Fh, 0.3, Lh, sg * 0.85, Uh, 0.5)), facing = -nn.z;
        if (facing < -0.12) continue;
        const q = proj(ep), er = 1.45 * sz * q[2], sq = clamp(0.3 + facing, 0.3, 1);
        if (P.ring) { ctx.strokeStyle = P.ring; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.45 * q[2]; ctx.beginPath(); ctx.ellipse(q[0], q[1], er * sq * 1.22, er * 1.22, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.fillStyle = P.eye; ctx.beginPath(); ctx.ellipse(q[0], q[1], er * sq, er, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(q[0] - er * 0.3 * sq, q[1] - er * 0.35, er * 0.36, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(q[0] + er * 0.35 * sq, q[1] + er * 0.32, er * 0.15, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      }
    };

    if (a.away) { gills(-hNear); head(); gills(hNear); legs(false); fin(); body(); legs(true); }
    else { gills(-hNear); legs(false); fin(); body(); legs(true); head(); gills(hNear); }
  };

  const drawShadow = (a) => {
    const m = a.pts[5], t = a.pts[12], h = a.pts[0];
    const gm = ground(m.x, m.z), q = proj(V(m.x, gm, m.z)), qh = proj(V(h.x, ground(h.x, h.z), h.z)), qt = proj(V(t.x, ground(t.x, t.z), t.z));
    const lift = gm - m.y, al = 0.32 * clamp(1 - lift / 110, 0.12, 1), rx = Math.max(8 * q[2], Math.hypot(qh[0] - qt[0], qh[1] - qt[1]) / 2 + 7 * q[2]);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(q[0], q[1]); ctx.rotate(Math.atan2(qh[1] - qt[1], qh[0] - qt[0]) * 0.15);
    ctx.filter = "none"; ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(shadowImg(), -rx, -3.2 * q[2] * (1 + lift / 60), rx * 2, 6.4 * q[2] * (1 + lift / 60));
    ctx.restore();
  };
  let _shadow = null;
  const shadowImg = () => {
    if (_shadow) return _shadow;
    _shadow = offscreen(64, 32); const g = _shadow.getContext("2d"), gr = g.createRadialGradient(32, 16, 0, 32, 16, 32);
    gr.addColorStop(0, "rgba(30,25,15,1)"); gr.addColorStop(1, "rgba(30,25,15,0)"); g.setTransform(1, 0, 0, 0.5, 0, 8); g.fillStyle = gr; g.fillRect(0, -16, 64, 64);
    return _shadow;
  };

  /* ---------- the frame ---------- */
  let clock = 0, alarm = false, downCount = 0, tagsUntil = 0, hovering = false, running = false;
  const stepWorld = (dt) => {
    clock += dt;
    stepFood(dt);
    for (const a of axos) think(a, dt);
    for (const a of axos) move(a, dt);
    pushPlants(dt);
    // bubbles from the air stone at the back, in bursts
    bubbler.t -= dt;
    if (bubbler.t <= 0) { bubbler.on = !bubbler.on; bubbler.t = bubbler.on ? rnd(3, 6) : rnd(5, 11); }
    if (house && axos.some((a) => a.sleep) && Math.random() < dt * 0.9) bubbles.push({ x: house.chim.x + rnd(-0.6, 0.6), y: house.chim.y - 1, z: house.chim.z, r: rnd(0.8, 1.5), vy: rnd(9, 13), ph: rnd(0, TAU), t: 0 });
    if (bubbler.on && Math.random() < dt * 5 && bubbles.length < 30) bubbles.push({ x: WW * 0.885 + rnd(-1, 1), y: sandY(WW * 0.885, 97) - 2, z: 97, r: rnd(0.7, 1.6), vy: rnd(22, 30), ph: rnd(0, TAU), t: 0 });
    bubbles = bubbles.filter((b) => { b.t += dt; if (b.t < 0) return true; b.ph += dt * 6; b.y -= b.vy * dt; b.x += Math.sin(b.ph) * 4 * dt; b.r = Math.min(b.r * (1 + dt * 0.08), 2.6); return b.y > SURF + 1; });
    for (const m of motes) { m.ph += dt * 0.5; m.x += (current(m.x, m.y, clock) * 1.6 + Math.sin(m.ph) * 0.4) * dt; m.y += (0.35 + Math.cos(m.ph * 1.3) * 0.3) * dt; if (m.x < 0) m.x += WW; if (m.x > WW) m.x -= WW; if (m.y > sandY(m.x, m.z) - 1) { m.y = SURF + 4; } }
  };

  const render = () => {
    if (!ctx) return;
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // ripples on the underside of the surface
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(200,245,245,.16)"; ctx.lineWidth = 0.6;
    for (let r = 0; r < 4; r++) {
      const z = 15 + r * 25; ctx.beginPath();
      for (let x = 0; x <= WW; x += 6) { const q = proj(V(x, SURF + 0.8 * Math.sin(x * 0.08 + clock * (1 + r * 0.2) + r), z)); x ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    // caustics on the sand
    for (const c of caustics) {
      const x = c.x + Math.sin(clock * c.sp + c.ph) * 14, z = clamp(c.z + Math.cos(clock * c.sp * 0.8 + c.ph) * 10, 0, D), q = proj(V(x, sandY(x, z), z));
      const a = 0.07 + 0.06 * Math.sin(clock * 1.3 + c.ph * 3), r = c.r * q[2] * (0.8 + 0.2 * Math.sin(clock * 0.9 + c.ph));
      ctx.globalAlpha = Math.max(0, a); ctx.drawImage(blob, q[0] - r, q[1] - r * 0.28, r * 2, r * 0.56);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // everything with depth, back to front
    const items = [];
    items.push({ key: 104, draw: () => drawBlades(plants[0]) });
    items.push({ key: 97, draw: () => drawBubbles((b) => b.z > 60) });
    rockImgs.forEach((r) => items.push({ key: r.key, draw: () => ctx.drawImage(r.img, r.x, r.y, r.w, r.h) }));
    if (houseImgs) { const [hi, ho] = houseImgs; items.push({ key: house.zb + 1, draw: () => ctx.drawImage(hi.img, hi.x, hi.y, hi.w, hi.h) }); items.push({ key: house.zf + 2, draw: () => ctx.drawImage(ho.img, ho.x, ho.y, ho.w, ho.h) }); }
    for (const pl of plants.slice(1)) {
      if (pl.kind === "vallis") items.push({ key: pl.z, draw: () => drawBlades(pl) });
      else if (pl.kind === "anubias") items.push({ key: pl.z - 0.5, draw: () => drawAnubias(pl) });
      else if (pl.kind === "moss") items.push({ key: pl.z, draw: () => ctx.drawImage(moss.img, moss.x, moss.y, moss.w, moss.w) });
    }
    items.push({ key: 75, draw: () => drawMotes((m) => m.z > 55) });
    items.push({ key: 20, draw: () => drawMotes((m) => m.z <= 55) });
    items.push({ key: 12, draw: () => drawBubbles((b) => b.z <= 60) });
    for (const p of pellets) items.push({ key: p.z, draw: () => drawPellet(p) });
    for (const a of axos) {
      if (!a.pts.length) continue;
      let zk = 0; for (const q of a.pts) zk += q.z; zk /= NSEG;
      // inside the house: between its dark inside and its front wall. Over the roof: in front of it.
      if (house && housing(a)) zk = house.zf + 3;
      else if (house && zk > house.zf && zk < house.zb + 3 && Math.abs(a.p.x - house.x) < house.w / 2 + 20) zk = Math.min(zk, house.zf + 1);
      items.push({ key: zk + 0.4, draw: () => drawShadow(a) });
      items.push({ key: zk, draw: () => drawAxo(a) });
    }
    items.sort((x, y) => y.key - x.key);
    for (const it of items) it.draw();

    // light from above
    ctx.globalCompositeOperation = "lighter";
    for (const r of rays) {
      const al = 0.05 + 0.03 * Math.sin(clock * 0.4 + r.ph), sway = Math.sin(clock * 0.13 + r.ph) * 0.06;
      const x0 = r.x, x1 = r.x + 60 + sway * 200, gr = ctx.createLinearGradient(0, SURF, 0, 175);
      gr.addColorStop(0, `rgba(210,250,240,${al})`); gr.addColorStop(1, "rgba(210,250,240,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0 - r.w / 2, SURF); ctx.lineTo(x0 + r.w / 2, SURF); ctx.lineTo(x1 + r.w * 1.3, 175); ctx.lineTo(x1 - r.w * 1.3, 175); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(vign, 0, 0); ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);

    // name tags on hover and after a tap
    if (hovering || clock < tagsUntil) {
      ctx.font = `500 ${9.5 / k}px "Geist Mono", Consolas, monospace`; ctx.textAlign = "center";
      for (const a of axos) {
        const q = proj(lin(a.pts[0], 1, V(0, -1, 0), 16 * a.size)), txt = `${a.label || ""} · ${Math.round(a.cpu)}%`;
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(txt, q[0] + 0.6, q[1] + 0.8);
        ctx.fillStyle = "rgba(235,248,255,.92)"; ctx.fillText(txt, q[0], q[1]);
      }
    }
    // keep it light: if frames get slow, draw at a lower resolution
    const cost = performance.now() - t0;
    perf = perf * 0.95 + cost * 0.05;
    if (perf > 9 && dpr > 1 && !lowRes) { lowRes = true; layout(); }
  };
  let perf = 0, lowRes = false;
  const drawBubbles = (f) => {
    ctx.lineWidth = 0.5;
    for (const b of bubbles) {
      if (b.t < 0 || !f(b)) continue;
      const q = proj(b), r = b.r * q[2];
      ctx.fillStyle = "rgba(220,245,255,.10)"; ctx.strokeStyle = "rgba(225,248,255,.6)";
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(q[0] - r * 0.35, q[1] - r * 0.35, r * 0.28, 0, TAU); ctx.fill();
    }
  };
  const drawMotes = (f) => {
    ctx.fillStyle = "#e6f6ee";
    for (const m of motes) { if (!f(m)) continue; const q = proj(m), r = m.r * q[2]; ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(m.ph * 2)) * q[2]; ctx.fillRect(q[0], q[1], r, r); }
    ctx.globalAlpha = 1;
  };
  const drawPellet = (p) => {
    const q = proj(p), r = 1.5 * q[2], fade = p.landed ? clamp(1 - (clock - p.landed - 26) / 4, 0, 1) : 1;
    ctx.globalAlpha = fade; ctx.fillStyle = "#6b3f1d"; ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 1.15, r, p.ph, 0, TAU); ctx.fill();
    ctx.fillStyle = "#b9763c"; ctx.beginPath(); ctx.ellipse(q[0] - r * 0.15, q[1] - r * 0.15, r * 0.85, r * 0.7, p.ph, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,230,190,.7)"; ctx.beginPath(); ctx.arc(q[0] - r * 0.4, q[1] - r * 0.4, r * 0.25, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  };

  /* ---------- size, start, loop ---------- */
  const layout = () => {
    const w = box.clientWidth || 250, h = box.clientHeight || 190;
    const oldWW = WW;
    cw = w; ch = h; dpr = Math.min(lowRes ? 1 : 2, window.devicePixelRatio || 1);
    k = h / WH; WW = w / k; VX = WW / 2;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx = cv.getContext("2d");
    if (!plants.length || Math.abs(oldWW - WW) > 0.5) buildScene();
    paintBg();
    for (const a of axos) {
      if (!a.pts.length) continue;
      a.p.x = clamp(a.p.x, 20, WW - 20); for (const q of a.pts) q.x = clamp(q.x, 3, WW - 3);
      if (a.b.spot) a.b.spot.x = clamp(a.b.spot.x, 26, WW - 26);
      if (a.b.kind === "rest") { a.b.spot = floorPoint(a, a.b.spot.x, a.b.spot.z); }
      if (a.b.kind === "cruise") a.b.wps = a.b.wps.map((w2) => inside(w2, a));
    }
    if (!running && ctx) render();
  };

  cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.className = "tank-canvas";
  box.prepend(cv);
  layout();

  // start: pink out exploring, black asleep on the flat rock
  {
    const [pk, bk] = axos;
    pk.p = V(WW * 0.3, 110, 40); pk.yaw = 0.3; layBody(pk); startB(pk, "cruise");
    const r = rocks[0];
    bk.p = floorPoint(bk, r.x - 4, r.z); bk.yaw = PI + 0.4; layBody(bk);
    startB(bk, "rest", { spot: cp(bk.p) }); bk.b.settled = true; bk.b.t0 = 0; bk.curlT = 0.8; bk.curl = 0.8;
    for (let i = 0; i < 60; i++) { move(bk, 0.05); }
  }

  let visible = true, raf = 0, last = 0;
  const loop = (t) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    const steps = dt > 0.025 ? 2 : 1;
    for (let i = 0; i < steps; i++) stepWorld(dt / steps);
    render();
    schedule();
  };
  const schedule = () => { running = visible && !document.hidden && !still; if (running && !raf) raf = requestAnimationFrame(loop); if (!running) last = 0; };
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; schedule(); }).observe(box);
  document.addEventListener("visibilitychange", schedule);
  if ("ResizeObserver" in window) new ResizeObserver(() => { if (Math.abs(box.clientWidth - cw) > 0.5 || Math.abs(box.clientHeight - ch) > 0.5) layout(); }).observe(box);
  if (still) { for (let i = 0; i < 400; i++) stepWorld(0.05); render(); }
  schedule();

  /* ---------- taps ---------- */
  const toWorld = (e) => { const r = box.getBoundingClientRect(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
  const hit = (sx, sy) => {
    const order = [...axos].sort((p, q) => p.pts[5].z - q.pts[5].z);
    for (const a of order) { if (!a.Q) continue; for (let i = 0; i < NSEG; i++) if (Math.hypot(a.Q[i][0] - sx, a.Q[i][1] - sy) < a.RR[i] + 4) return a; }
    return null;
  };
  const feed = (sx, sy) => {
    tagsUntil = clock + 3;
    if (still) { ate(++pinch); render(); return; }
    const z = rnd(18, 45), x0 = clamp(unprojX(sx, z), 14, WW - 14), y0 = clamp(unprojY(sy, z), SURF + 2, ground(x0, z) - 6);
    if (livePellets().length >= 9) {
      // they're full: just come and see what the fuss is
      for (const a of axos) if (!a.sick && a.b.kind !== "eat" && !housing(a)) { startB(a, "hover"); a.b.hold = inside(V(x0 + rnd(-15, 15), y0, z), a); a.glance = { at: V(x0, y0, z), until: clock + 3 }; }
      return;
    }
    pinch++;
    for (let i = 0; i < 3; i++) pellets.push({ x: clamp(x0 + rnd(-5, 5), 10, WW - 10), y: y0 + rnd(-3, 3), z: clamp(z + rnd(-6, 6), 8, D - 8), vy: rnd(5, 8), ph: rnd(0, TAU), pinch, landed: 0, gone: false });
  };
  box.addEventListener("click", (e) => {
    const [sx, sy] = toWorld(e), a = hit(sx, sy);
    if (a && housing(a)) { if (a.b.ph < 4) { a.b.ph = 4; a.sleep = false; } tagsUntil = clock + 2; return; }
    if (a && !a.sick && !still) { startB(a, "dart"); tagsUntil = clock + 2; return; }
    feed(sx, sy);
  });
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); feed(rnd(30, WW - 30), rnd(40, 90)); } });
  box.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; });
  box.addEventListener("pointerleave", () => { hovering = false; });

  /* ---------- the page's hooks ---------- */
  const LABEL = (n) => (n === "raspberrypi" ? "Pi 5" : n === "pi2" ? "Pi 4" : n);
  const rank = (n) => (n === "raspberrypi" ? 0 : n === "pi2" ? 1 : 2);
  const paint = () => {
    box.classList.toggle("alarm", alarm);
    const sick = axos.filter((a) => a.sick), busy = Math.max(0, ...axos.map((a) => a.cpu));
    const [b, rest] = sick.length ? ["Lying low:", `${sick.map((a) => a.label).join(", ")} not ready`]
      : alarm ? ["Murky water:", `${downCount} app${downCount === 1 ? "" : "s"} down`]
      : busy >= 70 ? ["Busy:", "axolotls zooming around"]
      : ["Calm water:", "all good"];
    if (moodEl) { moodEl.replaceChildren(); const el = document.createElement("b"); el.textContent = b; moodEl.append(el, document.createTextNode(" " + rest)); }
    box.setAttribute("aria-label", `Axolotl tank: a pink axolotl for the Pi 5 and a black one for the Pi 4. ${b} ${rest}. Press to feed them.`);
    if (still) render();
  };
  const sync = (list) => {
    const order = [...(list || [])].sort((p, q) => rank(p.name) - rank(q.name) || p.name.localeCompare(q.name));
    axos.forEach((a, i) => {
      const n = order[i]; if (!n) return;
      a.name = n.name; a.label = LABEL(n.name); a.cpu = +n.cpu || 0; a.sick = !n.ready;
    });
    paint();
  };
  axos[0].label = "Pi 5"; axos[1].label = "Pi 4";
  sync([{ name: "raspberrypi", ready: true, cpu: 10 }, { name: "pi2", ready: true, cpu: 10 }]);
  window.homelabTank = {
    sync, alarm: (n) => { downCount = n; alarm = n > 0; paint(); },
    // for testing: run the simulation without drawing, and read the state back
    _debug: { axos, start: (i, kind) => startB(axos[i], kind, kind === "inspect" || kind === "follow" || kind === "alongside" ? other(axos[i]) : undefined), step: (sec, dt = 1 / 60, draw = true) => { for (let t = 0; t < sec; t += dt) stepWorld(dt); if (draw) render(); }, world: () => ({ WW, WH, D, SURF, clock }), ground, feed, hit, render, pellets: () => pellets },
  };
})();
