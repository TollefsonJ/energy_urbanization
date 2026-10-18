/* ==========================================================
   MAP SETTINGS
   ========================================================== */
const CONFIG = {
  // The Excel workbook the map reads. Edit it, then upload over the old one.
  dataFile: "data/atlas.xlsx",

  // Where the JPEG scans live: the maps folder inside this site.
  // Put new scans in that folder and list the filename in the Maps sheet.
  imageBase: "maps/",

  // The city the map opens on. It must match the city column in the
  // Points sheet exactly. Leave it as "" to open on all cities.
  defaultCity: "",

  // Blank space left between two facing pages, in image pixels. Set to 0
  // for a seamless spread.
  spreadGap: 12,

  // Group points that sit close together on screen into one numbered circle
  // while you are zoomed out. Clicking the circle zooms to the points inside
  // it instead of opening a single site. Set to false to always draw every
  // point separately.
  clusterPoints: true,

  // Grouping stops at this zoom level and every point is drawn on its own.
  // Zooming to a single city lands at zoom 15, so by default a chosen city
  // shows all of its sites individually.
  clusterUntilZoom: 15,

  // How close two points must be, in screen pixels, before they are grouped.
  // Larger gathers more aggressively; smaller keeps nearby cities apart.
  clusterRadius: 45,

  // The chip row above the map lights up the cities you are looking at, and
  // follows along when you pan or zoom by hand. Below this zoom level the
  // view is counted as too wide to be in any city at all, so no chip lights.
  cityZoomFloor: 8,

  // How much of what is on screen must belong to a city before its chip
  // lights up. 0.2 means a fifth of the visible points. More than one chip
  // can light at once: zoom to the Bay Area and both San Francisco and
  // Oakland are genuinely in view, so both are shown. Raise it to be stricter
  // about which cities count as on screen.
  cityMinShare: 0.2,

  // The view for the moment before the workbook finishes loading.
  startView: { center: [37.77, -122.42], zoom: 11 }
};

/* ---------- Basemaps (the switcher in the top-right of the map) ---------- */
const basemaps = {
  "Streets": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
  }),
  "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics", maxZoom: 19
  }),
  "Muted gray": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri", maxZoom: 16
  })
};

/* The default basemap follows the site's light and dark setting, so a dark
   page does not sit behind a brilliant white map. Esri publishes the two as
   a matched pair, and swapping the URL on the existing layer keeps the same
   entry in the basemap switcher rather than adding a second one. */
const GRAY_TILES = {
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
};
function syncBasemapToTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  basemaps["Muted gray"].setUrl(dark ? GRAY_TILES.dark : GRAY_TILES.light);
}
// Watching the attribute rather than the toggle button means this keeps
// working however the theme comes to change.
new MutationObserver(syncBasemapToTheme)
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
syncBasemapToTheme();

const map = L.map("map", { layers: [basemaps["Muted gray"]], scrollWheelZoom: true })
  .setView(CONFIG.startView.center, CONFIG.startView.zoom);
L.control.layers(basemaps, null, { position: "topright", collapsed: true }).addTo(map);

/* ---------- Load the workbook ---------- */
const state = { points: [], mapsById: {}, mapsByPoint: {}, viewByPoint: {}, markers: {}, selected: null };

async function loadData() {
  const res = await fetch(CONFIG.dataFile);
  if (!res.ok) throw new Error("Could not load " + CONFIG.dataFile + " (" + res.status + ")");
  const wb = XLSX.read(await res.arrayBuffer());
  const table = name => {
    if (!wb.Sheets[name]) throw new Error('The workbook is missing a sheet named "' + name + '".');
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
  };
  /* Total Maps is optional: it only feeds the tally line, so an older
     workbook without it should still draw the map. */
  const optional = name =>
    wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) : [];
  return { points: table("Points"), maps: table("Maps"), links: table("Links"),
           totals: optional("Total Maps") };
}

