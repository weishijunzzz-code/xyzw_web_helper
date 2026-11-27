(function useMainFrameGameHttp() {
  "use strict";

  if (window.parent === window) return;

  const childBridge = window.Capacitor;
  let parentBridge;
  try {
    if (window.parent.location.origin !== window.location.origin) return;
    parentBridge = window.parent.Capacitor;
  } catch {
    // Cross-origin embeddings cannot use the application's native HTTP bridge.
    return;
  }
  if (childBridge === parentBridge || childBridge?.getPlatform?.() !== "android" ||
      parentBridge?.getPlatform?.() !== "android" ||
      typeof childBridge.nativePromise !== "function" || typeof parentBridge.nativePromise !== "function") return;

  const apiOrigin = "https://xxz-xyzw.hortorgames.com";
  const allowedOrigins = new Set([
    apiOrigin,
    "https://xxz-xyzw-res.hortorgames.com",
  ]);
  const childRequest = childBridge.nativePromise.bind(childBridge);
  const parentRequest = parentBridge.nativePromise.bind(parentBridge);

  function httpsUrl(input) {
    try {
      const url = new URL(input);
      if (url.protocol === "https:" && !url.username && !url.password) return url;
    } catch { /* Preserve the original handling of unparseable or relative URLs. */ }
    return null;
  }

  const browserXhr = window.CapacitorWebXMLHttpRequest;
  const patchedXhr = window.XMLHttpRequest;
  if (browserXhr?.prototype && browserXhr.fullObject !== patchedXhr && typeof patchedXhr === "function") {
    const methods = ["send", "abort", "setRequestHeader", "getAllResponseHeaders", "getResponseHeader"];
    const responseProperties = ["readyState", "status", "response", "responseText", "responseURL"];
    const descriptors = responseProperties.map(name => [name, Object.getOwnPropertyDescriptor(browserXhr.prototype, name)]);

    window.XMLHttpRequest = new Proxy(patchedXhr, {
      construct(target, args) {
        const xhr = Reflect.construct(target, args);
        const patchedOpen = xhr.open;
        const shadowed = new Set();
        let useBrowserPost = false;

        xhr.open = function (method, url, ...openOptions) {
          const nextUsesBrowser = String(method).toUpperCase() === "POST" && httpsUrl(url)?.origin === apiOrigin;
          if (nextUsesBrowser) {
            for (const name of shadowed) delete this[name];
            shadowed.clear();
          } else {
            if (useBrowserPost && this.readyState > 0 && this.readyState < 4) browserXhr.abort.call(this);
            // Capacitor defines these properties on POST. Keep our shadows removable
            // so a subsequent browser request can use the native getters again.
            for (const [name, descriptor] of descriptors) {
              if (descriptor && !Object.prototype.hasOwnProperty.call(this, name)) {
                Object.defineProperty(this, name, { ...descriptor, configurable: true });
                shadowed.add(name);
              }
            }
          }
          useBrowserPost = nextUsesBrowser;
          const open = useBrowserPost ? browserXhr.open : patchedOpen;
          return open.call(this, method, url, ...openOptions);
        };

        for (const name of methods) {
          const patched = xhr[name];
          xhr[name] = function (...params) {
            const method = useBrowserPost ? browserXhr[name] : patched;
            return method.apply(this, params);
          };
        }
        return xhr;
      },
    });
  }

  // Capacitor's patched fetch/XHR can call native HTTP, but Android only
  // accepts plugin requests from the main frame. Keep its body/response handling.
  childBridge.nativePromise = (plugin, method, options) => {
    if (plugin === "CapacitorHttp" && method === "request" && typeof options?.url === "string") {
      const url = httpsUrl(options.url);
      const isSwitchStatus = url?.origin === "https://comb-platform.hortorgames.com" &&
        url.pathname === "/comb-custom-switch-server/api/v1/switch/multi/status" &&
        String(options.method).toUpperCase() === "POST";
      if (allowedOrigins.has(url?.origin) || isSwitchStatus) {
        return parentRequest(plugin, method, options);
      }
    }
    return childRequest(plugin, method, options);
  };
})();
