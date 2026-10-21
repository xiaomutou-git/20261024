import * as THREE from 'three';
import { MORPH_CHARS } from '../config.js';
import { buildGlyphTargets, countGlyphPixels, easeInOutCubic } from './glyph.js';

/**
 * @file core/AvatarWall.js
 * @description 社区开发者像素头像墙：把每位开发者的头像以 8×8 像素方块浮雕的形式环绕在 1024 字形四周。
 *
 * 设计思路：
 *  - 头像图案由 username 哈希确定性生成（左右镜像的像素标识图），同一开发者每次进入都完全一致；
 *  - 每个像素用一个彩色方块表达，8×8 = 64 个方块 / 人，16 人恰好凑成 1024 个方块，与节日数字呼应；
 *  - 方块使用 MeshBasicMaterial(toneMapped: false)，使像素颜色不被色调映射改变，保证头像可辨认；
 *  - 头像牌只做 Y 轴朝向相机（billboard）：既保证任何角度都能看清头像，
 *    又避免了全向 billboard 带来的翻滚与廉价感；
 *  - 每个头像下方挂一枚 Sprite 标签显示社区昵称，Sprite 由 three.js 自动面向相机。
 *
 * @module core/AvatarWall
 */

/** 同一环内相邻头像的上下错落幅度（未缩放，实际使用时乘以头像牌缩放系数） @type {number} */
const RING_Y_STEP = 1.4;

/** 头像环的基础半径：内环贴着字形外侧，保证投影上不会压住中央 1024 @type {number} */
const RING_BASE_RADIUS = 16.5;

/** 内环的最小抬升高度：该值决定了头像簇与字形之间的净空（半径 16.5 时约 0.7 的比例） @type {number} */
const RING_BASE_Y = 11.5;

/** 相邻两环之间的垂直间距（未缩放） @type {number} */
const RING_Y_GAP = 3.0;

/** 相邻头像牌之间预留给缝隙的弧长（未缩放） @type {number} */
const RING_SLOT_GAP = 0.75;

/** 头像牌缩放系数的下限：人数很多时靠缩小牌面把所有人都塞进画面 @type {number} */
const CARD_SCALE_MIN = 0.6;

/** 超过该人数后开始缩小头像牌，避免头像簇过高导致相机被迫拉得过远 @type {number} */
const CARD_SCALE_THRESHOLD = 66;

/** 单环最多容纳的头像牌数量，超出后改为向外再扩一环 @type {number} */
const MAX_PER_RING = 52;

/** 移动端最多展示的头像数量，兼顾帧率与标签可读性 @type {number} */
const MOBILE_LIMIT = 36;

/** 单个像素方块的基准边长（实际使用时会乘以头像牌缩放系数） @type {number} */
const PIXEL_SIZE = 0.42;

/** 像素网格基准间距（略大于方块边长，形成缝隙；实际使用时会乘以头像牌缩放系数） @type {number} */
const PIXEL_GAP = 0.45;

/** 像素网格边长（8×8） @type {number} */
const GRID = 8;

/** 标签相对头像牌中心的垂直偏移（向下，基准值，实际使用时会乘以头像牌缩放系数） @type {number} */
const LABEL_OFFSET_Y = 2.7;

/** 标签 Sprite 的高度（世界单位，基准值），取值以保证昵称在拉远的相机下仍然可读 @type {number} */
const LABEL_HEIGHT = 1.5;

/** 标签 Sprite 的最大宽度（世界单位，基准值），避免超长昵称横向占位过宽 @type {number} */
const LABEL_MAX_WIDTH = 5.5;

/** 复用的离屏上下文，用于测量昵称文本宽度，避免反复创建 canvas @type {CanvasRenderingContext2D|null} */
let measureContext = null;

/** 真实头像像素的亮度系数：照片普遍偏亮，整体压暗以避免 Bloom 过曝 @type {number} */
const PHOTO_BRIGHTNESS = 0.82;

/** 真实头像中透明度低于该值的像素按“留空”处理 @type {number} */
const PHOTO_ALPHA_THRESHOLD = 0.45;

/** TRAE 汇聚形态的挤出层数，与中央 1024 字形的厚度观感保持一致 @type {number} */
const MORPH_DEPTH = 8;

/** 头像像素方块汇聚成 TRAE 时的放大倍数：小方块放大后填满字格 @type {number} */
const MORPH_VOXEL_SCALE = 2.35;

/** 每多少个「方位相邻」的头像共用一段字格：既保证同片区域的方块朝同一方向汇聚，又让字格由多张头像共同填充以保证颜色混合 @type {number} */
const MORPH_GROUP_SIZE = 4;

/** 同一头像牌内像素块依次飞出的错峰比例：0.25 表示最后一块比第一块晚启动约 1/4 的行程 @type {number} */
const MORPH_STAGGER = 0.25;

