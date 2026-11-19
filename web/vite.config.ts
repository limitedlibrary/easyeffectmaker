import { defineConfig } from 'vite';

// Relative base so the build works when hosted at a GitHub Pages
// project subpath (https://user.github.io/repo/) as well as at a
// custom domain root, without extra configuration.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
