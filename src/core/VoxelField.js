import * as THREE from 'three';
import {
  CELL_SIZE,
  VOXEL_SIZE,
  LOGO_DEPTH,
  INTERACTION_CONFIG
} from '../config.js';
import { buildLogoLayout, easeOutCubic, easeInOutCubic } from './glyph.js';
import { createRadialGlowTexture } from './textures.js';
// 每一格像素方块使用的贴图素材（构建期由 Vite 处理成带哈希的静态资源）
import VOXEL_TILE_URL from '../assets/voxel-tile.png';

/**
 * @file core/VoxelField.js
 * @description 1024 体素场：把 "1024" 四个字符译为三维体素阵列，并叠加一层环绕的数据方块云。
 *
 * 设计思路：
 *  - 使用单个 InstancedMesh 承载全部 1024 个方块，1 次 draw call 完成渲染，移动端亦可稳定 60fps；
 *  - 字形体素由 5x7 点阵字模沿 Z 轴挤出得到，环境方块自动补足剩余数量，保证总数恒为 1024；
 *  - 所有动画只在“需要”时才写入实例矩阵（入场聚合、脉冲扩散、点亮衰减、悬停），静止时零开销；
 *  - 关闭动效（prefers-reduced-motion）时直接呈现终态，点击改为瞬时点亮，不做波扩散。
 *
 * @module core/VoxelField
 */

/** 单块方块完成“从四周汇聚到字形”动画的时长（秒） @type {number} */
const REVEAL_DURATION = 1.9;

/** 入场动画的错峰总跨度（秒），让 1024 个方块的汇聚更有节奏而不拖沓 @type {number} */
const REVEAL_STAGGER = 0.45;

/** 点亮能量的每秒衰减值，数值越大回落越快 @type {number} */
const LIT_DECAY = 1.1;

/** 凝聚形变的进度速度（每秒），约 0.4s 完成「1024 ↔ TRAE」的一次切换 @type {number} */
const MORPH_SPEED = 2.4;

/** 地面网格与光晕所在的 Y 坐标 @type {number} */
const FLOOR_Y = -7.6;

/** 脉冲波带的宽度，决定一次点击能点亮多“厚”的一圈方块 @type {number} */
const PULSE_BAND = 2;

/**
 * 创建一个确定性伪随机数生成器（mulberry32），保证不同刷新之间布局稳定。
 *
 * @param {number} [seed=20261024] - 随机种子，默认取 1024 节日期 2026.10.24
 * @returns {() => number} 返回取值区间为 [0, 1) 的随机函数
 * @throws 无显式抛出
 */
