export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
/** Fired on <html> whenever the theme changes, from the toggle or the OS. */
export const THEME_EVENT = "themechange";
/** Mirrors --bg in globals.css for each theme, for the browser's theme-color. */
const THEME_COLOR: Record<Theme, string> = { light: "#f6f6f4", dark: "#0a0a0b" };

/**
 * Runs inline in <head>, before first paint, so the page never flashes the wrong theme. A choice
 * made with the toggle is kept in localStorage; without one the page follows the OS, live.
 * Plain ES5 in a string: it runs before any bundle loads.
 */
export const themeBootScript = `(function () {
  var root = document.documentElement;
  var colors = ${JSON.stringify(THEME_COLOR)};
  var query = window.matchMedia("(prefers-color-scheme: light)");
  function saved() {
    try { var t = localStorage.getItem("${STORAGE_KEY}"); return t === "light" || t === "dark" ? t : null; } catch (e) { return null; }
  }
  function apply(theme) {
    root.dataset.theme = theme;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", colors[theme]);
    root.dispatchEvent(new Event("${THEME_EVENT}"));
  }
  apply(saved() || (query.matches ? "light" : "dark"));
  query.addEventListener("change", function () { if (!saved()) apply(query.matches ? "light" : "dark"); });
  window.__setTheme = function (theme) {
    try { localStorage.setItem("${STORAGE_KEY}", theme); } catch (e) {}
    apply(theme);
  };
})();`;

/** The theme on the page right now. Dark if the boot script never ran (no JS). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches to the other theme and remembers the choice. */
export function toggleTheme() {
  const next: Theme = currentTheme() === "light" ? "dark" : "light";
  (window as unknown as { __setTheme?: (t: Theme) => void }).__setTheme?.(next);
}