/**
 * 计算字符串的 32 位哈希（FNV-1a），作为像素图案与色相的确定性种子。
 *
 * @param {string} input - 待哈希的字符串（此处为社区账号名）
 * @returns {number} 无符号 32 位整数哈希值，取值区间 [0, 4294967295]
 * @throws 无显式抛出
 */
function hashString(input) {
  let hash = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 创建确定性伪随机数生成器（mulberry32）。
 *
 * @param {number} seed - 随机种子，通常来自 {@link hashString}
 * @returns {() => number} 取值区间为 [0, 1) 的随机函数
 * @throws 无显式抛出
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成 8×8 的镜像像素图案（类似头像标识图）：边框留白，内部左三列随机、右三列镜像。
 *
 * @param {number} seed - 确定性种子
 * @returns {Uint8Array} 长度 64 的数组，1 表示该像素被点亮、0 表示留空
 * @throws 无显式抛出
 */
function buildPattern(seed) {
  const random = createRandom(seed);
  const cells = new Uint8Array(GRID * GRID);
  const lastIndex = GRID - 1;

  for (let y = 1; y < lastIndex; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      // 阈值取 0.52，使图案整体偏疏朗，避免糊成一块
      const on = random() < 0.52 ? 1 : 0;
      cells[y * GRID + x] = on;
      cells[y * GRID + (lastIndex - x)] = on;
    }
  }
  return cells;
}

/**
 * 由种子推导像素颜色色相（0~1），并在主题主色附近做有限偏移，
 * 既让每位开发者的头像有辨识度，又保证整组头像与主题色调协调。
 *
 * @param {number} seed - 确定性种子
 * @param {number} baseHue - 主题主色色相，取值区间 [0, 1)
 * @returns {number} 偏移后的色相，取值区间 [0, 1)
 * @throws 无显式抛出
 */
function hueForSeed(seed, baseHue) {
  const offset = ((seed % 101) / 101 - 0.5) * 0.28;
  return (baseHue + offset + 1) % 1;
}

/**
 * 提取颜色的色相分量。
 *
 * @param {string} hex - 十六进制颜色字符串（如 '#06B6D4'）
 * @returns {number} 色相，取值区间 [0, 1)；解析失败时回退为 0.52（青蓝色相）
 * @throws 无显式抛出：内部捕获异常并返回兜底色相
 */
function extractHue(hex) {
  try {
    const hsl = { h: 0.52, s: 0, l: 0 };
    new THREE.Color(hex).getHSL(hsl);
    return Number.isFinite(hsl.h) ? hsl.h : 0.52;
  } catch (error) {
    console.warn('[AvatarWall] 主题色相解析失败，使用兜底色相：', error);
    return 0.52;
  }
}

/**
 * 加载真实头像图片，并将其缩放到 8×8 网格后返回像素数据。
 *
 * 说明：读取像素必须携带 crossOrigin；若社区站点未返回允许跨域的响应头，
 * 画布会被标记为“污染”，此时 getImageData 抛出 SecurityError，由调用方降级处理。
 *
 * @param {string} url - 头像图片地址
 * @param {number} size - 目标网格边长（像素），此处取 8
 * @returns {Promise<Uint8ClampedArray>} 长度 size×size×4 的 RGBA 像素数据
 * @throws {Error} 图片加载失败、Canvas 2D 上下文不可用、或画布被跨域污染时，Promise 会 reject
 */
