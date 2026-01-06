import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ffxivCraftingMatCalc/',
  server: {
    proxy: {
      '/api': {
        target: 'https://v2.xivapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
