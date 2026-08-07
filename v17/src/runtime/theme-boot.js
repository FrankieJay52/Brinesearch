/* Applied before first paint so a driver who picked Daylight never sees a
   dark flash on load. */
(function () {
  var t = "night";
  try { var s = localStorage.getItem("brinesearch.theme.v1"); if (s === "day" || s === "night") t = s; } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
})();
