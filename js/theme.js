/* ==========================================================
   DARK MODE  -  this file is loaded in the <head> of every page
   so the right colors are applied before anything is drawn.
   It remembers the visitor's choice in the browser.

   Dark is the default. To make light the default instead,
   change  DEFAULT_DARK = true  to  false  below.
   ========================================================== */
(function () {
  var DEFAULT_DARK = true;
  try {
    var saved = localStorage.getItem("theme");
    var dark = saved ? saved === "dark" : DEFAULT_DARK;
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {
    if (DEFAULT_DARK) document.documentElement.setAttribute("data-theme", "dark");
  }
})();