function createRandom(seed = 20261024) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class VoxelField {
  /**
   * @param {Object} options - 构造参数
   * @param {object} options.theme - 主题令牌对象（见 config.js 的 THEMES），必须包含 accent / accentDeep / secondary / glow / diffuser 字段
   * @param {boolean} [options.reducedMotion=false] - 是否处于“减弱动效”模式，为 true 时跳过入场动画与波扩散
   * @param {(count: number) => void} [options.onLitCountChange=null] - 已点亮方块数量变化时的回调，用于 HUD 展示
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  constructor({ theme, reducedMotion = false, onLitCountChange = null } = {}) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('VoxelField 需要一个合法的 theme 对象');
    }

    /** @type {object} 当前主题令牌 */
    this.theme = theme;
    /** @type {boolean} 是否减弱动效 */
    this.reducedMotion = reducedMotion;
    /** @type {((count: number) => void)|null} 点亮计数回调 */
    this.onLitCountChange = onLitCountChange;

    /** @type {THREE.Group} 场景根节点（含方块、地面网格、光晕） */
    this.group = new THREE.Group();
    this.group.name = 'VoxelField';

    /**
     * @type {{positions: Float32Array, depth: number, pixelCount: number}}
     * 中央品牌 logo 的体素布局（外框 + 左下错位背板 + 由 1024 组成的两只眼睛）。
     * 布局只算一次，构造期与后续布局阶段共用同一份结果。
     */
    this._logoLayout = buildLogoLayout(LOGO_DEPTH);

    /**
     * @type {number} 场景方块总数。
     * 场景只保留中央 logo 的体素（不再有外围星尘方块），
     * 因此数量 = logo 点阵像素数 × 挤出层数。
     */
    this.count = this._logoLayout.positions.length / 3;
    /** @type {THREE.InstancedMesh|null} 实例化方块网格 */
    this.mesh = null;

    /** @type {Float32Array} 每个方块的目标位置（字形/数据云），长度 3n */
    this.basePositions = new Float32Array(this.count * 3);
    /** @type {Float32Array} 每个方块的入场起始位置，长度 3n */
    this.startPositions = new Float32Array(this.count * 3);
    /** @type {Float32Array} 每个方块的基础颜色（RGB），长度 3n */
    this.baseColors = new Float32Array(this.count * 3);
    /** @type {Float32Array} 每个方块当前的点亮能量，长度 n，取值区间 [0, 1] */
    this.litEnergy = new Float32Array(this.count);
    /** @type {Uint8Array} 每个方块是否已被点亮过（用于去重统计），长度 n */
    this.seen = new Uint8Array(this.count);
    /** @type {Float32Array} 每个方块入场动画的延迟时间，长度 n */
    this.delays = new Float32Array(this.count);
    /** @type {Uint8Array} 环境方块是否为“高亮数据点”，长度 n；构建期即固定，供主题切换复用 */
    this.glowFlag = new Uint8Array(this.count);
    /** @type {Float32Array} 每个方块的明暗系数，长度 n；构建期即固定，供主题切换复用 */
    this.shade = new Float32Array(this.count);

    /** @type {number} 已点亮方块数量 */
    this.litCount = 0;
    /** @type {number|null} 当前悬停的实例下标 */
    this.hoverIndex = null;

    // 内部运行时状态
    this._revealElapsed = 0;
    /** @type {boolean} 是否应处于凝聚形态（按住不放时置为 true） */
    this._morphTarget = false;
    /** @type {number} 当前凝聚进度：0 为「1024」形态，1 为「TRAE」形态 */
    this._morphProgress = 0;
    this._revealTotal = REVEAL_DURATION + REVEAL_STAGGER;
    this._litActive = false;
    this._pulse = { active: false, center: new THREE.Vector3(), radius: 0 };
    this._dummy = new THREE.Object3D();
    this._colorA = new THREE.Color();
    this._colorB = new THREE.Color();
    this._floor = null;
    this._disposables = [];

    this._buildLayout();
    this._buildMesh();
    this._buildFloor();

    // 减弱动效时直接跳到终态，避免任何位移动画
    if (this.reducedMotion) {
      this._revealElapsed = this._revealTotal;
      this._refreshAll();
    }
  }

  /**
   * 计算 1024 个方块的目标位置与颜色：先排布字形体素，再用数据云补足总数。
   *
   * @returns {void}
   * @throws 无显式抛出：内部不依赖外部输入，异常仅可能来自内存分配失败
   */
  _buildLayout() {
    const random = createRandom();

    // ---- 1. 中央 logo 的体素数量：点阵像素数 × 挤出层数 ----
    const logoLayout = this._logoLayout;
    const logoCount = logoLayout.positions.length / 3;
    this._logoCount = logoCount;

    // ---- 2. 写入 logo 的体素目标位置 ----
    const logoPositions = logoLayout.positions;

    // ---- 3. 写入位置与颜色：logo 体素偏亮，并按深度层做亮度变化（中段最亮、两端最暗） ----
    const accent = new THREE.Color(this.theme.accent);
    const glow = new THREE.Color(this.theme.glow);
    const diffuser = new THREE.Color(this.theme.diffuser);
    const white = new THREE.Color(0xffffff);
    const maxHalfDepth = Math.max(0.001, ((logoLayout.depth - 1) / 2) * CELL_SIZE * 0.86);

    for (let i = 0; i < logoCount; i += 1) {
      const i3 = i * 3;

      this.basePositions[i3] = logoPositions[i3];
      this.basePositions[i3 + 1] = logoPositions[i3 + 1];
      this.basePositions[i3 + 2] = logoPositions[i3 + 2];

      const layerRatio = Math.min(1, Math.abs(logoPositions[i3 + 2]) / maxHalfDepth);
      const shade = 0.78 + 0.42 * (1 - layerRatio);
      this.shade[i] = shade;
      const color = accent.clone().lerp(white, 0.16).multiplyScalar(shade);
      this.baseColors[i3] = color.r;
      this.baseColors[i3 + 1] = color.g;
      this.baseColors[i3 + 2] = color.b;
    }

    // ---- 4. 生成入场起始位置（从远处球面飞入）与错峰延迟 ----
    for (let i = 0; i < this.count; i += 1) {
      const bx = this.basePositions[i * 3];
      const by = this.basePositions[i * 3 + 1];
      const bz = this.basePositions[i * 3 + 2];
      const len = Math.max(0.001, Math.hypot(bx, by, bz));
      const distance = 46 + random() * 34;
      this.startPositions[i * 3] = bx + (bx / len) * distance + (random() - 0.5) * 6;
      this.startPositions[i * 3 + 1] = by + (by / len) * distance + (random() - 0.5) * 6;
      this.startPositions[i * 3 + 2] = bz + (bz / len) * distance * 0.6 + (random() - 0.5) * 6;

      this.delays[i] = (i < logoCount ? 0.24 : 0) + random() * REVEAL_STAGGER;
    }
  }

  /**
   * 创建承载全部方块的 InstancedMesh 以及配套光照。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _buildMesh() {
    const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

    // 每一格方块都贴上品牌图标贴图（BoxGeometry 的默认 UV 会把整张图铺满每个面），
    // 于是每个像素格看起来就是一枚微缩的社区图标，而不是纯色小方块
    const tileTexture = new THREE.TextureLoader().load(VOXEL_TILE_URL);
    tileTexture.colorSpace = THREE.SRGBColorSpace;
    tileTexture.anisotropy = 4;

    // 使用无光照材质：单色图形只呈现"贴图 × 实例色"的纯色结果，
    // 没有高光、没有反光、也没有自发光，避免方块表面出现发亮的光斑
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: tileTexture,
      // 方块贴图靠实例色着色（主题色），材质自身保持白色以便颜色正确相乘
      transparent: false
    });

    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.name = 'VoxelInstances';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 实例包围盒不随矩阵自动更新，关闭视锥剔除避免方块在旋转时被误剔
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.group.add(mesh);

    this._disposables.push(geometry, material, tileTexture);

    // 说明：方块已改为无光照材质，不再需要场景灯光；
    // 原先的半球光与方向光是为高光与冷暖对比服务的，这里一并移除，避免留下无用的照明开销
    this._refreshAll();
  }

  /**
   * 创建地面网格与环形光晕，强化空间参照与纵深。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _buildFloor() {
    const grid = new THREE.GridHelper(96, 48, this.theme.accent, this.theme.diffuser);
    grid.position.y = FLOOR_Y;
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    grid.material.depthWrite = false;

    const glowTexture = createRadialGlowTexture(this.theme.accent, 256);
    const glowGeometry = new THREE.CircleGeometry(26, 64);
    const glowMaterial = glowTexture
      ? new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      : new THREE.MeshBasicMaterial({
          color: new THREE.Color(this.theme.accent),
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
    const glowPlane = new THREE.Mesh(glowGeometry, glowMaterial);
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = FLOOR_Y + 0.05;
    glowPlane.renderOrder = -1;

    this._floor = { grid, glowPlane, glowGeometry, glowMaterial, glowTexture };
    this.group.add(grid, glowPlane);
    this._disposables.push(glowGeometry, glowMaterial);
    if (glowTexture) this._disposables.push(glowTexture);
  }

  /**
   * 计算并写入单个实例的矩阵与颜色。
   *
   * @param {number} index - 实例下标，取值区间 [0, count)
   * @returns {void}
   * @throws 无显式抛出：下标越界时直接返回，不做破坏性写入
   */
  _writeInstance(index) {
    if (index < 0 || index >= this.count) return;

    const i3 = index * 3;
    const bx = this.basePositions[i3];
    const by = this.basePositions[i3 + 1];
    const bz = this.basePositions[i3 + 2];

    // 入场聚合：仍在动画窗口内的方块按缓动从起点插值到目标位置
    const progress = this._revealElapsed - this.delays[index];
    let px = bx;
    let py = by;
    let pz = bz;
    if (progress < REVEAL_DURATION) {
      const t = easeOutCubic(Math.max(0, progress) / REVEAL_DURATION);
      px = this.startPositions[i3] + (bx - this.startPositions[i3]) * t;
      py = this.startPositions[i3 + 1] + (by - this.startPositions[i3 + 1]) * t;
      pz = this.startPositions[i3 + 2] + (bz - this.startPositions[i3 + 2]) * t;
    }

    // 凝聚时字形体素退场：缩小并压暗，把舞台让给由社区头像像素汇聚而成的 TRAE
    const morphT = easeInOutCubic(this._morphProgress);

    const lit = this.litEnergy[index];
    const isHover = this.hoverIndex === index;
    // 点亮时轻微放大，悬停时进一步放大，形成可感知的交互反馈
    const scale = (1 + lit * 0.3 + (isHover ? 0.22 : 0)) * (1 - morphT * 0.86);

    this._dummy.position.set(px, py, pz);
    this._dummy.scale.setScalar(scale);
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this._dummy.matrix);

    // 颜色 = 基础色 → 辉光色插值，再整体提亮
    this._colorA.setRGB(this.baseColors[i3], this.baseColors[i3 + 1], this.baseColors[i3 + 2]);
    this._colorB.set(this.theme.glow);
    this._colorA.lerp(this._colorB, Math.min(1, lit * 0.92));
    if (isHover) {
      this._colorA.lerp(new THREE.Color(this.theme.accent), 0.55);
    }
    this._colorA.multiplyScalar((1 + lit * 0.75 + (isHover ? 0.5 : 0)) * (1 - morphT * 0.82));
    this.mesh.setColorAt(index, this._colorA);
  }

  /**
   * 刷新全部实例的矩阵与颜色（入场动画、脉冲扩散等全量场景使用）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _refreshAll() {
    for (let i = 0; i < this.count; i += 1) {
      this._writeInstance(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * 仅刷新单个实例（悬停等局部变化使用，避免每帧全量重建矩阵）。
   *
   * @param {number} index - 实例下标
   * @returns {void}
   * @throws 无显式抛出
   */
  _refreshOne(index) {
    this._writeInstance(index);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * 记录一个方块被点亮，并去重统计点亮总数。
   *
   * @param {number} index - 被点亮的实例下标
   * @returns {void}
   * @throws 无显式抛出
   */
  _markSeen(index) {
    if (this.seen[index] === 1) return;
    this.seen[index] = 1;
    this.litCount += 1;
    if (typeof this.onLitCountChange === 'function') {
      this.onLitCountChange(this.litCount);
    }
  }

  /**
   * 在指定位置触发一次能量脉冲；减弱动效模式下改为瞬时点亮邻近方块。
   *
   * @param {THREE.Vector3} point - 世界坐标系下的脉冲中心点（通常为射线命中点）
   * @param {number|null} [hitIndex=null] - 被直接命中的实例下标；传 null 表示从空间中某点起爆
   * @returns {void}
   * @throws 无显式抛出
   */
  pulseAt(point, hitIndex = null) {
    // 被直接点中的方块立即获得满能量，反馈最直接
    if (hitIndex !== null && hitIndex >= 0 && hitIndex < this.count) {
      this.litEnergy[hitIndex] = 1;
      this._markSeen(hitIndex);
      this._litActive = true;
    }

    // 命中点来自世界坐标，而方块基础位置保存在组局部空间：
    // 自转后两者不再重合，因此先刷新世界矩阵再换算到局部坐标
    this.group.updateWorldMatrix(true, false);
    const local = this._pulse.center.copy(point);
    this.group.worldToLocal(local);

    if (this.reducedMotion) {
      const radius = 3.4;
      for (let i = 0; i < this.count; i += 1) {
        const dist = Math.hypot(
          this.basePositions[i * 3] - local.x,
          this.basePositions[i * 3 + 1] - local.y,
          this.basePositions[i * 3 + 2] - local.z
        );
        if (dist <= radius) {
          this.litEnergy[i] = Math.min(1, this.litEnergy[i] + 0.85);
          this._markSeen(i);
        }
      }
      this._litActive = true;
      this._refreshAll();
      return;
    }

    this._pulse.active = true;
    this._pulse.radius = 0;
    this._litActive = true;
  }

  /**
   * 设置悬停的实例下标，仅对变化项做局部刷新。
   *
   * @param {number|null} index - 悬停实例下标；传 null 表示取消悬停
   * @returns {void}
   * @throws 无显式抛出
   */
  setHover(index) {
    if (this.hoverIndex === index) return;
    const previous = this.hoverIndex;
    this.hoverIndex = index;
    if (previous !== null) this._refreshOne(previous);
    if (index !== null) this._refreshOne(index);
  }

  /**
   * 重新播放入场聚合动画（用于“重播”按钮）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  replayReveal() {
    if (this.reducedMotion) {
      // 减弱动效模式下仅重置点亮状态，不做位移动画
      this.litEnergy.fill(0);
      this.litCount = 0;
      this.seen.fill(0);
      if (typeof this.onLitCountChange === 'function') this.onLitCountChange(0);
      this._refreshAll();
      return;
    }
    this._revealElapsed = 0;
  }

  /**
   * 开始凝聚：中央的 1024 字形体素逐渐缩小、压暗并退场，
   * 把舞台让给由社区开发者头像像素汇聚而成的「TRAE」（由“按住不放”触发）。
   * 减弱动效模式下直接切到终态，不做过渡动画。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  startMorph() {
    this._morphTarget = true;
    if (this.reducedMotion) {
      this._morphProgress = 1;
      this._refreshAll();
    }
  }

  /**
   * 结束凝聚：头像像素飞回各自的头像牌，「1024」字形重新亮起
   * （松开指针或指针离开画布时调用）。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  endMorph() {
    this._morphTarget = false;
    if (this.reducedMotion) {
      this._morphProgress = 0;
      this._refreshAll();
    }
  }

  /**
   * 当前凝聚进度，取值区间 [0, 1]：0 表示「1024」完全在位，1 表示字形已完全退场。
   *
   * @returns {number} 凝聚进度
   * @throws 无显式抛出
   */
  get morphProgress() {
    return this._morphProgress;
  }

  /**
   * 当前是否处于凝聚状态（含正在过渡的过程）。
   *
   * @returns {boolean} 凝聚目标为 TRAE 形态、或进度尚未归零时为 true
   * @throws 无显式抛出
   */
  get morphing() {
    return this._morphTarget || this._morphProgress > 0.0005;
  }

  /**
   * 应用新的主题令牌：更新材质发光色、灯光颜色、地面网格与光晕，并重算基础色。
   *
   * @param {object} theme - 新的主题令牌对象
   * @returns {void}
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  applyTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('applyTheme 需要一个合法的 theme 对象');
    }
    this.theme = theme;

    // 方块使用无光照材质，切换主题只需重算实例色，不涉及自发光与灯光强度

    // 复用构建期固定的高亮标记与明暗系数，只替换色相，保证切主题前后方块分布完全一致
    const accent = new THREE.Color(theme.accent);
    const glow = new THREE.Color(theme.glow);
    const diffuser = new THREE.Color(theme.diffuser);
    const logoBase = accent.clone().lerp(new THREE.Color(0xffffff), 0.16);
    const logoBoundary = this._logoCount;

    for (let i = 0; i < this.count; i += 1) {
      const source = i < logoBoundary ? logoBase : this.glowFlag[i] === 1 ? glow : diffuser;
      const color = source.clone().multiplyScalar(this.shade[i]);
      this.baseColors[i * 3] = color.r;
      this.baseColors[i * 3 + 1] = color.g;
      this.baseColors[i * 3 + 2] = color.b;
    }

    if (this._floor) {
      this._floor.grid.material.color.set(theme.accent);
      this._floor.grid.material.opacity = 0.16;

      // 光晕为程序化纹理，切主题时重新生成，保证颜色与新主题一致
      const nextGlow = createRadialGlowTexture(theme.accent, 256);
      const material = this._floor.glowPlane.material;
      if (nextGlow) {
        if (material.map) {
          this._disposables = this._disposables.filter((item) => item !== material.map);
          material.map.dispose();
        }
        material.map = nextGlow;
        material.color.set(0xffffff);
        material.opacity = 0.42;
        material.needsUpdate = true;
        this._floor.glowTexture = nextGlow;
        this._disposables.push(nextGlow);
      } else {
        // 纹理生成失败时退化为纯色光晕
        material.color.set(theme.accent);
      }
    }

    this._refreshAll();
  }

  /**
   * 每帧更新：推进入场动画、扩散脉冲波、衰减点亮能量，并在需要时写入实例数据。
   *
   * @param {number} delta - 距上一帧的时间间隔（秒）
   * @param {number} [elapsed] - 场景运行总时长（秒），当前未使用但保留给后续呼吸动画扩展
   * @returns {void}
   * @throws 无显式抛出
   */
  update(delta, elapsed) {
    const dt = Math.min(delta, 0.05);
    let needsFullRefresh = false;

    // 1) 入场聚合
    if (this._revealElapsed < this._revealTotal) {
      this._revealElapsed = Math.min(this._revealTotal, this._revealElapsed + dt);
      needsFullRefresh = true;
    }

    // 2) 脉冲波推进：波带扫过的方块被点亮，形成“一环一环”扩散的效果
    if (this._pulse.active) {
      this._pulse.radius += INTERACTION_CONFIG.pulseSpeed * dt;
      const { center, radius } = this._pulse;
      for (let i = 0; i < this.count; i += 1) {
        const dist = Math.hypot(
          this.basePositions[i * 3] - center.x,
          this.basePositions[i * 3 + 1] - center.y,
          this.basePositions[i * 3 + 2] - center.z
        );
        if (Math.abs(dist - radius) <= PULSE_BAND) {
          this.litEnergy[i] = Math.min(1, this.litEnergy[i] + 0.75);
          this._markSeen(i);
        }
      }
      needsFullRefresh = true;
      if (this._pulse.radius > INTERACTION_CONFIG.pulseMaxRadius) {
        this._pulse.active = false;
      }
    }

    // 3) 点亮能量衰减
    if (this._litActive) {
      let maxEnergy = 0;
      for (let i = 0; i < this.count; i += 1) {
        const energy = this.litEnergy[i];
        if (energy > 0.002) {
          const next = Math.max(0, energy - dt * LIT_DECAY);
          this.litEnergy[i] = next;
          if (next > maxEnergy) maxEnergy = next;
        } else if (energy !== 0) {
          this.litEnergy[i] = 0;
        }
      }
      needsFullRefresh = true;
      if (maxEnergy <= 0.002 && !this._pulse.active) {
        this._litActive = false;
      }
    }

    // 4) 凝聚形变推进：向目标形态（1024 或 TRAE）逐帧靠拢
    const morphGoal = this._morphTarget ? 1 : 0;
    if (Math.abs(this._morphProgress - morphGoal) > 0.0005) {
      const step = dt * MORPH_SPEED;
      this._morphProgress =
        morphGoal > this._morphProgress
          ? Math.min(morphGoal, this._morphProgress + step)
          : Math.max(morphGoal, this._morphProgress - step);
      needsFullRefresh = true;
    }

    if (needsFullRefresh) {
      this._refreshAll();
    }
  }

  /**
   * 释放几何体、材质与纹理，避免内存泄漏。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    for (const item of this._disposables) {
      if (item && typeof item.dispose === 'function') {
        item.dispose();
      }
    }
    this._disposables.length = 0;
    this.group.clear();
    this.mesh = null;
    this._floor = null;
  }
}

/**
 * 记录字形体素的数量，供主题切换时区分布局使用。
 * 由于类内私有化会影响可读性，这里通过原型方法在首次构建后回填。
 */
Object.defineProperty(VoxelField.prototype, 'logoCount', {
  get() {
    return this._logoCount;
  }
});
