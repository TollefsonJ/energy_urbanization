# Project site: how to update it

**Change the title, menu, or footer:** edit the block at the top of `js/site.js`.
**Change the text on a page:** open the .html file and edit the words between the tags.
**Change colors and fonts:** edit the block at the top of `css/style.css`.
**Add or fix points and maps:** edit `data/atlas.xlsx` (sheets Points, Maps, Links), save, and upload it over the old one.
  - Points: set `status` to show or hide. Fill in `name` and `description` to appear on the map.
  - Links: one row per point-and-map pairing.
  - Review: sheet IDs with no JPEG found yet (the site ignores this sheet).

**Publish on GitHub Pages:** upload all of these files to a GitHub repository, then Settings > Pages > Deploy from branch > main > /(root).
**Preview on your own computer:** the map must be opened through a web server, not by double-clicking.
Run `python3 -m http.server` in this folder and visit http://localhost:8000.

**Add a new map scan:** copy the JPEG into the `maps` folder, then add a row to the Maps sheet (map_id and jpeg = the filename) and a row to the Links sheet for each point it belongs to.
