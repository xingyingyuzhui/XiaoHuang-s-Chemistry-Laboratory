const test = require('node:test');
const assert = require('node:assert/strict');

test('feature loader: same feature only loads factory once', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let callCount = 0;

  const factory = async () => {
    callCount++;
    return { init: true };
  };

  const r1 = await loader.load('mol', factory);
  const r2 = await loader.load('mol', factory);

  assert.equal(callCount, 1, 'factory should only be called once');
  assert.equal(r1.mod.init, true);
  assert.equal(r2.mod.init, true);
  assert.equal(r1.mod, r2.mod);
  assert.equal(loader.has('mol'), true);
});

test('feature loader: different features load independently', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let molCount = 0;
  let elecCount = 0;

  const r1 = await loader.load('mol', async () => { molCount++; return 'mol'; });
  const r2 = await loader.load('elec', async () => { elecCount++; return 'elec'; });

  assert.equal(molCount, 1);
  assert.equal(elecCount, 1);
  assert.equal(r1.mod, 'mol');
  assert.equal(r2.mod, 'elec');
});

test('feature loader: re-enter after other feature still returns cache (not false-stale)', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let molFactory = 0;
  let classFactory = 0;
  let molInited = 0;

  async function ensureMol() {
    const { mod } = await loader.load('molecule', async () => {
      molFactory++;
      return { name: 'mol' };
    });
    if (molInited === 0) {
      molInited++;
      assert.equal(mod.name, 'mol');
    }
    return true;
  }

  // 模拟 main：switchSeq 保护切页；loader 不得因加载了 classroom 而拒绝 molecule
  let switchSeq = 0;
  async function enter(name) {
    const mySeq = ++switchSeq;
    if (name === 'molecule') {
      await ensureMol();
      return mySeq === switchSeq;
    }
    if (name === 'classroom') {
      await loader.load('classroom', async () => {
        classFactory++;
        return { name: 'class' };
      });
      return mySeq === switchSeq;
    }
    return true;
  }

  assert.equal(await enter('molecule'), true);
  assert.equal(await enter('classroom'), true);
  assert.equal(await enter('molecule'), true, 're-enter molecule must succeed');
  assert.equal(molFactory, 1, 'molecule factory only once');
  assert.equal(classFactory, 1);
  assert.equal(molInited, 1, 'molecule init only once');
});

test('feature loader: rapid tab switch discards stale activation via switchSeq', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let switchSeq = 0;
  const started = [];

  async function switchTo(name, delayMs) {
    const mySeq = ++switchSeq;
    const { mod } = await loader.load(name, async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      return { name };
    });
    // 只有当前 Tab 请求才能「启动」
    if (mySeq !== switchSeq) return { activated: false, name: mod.name };
    started.push(mod.name);
    return { activated: true, name: mod.name };
  }

  const pSlow = switchTo('molecule', 40);
  const pFast = switchTo('classroom', 5);
  const [slow, fast] = await Promise.all([pSlow, pFast]);

  assert.equal(fast.activated, true);
  assert.equal(slow.activated, false, 'slower previous tab must not activate');
  assert.deepEqual(started, ['classroom']);
});

test('feature loader: failed load allows retry', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let attempts = 0;

  try {
    await loader.load('fail', async () => {
      attempts++;
      throw new Error('network');
    });
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.message, 'network');
    assert.equal(attempts, 1);
  }

  const r = await loader.load('fail', async () => {
    attempts++;
    return 'ok';
  });
  assert.equal(r.mod, 'ok');
  assert.equal(attempts, 2, 'second attempt should succeed');
});

test('feature loader: concurrent loads for same feature share promise', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const loader = createFeatureLoader();
  let callCount = 0;

  const factory = async () => {
    callCount++;
    await new Promise((r) => setTimeout(r, 10));
    return 'shared';
  };

  const [r1, r2] = await Promise.all([
    loader.load('concurrent', factory),
    loader.load('concurrent', factory),
  ]);

  assert.equal(callCount, 1, 'concurrent requests should share one factory call');
  assert.equal(r1.mod, 'shared');
  assert.equal(r2.mod, 'shared');
});

/**
 * 模拟 runFeatureLoad：成功/过期/失败时占位层 hidden 状态
 * （对应课堂交卷后仍见「加载中」的根因：加载结束未真正 hide）
 */
test('runFeatureLoad-like lifecycle always hides overlay after success or cancel', async () => {
  const { createFeatureLoader } = await import('../src/feature-loader.js');
  const {
    showPanelLoading,
    hidePanelLoading,
    showPanelError,
  } = await import('../src/panel-loading.js');

  function createMockPanel() {
    const nodes = [];
    const doc = {
      createElement() {
        return {
          className: '',
          textContent: '',
          hidden: false,
          attrs: {},
          setAttribute(k, v) {
            this.attrs[k] = v == null ? '' : String(v);
          },
          hasAttribute(k) {
            return Object.prototype.hasOwnProperty.call(this.attrs, k);
          },
          getAttribute(k) {
            return this.attrs[k] ?? null;
          },
        };
      },
    };
    return {
      ownerDocument: doc,
      querySelector(sel) {
        if (sel === '[data-panel-loading]') {
          return nodes.find((n) => n.hasAttribute('data-panel-loading')) || null;
        }
        return null;
      },
      prepend(el) {
        nodes.unshift(el);
      },
    };
  }

  const loader = createFeatureLoader();
  let switchSeq = 0;
  const panel = createMockPanel();

  async function runFeatureLoad(mySeq, ensureReady) {
    showPanelLoading(panel);
    try {
      await ensureReady();
      if (mySeq !== switchSeq) {
        hidePanelLoading(panel);
        return false;
      }
      hidePanelLoading(panel);
      return true;
    } catch (err) {
      if (mySeq !== switchSeq) {
        hidePanelLoading(panel);
        return false;
      }
      showPanelError(panel, err.message || String(err));
      return false;
    }
  }

  // 成功：hide
  const s1 = ++switchSeq;
  assert.equal(
    await runFeatureLoad(s1, async () => {
      await loader.load('classroom', async () => ({ ok: true }));
    }),
    true,
  );
  assert.equal(panel.querySelector('[data-panel-loading]').hidden, true);

  // 过期取消：hide（不留加载中）
  const s2 = ++switchSeq;
  const pending = runFeatureLoad(s2, async () => {
    await new Promise((r) => setTimeout(r, 30));
    await loader.load('battle', async () => ({ ok: true }));
  });
  switchSeq += 1; // 用户已切走
  assert.equal(await pending, false);
  assert.equal(panel.querySelector('[data-panel-loading]').hidden, true);

  // 失败且仍是当前 tab：显示错误且 hidden=false
  const s3 = ++switchSeq;
  assert.equal(
    await runFeatureLoad(s3, async () => {
      throw new Error('chunk load failed');
    }),
    false,
  );
  const errEl = panel.querySelector('[data-panel-loading]');
  assert.equal(errEl.hidden, false);
  assert.match(errEl.textContent, /chunk load failed/);
});
