import { defineConfig } from 'vite';

/**
 * Vite 构建配置
 * 说明：
 *  1. 使用相对 base，保证构建产物在任意静态目录/子路径下都能正确加载资源；
 *  2. 开发服务器固定 host/port，便于本地预览与自动化调试；
 *  3. 生产构建交给 Vite 8 默认的依赖分包策略，不再手工配置 manualChunks。
 */
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: false,
    open: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // 头像图片保持独立文件输出（不内联成 base64）：
    // 这样构建产物里能直接看到「名字-hash.jpeg」，便于核对“名字与头像一一对应”，也便于浏览器缓存
    assetsInlineLimit: 0,
    // three.js 打包后约 600KB，属预期体积，调高告警阈值避免无意义的构建噪音
    chunkSizeWarningLimit: 900
  }
});
