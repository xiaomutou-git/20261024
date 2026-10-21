import * as THREE from 'three';
import { RAIN_CONFIG, RAIN_WORDS } from '../config.js';
import { createDigitTexture, createVerticalTextTexture } from './textures.js';

/**
 * @file core/DataRain.js
 * @description 三维二进制数据雨：空间中缓慢下落的 0/1 字符点云，构成场景的数据氛围层。
 *
 * 设计思路：
 *  - 使用两个 Points（分别承载 '0' 与 '1' 字符贴图）批量绘制，总共 2 次 draw call；
 *  - 位置与速度在构建期确定性生成，运行时只做 Y 轴下落与顶部回收，计算量恒定；
 *  - 贴图由 Canvas 程序化生成，失败时退化为纯色方点，不影响主流程；
 *  - 减弱动效模式下冻结下落，仅保留静态点云，符合无障碍要求；
 *  - 除了 0/1 数据流，每隔数秒还会掉落一条祝福语或 TRAE 字样，作为节奏上的呼吸点。
 *
 * @module core/DataRain
 */

/** 掉落文字中单个字符占用的世界高度（与世界单位一致），保证与 0/1 竖列的节奏对齐 @type {number} */
const WORD_CHAR_SIZE = 1.9;

/** 掉落文字的下落速度（世界单位/秒）：放慢到与减速后的 0/1 数据流接近，便于逐字阅读 @type {number} */
const WORD_FALL_SPEED = 1.1;

/** 两次文字掉落之间的最短间隔（秒） @type {number} */
const WORD_INTERVAL_MIN = 2.4;

/** 两次文字掉落之间的最长间隔（秒） @type {number} */
const WORD_INTERVAL_MAX = 4.8;

/** 单个文字精灵的池容量（桌面端），移动端取一半 @type {number} */
const WORD_POOL_SIZE = 6;

/** 数字雨中同一列相邻字符的垂直间距（世界单位），决定“竖列”的疏密 @type {number} */
const RAIN_COLUMN_GAP = 2.6;

/**
 * 数据雨的亮度系数。
 * 说明：数字雨是单色的背景氛围层，不需要任何高光/辉光。
 * 场景开启了 Bloom 后处理，亮度超过阈值的像素会被“晕开”成光晕，
 * 因此这里把字符颜色整体压暗到阈值以下，让它呈现为干净的纯色文字而不是发光的点。
 * @type {number}
 */
const RAIN_BRIGHTNESS = 0.42;

export class DataRain {
  /**
   * @param {Object} options - 构造参数
   * @param {object} options.theme - 主题令牌对象，需包含 secondary 字段作为字符颜色
   * @param {boolean} [options.mobile=false] - 是否为移动端，为 true 时使用更少的粒子数量
   * @param {boolean} [options.reducedMotion=false] - 是否处于“减弱动效”模式
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  constructor({ theme, mobile = false, reducedMotion = false } = {}) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('DataRain 需要一个合法的 theme 对象');
    }

    /** @type {object} 主题令牌 */
    this.theme = theme;
    /** @type {boolean} 是否减弱动效 */
    this.reducedMotion = reducedMotion;

    /** @type {THREE.Group} 场景根节点 */
    this.group = new THREE.Group();
    this.group.name = 'DataRain';

    /** @type {Array<{points: THREE.Points, positions: Float32Array, speeds: Float32Array}>} 字符层集合 */
    this.layers = [];
    /** @type {Array<THREE.BufferGeometry|THREE.Material|THREE.Texture>} 需要释放的资源 */
    this._disposables = [];

    /** @type {Array<{texture: THREE.CanvasTexture, aspect: number, text: string, brand: boolean}>} 预生成的文字纹理 */
    this._wordTextures = [];
    /** @type {THREE.Sprite[]} 掉落文字精灵池（循环复用，避免频繁创建销毁） */
    this._wordPool = [];
    /** @type {number} 下一次文字掉落的倒计时（秒） */
    this._wordTimer = 1.6;
    /** @type {number} 纹理取用游标，保证祝福语与 TRAE 字样轮流出现 */
    this._wordCursor = 0;

