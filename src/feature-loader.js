/**
 * 功能模块按需加载器
 * - 缓存：同一功能只加载一次
 * - 去重：并发请求同一功能只触发一次 import
 * - 失败清缓存：允许下次重试
 *
 * 过期保护（快速切 Tab）由 main.js 的 switchSeq 负责，
 * 不要用「全局 load 序号」判断过期——否则 A→B→A 再进会误判 stale。
 */

export function createFeatureLoader() {
  /** @type {Map<string, Promise<{ mod: any }>>} */
  const cache = new Map();

  return {
    /**
     * @param {string} name
     * @param {() => Promise<any>} factory
     * @returns {Promise<{ mod: any }>}
     */
    load(name, factory) {
      if (cache.has(name)) {
        return cache.get(name);
      }
      const p = factory()
        .then((mod) => ({ mod }))
        .catch((err) => {
          cache.delete(name);
          throw err;
        });
      cache.set(name, p);
      return p;
    },

    /** 是否已有进行中或已完成的加载（含失败重试前的缓存） */
    has(name) {
      return cache.has(name);
    },

    /** 测试 / 调试：强制清缓存 */
    clear(name) {
      if (name == null) cache.clear();
      else cache.delete(name);
    },
  };
}
