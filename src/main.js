/**
 * @file main.js
 * @description 应用入口：装载 HUD 与三维场景，统一处理初始化异常与降级兜底。
 *
 * 处理流程：
 *  1. 先初始化 HUD（纯 DOM，不依赖 WebGL），保证任何情况下页面信息都完整可读；
 *  2. 检测 WebGL 能力，不可用则展示静态降级内容并结束；
 *  3. 初始化三维场景，成功后隐藏引导层、注册键盘快捷键与卸载钩子；
 *  4. 任何初始化异常都会被捕获，回退到静态内容，避免白屏。
 *
 * @module main
 */

import { App, isWebGLAvailable } from './core/App.js';
import { Hud } from './ui/hud.js';
import { DEFAULT_THEME_ID, resolveTheme } from './config.js';

/** @type {App|null} 全局三维应用实例，供快捷键与卸载钩子引用 */
let app = null;

/**
 * 展示静态降级内容，并在控制台输出原因。
 *
 * @param {string} reason - 降级原因说明，会打印到控制台便于排查
 * @returns {void}
 * @throws 无显式抛出：内部捕获异常，降级流程自身不会抛出
 */
function showFallback(reason) {
  try {
    console.warn('[main] 进入降级模式：', reason);
    const fallback = document.getElementById('fallback');
    const canvas = document.getElementById('scene-canvas');
    const boot = document.getElementById('boot');
    const stage = document.getElementById('stage');

    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.hidden = false;
    if (boot) boot.remove();
    if (stage) stage.classList.add('is-fallback');
  } catch (error) {
    console.error('[main] 渲染降级内容失败：', error);
  }
}

/**
 * 启动应用。
 *
 * @returns {void}
 * @throws 无显式抛出：内部完成全部异常捕获
 */
function bootstrap() {
  const canvas = document.getElementById('scene-canvas');
  const hud = new Hud({
    initialThemeId: DEFAULT_THEME_ID,
    onTheme: (id) => {
      if (app) app.setTheme(id);
    },
    onReplay: () => {
      if (app) app.replay();
    },
    onPulse: () => {
      if (app) app.pulseCenter();
    }
  });
  hud.init();

  // 初始主题先落到 CSS 变量，保证引导层与首屏配色就位
  const initialTheme = resolveTheme(DEFAULT_THEME_ID);
  hud.applyTheme(initialTheme);

  if (!isWebGLAvailable()) {
    showFallback('当前浏览器或设备不支持 WebGL');
    return;
  }
  if (!canvas) {
    showFallback('未找到渲染画布 canvas#scene-canvas');
    return;
  }

  try {
    app = new App({
      canvas,
      themeId: DEFAULT_THEME_ID,
      onLitCountChange: (count) => hud.updateLitCount(count),
      onThemeChange: (theme) => hud.applyTheme(theme)
    });
    app.init();
    app.start();
    // 用场景里的实际方块数刷新底部统计的分母（不再固定为 1024）
    hud.setBlockTotal(app.field.count);
  } catch (error) {
    console.error('[main] 三维场景初始化失败：', error);
    app = null;
    showFallback(error instanceof Error ? error.message : '未知初始化错误');
    return;
  }

  // 标记模块就绪，避免内联脚本把 js-ready 回滚导致入场动画被取消
  window.__traeAppReady = true;
  // 暴露应用实例：便于调试与自动化验收读取运行时状态（只读引用，不参与业务逻辑）
  window.__traeApp = app;
  hud.hideBoot();

  // 键盘快捷键：R 重播聚合动画，P / 空格 从中心点亮
  document.addEventListener('keydown', (event) => {
    if (!app) return;
    const target = event.target;
    // 输入框等可编辑元素中不劫持按键
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }
    if (event.key === 'r' || event.key === 'R') {
      app.replay();
    } else if (event.key === 'p' || event.key === 'P' || event.key === ' ') {
      event.preventDefault();
      app.pulseCenter();
    }
  });

  // 页面卸载时释放 WebGL 资源
  window.addEventListener('pagehide', () => {
    if (app) {
      app.dispose();
      app = null;
      window.__traeApp = null;
    }
    hud.dispose();
  });
}

try {
  bootstrap();
} catch (error) {
  console.error('[main] 启动流程异常：', error);
  showFallback(error instanceof Error ? error.message : '启动异常');
}

/**
 * 开发期热更新处理：
 * 三维场景持有 WebGL 资源与持续运行的动画循环，无法安全地热替换，
 * 若局部替换会出现“构造函数已更新、旧实例方法仍在运行”的半新半旧状态
 * （典型表现为控制台出现 THREE.Clock 之类的旧代码告警与属性读取异常）。
 * 因此源码变更时直接让 Vite 触发整页重载，保证运行时状态始终一致。
 */
if (import.meta.hot) {
  import.meta.hot.invalidate();
}