    this._build(mobile);
    this._buildWords(mobile);
  }

  /**
   * 构建两层字符点云（'0' 与 '1'），按“竖列”排布。
   *
   * 排布逻辑（本次调整的重点）：
   *  1. 先在水平面上均匀分出若干列，每列的 X/Z 固定，字符沿 Y 轴自上而下排成一串；
   *  2. 同一列内的字符按奇偶交替分给 '0' 层与 '1' 层，因此一列里 0 和 1 是混合出现的；
   *  3. 同一列共享同一个下落速度，字符越过底部时整体上移一个完整跨度，
   *     列的间距关系保持不变，视觉上就是“一列一列竖直下落”的数字雨。
   *
   * @param {boolean} mobile - 是否移动端（决定列数与每列字符数）
   * @returns {void}
   * @throws 无显式抛出
   */
  _build(mobile) {
    const half = RAIN_CONFIG.spread / 2;
    const { top, bottom, minSpeed, maxSpeed } = RAIN_CONFIG;
    const height = top - bottom;

    // 列数：桌面 11 列、移动端 6 列；列间距拉大后画面更透气
    const columnCount = mobile ? 6 : 11;
    const charsPerColumn = Math.max(8, Math.round(height / RAIN_COLUMN_GAP) + 1);
    const columnSpacing = RAIN_CONFIG.spread / columnCount;

    /** @type {Array<{positions: Float32Array, speeds: Float32Array, cursor: number}>} 每层待填充的数组 */
    const buffers = [null, null];

    /**
     * 统计某一层需要多少字符：每列的奇偶槽位各归一层。
     *
     * @param {number} layerIndex - 层下标：0 表示 '1'，1 表示 '0'
     * @returns {number} 该层的字符总数
     * @throws 无显式抛出
     */
    const countOf = (layerIndex) => {
      let count = 0;
      for (let slot = 0; slot < charsPerColumn; slot += 1) {
        if (slot % 2 === layerIndex) count += 1;
      }
      return count * columnCount;
    };

    buffers[0] = { positions: new Float32Array(countOf(0) * 3), speeds: new Float32Array(countOf(0)), cursor: 0 };
    buffers[1] = { positions: new Float32Array(countOf(1) * 3), speeds: new Float32Array(countOf(1)), cursor: 0 };

    // 用简单线性同余保证刷新之间分布稳定，避免每次进入页面雨点位置跳动
    let seed = 991024;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let column = 0; column < columnCount; column += 1) {
      // 列位置均匀铺开，再叠加微小抖动，避免整片看起来像规整网格
      const x = -half + (column + 0.5) * columnSpacing + (random() - 0.5) * columnSpacing * 0.35;
      const z = (random() - 0.5) * RAIN_CONFIG.spread * 0.7;
      // 同一列共用速度，列的间距关系在整段落雨过程中保持不变
      const speed = minSpeed + random() * (maxSpeed - minSpeed);
      // 列的起始相位随机，使各列错落而非齐刷刷同时出现
      const phase = random() * RAIN_COLUMN_GAP;

      for (let slot = 0; slot < charsPerColumn; slot += 1) {
        const layerIndex = slot % 2;
        const buffer = buffers[layerIndex];
        const index = buffer.cursor;
        buffer.cursor += 1;

        buffer.positions[index * 3] = x;
        // 自上而下等距排开，越界后由 update 整体回绕
        buffer.positions[index * 3 + 1] = top - slot * RAIN_COLUMN_GAP - phase;
        buffer.positions[index * 3 + 2] = z;
        buffer.speeds[index] = speed;
      }
    }

    ['1', '0'].forEach((digit, layerIndex) => {
      const buffer = buffers[layerIndex];
      const positions = buffer.positions;
      const speeds = buffer.speeds;

      const geometry = new THREE.BufferGeometry();
      const attribute = new THREE.BufferAttribute(positions, 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attribute);

      const texture = createDigitTexture(digit, 128);
      const material = new THREE.PointsMaterial({
        size: 2.1,
        // 压暗到辉光阈值以下：单色文字保持实色，不产生高光晕染
        color: new THREE.Color(this.theme.secondary).multiplyScalar(RAIN_BRIGHTNESS),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
        ...(texture ? { map: texture } : {})
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = -2;

      this.group.add(points);
      this.layers.push({ points, positions, speeds });
      this._disposables.push(geometry, material);
      if (texture) this._disposables.push(texture);
    });
  }

  /**
   * 构建“掉落文字”层：预生成祝福语与 TRAE 字样的**竖排**纹理，并准备一组可复用的精灵。
   *
   * 本次调整的重点：文字改为竖排（一字一行、自上而下堆叠），
   * 与 0/1 竖列同样的下落方式——只沿 Y 轴下降，不做横向移动。
   *
   * 设计要点：
   *  - 纹理只在构建期生成一次（白字透明底），运行时只切换 map，避免频繁创建 Canvas；
   *  - 精灵池循环复用，同一时刻最多 WORD_POOL_SIZE 条文字在飘落，保证画面克制；
   *  - 文字颜色交由材质 color 决定，切主题时无需重建纹理。
   *
   * @param {boolean} mobile - 是否移动端（决定精灵池容量）
   * @returns {void}
   * @throws 无显式抛出：纹理生成失败时自动跳过该条文字
   */
  _buildWords(mobile) {
    /**
     * 生成并登记一条竖排文字的纹理。
     *
     * @param {string} text - 文字内容
     * @param {boolean} brand - 是否为 TRAE 品牌字样（切换主题时用主色而非二次色）
     * @returns {void}
     * @throws 无显式抛出
     */
    const register = (text, brand) => {
      const made = createVerticalTextTexture(text, { fontSize: 56, padding: 12, maxChars: 16 });
      if (!made) return;
      this._wordTextures.push({ ...made, text, brand });
      this._disposables.push(made.texture);
    };

    RAIN_WORDS.phrases.forEach((text) => register(text, false));
    RAIN_WORDS.brands.forEach((text) => register(text, true));

    if (this._wordTextures.length === 0) return;

    const poolSize = mobile ? Math.max(2, Math.floor(WORD_POOL_SIZE / 2)) : WORD_POOL_SIZE;
    for (let i = 0; i < poolSize; i += 1) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
        // 同样压暗，避免掉落文字在 Bloom 下泛起高光
        color: new THREE.Color(this.theme.secondary).multiplyScalar(RAIN_BRIGHTNESS),
        toneMapped: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      // 排在体素之前绘制，配合深度测试即可被中央 logo 正常遮挡
      sprite.renderOrder = -1;
      sprite.userData = { active: false, speed: WORD_FALL_SPEED, age: 0, brand: false, height: 0 };
      this.group.add(sprite);
      this._wordPool.push(sprite);
      this._disposables.push(material);
    }
  }

  /**
   * 让池中一条空闲精灵携带下一条文字，从顶部开始下落。
   *
   * @returns {void}
   * @throws 无显式抛出：池满或尚未生成纹理时直接跳过
   */
  _spawnWord() {
    if (this._wordTextures.length === 0) return;

    const sprite = this._wordPool.find((item) => !item.userData.active);
    if (!sprite) return;

    const entry = this._wordTextures[this._wordCursor % this._wordTextures.length];
    this._wordCursor += 1;

    sprite.material.map = entry.texture;
    sprite.material.needsUpdate = true;
    // 祝福语用二次色、TRAE 字样用主色，形成轻微的主次区分；
    // 两者都乘上亮度系数，保持纯色不发光
    const tint = entry.brand ? this.theme.accent : this.theme.secondary;
    sprite.material.color.set(tint).multiplyScalar(RAIN_BRIGHTNESS);
    sprite.material.opacity = 0;

    // 竖排文字的高度由字符数决定：一个字约 WORD_CHAR_SIZE 高，整体与 0/1 竖列的节奏一致
    const height = entry.charCount * WORD_CHAR_SIZE;
    sprite.scale.set(height * entry.aspect, height, 1);
    // 横向散开在中央区域两侧，纵深放在 logo 之后，避免遮挡主体
    const spreadX = RAIN_CONFIG.spread * 0.36;
    const spreadZ = RAIN_CONFIG.spread * 0.22;
    sprite.position.set(
      (Math.random() - 0.5) * 2 * spreadX,
      RAIN_CONFIG.top + height * 0.5,
      -6 - Math.random() * spreadZ
    );

    sprite.userData.active = true;
    sprite.userData.age = 0;
    sprite.userData.height = height;
    sprite.userData.speed = WORD_FALL_SPEED * (0.85 + Math.random() * 0.35);
    sprite.userData.brand = entry.brand;
    sprite.visible = true;
  }

  /**
   * 更新掉落文字：计时生成新文字，并推进下落、淡入与淡出。
   *
   * @param {number} delta - 距上一帧的时间间隔（秒）
   * @returns {void}
   * @throws 无显式抛出
   */
  _updateWords(delta) {
    const { top, bottom } = RAIN_CONFIG;

    // 按随机间隔投放新文字，形成“0/1 数据流里偶尔掉落一句祝福”的节奏
    this._wordTimer -= delta;
    if (this._wordTimer <= 0) {
      this._spawnWord();
      this._wordTimer = WORD_INTERVAL_MIN + Math.random() * (WORD_INTERVAL_MAX - WORD_INTERVAL_MIN);
    }

    for (const sprite of this._wordPool) {
      const state = sprite.userData;
      if (!state.active) continue;

      state.age += delta;
      sprite.position.y -= state.speed * delta;

      // 依据已下落的比例做淡入淡出；竖排文字较高，进度按自身高度折算
      const height = state.height || WORD_CHAR_SIZE;
      const travel = Math.max(0.001, top + height - bottom);
      const progress = (top + height * 0.5 - sprite.position.y) / travel;
      const fadeIn = Math.min(1, progress / 0.12);
      const fadeOut = Math.min(1, (1 - progress) / 0.22);
      sprite.material.opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.86;

      // 整列完全移出下边界后才回收，避免文字尾巴突然消失
      if (sprite.position.y + height * 0.5 < bottom) {
        state.active = false;
        sprite.visible = false;
        sprite.material.opacity = 0;
      }
    }
  }

  /**
   * 更新数据雨下落状态：字符穿过底部边界后回到顶部，形成无缝循环。
   *
   * @param {number} delta - 距上一帧的时间间隔（秒）
   * @returns {void}
   * @throws 无显式抛出
   */
  update(delta) {
    if (this.reducedMotion) return;

    const dt = Math.min(delta, 0.05);
    const { top, bottom } = RAIN_CONFIG;

    for (const layer of this.layers) {
      const { positions, speeds } = layer;
      const count = speeds.length;
      for (let i = 0; i < count; i += 1) {
        const yIndex = i * 3 + 1;
        positions[yIndex] -= speeds[i] * dt;
        if (positions[yIndex] < bottom) {
          // 整体上移一个完整跨度（而非直接跳到顶部），保证同一列字符的间距关系不被打乱
          positions[yIndex] += top - bottom;
        }
      }
      layer.points.geometry.attributes.position.needsUpdate = true;
    }

    this._updateWords(dt);
  }

  /**
   * 应用新主题：仅更新字符颜色。
   *
   * @param {object} theme - 新主题令牌对象
   * @returns {void}
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  setTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('DataRain.setTheme 需要一个合法的 theme 对象');
    }
    this.theme = theme;
    for (const layer of this.layers) {
      layer.points.material.color.set(theme.secondary).multiplyScalar(RAIN_BRIGHTNESS);
    }
    // 掉落文字同样随主题换色：TRAE 字样用主色，祝福语用二次色；同样压暗以避免高光
    for (const sprite of this._wordPool) {
      const brand = sprite.userData && sprite.userData.brand;
      sprite.material.color
        .set(brand ? theme.accent : theme.secondary)
        .multiplyScalar(RAIN_BRIGHTNESS);
    }
  }

  /**
   * 切换减弱动效状态。
   *
   * @param {boolean} flag - true 表示冻结动画
   * @returns {void}
   * @throws 无显式抛出
   */
  setReducedMotion(flag) {
    this.reducedMotion = Boolean(flag);
  }

  /**
   * 释放几何体、材质与纹理。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    for (const item of this._disposables) {
      if (item && typeof item.dispose === 'function') item.dispose();
    }
    this._disposables.length = 0;
    this.layers.length = 0;
    this._wordPool.length = 0;
    this._wordTextures.length = 0;
    this.group.clear();
  }
}