function scanUrl(m) {
  return /^https?:/.test(m.jpeg) ? m.jpeg : CONFIG.imageBase + encodeURIComponent(m.jpeg);
}
function pageSide(m) { return String(m.page || "").trim().toLowerCase(); }
function sheetNo(m) { return m.map_id.split(/[-_]+/).pop(); }
function entryTitle(e) {
  return e.length > 1 ? `${e[0].title} + sheet ${sheetNo(e[1])}` : e[0].title;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function init(data) {
  data.maps.forEach(m => { state.mapsById[m.map_id] = m; });
  data.links.forEach(l => {
    const m = state.mapsById[l.map_id];
    if (!m) return;
    (state.mapsByPoint[l.point_id] = state.mapsByPoint[l.point_id] || []).push(m);
  });
  Object.values(state.mapsByPoint).forEach(list => list.sort((a, b) => a.year - b.year || a.map_id.localeCompare(b.map_id)));

  /* Group facing pages into spreads. A spread is one sheet marked page=left
     and one marked page=right, belonging to the same point and the same year.
     Both must carry the same rotate value, because a spread can only stay
     facing when north is up if the two pages turn the same way. Anything that
     does not pair cleanly stays a single sheet, so bad data degrades quietly
     instead of mispairing. Each entry below is [sheet] or [left, right]. */
  Object.keys(state.mapsByPoint).forEach(pid => {
    const list = state.mapsByPoint[pid], byYear = {}, entries = [], used = {};
    list.forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
    list.forEach(m => {
      if (used[m.map_id]) return;
      const side = pageSide(m);
      if (side === "left" || side === "right") {
        const want = side === "left" ? "right" : "left";
        const mate = (byYear[m.year] || []).find(x =>
          x.map_id !== m.map_id && pageSide(x) === want
          && rotation(x) === rotation(m) && !used[x.map_id]);
        if (mate) {
          used[m.map_id] = used[mate.map_id] = true;
          entries.push(side === "left" ? [m, mate] : [mate, m]);
          return;
        }
      }
      used[m.map_id] = true;
      entries.push([m]);
    });
    state.viewByPoint[pid] = entries;
  });

  state.points = data.points.filter(p => String(p.status).toLowerCase() === "show" && p.lat !== "" && p.lon !== "");

  // Points that share exactly the same coordinates would sit on top of each other,
  // so the display position of later ones is nudged about 10 metres. Data is not changed.
  const seen = {};
  state.points.forEach(p => {
    const key = p.lat + "," + p.lon;
    const n = seen[key] = (seen[key] || 0) + 1;
    p._lat = Number(p.lat) + (n - 1) * 0.00009;
    p._lon = Number(p.lon) + (n - 1) * 0.00009;
  });

  state.points.forEach(addMarker);

  const cities = [...new Set(state.points.map(p => p.city))].sort();
  buildCityBar(cities);
  buildTally(cities, data.totals);

  // Open on the city named in CONFIG and light up its chip.
  // An unrecognised name falls back to all cities.
  let startCity = "";
  if (CONFIG.defaultCity) {
    if (cities.includes(CONFIG.defaultCity)) startCity = CONFIG.defaultCity;
    else console.warn('CONFIG.defaultCity "' + CONFIG.defaultCity + '" is not in the Points sheet; opening on all cities.');
  }
  zoomToCity(startCity);

  // The workbook is fetched and parsed in the browser, so until it lands the
  // map is empty and the panel says so. Both are cleared here; the catch at
  // the bottom of the file clears them its own way if the load fails.
  document.getElementById("map").classList.remove("is-loading");
  document.getElementById("details").innerHTML =
    `<p class="note">Select a point to view historical maps for that site.</p>`;
}

/* ---------- City chips (the row above the map) ----------
   One button per city. These are plain buttons rather than a dropdown, so
   clicking the city you are already on reframes the view instead of doing
   nothing. Getting back out to the whole map is the control on the map
   itself, added further down.

   The lit chips are only a hint about where you are looking, never a thing
   the buttons depend on, so a close call between two neighbouring cities can
   at worst light the wrong chip. Every chip still goes exactly where it
   says. */
/* "N sites identified across N regions, the result of analyzing N map
   documents."

   Sites and regions are counted from the points actually drawn, so hiding a
   site lowers the count rather than claiming something a visitor cannot find.
   The document total is the sum of n_maps on the Total Maps sheet, which
   covers whole volumes that were read to find these sites, not just the
   sheets kept in maps/ - so it is much larger than the Maps sheet, by design.

   The numbers are spans, not buttons: they echo the city chips below but
   nothing happens when you click them. */
function buildTally(cities, totals) {
  const el = document.getElementById("map-tally");
  if (!el) return;
  const docs = (totals || []).reduce((sum, row) => {
    const n = Number(String(row.n_maps == null ? "" : row.n_maps).replace(/[, ]/g, ""));
    return sum + (isFinite(n) ? n : 0);
  }, 0);
  const num = n => `<span class="tally-num">${n.toLocaleString()}</span>`;
  const plural = (n, word) => n === 1 ? word : word + "s";
  const parts = [
    `${num(state.points.length)} ${plural(state.points.length, "site")} identified`,
    `across ${num(cities.length)} ${plural(cities.length, "region")}`
  ];
  el.innerHTML = docs
    ? `${parts.join(" ")}, the result of analyzing ${num(docs)} map ${plural(docs, "document")}.`
    : `${parts.join(" ")}.`;
}

function buildCityBar(cities) {
  const bar = document.getElementById("city-bar");
  cities.forEach(city => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "city-chip";
    b.dataset.city = city;
    b.textContent = city;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => zoomToCity(city));
    bar.appendChild(b);
  });
}

