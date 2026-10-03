/* ==========================================================
   ROTATING MAP BANNER  (methods page)

   Picks map sheets at random from the Maps sheet of the
   workbook, so it stays current as you add scans and it can
   only ever show a file that really exists.

   Each scan fills the frame, drifts slowly in a random
   direction, then cross-fades into the next one.

   Two things worth knowing about how this is built:

   1. The movement is drawn frame by frame in JavaScript rather
      than with CSS transitions. Some machines and browsers
      switch CSS transitions off (Windows "animation effects",
      a background tab), which turned the cross-fade into a
      hard cut. Drawing it directly avoids that entirely.

   2. The zoom is worked out per scan from its real pixel size,
      so a scan is never blown up past its natural resolution.
      Scans too small to fill the frame are skipped rather than
      stretched. See maxZoomFor() below.
   ========================================================== */
const BANNER = {
  workbook:  "data/atlas.xlsx",   // same file the map page reads
  sheet:     "Maps",              // sheet holding the jpeg filenames
  imageBase: "maps/",             // folder the scans live in

  hold: 11000,   // how long a scan stays on screen, in milliseconds
  fade: 1800,    // length of the cross-fade, in milliseconds

  zoom:  1.18,   // how far to zoom in, when the scan is big enough to allow it
  minZoom: 1.06, // below this a scan cannot pan without showing an edge, so it is skipped
  drift: 0.055,  // how far to travel, as a fraction of the frame

  caption: true  // show the sheet title and credit in the corner
};

