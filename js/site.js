/* ==========================================================
   SITE SETTINGS  -  edit this block to change the title, menu,
   and footer on EVERY page at once.
   ========================================================== */
const SITE = {
  title: "Energy and Urbanization",                 // <- replace with your project name
  tagline: "A short line describing the project",

  // Menu items: label shown, and the page it links to
  menu: [
    /* { label: "Home",        href: "index.html" }, */
    { label: "MGI Atlas", href: "map.html" },
   /*  { label: "Methods",    href: "methods.html" }, */
    { label: "Publications", href: "publications.html" },
   /* { label: "People",      href: "people.html" },*/
    { label: "Contact",     href: "contact.html" }
  ],

  // Footer acknowledgments. Add logos by putting image files in images/
  // and listing them here, e.g. { name: "Funder name", logo: "images/funder.png", url: "https://example.org" }
  acknowledgments: "Historical maps courtesy of the Library of Congress.",
  partners: [
    // { name: "Funder name", logo: "images/funder.png", url: "https://example.org" }
  ],
  copyright: "© 2026 Jonathan Tollefson"
};

/* ----------------------------------------------------------
   Everything below builds the header and footer. You normally
   do not need to edit it.
   ---------------------------------------------------------- */

/* Sun and moon icons for the dark mode button. */
const ICON_SUN = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4.2"/>
  <path d="M12 2.7v2.3M12 19v2.3M2.7 12h2.3M19 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/>
</svg>`;
const ICON_MOON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M20.2 14.6A8.6 8.6 0 1 1 9.4 3.8a6.9 6.9 0 0 0 10.8 10.8z"/>
</svg>`;

(function () {
  const root = document.body.dataset.root || "";   // "" for top-level pages, "../" inside /articles
  const here = location.pathname.split("/").pop() || "index.html";

  const header = document.getElementById("site-header");
  if (header) {
    const links = SITE.menu.map(m => {
      const current = (m.href === here) || (here.startsWith("article-") && m.href === "articles.html");
      return `<li><a href="${root}${m.href}"${current ? ' aria-current="page"' : ""}>${m.label}</a></li>`;
    }).join("");
    header.innerHTML = `
      <div class="header-inner">
        <a class="site-title" href="${root}index.html">${SITE.title}</a>
        <div class="header-controls">
          <button class="menu-toggle" aria-expanded="false" aria-controls="site-menu">Menu</button>
          <button class="theme-toggle" type="button"></button>
        </div>
        <nav aria-label="Main"><ul id="site-menu">${links}</ul></nav>
      </div>
      <div class="sanborn-key" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;

    const btn = header.querySelector(".menu-toggle");
    btn.addEventListener("click", () => {
      const open = header.classList.toggle("menu-open");
      btn.setAttribute("aria-expanded", open);
    });

    // Dark mode button. js/theme.js (loaded in the <head>) applies the
    // saved choice before the page is drawn; this just flips it.
    // In dark mode it shows a sun, because clicking it brings the light.
    const themeBtn = header.querySelector(".theme-toggle");
    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
    const syncThemeBtn = () => {
      const label = isDark() ? "Switch to light mode" : "Switch to dark mode";
      themeBtn.innerHTML = isDark() ? ICON_SUN : ICON_MOON;
      themeBtn.setAttribute("aria-label", label);
      themeBtn.setAttribute("title", label);
    };
    syncThemeBtn();
    themeBtn.addEventListener("click", () => {
      const goingLight = isDark();
      if (goingLight) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("theme", goingLight ? "light" : "dark"); } catch (e) {}
      syncThemeBtn();
    });
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    const logos = SITE.partners.map(p =>
      `<a href="${p.url}"><img src="${root}${p.logo}" alt="${p.name}"></a>`).join("");
    footer.innerHTML = `
      <div class="footer-inner">
        <p class="ack">${SITE.acknowledgments}</p>
        ${logos ? `<div class="logos">${logos}</div>` : ""}
        <p class="copyright">${SITE.copyright}</p>
      </div>`;
  }
})();
