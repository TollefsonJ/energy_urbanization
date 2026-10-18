/* ==========================================================
   GOOGLE ANALYTICS
   Loaded from the <head> of every page.

   GA_ID is the Measurement ID from Google Analytics
   (Admin > Data streams > your web stream). Set it to ""
   to switch tracking off everywhere.

   Visits from a local test server are ignored, so your own
   reloads on localhost do not show up in the statistics.
   ========================================================== */
const GA_ID = "G-KYGC5N9LED";

(function () {
  if (!GA_ID || GA_ID.indexOf("G-") !== 0) return;

  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "" || h.endsWith(".local")) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", GA_ID);
})();