function sampleAvatarPixels(url, size) {
  return new Promise((resolve, reject) => {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D 上下文不可用'));
            return;
          }
          ctx.drawImage(image, 0, 0, size, size);
          resolve(ctx.getImageData(0, 0, size, size).data);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('头像图片加载失败'));
      image.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 生成头像下方的昵称标签纹理（深色半透明底 + 白字）。
 * 画布宽度按昵称实际宽度自适应：短名字得到窄标签，长名字自动缩小字号，
 * 从而在 48 个头像同场的情形下避免标签互相拥挤。
 *
 * @param {string} name - 社区昵称
 * @returns {{texture: THREE.CanvasTexture, aspect: number}|null} 标签纹理及其宽高比；Canvas 不可用或绘制异常时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null，调用方会跳过标签
 */
function createLabelTexture(name) {
  try {
    const height = 96;
    const padding = 40;
    const maxTextureWidth = 560;
    const label = String(name);

    if (!measureContext) {
      const canvas = document.createElement('canvas');
      measureContext = canvas.getContext('2d');
    }
    if (!measureContext) return null;

    // 先测量文本宽度，据此决定画布宽度；过长时逐步缩小字号直到能装下
    let fontSize = 64;
    const setFont = (size) => `bold ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    measureContext.font = setFont(fontSize);
    let textWidth = measureContext.measureText(label).width;
    while (textWidth + padding * 2 > maxTextureWidth && fontSize > 30) {
      fontSize -= 4;
      measureContext.font = setFont(fontSize);
      textWidth = measureContext.measureText(label).width;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(Math.min(textWidth + padding * 2, maxTextureWidth));
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 深色半透明背板，保证在明亮头像与深色背景上都能读清；
    // 浅色主题改为浅底深色字，因此背板颜色也随基调翻转
    const fill = document.documentElement.dataset.tone === 'light'
      ? 'rgba(240, 240, 242, 0.95)'
      : 'rgba(7, 18, 26, 0.78)';
    const stroke = document.documentElement.dataset.tone === 'light'
      ? 'rgba(23, 34, 42, 0.28)'
      : 'rgba(255, 255, 255, 0.22)';
    const text = document.documentElement.dataset.tone === 'light' ? '#17222a' : '#ffffff';
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    ctx.font = setFont(fontSize);
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, aspect: canvas.width / canvas.height };
  } catch (error) {
    console.warn('[AvatarWall] 生成昵称标签失败，跳过该标签：', error);
    return null;
  }
}

export class AvatarWall {
  /**
   * @param {Object} options - 构造参数
   * @param {object} options.theme - 主题令牌对象，需包含 accent 字段（用于推导头像色相）
   * @param {ReadonlyArray<{username: string, name: string, role: string, avatarPath: string}>} [options.developers=[]] - 开发者名单
   * @param {boolean} [options.mobile=false] - 是否移动端，为 true 时采用两圈 24 人的轻量布局
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  constructor({ theme, developers = [], mobile = false } = {}) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('AvatarWall 需要一个合法的 theme 对象');
    }

    /** @type {object} 当前主题令牌 */
    this.theme = theme;
    /** @type {ReadonlyArray<object>} 开发者名单 */
    this.developers = developers;
    /** @type {boolean} 是否移动端（决定头像环的圈数与人数） */
    this.mobile = mobile;
    /** @type {number|null} 当前被悬停的头像下标 */
    this._hoveredIndex = null;
    /** @type {Float32Array} 每个头像像素方块汇聚成 TRAE 时的目标位置（头像墙局部坐标），长度 3×总方块数 */
    this.morphTargets = new Float32Array(0);
    /** @type {number} 当前凝聚进度，由 App 每帧写入，取值区间 [0, 1] */
    this._morphProgress = 0;
    /** @type {THREE.Object3D} 复用矩阵组装用的临时对象，避免每帧新建 */
    this._dummy = new THREE.Object3D();
    /** @type {THREE.Group} 头像墙根节点（由外部挂到场景节点下，从而随场景一起公转） */
    this.group = new THREE.Group();
    this.group.name = 'AvatarWall';

    /** @type {Array<{developer: object, mesh: THREE.InstancedMesh, sprite: THREE.Sprite|null, pattern: Uint8Array, seed: number, source: string}>} 头像条目 */
    this.items = [];
    /** @type {Array<THREE.BufferGeometry|THREE.Material|THREE.Texture>} 需要释放的资源 */
    this._disposables = [];
    /** @type {number} 主题主色色相 */
    this._baseHue = extractHue(theme.accent);
    /** @type {boolean} 是否已销毁，用于丢弃迟到的头像加载结果 */
    this._disposed = false;

    /**
     * 头像牌缩放系数：人数超过阈值后按人数逐步缩小牌面，
     * 使得 200 余位成员都能落进画面且相机不必拉得太远。
     * @type {number}
     */
    this._cardScale = AvatarWall._resolveCardScale(this.mobile ? MOBILE_LIMIT : developers.length);

    this._build();
  }

  /**
   * 依人数推导头像牌缩放系数。
   *
   * 逻辑：人数不超过阈值时保持原始尺寸；超过后按“面积占比”开方递减，
   * 例如 200 人时约为 0.6，既保证能全部排下，又不至于小到看不清像素头像。
   *
   * @param {number} count - 需要展示的头像数量
   * @returns {number} 缩放系数，取值区间 [CARD_SCALE_MIN, 1]
   * @throws 无显式抛出
   */
  static _resolveCardScale(count) {
    if (!Number.isFinite(count) || count <= CARD_SCALE_THRESHOLD) return 1;
    const ratio = Math.sqrt(CARD_SCALE_THRESHOLD / count);
    return Math.max(CARD_SCALE_MIN, Math.min(1, ratio));
  }

  /**
   * 按人数规划头像环布局（上下两簇、每簇若干环）。
   *
   * 计算逻辑：
   *  1. 先由缩放系数得出单张头像牌的实际宽度，据此算出每环可容纳的人数；
   *  2. 再把总人数均分到上下两簇的若干环上；
   *  3. 环的高度自内向外递增，保证头像簇整体位于字形上方 / 下方，投影上不遮挡中央 1024。
   *
   * @param {number} desired - 期望展示的头像数量
   * @returns {Array<{radius: number, count: number, y: number}>} 环布局表
   * @throws 无显式抛出：数量为 0 时返回空数组
   */
  _planLayout(desired) {
    if (desired <= 0) return [];

    const cardWidth = GRID * PIXEL_GAP * this._cardScale;
    const slotArc = cardWidth + RING_SLOT_GAP * this._cardScale;
    // 半径不变时每环的容量由弧长决定；上限 MAX_PER_RING 防止单环过密
    const perRing = Math.max(4, Math.min(MAX_PER_RING, Math.floor((Math.PI * 2 * RING_BASE_RADIUS) / slotArc)));

    // 每簇需要几环（上下各占一半）
    const perCluster = Math.ceil(desired / 2);
    const ringCount = Math.max(1, Math.ceil(perCluster / perRing));
    // 均分到各环，多出来的名额分给靠外的环（外环弧长更长，看起来更自然）
    const baseCount = Math.floor(perCluster / ringCount);
    const remainder = perCluster - baseCount * ringCount;

    const layout = [];

    // 先排上半簇，再排下半簇；两簇的环高互为镜像
    for (let sign = 1; sign >= -1; sign -= 2) {
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        const extra = ringIndex >= ringCount - remainder ? 1 : 0;
        layout.push({
          // 外环略微外扩，形成向观众张开的“环形看台”纵深
          radius: RING_BASE_RADIUS + ringIndex * 1.6 * this._cardScale,
          count: baseCount + extra,
          y: sign * (RING_BASE_Y + ringIndex * RING_Y_GAP * this._cardScale)
        });
      }
    }

    return layout;
  }

  /**
   * 构建全部头像牌：生成像素图案、实例矩阵与颜色，并按环状分布摆放。
   *
   * @returns {void}
   * @throws 无显式抛出：名单为空时直接返回
   */
  _build() {
    // 席位需求：移动端限制为 MOBILE_LIMIT（保帧率），桌面端按实际名单长度铺满
    const desired = this.mobile ? MOBILE_LIMIT : this.developers.length;
    const layout = this._planLayout(desired);
    const slots = this._computeSlots(layout);
    const count = Math.min(this.developers.length, slots.length);
    if (count === 0) return;

    // 头像牌缩放系数：人数越多牌面越小，保证所有人都能落进画面
    const cardScale = this._cardScale;

    // 全部头像共用一份几何体与材质，仅通过 instanceColor 区分颜色，降低显存与状态切换开销
    const pixelSize = PIXEL_SIZE * cardScale;
    const geometry = new THREE.BoxGeometry(pixelSize, pixelSize, pixelSize);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      // 关闭色调映射，让像素颜色保持原样，头像更易辨认
      toneMapped: false
    });
    this._disposables.push(geometry, material);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const halfGrid = (GRID - 1) / 2;

    for (let i = 0; i < count; i += 1) {
      const developer = this.developers[i];
      const seed = hashString(developer.username);
      const pattern = buildPattern(seed);
      const hue = hueForSeed(seed, this._baseHue);

      const mesh = new THREE.InstancedMesh(geometry, material, GRID * GRID);
      mesh.name = `Avatar-${developer.username}`;
      // 记录下标，便于外部射线拾取后反查是哪位开发者
      mesh.userData.avatarIndex = i;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // 实例矩阵是按像素格写的，包围盒不随实例变化，关闭视锥剔除避免旋转时整体消失
      mesh.frustumCulled = false;

      for (let pixel = 0; pixel < GRID * GRID; pixel += 1) {
        const gx = pixel % GRID;
        const gy = Math.floor(pixel / GRID);

        dummy.position.set(
          (gx - halfGrid) * PIXEL_GAP * cardScale,
          (halfGrid - gy) * PIXEL_GAP * cardScale,
          0
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(pixel, dummy.matrix);

        if (pattern[pixel] === 1) {
          color.setHSL(hue, 0.6, 0.5);
        } else {
          color.setHSL(hue, 0.28, 0.11);
        }
        mesh.setColorAt(pixel, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // 按预算好的环状落位摆放，并按环次高低错落，减少相邻头像的 billboard 遮挡
      const slot = slots[i];
      mesh.position.set(slot.x, slot.y, slot.z);
      this.group.add(mesh);

      // 昵称标签：桌面端改为"悬停时才即时创建"——
      // 220 张标签纹理一次性生成约占 40MB 显存，是持续的显存压力来源；
      // 移动端没有 hover，仍在构建时全部创建并常驻显示。
      let sprite = null;
      if (this.mobile) {
        sprite = this._createLabel(developer, mesh.position, cardScale);
      }

      // 记录该头像在汇聚目标表中的起始下标（每个头像占 8×8 = 64 个位置）
      this.items.push({
        developer,
        mesh,
        sprite,
        pattern,
        seed,
        source: 'identicon',
        targetOffset: i * GRID * GRID
      });
    }

    // 预先算好 TRAE 汇聚目标；凝聚时只需在「卡片位置 ↔ 汇聚位置」之间插值
    this._buildMorphTargets();

    // 生成的像素头像可立即呈现；随后异步拉取社区真实头像，成功后替换为真实像素
    this._loadRealAvatars();
  }

  /**
   * 依据环布局预算出每个头像牌的空间落位。
   *
   * @param {ReadonlyArray<{radius: number, count: number}>} layout - 环布局表（半径与人数）
   * @returns {Array<{x: number, y: number, z: number, ringIndex: number}>} 与布局总人数等长的位置数组
   * @throws 无显式抛出
   */
  _computeSlots(layout) {
    const slots = [];
    let index = 0;

    layout.forEach((ring, ringIndex) => {
      for (let slot = 0; slot < ring.count; slot += 1) {
        // 相邻环之间错开半个格位的角度，避免上下两环在视线上排成整齐的放射线
        const angle = (slot / ring.count) * Math.PI * 2 + ringIndex * (Math.PI / ring.count);
        slots.push({
          x: Math.cos(angle) * ring.radius,
          // ring.y 决定该环位于字形上方还是下方，环内再做小幅错落以避免呆板
          y: ring.y + (index % 2 === 0 ? 1 : -1) * RING_Y_STEP * this._cardScale,
          z: Math.sin(angle) * ring.radius,
          ringIndex
        });
        index += 1;
      }
    });

    return slots;
  }

  /**
   * 预算头像像素方块汇聚成 TRAE 时的目标位置。
   *
   * 执行逻辑：
   *  1. 先用与中央字形同尺寸的点阵生成「65 像素 × 8 层」的字格；
   *  2. 把字格与头像牌都按“方位”排序（先分上下、再按左右），再按每 4 张方位相邻的头像共用一段字格来配对——
   *     同一片区域的方块因而朝同一方向飞向中心（形成汇聚感），
   *     同时一段字格由多张头像的像素共同填充（颜色得以混合，字形保持清晰）；
   *  3. 同一字格内会有多块叠成一束（并做轻微抖动），于是 TRAE 字样像是由社区成员头像的像素合并而成。
   *
   * @returns {void}
   * @throws 无显式抛出：名单为空时保持空目标表
   */
  _buildMorphTargets() {
    const totalVoxels = this.items.length * GRID * GRID;
    if (totalVoxels === 0) {
      this.morphTargets = new Float32Array(0);
      return;
    }

    const pixelCount = countGlyphPixels(MORPH_CHARS);
    const slots = buildGlyphTargets(MORPH_CHARS, pixelCount * MORPH_DEPTH);
    const slotCount = slots.positions.length / 3;

    // 字格按方位排序：上半部分的字格排在前面，段内再按 X 从左到右
    const sortedSlots = Array.from({ length: slotCount }, (_, index) => index).sort(
      (a, b) => this._slotOrderKey(slots.positions, a) - this._slotOrderKey(slots.positions, b)
    );

    // 头像牌按同样的方位键排序，保证“左上的牌 → 左上方的字格”
    const orderedItems = this.items.slice().sort((a, b) => this._avatarOrderKey(a) - this._avatarOrderKey(b));

    // 每 MORPH_GROUP_SIZE 张方位相邻的头像共用一段字格
    const groupCount = Math.max(1, Math.ceil(orderedItems.length / MORPH_GROUP_SIZE));
    const slotsPerGroup = Math.max(1, Math.ceil(slotCount / groupCount));
    const targets = new Float32Array(totalVoxels * 3);

    orderedItems.forEach((item, orderIndex) => {
      const segmentStart = Math.floor(orderIndex / MORPH_GROUP_SIZE) * slotsPerGroup;

      for (let pixel = 0; pixel < GRID * GRID; pixel += 1) {
        const slotIndex = sortedSlots[(segmentStart + (pixel % slotsPerGroup)) % slotCount];
        // 用哈希取抖动，让同一字格内的方块在三个轴向上轻微散开，既保留体积感又不至于完全重合
        const noiseXY = (((pixel * 2654435761) >>> 8) % 1000) / 1000 - 0.5;
        const noiseZ = (((pixel * 2246822519) >>> 9) % 1000) / 1000 - 0.5;
        const targetIndex = (item.targetOffset + pixel) * 3;

        targets[targetIndex] = slots.positions[slotIndex * 3] + noiseXY * 0.14;
        targets[targetIndex + 1] = slots.positions[slotIndex * 3 + 1] + noiseXY * 0.09;
        targets[targetIndex + 2] = slots.positions[slotIndex * 3 + 2] + noiseZ * 0.3;
      }
    });

    this.morphTargets = targets;
  }

  /**
   * 字格的方位排序键：先按上下分组，再按左右排序。
   *
   * @param {Float32Array} positions - 字格位置数组（长度 3×槽位数）
   * @param {number} slotIndex - 槽位下标
   * @returns {number} 排序键，上半部分统一加上 1000 的偏移
   * @throws 无显式抛出
   */
  _slotOrderKey(positions, slotIndex) {
    const x = positions[slotIndex * 3];
    const y = positions[slotIndex * 3 + 1];
    return (y >= 0 ? 1000 : 0) + x;
  }

  /**
   * 头像牌的方位排序键，与 {@link AvatarWall#_slotOrderKey} 保持同一套规则。
   *
   * @param {{mesh: THREE.InstancedMesh}} item - 头像条目
   * @returns {number} 排序键
   * @throws 无显式抛出
   */
  _avatarOrderKey(item) {
    const { x, y } = item.mesh.position;
    return (y >= 0 ? 1000 : 0) + x;
  }

  /**
   * 加载本地真实头像，并把缩略图采样成 8×8 像素写入方块颜色。
   *
   * 说明：只使用随项目一起打包的本地头像（同源、无跨域限制、也不会产生网络请求）。
   * 曾经在缺少本地图时回退到社区 CDN 的远程头像，但该 CDN 在受限网络下会稳定失败，
   * 每次进页面都会刷出一屏 net::ERR_FAILED，因此取消远程回退——
   * 没有本地图的成员直接使用确定性生成的像素头像，画面完整且控制台干净。
   *
   * @returns {void}
   * @throws 无显式抛出：全部异常都在 Promise 内部捕获并静默降级
   */
  _loadRealAvatars() {
    for (const item of this.items) {
      const url = item.developer.localAvatar;
      if (!url) continue;

      sampleAvatarPixels(url, GRID)
        .then((pixels) => {
          if (this._disposed) return;
          this._applyPhotoPixels(item, pixels);
        })
        .catch((error) => {
          // 使用 debug 级别：DevTools 默认不显示，既方便排查又不污染控制台
          console.debug(`[AvatarWall] ${item.developer.name} 的本地头像未启用：${error.message}`);
        });
    }
  }

  /**
   * 把采样到的真实头像像素写入某个头像牌的方块颜色。
   *
   * @param {{mesh: THREE.InstancedMesh, source: string}} item - 头像条目
   * @param {Uint8ClampedArray} data - 8×8 像素的 RGBA 数据，长度 256
   * @returns {void}
   * @throws 无显式抛出
   */
  _applyPhotoPixels(item, data) {
    const color = new THREE.Color();
    for (let pixel = 0; pixel < GRID * GRID; pixel += 1) {
      const r = data[pixel * 4] / 255;
      const g = data[pixel * 4 + 1] / 255;
      const b = data[pixel * 4 + 2] / 255;
      const a = data[pixel * 4 + 3] / 255;

      if (a < PHOTO_ALPHA_THRESHOLD) {
        // 透明像素退化为暗色方块，保持牌面完整
        color.setRGB(r * 0.2, g * 0.2, b * 0.2, THREE.SRGBColorSpace);
      } else {
        color.setRGB(
          r * PHOTO_BRIGHTNESS,
          g * PHOTO_BRIGHTNESS,
          b * PHOTO_BRIGHTNESS,
          THREE.SRGBColorSpace
        );
      }
      item.mesh.setColorAt(pixel, color);
    }
    if (item.mesh.instanceColor) item.mesh.instanceColor.needsUpdate = true;
    item.source = 'photo';
  }

  /**
   * 统计已接入真实头像与仍使用生成头像的数量，便于自查资源接入情况。
   *
   * @returns {{photo: number, generated: number, total: number}} 真实头像数、生成头像数、总数
   * @throws 无显式抛出
   */
  getAvatarSourceStats() {
    let photo = 0;
    for (const item of this.items) {
      if (item.source === 'photo') photo += 1;
    }
    return { photo, generated: this.items.length - photo, total: this.items.length };
  }

  /**
   * 为一个头像创建昵称标签精灵（纹理 + 材质 + 精灵），并挂到场景中。
   *
   * @param {{displayName: string, name: string}} developer - 成员信息
   * @param {THREE.Vector3} position - 头像牌中心位置
   * @param {number} cardScale - 头像牌缩放系数
   * @returns {THREE.Sprite|null} 创建出的精灵；文本纹理失败时返回 null
   * @throws 无显式抛出：纹理生成失败时静默返回 null
   */
  _createLabel(developer, position, cardScale) {
    const label = createLabelTexture(developer.displayName || developer.name);
    if (!label) return null;

    const material = new THREE.SpriteMaterial({
      map: label.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(material);
    const labelWidth = Math.min(LABEL_HEIGHT * label.aspect, LABEL_MAX_WIDTH);
    sprite.scale.set(labelWidth * cardScale, LABEL_HEIGHT * cardScale, 1);
    sprite.position.set(
      position.x,
      position.y - LABEL_OFFSET_Y * cardScale,
      position.z
    );
    sprite.visible = this.mobile;
    this.group.add(sprite);
    this._disposables.push(material, label.texture);
    return sprite;
  }

  /**
   * 确保某个头像的标签已创建（桌面端按需创建，最多为悬停过的头像保留标签）。
   *
   * @param {number} index - 头像下标
   * @returns {THREE.Sprite|null} 对应标签精灵
   * @throws 无显式抛出
   */
  _ensureLabel(index) {
    const item = this.items[index];
    if (!item) return null;
    if (item.sprite) return item.sprite;

    item.sprite = this._createLabel(item.developer, item.mesh.position, this._cardScale);
    return item.sprite;
  }

  /**
   * 返回全部头像牌网格，供外部做射线拾取。
   *
   * @returns {THREE.InstancedMesh[]} 头像牌网格数组，顺序与内部 items 一致
   * @throws 无显式抛出
   */
  getMeshes() {
    return this.items.filter((item) => item.mesh).map((item) => item.mesh);
  }

  /**
   * 统计当前头像墙的实际空间范围，供相机自适应使用。
   * 头像数量会随社区成员增长，因此相机距离不宜写死，应按真实包围盒计算。
   *
   * @returns {{radius: number, maxY: number}} radius 为头像牌到中轴的最大水平距离；maxY 为头像中心的最大高度（取绝对值）
   * @throws 无显式抛出：尚未构建任何头像时返回全 0
   */
  getBounds() {
    let radius = 0;
    let maxY = 0;

    for (const item of this.items) {
      const { x, y, z } = item.mesh.position;
      radius = Math.max(radius, Math.hypot(x, z));
      maxY = Math.max(maxY, Math.abs(y));
    }

    return { radius, maxY };
  }

  /**
   * 设置被悬停的头像：桌面端只让该头像的昵称标签显形，其余保持隐藏。
   *
   * @param {number|null} index - 头像下标（与 getMeshes() 顺序一致）；传 null 表示取消悬停
   * @returns {void}
   * @throws 无显式抛出：下标越界时按取消悬停处理
   */
  setHovered(index) {
    const normalized = index !== null && index >= 0 && index < this.items.length ? index : null;
    if (this._hoveredIndex === normalized) return;

    const previous = this._hoveredIndex;
    this._hoveredIndex = normalized;

    // 移动端标签常驻显示，不参与悬停切换
    if (this.mobile) return;

    if (previous !== null) {
      const prevItem = this.items[previous];
      if (prevItem && prevItem.sprite) prevItem.sprite.visible = false;
    }
    if (normalized !== null) {
      // 桌面端标签按需创建：只给真正悬停过的头像生成纹理，避免一次性占满显存
      const sprite = this._ensureLabel(normalized);
      if (sprite) sprite.visible = true;
    }
  }

  /**
   * 每帧更新头像墙：
   *  - 常规状态：所有头像牌只绕 Y 轴朝向相机（billboard）；
   *  - 凝聚状态：头像牌逐渐转正，同时把 8×8 像素方块从卡片位置插值飞向 TRAE 汇聚目标，
   *    字号放大到填满字格，于是整块 TRAE 字样由社区成员头像的像素合并而成。
   *
   * @param {THREE.Camera} camera - 当前相机，用于计算朝向角
   * @param {number} [parentRotationY=0] - 父级场景节点的 Y 轴旋转（弧度）
   * @param {number} [morphProgress=0] - 凝聚进度，取值区间 [0, 1]，由 App 传入
   * @returns {void}
   * @throws 无显式抛出：参数缺失时直接跳过
   */
  update(camera, parentRotationY = 0, morphProgress = 0) {
    if (!camera || this.items.length === 0) return;

    const morphT = easeInOutCubic(morphProgress);
    const progressChanged = Math.abs(morphProgress - this._morphProgress) > 0.0002;
    this._morphProgress = morphProgress;

    // 凝聚时头像牌逐渐转正（不再朝向相机），使像素块沿直线飞向中心汇聚
    const rotation =
      (Math.atan2(camera.position.x, camera.position.z) - parentRotationY) * (1 - morphT);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    for (const item of this.items) {
      item.mesh.rotation.y = rotation;
      if (progressChanged) this._writeMorphMatrices(item, morphT, cos, sin);
    }

    if (progressChanged) this._updateLabelVisibility(morphT);
  }

  /**
   * 重写某个头像的全部实例矩阵：在卡片内位置与 TRAE 汇聚目标之间插值，并按进度放大字号。
   *
   * @param {{mesh: THREE.InstancedMesh, targetOffset: number}} item - 头像条目
   * @param {number} morphT - 已缓动的凝聚进度，取值区间 [0, 1]
   * @param {number} cos - 头像牌当前旋转角的余弦，用于把汇聚目标换算到牌面局部坐标
   * @param {number} sin - 头像牌当前旋转角的正弦
   * @returns {void}
   * @throws 无显式抛出
   */
  _writeMorphMatrices(item, morphT, cos, sin) {
    const mesh = item.mesh;
    const halfGrid = (GRID - 1) / 2;

    for (let pixel = 0; pixel < GRID * GRID; pixel += 1) {
      const gx = pixel % GRID;
      const gy = Math.floor(pixel / GRID);

      // 同一头像牌内的像素块依次飞出（错峰），形成“像素流朝中心汇聚”的层次感
      const delay = (pixel / (GRID * GRID)) * MORPH_STAGGER;
      const localT = morphT <= delay ? 0 : Math.min(1, (morphT - delay) / (1 - MORPH_STAGGER));
      const scale = 1 + (MORPH_VOXEL_SCALE - 1) * localT;

      // 卡片内的原始位置（头像牌局部坐标，牌面位于 z = 0）
      const cardX = (gx - halfGrid) * PIXEL_GAP * this._cardScale;
      const cardY = (halfGrid - gy) * PIXEL_GAP * this._cardScale;

      // 汇聚目标位于头像墙局部坐标系，需减去牌中心并按牌面旋转做逆变换
      const targetIndex = (item.targetOffset + pixel) * 3;
      const dx = this.morphTargets[targetIndex] - mesh.position.x;
      const dy = this.morphTargets[targetIndex + 1] - mesh.position.y;
      const dz = this.morphTargets[targetIndex + 2] - mesh.position.z;
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      this._dummy.position.set(
        cardX + (localX - cardX) * localT,
        cardY + (dy - cardY) * localT,
        localZ * localT
      );
      this._dummy.scale.setScalar(scale);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(pixel, this._dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 按凝聚进度切换昵称标签可见性：一旦开始凝聚就整体隐藏，恢复时回到常规规则。
   *
   * @param {number} morphT - 已缓动的凝聚进度，取值区间 [0, 1]
   * @returns {void}
   * @throws 无显式抛出
   */
  _updateLabelVisibility(morphT) {
    const morphed = morphT > 0.02;
    this.items.forEach((item, index) => {
      if (!item.sprite) return;
      if (morphed) {
        item.sprite.visible = false;
      } else {
        // 移动端没有 hover，标签常驻；桌面端仍只在悬停时显示
        item.sprite.visible = this.mobile || index === this._hoveredIndex;
      }
    });
  }

  /**
   * 应用新主题：仅重算像素颜色（图案与布局保持不变），在主题主色附近重新分配色相。
   *
   * @param {object} theme - 新的主题令牌对象
   * @returns {void}
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  applyTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('AvatarWall.applyTheme 需要一个合法的 theme 对象');
    }
    this.theme = theme;
    this._baseHue = extractHue(theme.accent);

    const color = new THREE.Color();
    for (const item of this.items) {
      // 已接入真实头像的条目保留照片原色，不再参与主题着色
      if (item.source === 'photo') continue;
      const hue = hueForSeed(item.seed, this._baseHue);
      for (let pixel = 0; pixel < GRID * GRID; pixel += 1) {
        if (item.pattern[pixel] === 1) {
          color.setHSL(hue, 0.6, 0.5);
        } else {
          color.setHSL(hue, 0.28, 0.11);
        }
        item.mesh.setColorAt(pixel, color);
      }
      if (item.mesh.instanceColor) item.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 统计头像墙方块总数（每个头像 8×8 = 64 块）。
   *
   * @returns {number} 方块总数
   * @throws 无显式抛出
   */
  getVoxelCount() {
    return this.items.length * GRID * GRID;
  }

  /**
   * 释放几何体、材质与标签纹理，避免内存泄漏。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    this._disposed = true;
    for (const item of this.items) {
      if (item.sprite) {
        this.group.remove(item.sprite);
        item.sprite = null;
      }
      this.group.remove(item.mesh);
    }
    this.items.length = 0;

    for (const resource of this._disposables) {
      if (resource && typeof resource.dispose === 'function') resource.dispose();
    }
    this._disposables.length = 0;
    this.group.clear();
  }
}
