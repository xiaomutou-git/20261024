import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VoxelField } from './VoxelField.js';
import { DataRain } from './DataRain.js';
import { AvatarWall } from './AvatarWall.js';
import { COMMUNITY_DEVELOPERS } from '../data/developers.js';
import { TRAE_TIPS } from '../data/tips.js';
import { SHOWCASE_IMAGES } from '../data/showcase.js';
import { TipTicker } from './TipTicker.js';
import { PhotoShowcase, SHOWCASE_START_DELAY } from './PhotoShowcase.js';
import {
  CAMERA_CONFIG,
  CONTROLS_CONFIG,
  LIGHT_TONE_RENDER,
  INTERACTION_CONFIG,
  DEFAULT_THEME_ID,
  resolveTheme
} from '../config.js';

/**
 * @file core/App.js
 * @description 三维场景主应用：负责渲染器、相机、控制器、后处理、交互与主循环的统一编排。
 *
 * 设计思路：
 *  - 单一职责拆分：VoxelField 管方块、DataRain 管数据雨、App 只管“搭台”与调度；
 *  - 交互克制：空闲 3 秒后缓慢自转，用户一旦操作立即停止，避免“抢镜头”的廉价动效；
 *  - 体验优先：Bloom 后处理仅在桌面端开启，移动端与“减弱动效”模式自动降级为直出渲染；
 *  - 资源可控：页面切到后台时停止渲染循环，切回时恢复，降低移动端耗电。
 *
 * @module core/App
 */

/** 无操作多久后恢复缓慢自转（秒） @type {number} */
const IDLE_DELAY = 3.2;

/** 指针位移阈值：超过该像素值判定为拖拽旋转而非点击（像素） @type {number} */
const CLICK_MOVE_THRESHOLD = 8;

/** 按下与抬起的时间阈值：超过则判定为长按拖拽而非点击（毫秒） @type {number} */
const CLICK_TIME_THRESHOLD = 700;

/** 触发“按住汇聚成 TRAE”所需的按住时长（毫秒）：一旦触发，只要指针未抬起就持续保持 @type {number} */
const LONG_PRESS_DELAY = 320;

/**
 * 检测当前环境是否支持 WebGL。
 *
 * @returns {boolean} 支持返回 true；不支持或检测过程异常返回 false
 * @throws 无显式抛出：内部捕获异常并返回 false，供调用方决定是否降级
 */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return Boolean(context);
  } catch (error) {
    console.warn('[App] WebGL 能力检测失败：', error);
    return false;
  }
}

export class App {
  /**
   * @param {Object} options - 构造参数
   * @param {HTMLCanvasElement} options.canvas - 用于渲染的 canvas 元素，必须已存在于 DOM 中
   * @param {string} [options.themeId=DEFAULT_THEME_ID] - 初始主题 id
   * @param {(count: number) => void} [options.onLitCountChange=null] - 已点亮方块数量变化回调
   * @param {(theme: object) => void} [options.onThemeChange=null] - 主题切换完成回调，用于同步 CSS 变量
   * @throws {TypeError} 当 canvas 不是有效的 canvas 元素时抛出
   */
  constructor({ canvas, themeId = DEFAULT_THEME_ID, onLitCountChange = null, onThemeChange = null } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new TypeError('App 需要一个有效的 canvas 元素');
    }

    /** @type {HTMLCanvasElement} 渲染画布 */
    this.canvas = canvas;
    /** @type {string} 当前主题 id */
    this.themeId = themeId;
    /** @type {object} 当前主题令牌 */
    this.theme = resolveTheme(themeId);
    /** @type {boolean} 是否移动端（决定像素比、粒子数量与后处理开关） */
    this.mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || window.innerWidth < 760;

    /** @type {MediaQueryList} 系统“减弱动效”偏好查询 */
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @type {boolean} 是否处于减弱动效模式 */
    this.reducedMotion = this.motionQuery.matches;

    /** @type {(count: number) => void}|null} */
    this.onLitCountChange = onLitCountChange;
    /** @type {((theme: object) => void)|null} */
    this.onThemeChange = onThemeChange;

