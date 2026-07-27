/**
 * 一级页二级侧栏：可收起抽屉轨
 * 用法：aside.sidebar.side-drawer[data-drawer-key="molecule"]
 *       内含 .side-drawer-head（标题+toggle）+ .side-drawer-body（内容）
 */

const STORAGE_PREFIX = 'side-drawer:';

/**
 * @param {object} [options]
 * @param {(key: string, collapsed: boolean) => void} [options.onToggle]
 */
export function initSideDrawers(options = {}) {
  const { onToggle } = options;
  const drawers = document.querySelectorAll('.side-drawer[data-drawer-key]');

  drawers.forEach((aside) => {
    const key = aside.dataset.drawerKey;
    if (!key) return;

    let toggle = aside.querySelector('.side-drawer-toggle');
    if (!toggle) {
      const head = aside.querySelector('.side-drawer-head');
      if (head) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'side-drawer-toggle';
        toggle.setAttribute('aria-label', '收起侧栏');
        head.appendChild(toggle);
      }
    }
    if (!toggle) return;

    const apply = (collapsed, { persist = true, notify = true } = {}) => {
      aside.classList.toggle('is-collapsed', collapsed);
      const panel = aside.closest('.panel');
      if (panel) panel.classList.toggle('has-drawer-collapsed', collapsed);
      toggle.textContent = collapsed ? '»' : '«';
      toggle.title = collapsed ? '展开侧栏' : '收起侧栏';
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (persist) {
        try {
          localStorage.setItem(STORAGE_PREFIX + key, collapsed ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      if (notify && typeof onToggle === 'function') {
        onToggle(key, collapsed);
      }
    };

    let initial = false;
    try {
      initial = localStorage.getItem(STORAGE_PREFIX + key) === '1';
    } catch {
      initial = false;
    }
    // 窄屏默认收起（若用户没记过偏好）
    if (localStorage.getItem(STORAGE_PREFIX + key) == null && window.matchMedia('(max-width: 900px)').matches) {
      initial = true;
    }
    apply(initial, { persist: false, notify: false });

    toggle.addEventListener('click', () => {
      const next = !aside.classList.contains('is-collapsed');
      apply(next);
    });
  });
}

/** 供外部查询 */
export function isSideDrawerCollapsed(key) {
  const el = document.querySelector(`.side-drawer[data-drawer-key="${key}"]`);
  return !!el?.classList.contains('is-collapsed');
}
