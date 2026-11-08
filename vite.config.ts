import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' + HashRouter: works on any GitHub Pages repo path, refresh never 404s.
export default defineConfig({ plugins: [react()], base: './' });