/* Every city with a real share of the points on screen, not just the biggest
   one. Two cities close enough to share a view, like San Francisco and
   Oakland, both light up rather than one of them quietly speaking for the
   other. Zoomed out past cityZoomFloor, or over empty country with no points
   in view, nothing is claimed and no chip lights. */
function visibleCities() {
  const lit = new Set();
  if (map.getZoom() < CONFIG.cityZoomFloor) return lit;
  const view = map.getBounds(), counts = {};
  let total = 0;
  state.points.forEach(p => {
    if (!view.contains([p._lat, p._lon])) return;
    counts[p.city] = (counts[p.city] || 0) + 1;
    total++;
  });
  Object.keys(counts).forEach(city => {
    if (counts[city] / total >= CONFIG.cityMinShare) lit.add(city);
  });
  return lit;
}

function markActiveCities(cities) {
  document.querySelectorAll(".city-chip").forEach(b => {
    b.setAttribute("aria-pressed", String(cities.has(b.dataset.city)));
  });
}

// Panning and zooming by hand keep the lit chips honest.
map.on("moveend", () => markActiveCities(visibleCities()));

/* ---------- Markers ---------- */
const STYLE = { radius: 7, color: "#fff", weight: 1.5, fillColor: "#a1313a", fillOpacity: 0.95 };
const STYLE_ON = { radius: 9, color: "#f1d24a", weight: 3, fillColor: "#a1313a", fillOpacity: 1 };

/* Rows with the name column left blank would otherwise show their raw
   point_id, so a half-filled sheet puts things like "baltimore-10" on the
   page in heading type. Fall back to the city and the number off the end of
   the id instead; fill in the name column and this is never reached. */
function pointTitle(p) {
  if (p.name) return p.name;
  const n = String(p.point_id).split(/[-_]+/).pop();
  return (p.city && /^\d+$/.test(n)) ? `${p.city} — site ${n}` : p.point_id;
}

/* Points are added to this layer rather than straight to the map. When
   clustering is on it is a group that rolls points too close together to
   tell apart into one numbered circle, and zooms to their extent when that
   circle is clicked. Only the drawing changes; the workbook is never read
   or written differently because of it. */
const pointLayer = CONFIG.clusterPoints
  ? L.markerClusterGroup({
      maxClusterRadius: CONFIG.clusterRadius,
      disableClusteringAtZoom: CONFIG.clusterUntilZoom,
      spiderfyOnMaxZoom: false,   // points on identical coordinates are already nudged apart above
      polygonOptions: { color: STYLE.fillColor, weight: 1, opacity: 0.6, fillOpacity: 0.08 }
    })
  : L.layerGroup();
pointLayer.addTo(map);

function addMarker(p) {
  const mk = L.circleMarker([p._lat, p._lon], STYLE);
  mk.bindPopup(() => popupHtml(p), { maxWidth: 300 });
  mk.on("click", () => select(p.point_id));
  pointLayer.addLayer(mk);
  state.markers[p.point_id] = mk;
}

