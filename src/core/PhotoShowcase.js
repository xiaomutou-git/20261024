import * as THREE from 'three';

/**
 * @file core/PhotoShowcase.js
 * @description TRAE 形态的粒子相册：按住汇聚成 TRAE 并保持 5 秒后，
 * 在 TRAE 字样背后用粒子拼出 image2 里的图片，并轮播切换。
 *
 * 设计思路：
 *  - 图片不是整张贴图，而是按网格采样成彩色粒子点云——这样"换成下一张"时，
 *    上一张天然就是"散成粒子消失"，与场景的体素/粒子语言一致；
 *  - 每张图的粒子都记录了目标位置与散开方向：切换时旧图沿方向飞散并淡出，
 *    新图从散开的位置汇聚到目标位置并淡入，形成"消失 → 汇聚"的节奏；
 *  - 图片按需加载（同一时刻最多 2 张），避免一次性加载 50 多张大图占满显存；
 *  - 释放（松手）时快速淡出并复位，不残留状态。
 *
 * @module core/PhotoShowcase
 */

/** 展示满多久后开始播放相册（秒） @type {number} */
const START_DELAY = 5;

/** 单张图片停留时长（秒） @type {number} */
const HOLD_DURATION = 3.0;

/** 旧图散成粒子的时长（秒） @type {number} */
const DISSOLVE_DURATION = 0.75;

/** 新图粒子汇聚的时长（秒） @type {number} */
const GATHER_DURATION = 0.85;

/** 松手后整体淡出的时长（秒） @type {number} */
const RELEASE_FADE = 0.28;

/** 相册画面的最大尺寸（世界单位），保证落在 TRAE 字样背后而不溢出画面 @type {number} */
const MAX_WIDTH = 24;

/** 相册画面的最大高度（世界单位） @type {number} */
const MAX_HEIGHT = 13;

/** 粒子散开的最大距离（世界单位） @type {number} */
const SCATTER_DISTANCE = 4.2;

/** 相册画面相对 TRAE 字样的纵深（负值表示在字样之后） @type {number} */
const BACKDROP_Z = -3.2;

/** 桌面端网格采样列数，移动端减半 @type {number} */
const GRID_COLUMNS = 64;

/** 解码时把长边缩到的像素高度：远小于原图，避免把 1080×1080 的全尺寸位图读进内存 @type {number} */
const DECODE_HEIGHT = 84;

/**
 * 把一张图片按网格采样成彩色像素点。
 *
 * 性能说明（这是"按住久了会卡"的关键修复）：
 *  - 先 fetch 成 Blob，再用 createImageBitmap 的 resizeHeight 在**解码阶段**就缩小，
 *    这样不会像 <img> + drawImage 那样先把 1080×1080 的完整位图解码进内存
 *    （单张约 4.6MB，51 张累积两百多 MB，会拖垮浏览器甚至系统）；
 *  - 采样完立即 close() 释放位图；
 *  - 不支持该 API 的浏览器回退到 <img> 解码路径。
 *
 * @param {string} url - 图片地址
 * @param {number} columns - 采样列数（行数按图片宽高比推导）
 * @returns {Promise<{colors: Float32Array, columns: number, rows: number, aspect: number}>} 采样结果
 * @throws {Error} 图片加载失败或 Canvas 不可用时 reject
 */
async function sampleImage(url, columns) {
  let source = null;
  let release = () => {};

  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    try {
      // 解码阶段直接缩到 DECODE_HEIGHT 高，内存占用只有原图的一小部分
      source = await createImageBitmap(blob, { resizeHeight: DECODE_HEIGHT, resizeQuality: 'low' });
    } catch (error) {
      source = await createImageBitmap(blob);
    }
    release = () => {
      if (source && typeof source.close === 'function') source.close();
    };
  } catch (error) {
    // 回退路径：部分浏览器不支持 createImageBitmap 的缩放选项
    source = await new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片加载失败'));
      image.src = url;
    });
  }

  try {
    const width = source.width || source.naturalWidth || 1;
    const height = source.height || source.naturalHeight || 1;
    const aspect = width / height || 1;
    const cols = Math.max(8, Math.round(columns));
    const rows = Math.max(8, Math.round(cols / aspect));

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D 上下文不可用');

    // 直接缩放到网格尺寸后读像素，等价于对原图做一次面积平均采样
    ctx.drawImage(source, 0, 0, cols, rows);
    const data = ctx.getImageData(0, 0, cols, rows).data;

    const colors = new Float32Array(cols * rows * 3);
    for (let i = 0; i < cols * rows; i += 1) {
      colors[i * 3] = data[i * 4] / 255;
      colors[i * 3 + 1] = data[i * 4 + 1] / 255;
      colors[i * 3 + 2] = data[i * 4 + 2] / 255;
    }

    return { colors, columns: cols, rows, aspect };
  } finally {
    release();
  }
}

