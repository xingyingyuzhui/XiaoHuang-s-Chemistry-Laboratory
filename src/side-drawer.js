/**
 * 一级页二级侧栏：可收起抽屉轨
 * 用法：aside.sidebar.side-drawer[data-drawer-key="molecule"]
 *       内含 .side-drawer-head（标题+toggle）+ .side-drawer-body（内容）
 */

const STORAGE_PREFIX = 'side-drawer:';

/**
 * 绑定单个可收起抽屉（支持动态懒加载面板如 data-drawer="crystal"）
 * @param {HTMLElement} aside
 * @param {{ onToggle?: (key: string, collapsed: boolean) => void }} [options]
 */
export function bindSideDrawer(aside, options = {}) {
  if (!aside || aside.dataset.drawerBound === '1') return;
  const key = aside.dataset.drawerKey || aside.dataset.drawer;
  if (!key) return;
  const { onToggle } = options;

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
  aside.dataset.drawerBound = '1';

  const apply = (collapsed, { persist = true, notify = true } = {}) => {
    aside.classList.toggle('is-collapsed', collapsed);
    const panel = aside.closest('.panel');
    if (panel) panel.classList.toggle('has-drawer-collapsed', collapsed);
    const shell = aside.closest('.crystal-shell');
    if (shell) shell.classList.toggle('has-drawer-collapsed', collapsed);
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
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_PREFIX + key);
    initial = stored === '1';
  } catch {
    initial = false;
  }
  // 窄屏默认收起（若用户没记过偏好）
  if (stored == null && window.matchMedia('(max-width: 900px)').matches) {
    initial = true;
  }
  apply(initial, { persist: false, notify: false });

  toggle.addEventListener('click', () => {
    const next = !aside.classList.contains('is-collapsed');
    apply(next);
  });
}

/**
 * @param {object} [options]
 * @param {(key: string, collapsed: boolean) => void} [options.onToggle]
 */
export function initSideDrawers(options = {}) {
  const drawers = document.querySelectorAll('.side-drawer[data-drawer-key], .side-drawer[data-drawer]');
  drawers.forEach((aside) => bindSideDrawer(aside, options));
}

/** 供外部查询 */
export function isSideDrawerCollapsed(key) {
  const el = document.querySelector(
    `.side-drawer[data-drawer-key="${key}"], .side-drawer[data-drawer="${key}"]`,
  );
  return !!el?.classList.contains('is-collapsed');
}
