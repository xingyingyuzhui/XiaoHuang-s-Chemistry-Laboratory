import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { writeBuildManifest } from './scripts/write-build-manifest.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function buildManifestPlugin() {
  return {
    name: 'write-build-manifest',
    closeBundle() {
      writeBuildManifest(path.join(rootDir, 'dist'), { platform: 'web' });
    },
  };
}

export default defineConfig({
  plugins: [buildManifestPlugin()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          animation: ['animejs', 'canvas-confetti'],
        },
      },
    },
  },
});
