export const THEME_KEY = "theme";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong theme.
 * A plain string in a plain module: the server layout inlines it, and it must work before React loads.
 */
export const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
