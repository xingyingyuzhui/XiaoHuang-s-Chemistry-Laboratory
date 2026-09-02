/**
 * Express 4 路由存在性探测（health / stage 冒烟 / 单测）
 */

const { CAPABILITY_ROUTE_SPECS } = require('./capabilities');

function normalizePath(prefix, segment) {
  const joined = `${prefix}${segment}`
    .replace(/\/+\?\//g, '/')
    .replace(/\/\?$/g, '')
    .replace(/\/+/g, '/');
  return joined.endsWith('/') && joined.length > 1 ? joined.slice(0, -1) : joined;
}

function mountPrefixFromLayer(layer) {
  if (layer.fast_slash) return '';
  if (!layer.regexp) return '';
  const src = layer.regexp.source;
  const cleaned = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\).*$/i, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)/i, '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
  if (!cleaned || cleaned === '/?') return '';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function walkRoutes(stack, prefix, hits) {
  for (const layer of stack || []) {
    if (layer.route) {
      const routePath = normalizePath(prefix, layer.route.path);
      for (const method of Object.keys(layer.route.methods)) {
        hits.push({ method: method.toUpperCase(), path: routePath });
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle?.stack) {
      const mount = mountPrefixFromLayer(layer);
      walkRoutes(layer.handle.stack, normalizePath(prefix, mount), hits);
    }
  }
}

function listRoutes(app) {
  /** @type {{ method: string, path: string }[]} */
  const hits = [];
  walkRoutes(app?._router?.stack, '', hits);
  return hits;
}

function hasRoute(app, method, path) {
  const targetMethod = String(method || '').toUpperCase();
  const targetPath = normalizePath('', path);
  return listRoutes(app).some(
    (route) => route.method === targetMethod && route.path === targetPath,
  );
}

function probeCapabilities(app) {
  /** @type {Record<string, boolean>} */
  const capabilities = {};
  for (const [key, spec] of Object.entries(CAPABILITY_ROUTE_SPECS)) {
    capabilities[key] = hasRoute(app, spec.method, spec.path);
  }
  return capabilities;
}

module.exports = {
  listRoutes,
  hasRoute,
  probeCapabilities,
  mountPrefixFromLayer,
};