export class PhotoShowcase {
  /**
   * @param {Object} options - 构造参数
   * @param {ReadonlyArray<string>} [options.images=[]] - 图片地址列表（顺序即轮播顺序）
   * @param {boolean} [options.mobile=false] - 是否移动端（降低采样密度）
   * @throws {TypeError} 当 images 不是数组时抛出
   */
  constructor({ images = [], mobile = false } = {}) {
    if (!Array.isArray(images)) {
      throw new TypeError('PhotoShowcase 需要 images 为数组');
    }

    /** @type {ReadonlyArray<string>} 图片地址列表 */
    this.images = images;
    /** @type {boolean} 是否移动端 */
    this.mobile = mobile;

    /** @type {THREE.Group} 场景根节点（挂到头像墙下，随 TRAE 字样一同定位） */
    this.group = new THREE.Group();
    this.group.name = 'PhotoShowcase';
    this.group.position.set(0, 0, BACKDROP_Z);

    /** @type {boolean} 是否处于展示状态 */
    this.active = false;
    /** @type {number} 当前展示阶段的计时（秒） */
    this._timer = 0;
    /** @type {'loading'|'hold'|'out'|'in'|'off'} 当前阶段 */
    this._phase = 'off';
    /** @type {number} 当前图片下标 */
    this._index = -1;
    /** @type {number} 阶段进度（0→1） */
    this._progress = 0;

    /**
     * @type {Array<{points: THREE.Points, geometry: THREE.BufferGeometry, material: THREE.PointsMaterial,
     *   targets: Float32Array, dirs: Float32Array, count: number}>|null}
     * 两个粒子云：一个承载当前图片，一个承载即将出现的图片
     */
    this._current = null;
    /** @type {object|null} */
    this._incoming = null;
    /** @type {number} 松手淡出的剩余进度 */
    this._fade = 0;

    /** @type {Array<THREE.BufferGeometry|THREE.Material>} 需要释放的资源 */
    this._disposables = [];

    /**
     * @type {Map<string, {colors: Float32Array, columns: number, rows: number, aspect: number}>}
     * 采样结果缓存：每张图只解码一次，之后轮播直接复用这份很小的颜色数组（单张约 30KB），
     * 避免长时间按住时反复解码大图导致内存与 CPU 持续攀升。
     */
    this._samples = new Map();

    this._columns = mobile ? Math.round(GRID_COLUMNS * 0.6) : GRID_COLUMNS;
  }