function popupHtml(p) {
  const entries = state.viewByPoint[p.point_id] || [];
  const count = entries.reduce((a, e) => a + e.length, 0);
  const years = entries.map(e => {
    const label = e.length > 1
      ? `${e[0].year} #${sheetNo(e[0])}+${sheetNo(e[1])}`
      : `${e[0].year} #${sheetNo(e[0])}`;
    return `<button class="popup-year" data-view="${esc(e[0].map_id)}" data-point="${esc(p.point_id)}" title="${esc(entryTitle(e))}">${esc(label)}</button>`;
  }).join("");
  return `<strong>${esc(pointTitle(p))}</strong>
    <span class="popup-meta">${esc(p.city)}${count ? ` &middot; ${count} sheet${count > 1 ? "s" : ""}` : ""}</span>
    ${count ? `<div class="popup-years">${years}</div>
    <a href="#details">See all sheets</a>` : `<span class="popup-meta">No map sheets yet</span>`}`;
}

function select(pointId) {
  if (state.selected && state.markers[state.selected]) state.markers[state.selected].setStyle(STYLE);
  state.selected = pointId;
  const mk = state.markers[pointId];
  if (mk) { mk.setStyle(STYLE_ON); mk.bringToFront(); }
  renderDetails(state.points.find(p => p.point_id === pointId));
}

function zoomToCity(city) {
  const pts = state.points.filter(p => !city || p.city === city);
  if (!pts.length) return;
  markActiveCities(new Set(city ? [city] : []));   // light the chip at once, before the map finishes moving
  const b = L.latLngBounds(pts.map(p => [p._lat, p._lon]));
  map.fitBounds(b, { padding: [40, 40], maxZoom: city ? 15 : 5 });
}

/* ---------- "Show all cities" control (under the zoom buttons) ----------
   The way back out to the whole map, from wherever you have got to. It lives
   on the map rather than in the chip row so that it is still to hand on a
   phone, where the row scrolls sideways and may be showing other cities. */
const ShowAllCities = L.Control.extend({
  onAdd() {
    const box = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const link = L.DomUtil.create("a", "show-all-cities", box);
    link.href = "#";
    link.title = "Show all cities";
    link.setAttribute("role", "button");
    link.setAttribute("aria-label", "Show all cities");
    // Drawn rather than typed: a corner-marks glyph is missing from enough
    // fonts to risk showing an empty box on someone's machine.
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"'
      + ' stroke="currentColor" stroke-width="2.2" stroke-linecap="round">'
      + '<path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>';
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.on(link, "click", L.DomEvent.stop).on(link, "click", () => zoomToCity(""));
    return box;
  }
});
map.addControl(new ShowAllCities({ position: "topleft" }));


/* ---------- Progress badge (set in the Points sheet) ----------
   progress       = the label shown, e.g. "complete" or "in progress"
   progress_color = "red", "green", or a hex code like #2e7d32
   Leave progress blank for a site and no badge is shown.
   Colours are checked against the list below, so a typo in the
   spreadsheet falls back to red rather than breaking the page.   */
const PROGRESS_COLORS = { red: "#a1313a", green: "#2e7d32" };

