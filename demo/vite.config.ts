import { defineConfig } from 'vite';

// GitHub Pages 部署於 https://5tail.github.io/smart-cubes/，故 base 設為 repo 名。
export default defineConfig({
  base: '/smart-cubes/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
