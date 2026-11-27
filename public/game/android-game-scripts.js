(function defineLocalGameScripts(root) {
  'use strict';

  function scopedApis(script, account) {
    const prefix = `local-userscript:${account}:${script.id}:`;
    const storage = root.localStorage;
    const getValue = (key, fallback) => {
      const value = storage.getItem(prefix + key);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch { return fallback; }
    };
    const setValue = (key, value) => {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) deleteValue(key);
      else storage.setItem(prefix + key, encoded);
    };
    const deleteValue = key => storage.removeItem(prefix + key);
    const listValues = () => Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(key => key?.startsWith(prefix)).map(key => key.slice(prefix.length));
    const addStyle = (css) => {
      const style = root.document.createElement('style');
      style.textContent = css;
      root.document.head.appendChild(style);
      return style;
    };
    const info = { scriptHandler: 'XYZW', script: { name: script.name, version: script.version || '' } };
    return {
      GM_getValue: getValue, GM_setValue: setValue, GM_deleteValue: deleteValue, GM_listValues: listValues,
      GM_addStyle: addStyle, GM_info: info, unsafeWindow: root,
      GM: {
        getValue: async (...args) => getValue(...args), setValue: async (...args) => setValue(...args),
        deleteValue: async (...args) => deleteValue(...args), listValues: async () => listValues(), addStyle, info,
      },
    };
  }

  function createRunner(entries, account, report) {
    const executed = new Set();
    return function runScripts(phase) {
      for (const script of entries) {
        if ((script.runAt || 'document-end') !== phase || executed.has(script.id)) continue;
        executed.add(script.id);
        const metadata = script.code.slice(0, 64 * 1024)
          .match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/)?.[1] ?? '';
        if (/^\s*\/\/\s*@(?:require|resource)\s/m.test(metadata)) {
          report(script.id, 'unsupported', 'external-script-dependency');
          continue;
        }
        try {
          const apis = scopedApis(script, account);
          // eslint-disable-next-line no-new-func -- Runs explicitly enabled code only in the isolated game document.
          const execute = new Function(...Object.keys(apis), script.code);
          const returned = execute.call(root, ...Object.values(apis));
          if (returned && typeof returned.then === 'function') {
            Promise.resolve(returned).then(
              () => report(script.id, 'loaded'),
              () => report(script.id, 'failed', 'script-runtime-error'),
            );
          } else {
            report(script.id, 'loaded');
          }
        } catch (error) {
          report(script.id, 'failed', error?.name === 'SyntaxError' ? 'script-syntax-error' : 'script-runtime-error');
        }
      }
    };
  }

  root.createLocalGameScriptRunner = createRunner;
})(window);
