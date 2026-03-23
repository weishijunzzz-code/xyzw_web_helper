import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

export function useKeyboardShortcuts() {
  const router = useRouter();
  
  const shortcuts = [
    {
      key: 'k',
      ctrl: true,
      description: '快速搜索',
      action: () => {
        // 触发搜索框聚焦
        const searchInput = document.querySelector('[data-shortcut="search"]');
        if (searchInput) {
          searchInput.focus();
        }
      }
    },
    {
      key: 'r',
      ctrl: true,
      description: '刷新数据',
      action: () => {
        window.location.reload();
      }
    },
    {
      key: 'h',
      ctrl: true,
      description: '返回首页',
      action: () => {
        router.push('/admin/dashboard');
      }
    },
    {
      key: 't',
      ctrl: true,
      description: 'Token管理',
      action: () => {
        router.push('/tokens');
      }
    },
    {
      key: 'f',
      ctrl: true,
      description: '游戏功能',
      action: () => {
        router.push('/admin/game-features');
      }
    },
    {
      key: 'Escape',
      description: '关闭弹窗/返回',
      action: () => {
        // 关闭所有弹窗
        const modals = document.querySelectorAll('.n-modal-mask');
        if (modals.length > 0) {
          const closeButtons = document.querySelectorAll('.n-modal-close');
          closeButtons.forEach(btn => btn.click());
        }
      }
    },
    {
      key: '?',
      shift: true,
      description: '显示快捷键帮助',
      action: () => {
        showShortcutsHelp();
      }
    }
  ];

  const showShortcutsHelp = () => {
    // 创建快捷键帮助弹窗
    const helpDiv = document.createElement('div');
    helpDiv.className = 'keyboard-shortcuts-help';
    helpDiv.innerHTML = `
      <div class="shortcuts-overlay" onclick="this.remove()">
        <div class="shortcuts-modal" onclick="event.stopPropagation()">
          <div class="shortcuts-header">
            <h3>键盘快捷键</h3>
            <button class="close-btn" onclick="this.closest('.keyboard-shortcuts-help').remove()">×</button>
          </div>
          <div class="shortcuts-list">
            ${shortcuts.map(s => `
              <div class="shortcut-item">
                <span class="shortcut-keys">
                  ${s.ctrl ? '<kbd>Ctrl</kbd> + ' : ''}
                  ${s.shift ? '<kbd>Shift</kbd> + ' : ''}
                  <kbd>${s.key}</kbd>
                </span>
                <span class="shortcut-desc">${s.description}</span>
              </div>
            `).join('')}
          </div>
          <div class="shortcuts-footer">
            按 <kbd>?</kbd> 显示此帮助
          </div>
        </div>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .keyboard-shortcuts-help {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      }
      .shortcuts-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .shortcuts-modal {
        background: var(--bg-primary, #fff);
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      .shortcuts-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      .shortcuts-header h3 {
        margin: 0;
        font-size: 20px;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }
      .close-btn:hover {
        background: var(--bg-tertiary, #f0f0f0);
      }
      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background: var(--bg-secondary, #f5f5f5);
        border-radius: 8px;
      }
      .shortcut-keys {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      kbd {
        background: var(--bg-tertiary, #e0e0e0);
        border: 1px solid var(--border-light, #ccc);
        border-radius: 4px;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 12px;
        box-shadow: 0 2px 0 var(--border-light, #ccc);
      }
      .shortcut-desc {
        color: var(--text-secondary, #666);
        font-size: 14px;
      }
      .shortcuts-footer {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--border-light, #eee);
        text-align: center;
        color: var(--text-tertiary, #999);
        font-size: 13px;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(helpDiv);
    
    // ESC 关闭
    const closeOnEsc = (e) => {
      if (e.key === 'Escape') {
        helpDiv.remove();
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    document.addEventListener('keydown', closeOnEsc);
  };

  const handleKeyDown = (event) => {
    // 如果在输入框中，不触发快捷键
    if (event.target.tagName === 'INPUT' || 
        event.target.tagName === 'TEXTAREA' ||
        event.target.contentEditable === 'true') {
      return;
    }

    const shortcut = shortcuts.find(s => {
      const keyMatch = event.key.toLowerCase() === s.key.toLowerCase();
      const ctrlMatch = !!s.ctrl === event.ctrlKey || event.metaKey;
      const shiftMatch = !!s.shift === event.shiftKey;
      return keyMatch && ctrlMatch && shiftMatch;
    });

    if (shortcut) {
      event.preventDefault();
      shortcut.action();
    }
  };

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return {
    shortcuts,
    showShortcutsHelp
  };
}

export default useKeyboardShortcuts;