    // three.js 运行时对象
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.composer = null;
    /** @type {VoxelField|null} */
    this.field = null;
    /** @type {DataRain|null} */
    this.rain = null;
    /** @type {AvatarWall|null} 社区开发者像素头像墙 */
    this.avatarWall = null;
    /** @type {PhotoShowcase|null} TRAE 背后的粒子相册 */
    this.showcase = null;
    /** @type {number} TRAE 形态已保持的时长（秒），用于触发粒子相册 */
    this._morphHoldTime = 0;

    this.raycaster = new THREE.Raycaster();
    /** @type {number} 上一帧时间戳（秒），手工计算帧间隔，避免依赖已废弃的 THREE.Clock */
    this._lastFrameTime = 0;
    /** @type {number} 最近一次脉冲触发时间（毫秒），用于 pointerup 与 click 去重 */
    this._lastPulseAt = 0;
    this.pointerNdc = new THREE.Vector2();
    this._pointerDirty = false;
    this._pointerInside = false;
    this._pointerDown = null;
    this._idleElapsed = 0;
    /** @type {number|null} 长按计时器句柄 */
    this._longPressTimer = null;
    /** @type {boolean} 本次按下是否已触发凝聚（用于区分“按住”与“点击”） */
    this._morphTriggered = false;
    this._composerEnabled = false;
    this._running = false;