function progressBadge(p) {
  const label = String(p.progress || "").trim();
  if (!label) return "";
  let key = String(p.progress_color || "").trim().toLowerCase();
  if (!key) key = label.toLowerCase() === "complete" ? "green" : "red";
  const color = PROGRESS_COLORS[key]
    || (/^#[0-9a-fA-F]{3,8}$/.test(key) ? key : PROGRESS_COLORS.red);
  return `<span class="progress-badge" style="--badge: ${color}">${esc(label)}</span>`;
}
/* ---------- Details panel under the map ---------- */
function renderDetails(p) {
  const el = document.getElementById("details");
  const list = state.viewByPoint[p.point_id] || [];
  const rows = list.map(e => {
    const spread = e.length > 1;
    const links = spread
      ? `<button class="link-button" data-view="${esc(e[0].map_id)}" data-point="${esc(p.point_id)}">View spread</button>
         <a href="${scanUrl(e[0])}" target="_blank" rel="noopener">Left</a>
         <a href="${scanUrl(e[1])}" target="_blank" rel="noopener">Right</a>`
      : `<button class="link-button" data-view="${esc(e[0].map_id)}" data-point="${esc(p.point_id)}">View scan</button>
         <a href="${scanUrl(e[0])}" target="_blank" rel="noopener">Open original</a>`;
    return `
    <li>
      <span class="yr">${esc(e[0].year)}</span>
      <span>${esc(entryTitle(e))}</span>
      <span class="links">${links}</span>
    </li>`;
  }).join("");
  el.innerHTML = `
    <h2>${esc(pointTitle(p))}${progressBadge(p)}</h2>
    <p class="where">${esc(p.city)} &middot; ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</p>
    ${p.description ? `<p class="text">${esc(p.description)}</p>` : ""}
    ${p.article ? `<p><a href="${esc(p.article)}">Read the article about this site</a></p>` : ""}
    ${list.length ? `<ul class="sheet-list">${rows}</ul>` : `<p class="note">No map sheets are linked to this site yet.</p>`}`;
}

/* ---------- Zoomable scan viewer (with previous / next) ---------- */
let viewerMap = null, viewerLayers = [], viewerList = [], viewerIndex = 0, viewerReq = 0;
let northUp = false;  // false: show scans as published (default). true: apply the rotate flag so north points up.

/* Rotation flag from the Maps sheet: "r" turns the scan 90 degrees right, "l" 90 degrees left. */
function rotation(m) {
  const v = String(m.rotate || "").trim().toLowerCase();
  return v === "r" ? 1 : v === "l" ? -1 : 0;
}
function orient(img, turn) {
  if (!turn) return { src: img.src, w: img.naturalWidth, h: img.naturalHeight };
  const c = document.createElement("canvas");
  c.width = img.naturalHeight; c.height = img.naturalWidth;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(turn * Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return { src: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height };
}

function openViewer(mapId, pointId) {
  const list = (pointId && state.viewByPoint[pointId])
    || (state.mapsById[mapId] ? [[state.mapsById[mapId]]] : []);
  if (!list.length) return;
  viewerList = list;
  viewerIndex = Math.max(0, list.findIndex(e => e.some(m => m.map_id === mapId)));
  document.getElementById("viewer").classList.add("open");
  if (viewerMap) { viewerMap.remove(); viewerMap = null; }
  viewerLayers = [];
  viewerMap = L.map("viewer-map", { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: false });
  showScan();
  document.getElementById("viewer-close").focus();
}

/* Where each page sits, in image pixels, as Leaflet bounds
   [[bottom, left], [top, right]].

   Side by side when the scans are shown as published. When north up turns
   them 90 degrees the spread has to stack, or the two pages would no longer
   face each other: turning left (anticlockwise) lifts the right-hand page to
   the top, turning right drops it to the bottom. Single sheets are unchanged. */
function layoutSpread(parts, turn, gap) {
  if (parts.length === 1) {
    const p = parts[0];
    return { boxes: [[[0, 0], [p.h, p.w]]], h: p.h, w: p.w };
  }
  const [L, R] = parts;
  if (!turn) {
    const h = Math.max(L.h, R.h), w = L.w + gap + R.w;
    const yL = (h - L.h) / 2, yR = (h - R.h) / 2;
    return { boxes: [
      [[yL, 0], [yL + L.h, L.w]],
      [[yR, L.w + gap], [yR + R.h, L.w + gap + R.w]]
    ], h, w };
  }
  const w = Math.max(L.w, R.w), h = L.h + gap + R.h;
  const rightOnTop = turn < 0;                     // turn < 0 is "l", anticlockwise
  const yR = rightOnTop ? L.h + gap : 0;
  const yL = rightOnTop ? 0 : R.h + gap;
  return { boxes: [
    [[yL, (w - L.w) / 2], [yL + L.h, (w - L.w) / 2 + L.w]],
    [[yR, (w - R.w) / 2], [yR + R.h, (w - R.w) / 2 + R.w]]
  ], h, w };
}

function loadImages(urls, needCanvas) {
  return Promise.all(urls.map(u => new Promise((resolve, reject) => {
    const img = new Image();
    if (needCanvas && /^https?:/.test(u)) img.crossOrigin = "anonymous";  // needed to redraw a scan hosted elsewhere
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = u;
  })));
}

function showScan() {
  const entry = viewerList[viewerIndex], n = viewerList.length;
  const spread = entry.length > 1;
  const title = document.getElementById("viewer-title");
  title.textContent = entryTitle(entry);
  document.getElementById("viewer-count").textContent = n > 1 ? `${viewerIndex + 1} of ${n}` : "";

  const a1 = document.getElementById("viewer-original");
  const a2 = document.getElementById("viewer-original-2");
  a1.href = scanUrl(entry[0]);
  a1.textContent = spread ? "Open left" : "Open original";
  if (a2) {
    a2.hidden = !spread;
    if (spread) a2.href = scanUrl(entry[1]);
  }
  document.getElementById("viewer-prev").disabled = viewerIndex === 0;
  document.getElementById("viewer-next").disabled = viewerIndex === n - 1;
  document.querySelectorAll(".viewer-nav").forEach(el => { el.hidden = n < 2; });
  updateNorthToggle();

  const req = ++viewerReq;
  const turn = northUp ? rotation(entry[0]) : 0;    // both pages share a rotate value
  loadImages(entry.map(scanUrl), !!turn).then(imgs => {
    if (req !== viewerReq || !viewerMap) return;    // user already moved on
    viewerLayers.forEach(l => viewerMap.removeLayer(l));
    viewerLayers = [];
    const parts = imgs.map(img => orient(img, turn));
    const plan = layoutSpread(parts, turn, spread ? Number(CONFIG.spreadGap) || 0 : 0);
    parts.forEach((o, i) => {
      viewerLayers.push(L.imageOverlay(o.src, plan.boxes[i]).addTo(viewerMap));
    });
    const bounds = [[0, 0], [plan.h, plan.w]];
    viewerMap.setMaxBounds(L.latLngBounds(bounds).pad(0.5));
    viewerMap.fitBounds(bounds);
  }).catch(() => {
    if (req === viewerReq) title.textContent = entryTitle(entry) + " (image not found)";
  });

  // warm the cache for the neighbours so cycling feels instant
  [viewerIndex - 1, viewerIndex + 1].forEach(i => {
    (viewerList[i] || []).forEach(m => { new Image().src = scanUrl(m); });
  });
}

function updateNorthToggle() {
  const btn = document.getElementById("viewer-north");
  btn.hidden = !viewerList.some(e => e.some(m => rotation(m)));   // only offer it when some sheet has a rotate flag
  btn.setAttribute("aria-pressed", northUp);
  btn.textContent = northUp ? "View: north up" : "View: as published";
  btn.title = northUp ? "Click to show the scan as it was published" : "Click to turn the scan so north points up";
}

function stepViewer(delta) {
  const next = viewerIndex + delta;
  if (next < 0 || next >= viewerList.length) return;
  viewerIndex = next;
  showScan();
}

function closeViewer() {
  document.getElementById("viewer").classList.remove("open");
  if (viewerMap) { viewerMap.remove(); viewerMap = null; viewerLayers = []; }
  viewerReq++;
}

document.getElementById("viewer-close").addEventListener("click", closeViewer);
document.getElementById("viewer-north").addEventListener("click", () => { northUp = !northUp; showScan(); });
document.getElementById("viewer-prev").addEventListener("click", () => stepViewer(-1));
document.getElementById("viewer-next").addEventListener("click", () => stepViewer(1));
document.addEventListener("keydown", e => {
  if (!document.getElementById("viewer").classList.contains("open")) return;
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft") { stepViewer(-1); e.preventDefault(); }
  else if (e.key === "ArrowRight") { stepViewer(1); e.preventDefault(); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-view]");
  if (b) openViewer(b.dataset.view, b.dataset.point);
});

/* ---------- Start ---------- */
loadData().then(init).catch(err => {
  document.getElementById("map").classList.remove("is-loading");
  document.getElementById("details").innerHTML =
    `<p class="note"><strong>The map data could not be loaded.</strong> ${esc(err.message)}<br>
    If you opened this page straight from your computer, use a local web server or view the site on GitHub Pages.</p>`;
  console.error(err);
});
