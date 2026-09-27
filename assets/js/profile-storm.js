// Profile photo storm. While idle, sequin shards and small lightning arcs leak out of the
// photo frame. Every visit plays the shatter clip once on its own after the photo has been
// on screen for 3 s; after that, hovering (or clicking/tapping) plays it. The clip holds on
// the second photo and then shatters back to the first.
(function () {
  const root = document.querySelector(".storm-figure");
  if (!root) return;
  const video = root.querySelector("video");
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // The clip is forward shatter + hold + the same shatter reversed (24 fps source).
  const FORWARD = 109 / 24;
  const HOLD = 5; // baked into the clip
  const AUTOPLAY_DELAY = 3000;
  const END = FORWARD + HOLD + FORWARD;
  const STRIKE = 0.42; // the face breaks apart
  const FLASH = 2.4; // brightest cyan flash inside the vortex
  const cues = [
    { t: STRIKE, run: () => burst() },
    { t: FLASH, run: () => strikeArcs(2, 0.7) },
    { t: END - STRIKE - 0.35, run: () => implode(0.35) },
    { t: END - STRIKE, run: () => strikeArcs(3, 1) },
  ];

  // How far effects may spill past each edge. Left borders the text column.
  const MAX_SPILL = { top: 40, right: 36, bottom: 14, left: 10 };
  let spill = { ...MAX_SPILL };
  let frameW = 0;
  let frameH = 0;
  let dpr = 1;

  let state = "idle";
  let primed = false;
  let nextCue = 0;
  let visible = true;
  let rafId = 0;
  let lastTs = 0;
  let nextArcAt = 0;
  let autoTimer = 0;
  let autoDone = false;
  const shards = [];
  const arcs = [];

  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
  const rand = (a, b) => a + (b - a) * Math.random();
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function layout() {
    const rect = root.getBoundingClientRect();
    const pageW = document.documentElement.clientWidth;
    spill = {
      top: MAX_SPILL.top,
      bottom: MAX_SPILL.bottom,
      left: Math.max(0, Math.min(MAX_SPILL.left, rect.left - 4)),
      right: Math.max(0, Math.min(MAX_SPILL.right, pageW - rect.right - 4)),
    };
    frameW = rect.width;
    frameH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = frameW + spill.left + spill.right;
    const h = frameH + spill.top + spill.bottom;
    Object.assign(canvas.style, {
      left: `${-spill.left}px`,
      top: `${-spill.top}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  // A random point on the frame edge, weighted by how much room each side has.
  function edgePoint() {
    const weights = [spill.top * frameW, spill.right * frameH, spill.bottom * frameW, spill.left * frameH];
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let side = 0;
    while (side < 3 && r > weights[side]) r -= weights[side++];
    const x0 = spill.left;
    const y0 = spill.top;
    const u = Math.random();
    if (side === 0) return { x: x0 + u * frameW, y: y0, nx: 0, ny: -1, room: spill.top };
    if (side === 1) return { x: x0 + frameW, y: y0 + u * frameH, nx: 1, ny: 0, room: spill.right };
    if (side === 2) return { x: x0 + u * frameW, y: y0 + frameH, nx: 0, ny: 1, room: spill.bottom };
    return { x: x0, y: y0 + u * frameH, nx: -1, ny: 0, room: spill.left };
  }

  function shardColor(glint) {
    if (glint) return isDark() ? "#e6f8ff" : "#6fd3ff";
    return pick(isDark() ? ["#2f63d8", "#4a86ff", "#7fb2ff", "#a9d2ff"] : ["#0d1f4f", "#1b3a8a", "#2856c7", "#3f7bea"]);
  }

  function spawnShard(p, speed, life, size) {
    const tangent = rand(-0.5, 0.5) * speed;
    const glint = Math.random() < 0.3;
    shards.push({
      x: p.x + p.nx * rand(0, 2),
      y: p.y + p.ny * rand(0, 2),
      vx: p.nx * speed - p.ny * tangent,
      vy: p.ny * speed + p.nx * tangent,
      ox: p.x,
      oy: p.y,
      room: Math.max(p.room, 1),
      rot: rand(0, Math.PI),
      vr: rand(-4, 4),
      size,
      life,
      age: 0,
      glint,
      color: shardColor(glint),
      drag: 1.2,
    });
  }

  // Jagged polyline by midpoint displacement, optionally with one branch.
  function arcPath(x, y, dx, dy, len) {
    let pts = [
      [x, y],
      [x + dx * len, y + dy * len],
    ];
    let jitter = len * 0.35;
    for (let level = 0; level < 3; level++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const off = rand(-jitter, jitter);
        next.push([(ax + bx) / 2 - dy * off, (ay + by) / 2 + dx * off], pts[i]);
      }
      pts = next;
      jitter *= 0.55;
    }
    return pts;
  }

  function spawnArc(intensity) {
    const p = edgePoint();
    if (p.room < 4) return;
    const crawl = Math.random() < 0.3;
    const a = crawl ? rand(-0.35, 0.35) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : rand(-0.8, 0.8);
    const dx = p.nx * Math.cos(a) - p.ny * Math.sin(a);
    const dy = p.ny * Math.cos(a) + p.nx * Math.sin(a);
    const len = crawl ? rand(14, 30) * intensity : Math.min(p.room * rand(0.6, 1), 40) * intensity;
    const paths = [arcPath(p.x, p.y, dx, dy, len)];
    if (Math.random() < 0.45) {
      const main = paths[0];
      const [bx, by] = main[Math.floor(main.length / 2)];
      const b = rand(0.5, 0.9) * (Math.random() < 0.5 ? 1 : -1);
      paths.push(arcPath(bx, by, dx * Math.cos(b) - dy * Math.sin(b), dy * Math.cos(b) + dx * Math.sin(b), len * 0.45));
    }
    // A short charge along the frame edge where the arc leaves it (drawn just outside the clip).
    const run = rand(14, 34) / 2;
    const edge = [
      [p.x + p.ny * run + p.nx, p.y - p.nx * run + p.ny],
      [p.x - p.ny * run + p.nx, p.y + p.nx * run + p.ny],
    ];
    arcs.push({ paths, edge, age: 0, life: rand(0.22, 0.4), seed: Math.random() * 10 });
    for (let i = 0; i < 4; i++) spawnShard(p, rand(18, 40) * intensity, rand(0.6, 1.2), rand(1.2, 2.6));
  }

  function burst() {
    for (let i = 0; i < 70; i++) {
      const p = edgePoint();
      spawnShard(p, rand(40, 120), rand(0.5, 1.2), rand(1.5, 4));
    }
    strikeArcs(5, 1);
  }

  function strikeArcs(n, intensity) {
    for (let i = 0; i < n; i++) spawnArc(intensity);
  }

  // Shards fly in from the edge of the spill zone and vanish into the frame.
  function implode(duration) {
    for (let i = 0; i < 45; i++) {
      const p = edgePoint();
      const d = p.room * rand(0.6, 1);
      spawnShard({ ...p, x: p.x + p.nx * d, y: p.y + p.ny * d, nx: -p.nx, ny: -p.ny }, d / duration, duration, rand(1.5, 3.5));
      shards[shards.length - 1].drag = 0;
    }
  }

  function inFrame(x, y) {
    return x > spill.left && x < spill.left + frameW && y > spill.top && y < spill.top + frameH;
  }

  function step(dt, now) {
    // The resting photo and the held second photo both get the idle sparks.
    const holding = state === "playing" && video.currentTime > FORWARD + 0.3 && video.currentTime < FORWARD + HOLD;
    if (!reduceMotion.matches && (state === "idle" || holding)) {
      if (Math.random() < dt * 7) spawnShard(edgePoint(), rand(6, 20), rand(1.4, 2.8), rand(1.8, 4.2));
      if (now >= nextArcAt) {
        spawnArc(1);
        nextArcAt = now + (Math.random() < 0.35 ? rand(0.08, 0.16) : rand(0.9, 2.6));
      }
    }
    if (state === "playing") {
      const t = video.currentTime;
      while (nextCue < cues.length && t >= cues[nextCue].t) {
        const cue = cues[nextCue++];
        if (t - cue.t < 0.3) cue.run(); // cues missed while scrolled away are skipped
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.age += dt;
      const k = Math.exp(-s.drag * dt);
      s.vx *= k;
      s.vy *= k;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      if (s.age >= s.life) shards.splice(i, 1);
    }
    for (let i = arcs.length - 1; i >= 0; i--) {
      arcs[i].age += dt;
      if (arcs[i].age >= arcs[i].life) arcs.splice(i, 1);
    }
  }

  function draw() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    // Everything draws outside the photo only.
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(spill.left, spill.top, frameW, frameH);
    ctx.clip("evenodd");

    for (const s of shards) {
      if (inFrame(s.x, s.y)) continue;
      const dist = Math.hypot(s.x - s.ox, s.y - s.oy);
      const edgeFade = Math.max(0, 1 - Math.pow(dist / (s.room + 6), 2));
      let alpha = Math.pow(Math.sin((Math.PI * s.age) / s.life), 0.7) * edgeFade;
      if (s.glint) alpha *= 0.6 + 0.4 * Math.sin(s.age * 18);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.glint ? "#4cc3ff" : "transparent";
      ctx.shadowBlur = s.glint ? 6 : 0;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.shadowBlur = 0;

    const dark = isDark();
    for (const a of arcs) {
      // Flicker: a few on/off beats over the arc's short life.
      if (Math.floor(a.age / 0.045 + a.seed) % 3 === 1) continue;
      const fade = 1 - a.age / a.life;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const [pass, width, color, alpha] of [
        [0, 4.5, dark ? "#3fa9ff" : "#57c8ff", 0.35],
        [1, 1.5, dark ? "#eaf8ff" : "#1d5eff", 1],
      ]) {
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = pass ? (dark ? "#7fd4ff" : "#4cc3ff") : "transparent";
        ctx.shadowBlur = pass ? 6 : 0;
        ctx.beginPath();
        ctx.moveTo(a.edge[0][0], a.edge[0][1]);
        ctx.lineTo(a.edge[1][0], a.edge[1][1]);
        ctx.stroke();
        for (const path of a.paths) {
          ctx.beginPath();
          ctx.moveTo(path[0][0], path[0][1]);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    rafId = 0;
    const now = ts / 1000;
    const dt = Math.min(0.05, lastTs ? now - lastTs : 0);
    lastTs = now;
    step(dt, now);
    draw();
    const busy = state === "playing" || shards.length || arcs.length;
    if (visible && !document.hidden && (busy || !reduceMotion.matches)) rafId = requestAnimationFrame(frame);
    else lastTs = 0;
  }

  function wake() {
    if (!rafId && visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  // Reduced motion: no clip, just fade to the second photo for the hold time.
  function crossfade() {
    let still = root.querySelector(".storm-still");
    if (!still) {
      still = document.createElement("img");
      still.className = "storm-still z-depth-1 rounded";
      still.alt = "";
      still.src = root.dataset.alt;
      root.insertBefore(still, canvas);
    }
    state = "playing";
    root.classList.add("is-alt");
    setTimeout(() => {
      root.classList.remove("is-alt");
      setTimeout(() => (state = "idle"), 600);
    }, HOLD * 1000);
  }

  // The countdown only runs while the photo is on screen in a visible tab.
  function scheduleAutoplay() {
    clearTimeout(autoTimer);
    if (autoDone || !visible || document.hidden) return;
    autoTimer = setTimeout(start, AUTOPLAY_DELAY);
  }

  function start() {
    autoDone = true;
    clearTimeout(autoTimer);
    if (state !== "idle") return;
    if (reduceMotion.matches) return crossfade();
    state = "playing";
    nextCue = 0;
    video.currentTime = 0;
    video.muted = false;
    video.volume = 1;
    root.classList.remove("is-muted");
    const played = video.play();
    if (played)
      played.catch(() => {
        // Browsers only allow sound after the visitor has clicked, tapped or typed on the page.
        video.muted = true;
        root.classList.add("is-muted");
        video.play().catch(finish);
      });
    wake();
  }

  function finish() {
    state = "idle";
    root.classList.remove("is-muted");
    video.pause();
    video.currentTime = 0; // first frame == last frame
  }

  // Safari only lets a media element play sound later if it was started inside a gesture,
  // so the visitor's first click or key press while the photo is idle primes it silently.
  function prime() {
    if (primed || state !== "idle" || reduceMotion.matches) return;
    primed = true;
    video.muted = false;
    video.volume = 0;
    const p = video.play();
    const reset = () => {
      if (state !== "idle") return;
      video.pause();
      video.currentTime = 0;
      video.volume = 1;
    };
    if (p) p.then(reset, reset);
  }
  ["pointerdown", "keydown"].forEach((type) => document.addEventListener(type, prime, { capture: true }));

  // A finished cycle waits for the pointer to leave and come back before playing again.
  root.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") start(); // taps arrive as clicks
  });
  root.addEventListener("click", () => {
    if (state === "idle") start();
    else if (video.muted) {
      video.muted = false;
      root.classList.remove("is-muted");
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    root.click();
  });
  video.addEventListener("ended", finish);

  new ResizeObserver(layout).observe(root);
  window.addEventListener("resize", layout);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    wake();
    scheduleAutoplay();
  }).observe(root);
  document.addEventListener("visibilitychange", () => {
    wake();
    scheduleAutoplay();
  });
  reduceMotion.addEventListener("change", wake);
  layout();
  wake();
})();
