#!/usr/bin/env sh
set -eu

if [ ! -f package.json ] || [ ! -f server/package.json ]; then
  echo 'Run this script from the XiaoHuang Chemistry Laboratory repository root.' >&2
  exit 2
fi

echo 'Repository status:'
git status --short --branch
printf '\nEntrypoints:\n'
printf '%s\n' \
  'browser: index.html -> src/main.js' \
  'api: server/index.js -> server/routes/* -> db/sqlite.js' \
  'desktop: electron/main.cjs -> staged server' \
  'release: package.json scripts -> electron-builder.yml'
printf '\nFeature module counts:\n'
for path in src/battle server/routes src/styles/themes test; do
  count=$(rg --files "$path" 2>/dev/null | wc -l | tr -d ' ')
  printf '%-20s %s files\n' "$path" "$count"
done
printf '\nGenerated/runtime paths present:\n'
for path in dist server/public .electron-stage dist-electron dist-exe server/data; do
  if [ -e "$path" ]; then
    printf '%s\n' "$path"
  fi
done
