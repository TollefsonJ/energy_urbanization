/* ==========================================================
   MAP SETTINGS
   ========================================================== */
const CONFIG = {
  // The Excel workbook the map reads. Edit it, then upload over the old one.
  dataFile: "data/atlas.xlsx",

  // Where the JPEG scans live: the maps folder inside this site.
  // Put new scans in that folder and list the filename in the Maps sheet.
  imageBase: "maps/",

  startView: { center: [39.5, -96], zoom: 4 }
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

const map = L.map("map", { layers: [basemaps["Muted gray"]], scrollWheelZoom: true })
  .setView(CONFIG.startView.center, CONFIG.startView.zoom);
L.control.layers(basemaps, null, { position: "topright", collapsed: true }).addTo(map);

/* ---------- Load the workbook ---------- */
const state = { points: [], mapsById: {}, mapsByPoint: {}, markers: {}, selected: null };

async function loadData() {
  const res = await fetch(CONFIG.dataFile);
  if (!res.ok) throw new Error("Could not load " + CONFIG.dataFile + " (" + res.status + ")");
  const wb = XLSX.read(await res.arrayBuffer());
  const table = name => {
    if (!wb.Sheets[name]) throw new Error('The workbook is missing a sheet named "' + name + '".');
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
  };
  return { points: table("Points"), maps: table("Maps"), links: table("Links") };
}

function scanUrl(m) {
  return /^https?:/.test(m.jpeg) ? m.jpeg : CONFIG.imageBase + encodeURIComponent(m.jpeg);
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
  const sel = document.getElementById("city-select");
  cities.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o); });
  sel.addEventListener("change", () => zoomToCity(sel.value));

  zoomToCity("");
}

/* ---------- Markers ---------- */
const STYLE = { radius: 7, color: "#fff", weight: 1.5, fillColor: "#a1313a", fillOpacity: 0.95 };
const STYLE_ON = { radius: 9, color: "#f1d24a", weight: 3, fillColor: "#a1313a", fillOpacity: 1 };

function pointTitle(p) { return p.name || p.point_id; }

function addMarker(p) {
  const mk = L.circleMarker([p._lat, p._lon], STYLE).addTo(map);
  mk.bindPopup(() => popupHtml(p), { maxWidth: 300 });
  mk.on("click", () => select(p.point_id));
  state.markers[p.point_id] = mk;
}

function popupHtml(p) {
  const list = state.mapsByPoint[p.point_id] || [];
  const years = list.map(m => `<button class="link-button" data-view="${esc(m.map_id)}" data-point="${esc(p.point_id)}" title="${esc(m.title)}">${esc(m.year)} #${esc(m.map_id.split(/[-_]+/).pop())}</button>`).join("");
  return `<strong>${esc(pointTitle(p))}</strong>
    ${esc(p.city)}<br>
    ${list.length ? `${list.length} map sheet${list.length > 1 ? "s" : ""}
    <div class="popup-years">${years}</div>
    <a href="#details">See all sheets below</a>` : "No map sheets yet"}`;
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
  const b = L.latLngBounds(pts.map(p => [p._lat, p._lon]));
  map.fitBounds(b, { padding: [40, 40], maxZoom: city ? 15 : 5 });
}

/* ---------- Details panel under the map ---------- */
function renderDetails(p) {
  const el = document.getElementById("details");
  const list = state.mapsByPoint[p.point_id] || [];
  const rows = list.map(m => `
    <li>
      <span class="yr">${esc(m.year)}</span>
      <span>${esc(m.title)}${m.credit ? `<br><span class="note">${esc(m.credit)}</span>` : ""}</span>
      <span class="links">
        <button class="link-button" data-view="${esc(m.map_id)}" data-point="${esc(p.point_id)}">View scan</button>
        <a href="${scanUrl(m)}" target="_blank" rel="noopener">Open original</a>
      </span>
    </li>`).join("");
  el.innerHTML = `
    <h2>${esc(pointTitle(p))}</h2>
    <p class="where">${esc(p.city)} &middot; ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</p>
    ${p.description ? `<p class="text">${esc(p.description)}</p>` : ""}
    ${p.article ? `<p><a href="${esc(p.article)}">Read the article about this site</a></p>` : ""}
    ${list.length ? `<ul class="sheet-list">${rows}</ul>` : `<p class="note">No map sheets are linked to this site yet.</p>`}`;
}

/* ---------- Zoomable scan viewer (with previous / next) ---------- */
let viewerMap = null, viewerLayer = null, viewerList = [], viewerIndex = 0, viewerReq = 0;

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
  const list = (pointId && state.mapsByPoint[pointId]) || [state.mapsById[mapId]].filter(Boolean);
  if (!list.length) return;
  viewerList = list;
  viewerIndex = Math.max(0, list.findIndex(m => m.map_id === mapId));
  document.getElementById("viewer").classList.add("open");
  if (viewerMap) { viewerMap.remove(); viewerMap = null; }
  viewerMap = L.map("viewer-map", { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: false });
  showScan();
  document.getElementById("viewer-close").focus();
}

function showScan() {
  const m = viewerList[viewerIndex], n = viewerList.length;
  const title = document.getElementById("viewer-title");
  title.textContent = m.title;
  document.getElementById("viewer-count").textContent = n > 1 ? `${viewerIndex + 1} of ${n}` : "";
  document.getElementById("viewer-original").href = scanUrl(m);
  document.getElementById("viewer-prev").disabled = viewerIndex === 0;
  document.getElementById("viewer-next").disabled = viewerIndex === n - 1;
  document.querySelectorAll(".viewer-nav").forEach(el => { el.hidden = n < 2; });

  const req = ++viewerReq;
  const turn = rotation(m);
  const img = new Image();
  if (turn && /^https?:/.test(scanUrl(m))) img.crossOrigin = "anonymous";   // needed to redraw a scan hosted elsewhere
  img.onload = () => {
    if (req !== viewerReq || !viewerMap) return;       // user already moved on
    if (viewerLayer) viewerMap.removeLayer(viewerLayer);
    const o = orient(img, turn);
    const bounds = [[0, 0], [o.h, o.w]];
    viewerLayer = L.imageOverlay(o.src, bounds).addTo(viewerMap);
    viewerMap.setMaxBounds(L.latLngBounds(bounds).pad(0.5));
    viewerMap.fitBounds(bounds);
  };
  img.onerror = () => { if (req === viewerReq) title.textContent = m.title + " (image not found)"; };
  img.src = scanUrl(m);
  // warm the cache for the neighbours so cycling feels instant
  [viewerIndex - 1, viewerIndex + 1].forEach(i => { if (viewerList[i]) new Image().src = scanUrl(viewerList[i]); });
}

function stepViewer(delta) {
  const next = viewerIndex + delta;
  if (next < 0 || next >= viewerList.length) return;
  viewerIndex = next;
  showScan();
}

function closeViewer() {
  document.getElementById("viewer").classList.remove("open");
  if (viewerMap) { viewerMap.remove(); viewerMap = null; viewerLayer = null; }
  viewerReq++;
}

document.getElementById("viewer-close").addEventListener("click", closeViewer);
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
  document.getElementById("details").innerHTML =
    `<p class="note"><strong>The map data could not be loaded.</strong> ${esc(err.message)}<br>
    If you opened this page straight from your computer, use a local web server or view the site on GitHub Pages.</p>`;
  console.error(err);
});
