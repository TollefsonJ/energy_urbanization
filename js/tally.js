/* ==========================================================
   THE TALLY LINE
   "N sites identified across N regions, the result of
   analyzing N map documents."

   Shared by the atlas page and the front page so the two can
   never disagree. Both count from the same workbook with the
   same rule for what a site is: drawn on the map, meaning
   status = show and real coordinates. Hiding a site lowers
   the count rather than advertising something a visitor
   cannot find.

   The map page already has the workbook parsed and calls
   renderTally directly. Any other page gets the numbers by
   putting data-workbook on the paragraph, which makes this
   file fetch and parse the workbook itself:

     <p class="map-tally" id="map-tally"
        data-workbook="data/atlas.xlsx"></p>

   The document total is the sum of n_maps on the Total Maps
   sheet - whole volumes read to find these sites, not the
   sheets kept in maps/ - so it is far larger than the Maps
   sheet, by design.
   ========================================================== */

/* The points that actually appear on the map. */
function visibleSites(points) {
  return (points || []).filter(p =>
    String(p.status).toLowerCase() === "show" && p.lat !== "" && p.lon !== "");
}

function renderTally(points, totals) {
  const el = document.getElementById("map-tally");
  if (!el) return;
  const sites = visibleSites(points);
  const regions = new Set(sites.map(p => p.city)).size;
  const docs = (totals || []).reduce((sum, row) => {
    const n = Number(String(row.n_maps == null ? "" : row.n_maps).replace(/[, ]/g, ""));
    return sum + (isFinite(n) ? n : 0);
  }, 0);

  const num = n => `<span class="tally-num">${n.toLocaleString()}</span>`;
  const plural = (n, word) => n === 1 ? word : word + "s";
  const head = `${num(sites.length)} ${plural(sites.length, "site")} identified `
             + `across ${num(regions)} ${plural(regions, "region")}`;
  el.innerHTML = docs
    ? `${head}, the result of analyzing ${num(docs)} map ${plural(docs, "document")}.`
    : `${head}.`;
}

/* For pages that do not otherwise load the workbook. Quietly does
   nothing if the file cannot be read, rather than leaving an error
   where a sentence should be. */
function loadTally(file) {
  if (typeof XLSX === "undefined") return;
  fetch(file)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(buf => {
      const wb = XLSX.read(buf);
      const sheet = name => wb.Sheets[name]
        ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) : [];
      renderTally(sheet("Points"), sheet("Total Maps"));
    })
    .catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("map-tally");
  if (el && el.dataset.workbook) loadTally(el.dataset.workbook);
});
