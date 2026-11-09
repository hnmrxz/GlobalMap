import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径产物，可部署到任意子路径 / 对象存储
  base: './',
  server: { port: 5180, strictPort: true },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 220,
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet'],
        },
      },
    },
  },
});
