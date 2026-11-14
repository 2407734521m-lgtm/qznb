import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' + HashRouter: works on any GitHub Pages repo path, refresh never 404s.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // 首屏只下发应用代码；体积大又很少变的第三方库单独成包，
    // 文件名带 hash，部署新版后老用户只重新下载变了的包。
    // （Vite 8 / Rolldown 只接受函数形式的 manualChunks。）
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react-router|react-router-dom)\//.test(id)) return 'react-vendor';
          if (/node_modules\/(react-dom|react)\//.test(id)) return 'react-vendor';
          if (/node_modules\/@supabase\//.test(id)) return 'supabase';
          if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
          if (/node_modules\/(liquid-glass-react|simple-liquid-glass)\//.test(id)) return 'glass';
          return undefined;
        },
      },
    },
  },
});