    /**
     * 轻量性能探针的累加器：按子系统分别累计每帧耗时（毫秒），每满 1 秒折算成平均值。
     * 目的：出现"按住久了变卡"这类问题时，能直接在控制台看出是哪一段在吃性能，
     * 而不是靠猜。开销仅为每帧若干次 performance.now()，可忽略。
     * @type {Record<string, number>}
     */
    this._perfAcc = Object.create(null);
    /** @type {{key: string, at: number}|null} 当前正在计时的段落 */
    this._perfMark = null;
    /** @type {number} 当前统计窗口内的帧数 */
    this._perfFrames = 0;
    /** @type {number} 当前统计窗口的起始时间（毫秒） */
    this._perfWindowStart = 0;
    /** @type {object} 最近一次折算出的性能报告 */
    this._perfReport = { fps: 0, frameMs: 0, segments: {}, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

    this._onResize = this._onResize.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);
    this._onMotionChange = this._onMotionChange.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._onControlsStart = this._onControlsStart.bind(this);
    this._tick = this._tick.bind(this);
  }

  /**
   * 初始化三维场景的全部资源。WebGL 不可用时由调用方（main.js）捕获异常并展示降级内容。
   *
   * @returns {void}
   * @throws {Error} 当 WebGL 上下文创建失败时，three.js 会抛出错误
   */
  init() {
    const theme = this.theme;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.mobile,
      alpha: true,
      powerPreference: 'high-performance'
    });
    // 像素比上限刻意压到 1.5 / 1.25：这个场景是满屏粒子 + 上千方块，
    // 在 2x 屏上按 2 倍分辨率渲染意味着 4 倍像素填充，长时间按住很容易把 GPU 顶到降频。
    // 降到 1.5 倍后肉眼差别很小，但填充率减半，持续高负载下的发热与掉帧会明显缓解。
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.5));
    // 背景交由 CSS 渐变负责，画布保持透明，主题切换时无需重建场景背景
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(new THREE.Color(theme.bgBottom), 58, 158);

    this.camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fov, 1, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
    this.camera.position.set(...CAMERA_CONFIG.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA_CONFIG.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = CONTROLS_CONFIG.dampingFactor;
    this.controls.enablePan = false;
    this.controls.minDistance = CONTROLS_CONFIG.minDistance;
    this.controls.maxDistance = CONTROLS_CONFIG.maxDistance;
    this.controls.minPolarAngle = CONTROLS_CONFIG.minPolarAngle;
    this.controls.maxPolarAngle = CONTROLS_CONFIG.maxPolarAngle;
    this.controls.rotateSpeed = 0.52;
    this.controls.zoomSpeed = 0.75;
    this.controls.update();

    this.field = new VoxelField({
      theme,
      reducedMotion: this.reducedMotion,
      onLitCountChange: this.onLitCountChange
    });
    this.rain = new DataRain({ theme, mobile: this.mobile, reducedMotion: this.reducedMotion });
    this.scene.add(this.field.group, this.rain.group);

    // 头像墙挂在体素场节点下，从而与 1024 字形一同公转；每帧再做朝向补偿使其始终面向相机
    this.avatarWall = new AvatarWall({
      theme,
      developers: COMMUNITY_DEVELOPERS,
      mobile: this.mobile
    });
    this.field.group.add(this.avatarWall.group);

    // 粒子相册：挂在头像墙节点下，因此与汇聚后的 TRAE 字样处于同一坐标系，
    // 画面始终位于字样背后（z 为负）
    this.showcase = new PhotoShowcase({
      images: SHOWCASE_IMAGES,
      mobile: this.mobile
    });
    this.avatarWall.group.add(this.showcase.group);

    // 社区技巧飘带：贴在头像簇上方横向飘过，位置依赖头像墙的实际包围盒
    this.tipTicker = new TipTicker({
      theme,
      tips: TRAE_TIPS,
      bounds: this.avatarWall.getBounds(),
      mobile: this.mobile,
      reducedMotion: this.reducedMotion
    });
    this.scene.add(this.tipTicker.group);

    this._setupComposer();

    // 初始主题可能是浅色（白 / 灰），需要立刻套用对应的曝光与辉光参数
    this._applyToneRendering(theme);

    window.addEventListener('resize', this._onResize, { passive: true });
    this.motionQuery.addEventListener('change', this._onMotionChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this.controls.addEventListener('start', this._onControlsStart);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this._onPointerMove, { passive: true });
    dom.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    dom.addEventListener('pointerup', this._onPointerUp, { passive: true });
    dom.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    dom.addEventListener('click', this._onClick, { passive: true });
    dom.addEventListener('pointercancel', this._onPointerCancel, { passive: true });

    this._onResize();
    if (typeof this.onThemeChange === 'function') this.onThemeChange(theme);
  }

  /**
   * 装配后处理链。
   *
   * 说明：原先后处理里带了 Bloom（泛光）——亮度超过阈值的像素会被晕开成一圈光晕，
   * 使单色文字与单色图形都带“高光”。按设计要求画面保持纯色、不发光，
   * 因此这里不再添加 Bloom，仅保留渲染直出（页面整体仍受色调映射与曝光控制）。
   *
   * @returns {void}
   * @throws 无显式抛出：装配失败时自动降级为直出渲染
   */
  _setupComposer() {
    const shouldEnable = !this.mobile && !this.reducedMotion;
    this._composerEnabled = shouldEnable;
    if (!shouldEnable) return;

    try {
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      composer.addPass(new RenderPass(this.scene, this.camera));
      // 只做一次输出色彩空间转换，不再叠加任何泛光/辉光效果
      composer.addPass(new OutputPass());

      this.composer = composer;
    } catch (error) {
      console.warn('[App] 后处理初始化失败，降级为直出渲染：', error);
      this.composer = null;
      this._composerEnabled = false;
    }
  }

  /**
   * 启动渲染主循环。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrameTime = 0;
    this.renderer.setAnimationLoop(this._tick);
  }

  /**
   * 停止渲染主循环（页面不可见或组件卸载时调用）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  /**
   * 切换主题：同步方块、数据雨、雾色与 CSS 变量。
   *
   * @param {string} id - 目标主题 id，见 config.js 的 THEMES
   * @returns {object} 切换后的主题令牌对象
   * @throws 无显式抛出：未知 id 时回退到内置首个主题
   */
  setTheme(id) {
    const theme = resolveTheme(id);
    this.themeId = theme.id;
    this.theme = theme;
    this.field.applyTheme(theme);
    this.rain.setTheme(theme);
    this.avatarWall.applyTheme(theme);
    if (this.tipTicker) this.tipTicker.setTheme(theme);
    if (this.scene.fog) this.scene.fog.color.set(theme.bgBottom);
    this._applyToneRendering(theme);
    if (typeof this.onThemeChange === 'function') this.onThemeChange(theme);
    return theme;
  }

  /**
   * 按主题的明暗基调调整曝光。
   *
   * 浅色主题下背景本身很亮，若沿用深色主题的曝光，方块会整片过曝发白；
   * 这里统一做一次覆盖。场景已不再使用泛光，故只调整曝光。
   *
   * @param {object} theme - 主题令牌对象（含可选 tone 字段）
   * @returns {void}
   * @throws 无显式抛出：渲染器尚未创建时跳过
   */
  _applyToneRendering(theme) {
    try {
      const isLight = theme && theme.tone === 'light';
      if (this.renderer) {
        this.renderer.toneMappingExposure = isLight ? LIGHT_TONE_RENDER.exposure : 1.06;
      }
    } catch (error) {
      console.warn('[App] 基调渲染参数调整失败：', error);
    }
  }

  /**
   * 重播方块聚合入场动画。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  replay() {
    this.field.replayReveal();
    this._idleElapsed = 0;
  }

  /**
   * 从场景中心触发一次能量脉冲（供键盘 / 按钮使用）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  pulseCenter() {
    this.field.pulseAt(new THREE.Vector3(0, 0, 0), null);
  }

  /**
   * 主循环：驱动各子系统更新并渲染一帧。
   *
   * @returns {void}
   * @throws 无显式抛出：单帧异常被捕获以避免整个动画循环中断
   */
  _tick() {
    try {
      const now = performance.now() / 1000;
      // 首帧缺少上一帧参照，用 60fps 标称间隔起步，并对异常大跳变做上限保护
      const delta = this._lastFrameTime === 0 ? 1 / 60 : Math.min(now - this._lastFrameTime, 0.1);
      this._lastFrameTime = now;
      const elapsed = now;

      this._perfBegin('field');
      this.field.update(delta, elapsed);
      this._perfEnd();

      this._perfBegin('rain');
      this.rain.update(delta);
      this._perfEnd();

      this._perfBegin('tips');
      if (this.tipTicker) this.tipTicker.update(delta);
      this._perfEnd();

      this._perfBegin('showcase');
      this._updateShowcase(delta);
      this._perfEnd();

      this._perfBegin('avatars');
      this.avatarWall.update(this.camera, this.field.group.rotation.y, this.field.morphProgress);
      this._perfEnd();

      this._perfBegin('misc');
      this._updateIdleRotation(delta);
      this._updatePointerPick();
      this.controls.update();
      this._perfEnd();

      this._perfBegin('render');
      if (this.composer && this._composerEnabled) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this._perfEnd();

      this._perfSample(now);
    } catch (error) {
      console.error('[App] 渲染帧异常：', error);
      this.stop();
    }
  }

  /**
   * 开始为某个子系统计时。
   *
   * @param {string} key - 子系统标识（field / rain / tips / showcase / avatars / misc / render）
   * @returns {void}
   * @throws 无显式抛出
   */
  _perfBegin(key) {
    this._perfMark = { key, at: performance.now() };
  }

  /**
   * 结束当前计时段并累加到对应子系统。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _perfEnd() {
    const mark = this._perfMark;
    if (!mark) return;
    this._perfAcc[mark.key] = (this._perfAcc[mark.key] || 0) + (performance.now() - mark.at);
    this._perfMark = null;
  }

  /**
   * 每帧末采样：累计帧数，每满 1 秒折算一次平均值写入性能报告。
   *
   * @param {number} now - 当前时间（秒）
   * @returns {void}
   * @throws 无显式抛出
   */
  _perfSample(now) {
    this._perfFrames += 1;
    if (this._perfWindowStart === 0) {
      this._perfWindowStart = now;
      return;
    }

    const span = now - this._perfWindowStart;
    if (span < 1) return;

    const frames = Math.max(1, this._perfFrames);
    const segments = {};
    let total = 0;
    for (const [key, value] of Object.entries(this._perfAcc)) {
      const avg = value / frames;
      segments[key] = Math.round(avg * 100) / 100;
      total += avg;
    }

    const info = this.renderer ? this.renderer.info : null;
    this._perfReport = {
      fps: Math.round(frames / span),
      frameMs: Math.round(total * 100) / 100,
      segments,
      drawCalls: info ? info.render.calls : 0,
      triangles: info ? info.render.triangles : 0,
      geometries: info ? info.memory.geometries : 0,
      textures: info ? info.memory.textures : 0,
      programs: info && info.programs ? info.programs.length : 0
    };

    this._perfAcc = Object.create(null);
    this._perfFrames = 0;
    this._perfWindowStart = now;
  }

  /**
   * 读取性能报告：在控制台执行 `__traeApp.getPerfReport()` 即可看到各子系统每帧耗时。
   * 用于定位"按住久了变卡"这类问题究竟发生在哪一段。
   *
   * @returns {object} 最近一秒的报告（fps / 每段毫秒数 / draw call / 几何体 / 显存纹理数）
   * @throws 无显式抛出
   */
  getPerfReport() {
    return {
      ...this._perfReport,
      holdSeconds: Math.round(this._morphHoldTime * 10) / 10,
      showcaseActive: Boolean(this.showcase && this.showcase.active),
      showcaseSamples: this.showcase ? this.showcase._samples.size : 0,
      heapMB: typeof performance !== 'undefined' && performance.memory
        ? Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10
        : null
    };
  }

  /**
   * 驱动「TRAE 背后的粒子相册」：按住并保持 TRAE 形态满 5 秒后开始播放，松手即停止。
   *
   * @param {number} delta - 距上一帧的秒数
   * @returns {void}
   * @throws 无显式抛出
   */
  _updateShowcase(delta) {
    if (!this.showcase) return;

    // morphProgress 接近 1 才视为"TRAE 已完全成型"，避免过渡动画期间就开始计时
    const fullyMorphed = this.field.morphProgress > 0.995;
    if (fullyMorphed) {
      this._morphHoldTime += delta;
      if (this._morphHoldTime >= SHOWCASE_START_DELAY) this.showcase.start();
    } else {
      this._morphHoldTime = 0;
      this.showcase.stop();
    }

    this.showcase.update(delta);
  }

  /**
   * 空闲自转：长时间无操作时让整组方块缓慢旋转，展示立体感；任何操作都会重置计时。
   *
   * @param {number} delta - 距上一帧的秒数
   * @returns {void}
   * @throws 无显式抛出
   */
  _updateIdleRotation(delta) {
    if (this.reducedMotion) return;
    this._idleElapsed += delta;
    if (this._idleElapsed < IDLE_DELAY) return;
    this.field.group.rotation.y += INTERACTION_CONFIG.idleSpinSpeed * delta;
  }

  /**
   * 基于当前指针位置执行一次悬停拾取（仅在指针移动后执行，避免每帧无谓的射线检测）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _updatePointerPick() {
    if (!this._pointerDirty) return;
    this._pointerDirty = false;

    if (!this._pointerInside) {
      this.field.setHover(null);
      return;
    }

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // 优先检测中央的 1024 方块；未命中时再检测环绕的开发者头像牌（命中则显形其昵称标签）
    const fieldHits = this.raycaster.intersectObject(this.field.mesh, false);
    if (fieldHits.length > 0) {
      this.field.setHover(fieldHits[0].instanceId ?? null);
      this.avatarWall.setHovered(null);
      return;
    }

    this.field.setHover(null);
    const avatarHits = this.raycaster.intersectObjects(this.avatarWall.getMeshes(), false);
    const avatarIndex = avatarHits.length > 0 ? avatarHits[0].object.userData.avatarIndex : null;
    this.avatarWall.setHovered(typeof avatarIndex === 'number' ? avatarIndex : null);
  }

  /**
   * 把指针事件的屏幕坐标转换为 NDC 坐标。
   *
   * @param {PointerEvent} event - 浏览器指针事件
   * @returns {void}
   * @throws 无显式抛出：无法获取画布尺寸时按窗口尺寸兜底
   */
  _updatePointerNdc(event) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    this.pointerNdc.x = ((event.clientX - rect.left) / width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  /**
   * 指针移动：记录 NDC 坐标并标记待拾取。
   *
   * @param {PointerEvent} event - 浏览器指针事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onPointerMove(event) {
    this._pointerInside = true;
    this._updatePointerNdc(event);
    this._pointerDirty = true;
    // 按住后即使拖动（旋转场景），汇聚形态也照常保持，
    // 因此这里不再因位移撤销长按计时
  }

  /**
   * 指针按下：记录起点，用于后续区分“拖拽旋转”与“点击点亮”。
   *
   * @param {PointerEvent} event - 浏览器指针事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onPointerDown(event) {
    this._pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    this._idleElapsed = 0;
    this._morphTriggered = false;

    // 捕获指针：按住后即使把指针拖到画布之外，抬起事件依然会回到画布，
    // 保证凝聚状态能被正确结束（合成事件没有活跃指针，捕获会失败，故做兜底）
    try {
      if (typeof this.canvas.setPointerCapture === 'function') {
        this.canvas.setPointerCapture(event.pointerId);
      }
    } catch (error) {
      console.debug('[App] 指针捕获失败（合成事件常见）：', error);
    }

    // 按住一小段时间后，四周头像的像素会汇聚成 TRAE 字样；
    // 触发后只要指针没有抬起就一直保持，拖动旋转场景也不会打断
    this._clearLongPress();
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = null;
      if (!this._pointerDown) return;
      this._morphTriggered = true;
      this.field.startMorph();
    }, LONG_PRESS_DELAY);
  }

  /**
   * 指针抬起：判定为点击时，向射线命中的方块位置发射一次能量脉冲。
   *
   * @param {PointerEvent} event - 浏览器指针事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onPointerUp(event) {
    const down = this._pointerDown;
    this._pointerDown = null;
    this._idleElapsed = 0;
    this._clearLongPress();

    // 本次按下若已触发过凝聚，抬手只负责恢复形态，不再触发点亮脉冲
    if (this._morphTriggered) {
      this._morphTriggered = false;
      this.field.endMorph();
      return;
    }

    if (!down) return;

    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const duration = performance.now() - down.time;
    if (moved > CLICK_MOVE_THRESHOLD || duration > CLICK_TIME_THRESHOLD) return;

    this._pulseAtPointer(event.clientX, event.clientY);
  }

  /**
   * 点击兜底：部分无障碍工具或程序化触发只会派发 click 而无完整指针序列，
   * 这里补一次处理，并通过时间戳与 pointerup 的结果去重，避免真实点击被触发两次。
   *
   * @param {MouseEvent} event - 点击事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onClick(event) {
    if (performance.now() - this._lastPulseAt < 400) return;
    this._pulseAtPointer(event.clientX, event.clientY);
  }

  /**
   * 在给定屏幕坐标处做一次射线检测，命中方块时触发能量脉冲。
   *
   * @param {number} clientX - 相对视口的横坐标（像素）
   * @param {number} clientY - 相对视口的纵坐标（像素）
   * @returns {void}
   * @throws 无显式抛出：未命中方块时不产生任何副作用
   */
  _pulseAtPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    this.pointerNdc.x = ((clientX - rect.left) / width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.field.mesh, false);
    if (hits.length > 0) {
      this._lastPulseAt = performance.now();
      this.field.pulseAt(hits[0].point, hits[0].instanceId ?? null);
    }
  }

  /**
   * 指针离开画布：清除悬停状态。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _onPointerLeave() {
    this._pointerInside = false;
    this._pointerDirty = true;
    this.field.setHover(null);
    this.avatarWall.setHovered(null);
    // 仍处于按下状态时（例如拖拽到画布边缘外），继续维持汇聚形态，等抬起再结束
    if (!this._pointerDown) this._releaseLongPress();
  }

  /**
   * 指针被取消（移动端触摸被打断等）：与离开画布一致，恢复形态并清除长按计时。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _onPointerCancel() {
    this._pointerDown = null;
    this._releaseLongPress();
  }

  /**
   * 清除长按计时，并在已触发凝聚时把字形恢复成「1024」。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _releaseLongPress() {
    this._clearLongPress();
    if (this._morphTriggered) {
      this._morphTriggered = false;
      this.field.endMorph();
    }
  }

  /**
   * 仅清除长按计时器，不改变当前形态。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _clearLongPress() {
    if (this._longPressTimer !== null) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  /**
   * 用户在控制器上开始交互（拖拽/缩放）：立即暂停空闲自转。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _onControlsStart() {
    this._idleElapsed = 0;
  }

  /**
   * 系统“减弱动效”偏好变化：同步各子系统并复位旋转角度。
   *
   * @param {MediaQueryListEvent} event - 媒体查询变更事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onMotionChange(event) {
    this.reducedMotion = event.matches;
    this.field.reducedMotion = event.matches;
    this.rain.setReducedMotion(event.matches);
    if (this.tipTicker) this.tipTicker.setReducedMotion(event.matches);
    this.field.group.rotation.y = 0;

    if (event.matches) {
      this._composerEnabled = false;
    } else if (this.composer) {
      this._composerEnabled = true;
    } else {
      this._setupComposer();
    }
  }

  /**
   * 页面可见性变化：不可见时停止渲染以节省电量，恢复可见时重启循环。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _onVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * 视口尺寸变化：同步相机宽高比、渲染器与后处理的尺寸。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _onResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // 第三个参数为 false：画布尺寸由 CSS 控制，避免 three.js 覆盖样式
    this.renderer.setSize(width, height, false);
    if (this.composer) this.composer.setSize(width, height);
    this._fitCamera();
  }

  /**
   * 依当前视口宽高比自适应相机距离，保证 1024 字形与环绕的像素头像都能完整入镜。
   * 窄屏（竖屏手机）下会自动拉远相机，避免两侧头像被裁切。
   *
   * @returns {void}
   * @throws 无显式抛出：计算异常时保留原有相机位置
   */
  _fitCamera() {
    try {
      if (!this.camera || !this.controls) return;

      const aspect = this.camera.aspect || 1;
      const fovY = THREE.MathUtils.degToRad(this.camera.fov);
      const halfFovTan = Math.tan(fovY / 2);
      // 水平方向要容纳最外环的直径，垂直方向要容纳上下两簇头像（含昵称标签），取两者中更远的距离。
      // 头像数量会随社区成员增长，因此这里不写死尺寸，而是取头像墙上实际的头像牌包围盒
      const bounds = this.avatarWall ? this.avatarWall.getBounds() : null;
      const halfWidth = bounds && bounds.radius > 0 ? bounds.radius + 6 : 25;
      const halfHeight = bounds && bounds.maxY > 0 ? bounds.maxY + 6 : 17.5;
      const requiredForWidth = (halfWidth * 2) / (halfFovTan * aspect);
      const requiredForHeight = (halfHeight * 2) / halfFovTan;
      const distance = THREE.MathUtils.clamp(
        Math.max(requiredForWidth, requiredForHeight),
        CONTROLS_CONFIG.minDistance,
        CONTROLS_CONFIG.maxDistance
      );

      // 保持当前观察方向不变，仅沿视线方向调整距离
      const offset = this.camera.position.clone().sub(this.controls.target);
      const length = offset.length() || 1;
      offset.multiplyScalar(distance / length);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
    } catch (error) {
      console.warn('[App] 相机自适应失败：', error);
    }
  }

  /**
   * 释放全部三维资源并移除事件监听。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    this._clearLongPress();
    this.stop();

    window.removeEventListener('resize', this._onResize);
    this.motionQuery.removeEventListener('change', this._onMotionChange);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    const dom = this.renderer ? this.renderer.domElement : this.canvas;
    dom.removeEventListener('pointermove', this._onPointerMove);
    dom.removeEventListener('pointerdown', this._onPointerDown);
    dom.removeEventListener('pointerup', this._onPointerUp);
    dom.removeEventListener('pointerleave', this._onPointerLeave);
    dom.removeEventListener('click', this._onClick);
    dom.removeEventListener('pointercancel', this._onPointerCancel);

    if (this.controls) {
      this.controls.removeEventListener('start', this._onControlsStart);
      this.controls.dispose();
    }
    if (this.field) this.field.dispose();
    if (this.rain) this.rain.dispose();
    if (this.tipTicker) this.tipTicker.dispose();
    if (this.avatarWall) this.avatarWall.dispose();
    if (this.showcase) this.showcase.dispose();
    if (this.composer) this.composer.dispose();
    if (this.renderer) this.renderer.dispose();

    this.field = null;
    this.rain = null;
    this.avatarWall = null;
    this.controls = null;
    this.composer = null;
    this.renderer = null;
  }
}
