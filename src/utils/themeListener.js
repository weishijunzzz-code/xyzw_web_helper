/**
 * Subscribe to a media query and return its matching cleanup operation.
 * @param {MediaQueryList} mediaQuery System-theme media query.
 * @param {Function} listener Callback to invoke when the query changes.
 * @returns {Function} Unsubscribes the same callback, including on legacy browsers.
 */
export function listenForThemeChanges(mediaQuery, listener) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }
  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}