(function () {
  const frame = document.getElementById("map-banner");
  if (!frame) return;

  const layers = [document.createElement("div"), document.createElement("div")];
  layers.forEach(l => { l.className = "mb-layer"; frame.appendChild(l); });

  /* Each layer gets its own label, so a label can fade on exactly the
     same curve as the scan it belongs to. The dark scrim behind them is
     a separate, static element - one per label would double up and
     darken the corner during a cross-fade. */
  let caps = null;
  if (BANNER.caption) {
    const scrim = document.createElement("div");
    scrim.className = "mb-scrim";
    frame.appendChild(scrim);
    caps = [document.createElement("p"), document.createElement("p")];
    caps.forEach(c => { c.className = "mb-caption"; frame.appendChild(c); });
  }

  let shown = 0, queue = [], at = 0, timer = null, skips = 0;
  const live = new Set();          // animation state for layers still moving

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function url(m) {
    return /^https?:/.test(m.jpeg) ? m.jpeg : BANNER.imageBase + encodeURIComponent(m.jpeg);
  }

  /* The largest zoom this scan can take without being enlarged past its
     own pixel size. background-size:cover already scales the image by
     max(frameW/imgW, frameH/imgH); any zoom on top of that multiplies it.
     Keeping the product at or below 1 means the scan is only ever shown
     at, or below, its natural size - so it cannot look pixelated.

     This is measured in CSS pixels. On a 2x display the browser still has
     fewer image pixels than screen pixels, which reads as slightly soft,
     never as visible blocks. */
  function maxZoomFor(iw, ih) {
    const fw = frame.clientWidth, fh = frame.clientHeight;
    /* If the frame cannot be measured yet - a hidden tab, or layout not
       settled - fall back to the configured zoom rather than to 1. A
       frame with no size is not on screen, so there is nothing to look
       pixelated; returning 1 here would instead leave that scan stuck
       with no pan at all. The next scan measures properly. */
    if (!iw || !ih || !fw || !fh) return BANNER.zoom;
    return 1 / Math.max(fw / iw, fh / ih);
  }

  /* How far we can travel at this zoom before an edge of the scan slides
     into view. translate() inside scale() is multiplied by the scale, so
     the usable margin is (z-1)/2 and the limit on translate is (z-1)/2z.
     The 0.9 leaves a little slack. */
  function driftFor(z) {
    return Math.min(BANNER.drift, ((z - 1) / (2 * z)) * 0.9);
  }

  function randomDrift(z) {
    const d = driftFor(z) * 100;
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle) * d, y: Math.sin(angle) * d * 0.5 };
  }

  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  /* One loop drives every moving layer. Each scan travels from its start
     offset to the mirror image of it, so the midpoint is dead centre. */
  function paint(now) {
    for (const st of [...live]) {
      const p = Math.min(1, (now - st.start) / st.panDur);
      const x = st.from.x * (1 - 2 * p);
      const y = st.from.y * (1 - 2 * p);
      st.el.style.transform =
        `scale(${st.z}) translate(${x.toFixed(3)}%, ${y.toFixed(3)}%)`;

      const f = Math.min(1, Math.max(0, (now - st.fadeStart) / BANNER.fade));
      const o = (st.o1 + (st.o2 - st.o1) * easeInOut(f)).toFixed(3);
      st.el.style.opacity = o;
      if (st.cap) st.cap.style.opacity = o;      // label fades with its scan

      if (p >= 1 && f >= 1) live.delete(st);     // finished; leave it alone
    }
    if (live.size) requestAnimationFrame(paint);
  }

  function show(m, iw, ih) {
    const incoming = layers[shown ^ 1], outgoing = layers[shown];
    const z = Math.min(BANNER.zoom, maxZoomFor(iw, ih));
    const now = performance.now();

    /* The outgoing scan keeps the pan it is already running and simply
       starts fading, so it never jumps position mid-transition. */
    if (outgoing._mb) {
      outgoing._mb.o1 = Number(outgoing.style.opacity || 1);
      outgoing._mb.o2 = 0;
      outgoing._mb.fadeStart = now;
      live.add(outgoing._mb);
    }

    if (incoming._mb) live.delete(incoming._mb);   // drop its previous run
    incoming.style.backgroundImage = `url("${url(m)}")`;

    const inCap = caps ? caps[shown ^ 1] : null;
    if (inCap) {
      inCap.textContent = [m.title, m.credit].filter(Boolean).join(" · ");
      inCap.style.opacity = "0";
    }

    const from = randomDrift(z);
    const st = { el: incoming, cap: inCap, z, from, start: now,
                 panDur: BANNER.hold + BANNER.fade * 2,
                 fadeStart: now, o1: 0, o2: 1 };
    incoming._mb = st;
    incoming.style.opacity = "0";
    incoming.style.transform =
      `scale(${z}) translate(${from.x.toFixed(3)}%, ${from.y.toFixed(3)}%)`;
    live.add(st);

    shown ^= 1;
    requestAnimationFrame(paint);
  }

  /* Load the next scan before showing it, so a slow image never
     cross-fades into a blank frame. Scans too small for the frame at
     this window size are skipped. */
  function next() {
    if (!queue.length) return;
    if (at >= queue.length) { shuffle(queue); at = 0; }
    const m = queue[at++];
    const pre = new Image();
    pre.onload = () => {
      if (maxZoomFor(pre.naturalWidth, pre.naturalHeight) < BANNER.minZoom) {
        if (++skips < queue.length) return next();         // too small: try another
        skips = 0;                                          // none fit; show it anyway
      } else {
        skips = 0;
      }
      show(m, pre.naturalWidth, pre.naturalHeight);
      timer = setTimeout(next, BANNER.hold + BANNER.fade);
    };
    pre.onerror = () => next();
    pre.src = url(m);
  }

  fetch(BANNER.workbook)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(buf => {
      const wb = XLSX.read(buf);
      const rows = wb.Sheets[BANNER.sheet]
        ? XLSX.utils.sheet_to_json(wb.Sheets[BANNER.sheet], { defval: "" }) : [];
      queue = shuffle(rows.filter(m => String(m.jpeg || "").trim()));
      if (!queue.length) { frame.classList.add("mb-empty"); return; }
      frame.classList.add("is-ready");
      next();
    })
    .catch(() => { frame.classList.add("mb-empty"); });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else if (queue.length) { clearTimeout(timer); timer = setTimeout(next, 400); }
  });
})();
