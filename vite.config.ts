import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the production build can be opened directly via file://
  // (matches Constitution P2 "zero-install threshold").
  base: './',
  // MVP: single static bundle, no backend
  server: {
    port: 5173,
  },
});
