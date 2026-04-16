import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Two build modes:
// - default: `base: './'` so dist/index.html opens directly via file://
//   (matches Constitution P2 "zero-install threshold")
// - --mode pages: `base: '/cwebp/'` for https://seanlee111.github.io/cwebp/
//   used by the GitHub Actions workflow (.github/workflows/deploy.yml)
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === 'pages' ? '/cwebp/' : './',
  server: {
    port: 5173,
  },
}));
