(function defineNativeTeamInvite(root) {
  'use strict';

  function getModule(name) {
    try { return root.__require?.(name); } catch { return undefined; }
  }

  function install(report, copyTeamId) {
    const platform = getModule('PlatformManager')?.PlatformManager?.instance;
    const originalCopy = platform?.setClipboardData;
    if (typeof originalCopy === 'function') {
      platform.setClipboardData = function (options) {
        const id = typeof options?.data === 'string' || typeof options?.data === 'number' ? String(options.data) : '';
        if (!/^\d{1,20}$/.test(id)) return originalCopy.call(this, options);
        void copyTeamId(id).then((ok) => {
          try {
            if (ok) options.success?.();
            else if (options.fail) options.fail();
            else report('team-copy-failed');
          } finally {
            options.complete?.();
          }
        }).catch(() => report('team-copy-failed'));
      };
    }

    const dialog = getModule('TeamUpShareChatDialog')?.TeamUpShareChatDialog?.prototype;
    if (!dialog) return;
    const recovering = new WeakSet();
    function recover(instance) {
      if (recovering.has(instance)) return;
      recovering.add(instance);
      report('team-invite-failed');
      // Let the current UI lifecycle unwind before closing this proxy and its own mask.
      queueMicrotask(async () => {
        try {
          try {
            if (await instance.close() !== false) return;
          } catch { /* Fall back to the proxy's own hide lifecycle. */ }
          try { await instance.hide(); } catch { /* The proxy may already have been removed. */ }
        } finally {
          recovering.delete(instance);
        }
      });
    }
    for (const method of ['onAwake', 'onShown']) {
      const original = dialog[method];
      if (typeof original !== 'function') continue;
      dialog[method] = function (...args) {
        try {
          const result = original.apply(this, args);
          return result && typeof result.then === 'function'
            ? Promise.resolve(result).catch(() => recover(this)) : result;
        } catch { recover(this); }
      };
    }
  }

  root.installNativeTeamInvite = install;
})(window);