  /**
   * 依据采样结果构建一组粒子云（位置仓库 + 散开方向 + 颜色）。
   *
   * @param {{colors: Float32Array, columns: number, rows: number, aspect: number}} sample - 采样结果
   * @returns {object|null} 粒子云对象；采样为空时返回 null
   * @throws 无显式抛出
   */
  _createCloud(sample) {
    if (!sample || sample.colors.length === 0) return null;

    // 等比缩放到 MAX_WIDTH × MAX_HEIGHT 的框内
    let width = MAX_WIDTH;
    let height = width / sample.aspect;
    if (height > MAX_HEIGHT) {
      height = MAX_HEIGHT;
      width = height * sample.aspect;
    }

    const { columns, rows, colors } = sample;
    const count = columns * rows;
    const targets = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const i = row * columns + col;
        const x = (col / Math.max(1, columns - 1) - 0.5) * width;
        const y = (0.5 - row / Math.max(1, rows - 1)) * height;
        const z = 0;

        targets[i * 3] = x;
        targets[i * 3 + 1] = y;
        targets[i * 3 + 2] = z;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // 散开方向：以画面中心为基准向外，再叠加随机扰动，避免像规则放大
        const len = Math.max(0.001, Math.hypot(x, y));
        const spread = 0.55 + Math.random() * 0.75;
        dirs[i * 3] = (x / len) * spread + (Math.random() - 0.5) * 0.8;
        dirs[i * 3 + 1] = (y / len) * spread + (Math.random() - 0.5) * 0.8;
        dirs[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      }
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      // 点径刻意大于网格间距（间距约 (width/columns)，这里取 1.9 倍），
      // 让相邻粒子彼此重叠成“连续画面”，远看就是一张照片而不是稀疏的点阵；
      // 之前取 1.45 时点与点之间留有空隙，远景下会显得稀薄、看不清内容。
      size: (width / columns) * 1.9,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      // 保持照片原始颜色，不受色调映射影响
      toneMapped: false
    });

    // 淡暗底板：照片本身明暗差异大，在深色背景上容易出现“看不清边界”的问题；
    // 垫一层半透明暗底把画面范围框出来，图片内容会更醒目（与主题无关，用中性黑）
    const panelGeometry = new THREE.PlaneGeometry(width, height);
    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false
    });
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(0, 0, -0.06);
    panel.renderOrder = -2;
    panel.visible = false;
    this.group.add(panel);

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    // 排在头像方块之前绘制，让粒子落在 TRAE 字样背后
    points.renderOrder = -1;
    points.visible = false;
    this.group.add(points);

    this._disposables.push(geometry, material, panelGeometry, panelMaterial);

    return { points, geometry, material, panel, targets, dirs, count };
  }

  /**
   * 释放一组粒子云的几何体与材质，并从场景中移除。
   *
   * @param {object|null} cloud - 粒子云对象
   * @returns {void}
   * @throws 无显式抛出
   */
  _disposeCloud(cloud) {
    if (!cloud) return;
    this.group.remove(cloud.points);
    if (cloud.panel) this.group.remove(cloud.panel);
    this._disposables = this._disposables.filter(
      (item) => item !== cloud.geometry
        && item !== cloud.material
        && item !== (cloud.panel && cloud.panel.geometry)
        && item !== (cloud.panel && cloud.panel.material)
    );
    cloud.geometry.dispose();
    cloud.material.dispose();
    if (cloud.panel) {
      cloud.panel.geometry.dispose();
      cloud.panel.material.dispose();
    }
  }

  /**
   * 同步设置一组粒子云（含其暗底）的可见与透明度。
   *
   * @param {object|null} cloud - 粒子云对象
   * @param {number} value - 透明度，取值区间 [0, 1]
   * @returns {void}
   * @throws 无显式抛出
   */
  _setCloudOpacity(cloud, value) {
    if (!cloud) return;
    const opacity = Math.max(0, Math.min(1, value));
    cloud.material.opacity = opacity;
    if (cloud.panel) {
      // 底板只做轻微的衬托，透明度控制在图片透明度的 45%，避免变成一块黑框
      cloud.panel.material.opacity = opacity * 0.45;
      cloud.panel.visible = opacity > 0.001;
    }
    cloud.points.visible = opacity > 0.001;
  }

  /**
   * 把粒子云的位置按进度写入：t=0 位于目标位置，t>0 沿各自方向散开。
   *
   * @param {object} cloud - 粒子云对象
   * @param {number} amount - 散开程度（0 为归位，1 为完全散开）
   * @returns {void}
   * @throws 无显式抛出
   */
  _applyScatter(cloud, amount) {
    const { geometry, targets, dirs, count } = cloud;
    const attr = geometry.attributes.position;
    const array = attr.array;

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      array[i3] = targets[i3] + dirs[i3] * amount * SCATTER_DISTANCE;
      array[i3 + 1] = targets[i3 + 1] + dirs[i3 + 1] * amount * SCATTER_DISTANCE;
      array[i3 + 2] = targets[i3 + 2] + dirs[i3 + 2] * amount * SCATTER_DISTANCE;
    }
    attr.needsUpdate = true;
  }

  /**
   * 载入下一张图片并作为"即将出现"的粒子云。
   *
   * @returns {Promise<void>}
   * @throws 无显式抛出：加载失败时跳过该张，继续下一张
   */
  async _prepareNext() {
    if (this.images.length === 0) return;

    // 最多尝试 3 张，避免个别图片损坏导致卡住
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this._index = (this._index + 1) % this.images.length;
      const url = this.images[this._index];
      try {
        const cached = this._samples.get(url);
        const sample = cached || (await sampleImage(url, this._columns));
        if (!cached) this._samples.set(url, sample);

        // 等待期间用户可能已经松手：此时必须丢弃刚建好的粒子云，否则会残留在场景里泄漏
        if (!this.active) {
          if (this._incoming) {
            this._disposeCloud(this._incoming);
            this._incoming = null;
          }
          return;
        }

        const cloud = this._createCloud(sample);
        if (cloud) {
          // 新图一开始处于完全散开状态，随后汇聚成图片
          this._applyScatter(cloud, 1);
          this._setCloudOpacity(cloud, 0);
          this._incoming = cloud;
          return;
        }
      } catch (error) {
        console.debug(`[PhotoShowcase] 跳过一张图片：${error.message}`);
      }
    }
  }

  /**
   * 开始展示：立刻载入第一张图片。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  start() {
    if (this.active || this.images.length === 0) return;
    this.active = true;
    this._timer = 0;
    this._phase = 'loading';
    this._progress = 0;
    this._fade = 0;

    this._prepareNext()
      .then(() => {
        if (!this.active) return;
        if (!this._incoming) {
          this._phase = 'off';
          return;
        }
        // 首张也走"粒子汇聚"入场：之前它是直接跳到 hold 状态、以不透明度 1 瞬间出现，
        // 与后续图片"散开→汇聚"的呈现方式不一致，看起来像"第一张没有效果"。
        // 这里统一改用 in 阶段，让第一张同样由粒子汇聚成型，然后进入停留。
        this._phase = 'in';
        this._progress = 0;
      })
      .catch((error) => {
        console.debug('[PhotoShowcase] 首张图片准备失败：', error.message);
        this._phase = 'off';
      });
  }

  /**
   * 结束展示：淡出并释放粒子资源。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  stop() {
    if (!this.active) return;
    this.active = false;
    this._phase = 'off';
    this._fade = 1;
    this._disposeCloud(this._incoming);
    this._incoming = null;
  }

  /**
   * 每帧更新：推进停留计时、散开/汇聚阶段与淡出。
   *
   * @param {number} delta - 距上一帧的时间间隔（秒）
   * @returns {void}
   * @throws 无显式抛出
   */
  update(delta) {
    const dt = Math.min(delta, 0.05);

    // 松手后的收尾淡出
    if (!this.active) {
      if (this._fade > 0) {
        this._fade = Math.max(0, this._fade - dt / RELEASE_FADE);
        if (this._current) {
          this._setCloudOpacity(this._current, this._fade);
          this._applyScatter(this._current, (1 - this._fade) * 0.6);
        }
        if (this._fade === 0) {
          this._disposeCloud(this._current);
          this._current = null;
        }
      }
      return;
    }

    if (this._phase === 'loading' || this._phase === 'off') return;

    if (this._phase === 'hold') {
      const cloud = this._current;
      if (cloud) this._setCloudOpacity(cloud, 1);
      this._timer += dt;
      if (this._timer >= HOLD_DURATION && this.images.length > 1) {
        this._timer = 0;
        this._phase = 'loading';
        // 载入完成后自动进入"散开 → 汇聚"流程
        this._prepareNext()
          .then(() => {
            if (!this.active || !this._incoming) {
              this._phase = 'hold';
              return;
            }
            this._phase = 'out';
            this._progress = 0;
          })
          .catch(() => {
            this._phase = 'hold';
          });
      }
      return;
    }

    if (this._phase === 'out') {
      this._progress = Math.min(1, this._progress + dt / DISSOLVE_DURATION);
      if (this._current) {
        this._setCloudOpacity(this._current, 1 - this._progress);
        this._applyScatter(this._current, this._progress);
      }
      if (this._progress >= 1) {
        this._disposeCloud(this._current);
        this._current = null;
        this._phase = 'in';
        this._progress = 0;
      }
      return;
    }

    if (this._phase === 'in') {
      this._progress = Math.min(1, this._progress + dt / GATHER_DURATION);
      const cloud = this._incoming;
      if (cloud) {
        this._setCloudOpacity(cloud, this._progress);
        this._applyScatter(cloud, 1 - this._progress);
      }
      if (this._progress >= 1) {
        this._current = this._incoming;
        this._incoming = null;
        this._phase = 'hold';
        this._timer = 0;
      }
    }
  }

  /**
   * 释放全部粒子资源。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    this._disposeCloud(this._current);
    this._disposeCloud(this._incoming);
    this._current = null;
    this._incoming = null;
    // 采样缓存只是很小的颜色数组，直接清空即可（不含需要释放的 GPU 资源）
    this._samples.clear();
    for (const item of this._disposables) {
      if (item && typeof item.dispose === 'function') item.dispose();
    }
    this._disposables.length = 0;
    this.group.clear();
  }
}

/**
 * START_DELAY 用于文档与外部读取，说明"按住满 5 秒后开始播放"。
 * @type {number}
 */
export const SHOWCASE_START_DELAY = START_DELAY;
