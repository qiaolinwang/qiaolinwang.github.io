// A voice-memo style waveform running out of the motto. It murmurs while idle, gets louder
// while the visitor hovers the name or motto, and carries the storm clip's thunder outward
// when the profile photo shatters.
(function () {
  const canvas = document.querySelector(".motto-wave");
  if (!canvas) return;
  const motto = canvas.previousElementSibling;
  const header = canvas.closest(".post-header");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Loudness of the storm clip every 50 ms (0-99), measured from its soundtrack.
  const STORM_ENV = [4,7,11,15,19,21,26,31,99,77,70,62,54,48,50,48,48,46,48,45,44,43,48,48,54,60,58,53,47,42,40,38,40,32,35,33,30,26,23,22,18,21,18,20,17,19,18,18,76,51,38,25,20,17,15,14,13,14,14,14,14,16,19,23,29,33,39,44,49,55,61,81,92,83,78,73,70,66,63,60,58,55,53,51,48,46,44,42,40,39,37,36,34,33,31,30,29,27,26,25,24,23,22,21,20,20,19,18,17,16,15,14,13,11,10,8,7,5,3,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,5,6,7,9,10,11,12,13,14,15,15,16,17,17,18,19,20,20,21,22,23,24,25,26,28,29,30,31,33,34,36,38,39,41,43,45,47,49,51,54,56,59,62,66,72,79,57,50,45,40,36,31,27,23,17,15,13,11,12,11,12,11,12,13,15,18,24,35,49,60,15,16,14,15,17,17,15,16,18,19,23,24,29,30,29,31,32,35,36,41,45,50,47,47,36,40,35,36,39,42,37,40,40,43,41,47,52,60,69,82,25,20,16,15,11,8,5];
  const H = 28;
  const MIN_W = 50;
  const MAX_W = 85;
  const BAR = 2;
  const GAP = 2;
  const TRAVEL = 0.3; // seconds for a sound to cross the waveform

  // Smooth random field; its peaks read as syllables scrolling away from the motto.
  const NOISE = Array.from({ length: 256 }, () => Math.random());
  function noise(p) {
    const i = Math.floor(p);
    const f = p - i;
    const a = NOISE[((i % 256) + 256) % 256];
    const b = NOISE[(((i + 1) % 256) + 256) % 256];
    return a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * f));
  }

  let W = 0;
  let dpr = 1;
  let level = 0.6;
  let hovering = false;
  let visible = true;
  let rafId = 0;
  let lastTs = 0;
  const dots = [];

  function layout() {
    canvas.style.width = "0px";
    const box = canvas.parentElement.getBoundingClientRect();
    const room = box.right - motto.getBoundingClientRect().right - 14;
    W = room >= MIN_W ? Math.min(MAX_W, room) : 0;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(canvas.style, { width: `${W}px`, height: `${W ? H : 0}px`, marginLeft: W ? "12px" : "0" });
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  // Storm loudness as heard at position u along the wave (it takes TRAVEL s to cross).
  function stormAt(video, u) {
    if (!video || video.paused) return 0;
    return (STORM_ENV[Math.floor((video.currentTime - u * TRAVEL) * 20)] || 0) / 99;
  }

  function draw(t, dt) {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const video = document.querySelector(".storm-figure video");
    level += ((hovering ? 1 : 0.6) - level) * (1 - Math.exp(-dt * 6));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const mid = H / 2;
    const n = Math.floor(W / (BAR + GAP));
    const [r, g, b] = dark ? [127, 178, 255] : [29, 94, 255];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const taper = Math.min(1, u / 0.08) * Math.pow(1 - u, 0.7);
      const syllable = Math.pow(noise(i * 0.28 - t * 5), 1.6) * (0.75 + 0.25 * Math.sin(i * 1.7 + t * 11));
      const storm = stormAt(video, u);
      const loud = Math.max(level * (0.2 + 0.8 * syllable), storm * (0.55 + 0.45 * syllable));
      const h = Math.max(2, (H - 4) * taper * loud);
      ctx.globalAlpha = 0.25 + 0.75 * taper;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.roundRect(i * (BAR + GAP), mid - h / 2, BAR, h, 1);
      ctx.fill();
      // Loud bars throw off particles that drift away up and to the right.
      if (loud * taper > 0.55 && Math.random() < dt * 6) {
        dots.push({ x: i * (BAR + GAP) + 1, y: mid - h / 2, vx: 20 + Math.random() * 30, vy: -(8 + Math.random() * 14), age: 0, life: 0.5 + Math.random() * 0.4 });
      }
    }
    ctx.fillStyle = dark ? "#bfe3ff" : "#57c8ff";
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.age >= d.life || d.x > W || d.y < 0) {
        dots.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - d.age / d.life;
      ctx.fillRect(d.x - 0.9, d.y - 0.9, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    rafId = 0;
    const now = ts / 1000;
    const dt = Math.min(0.05, lastTs ? now - lastTs : 0);
    lastTs = now;
    if (W) draw(now, dt);
    if (visible && !document.hidden && !reduceMotion.matches) rafId = requestAnimationFrame(frame);
    else lastTs = 0;
  }

  function wake() {
    if (reduceMotion.matches) {
      if (W) draw(0, 1); // one still frame
      return;
    }
    if (!rafId && visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  header.addEventListener("pointerenter", () => (hovering = true));
  header.addEventListener("pointerleave", () => (hovering = false));
  new ResizeObserver(() => {
    layout();
    wake();
  }).observe(canvas.parentElement);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    wake();
  }).observe(header);
  document.addEventListener("visibilitychange", wake);
  reduceMotion.addEventListener("change", wake);
  if (document.fonts) document.fonts.ready.then(layout); // the motto font changes its width
  layout();
  wake();
})();
