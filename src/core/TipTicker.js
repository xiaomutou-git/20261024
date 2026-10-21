import * as THREE from 'three';
import { createTextTexture } from './textures.js';

/**
 * @file core/TipTicker.js
 * @description 社区技巧横向飘带：把「官方收录奖」的技巧做成文字精灵，
 * 在头像簇上方横向缓缓飘过，营造社区经验在头顶流动的观感。
 *
 * 设计思路：
 *  - 文字只横移、不落下（与数据雨的纵向 0/1 形成明确的方向对比）；
 *  - 每条技巧从画面一侧进入、从另一侧离开，左右方向交替，避免呆板；
 *  - 用固定精灵池 + 预生成纹理，运行时只改位置与透明度，开销恒定；
 *  - 投放间隔随机（1.8~3.4 秒），保证“不定时飘过”而不是匀速滚动；
 *  - 减弱动效模式下完全不投放，符合无障碍要求。
 *
 * @module core/TipTicker
 */

/** 文字精灵的世界高度（世界单位） @type {number} */
const TIP_HEIGHT = 2.3;

/** 横向移动速度下限（世界单位/秒） @type {number} */
const TIP_SPEED_MIN = 11;

/** 横向移动速度上限（世界单位/秒） @type {number} */
const TIP_SPEED_MAX = 15;

/** 两次投放之间的最短间隔（秒） @type {number} */
const SPAWN_INTERVAL_MIN = 1.8;

/** 两次投放之间的最长间隔（秒） @type {number} */
const SPAWN_INTERVAL_MAX = 3.4;

/** 同时存在的最大文字条数（桌面端），移动端减半 @type {number} */
const TIP_POOL_SIZE = 5;

/** 文字相对头像顶部再向上的基准偏移（世界单位） @type {number} */
const TIP_BASE_LIFT = 2.6;

/** 两条飘带之间的行距（世界单位） @type {number} */
const TIP_LANE_GAP = 2.3;

export class TipTicker {
  /**
   * @param {Object} options - 构造参数
   * @param {object} options.theme - 主题令牌对象，需包含 accent 字段作为文字颜色
   * @param {ReadonlyArray<string>} options.tips - 技巧正文列表
   * @param {{radius: number, maxY: number}} [options.bounds] - 头像墙的包围盒，用于把飘带定位在头像上方
   * @param {boolean} [options.mobile=false] - 是否移动端
   * @param {boolean} [options.reducedMotion=false] - 是否处于“减弱动效”模式
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  constructor({ theme, tips = [], bounds = { radius: 18, maxY: 16 }, mobile = false, reducedMotion = false } = {}) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('TipTicker 需要一个合法的 theme 对象');
    }

    /** @type {object} 主题令牌 */
    this.theme = theme;
    /** @type {boolean} 是否移动端 */
    this.mobile = mobile;
    /** @type {boolean} 是否减弱动效 */
    this.reducedMotion = reducedMotion;

    /** @type {THREE.Group} 场景根节点 */
    this.group = new THREE.Group();
    this.group.name = 'TipTicker';

    /** @type {ReadonlyArray<string>} 技巧正文列表 */
    this.tips = tips;
    /**
     * @type {Map<string, {texture: THREE.CanvasTexture, aspect: number}>}
     * 文字纹理缓存：技巧语句较长且数量多（290 条），一次性全部生成会占用上百 MB 显存，
     * 因此改为按需生成 + 容量上限的 LRU 淘汰。
     */
    this._cache = new Map();
    /** @type {Array<THREE.Sprite>} 精灵池 */
    this._pool = [];
    /** @type {Array<THREE.Material|THREE.Texture>} 需要释放的资源 */
    this._disposables = [];

    /** @type {number} 下一条的投放倒计时（秒） */
    this._timer = 1.2;
    /** @type {number} 纹理取用游标 */
    this._cursor = 0;
    /** @type {number} 飘带的基准高度（头像簇上方） */
    this._baseY = (bounds.maxY || 16) + TIP_BASE_LIFT;
    /** @type {number} 横向行程半宽（略大于可视宽度，保证从画面外进出） */
    this._travelX = (bounds.radius || 18) * 4.2;

    this._buildPool();
  }

  /**
   * 取用某条技巧的文字纹理，未缓存时即时生成，并按容量上限淘汰最久未用的条目。
   *
   * @param {string} text - 技巧正文
   * @returns {{texture: THREE.CanvasTexture, aspect: number}|null} 纹理与其宽高比；生成失败时返回 null
   * @throws 无显式抛出：生成失败时返回 null，由调用方跳过本次投放
   */
  _getTexture(text) {
    const cached = this._cache.get(text);
    if (cached) return cached;

    const made = createTextTexture(text, { fontSize: 64, padding: 22, maxWidth: 1024 });
    if (!made) return null;

    this._cache.set(text, made);
    this._trimCache();
    return made;
  }

  /**
   * 把纹理缓存控制在容量上限内，优先淘汰当前没有精灵在用的最旧条目。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _trimCache() {
    const limit = this.mobile ? 12 : 28;
    if (this._cache.size <= limit) return;

    for (const [key, entry] of this._cache) {
      if (this._cache.size <= limit) break;
      const inUse = this._pool.some((sprite) => sprite.material.map === entry.texture);
      if (inUse) continue;
      this._cache.delete(key);
      entry.texture.dispose();
    }
  }

  /**
   * 创建精灵池。
   *
   * @returns {void}
   * @throws 无显式抛出：无可用纹理时不创建任何精灵
   */
  _buildPool() {
    if (this.tips.length === 0) return;

    const poolSize = this.mobile ? Math.max(2, Math.ceil(TIP_POOL_SIZE / 2)) : TIP_POOL_SIZE;
    for (let i = 0; i < poolSize; i += 1) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: new THREE.Color(this.theme.accent),
        toneMapped: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 1;
      sprite.userData = { active: false, speed: TIP_SPEED_MIN, direction: 1, lane: 0 };
      this.group.add(sprite);
      this._pool.push(sprite);
      this._disposables.push(material);
    }
  }

  /**
   * 投放一条技巧，从画面一侧横向飘入。
   *
   * @returns {void}
   * @throws 无显式抛出：池满或无纹理时跳过
   */
  _spawn() {
    if (this.tips.length === 0) return;

    const sprite = this._pool.find((item) => !item.userData.active);
    if (!sprite) return;

    // 技巧数据只保留正文（不附带成员昵称），因此这里直接取字符串
    const text = this.tips[this._cursor % this.tips.length];
    const made = this._getTexture(text);
    if (!made) {
      this._cursor += 1;
      return;
    }
    this._cursor += 1;

    sprite.material.map = made.texture;
    sprite.material.needsUpdate = true;
    sprite.material.opacity = 0;

    const height = TIP_HEIGHT;
    sprite.scale.set(height * made.aspect, height, 1);

    // 左右交替进入，两条高度不同的飘带轮换，避免所有文字挤在同一条线上
    const direction = this._cursor % 4 < 2 ? 1 : -1;
    const lane = this._cursor % 2;
    sprite.position.set(
      -direction * this._travelX,
      this._baseY + lane * TIP_LANE_GAP,
      (Math.random() - 0.5) * 8
    );

    sprite.userData.active = true;
    sprite.userData.direction = direction;
    sprite.userData.lane = lane;
    sprite.userData.speed = TIP_SPEED_MIN + Math.random() * (TIP_SPEED_MAX - TIP_SPEED_MIN);
    sprite.visible = true;
  }

  /**
   * 更新飘带：计时投放新技巧，并推进横移与进出场淡入淡出。
   *
   * @param {number} delta - 距上一帧的时间间隔（秒）
   * @returns {void}
   * @throws 无显式抛出
   */
  update(delta) {
    if (this.reducedMotion) return;
    if (this._pool.length === 0) return;

    const dt = Math.min(delta, 0.05);

    this._timer -= dt;
    if (this._timer <= 0) {
      this._spawn();
      this._timer = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
    }

    for (const sprite of this._pool) {
      const state = sprite.userData;
      if (!state.active) continue;

      sprite.position.x += state.direction * state.speed * dt;

      // 靠近画面两端时淡出，避免文字“啪”地消失
      const fadeWidth = this._travelX * 0.28;
      const edgeDistance = this._travelX - Math.abs(sprite.position.x);
      const opacity = Math.max(0, Math.min(1, edgeDistance / fadeWidth));
      sprite.material.opacity = Math.min(0.88, opacity * 0.88);

      if (Math.abs(sprite.position.x) >= this._travelX) {
        state.active = false;
        sprite.visible = false;
        sprite.material.opacity = 0;
      }
    }
  }

  /**
   * 应用新主题：仅更新文字颜色。
   *
   * @param {object} theme - 新主题令牌对象
   * @returns {void}
   * @throws {TypeError} 当 theme 缺失或不是对象时抛出
   */
  setTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      throw new TypeError('TipTicker.setTheme 需要一个合法的 theme 对象');
    }
    this.theme = theme;
    for (const sprite of this._pool) {
      sprite.material.color.set(theme.accent);
    }
  }

  /**
   * 切换减弱动效状态：开启时立即隐藏所有飘带。
   *
   * @param {boolean} flag - true 表示停止飘动
   * @returns {void}
   * @throws 无显式抛出
   */
  setReducedMotion(flag) {
    this.reducedMotion = Boolean(flag);
    if (this.reducedMotion) {
      for (const sprite of this._pool) {
        sprite.visible = false;
        sprite.material.opacity = 0;
        sprite.userData.active = false;
      }
    }
  }

  /**
   * 释放纹理与材质。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    for (const entry of this._cache.values()) {
      entry.texture.dispose();
    }
    this._cache.clear();
    for (const item of this._disposables) {
      if (item && typeof item.dispose === 'function') item.dispose();
    }
    this._disposables.length = 0;
    this._pool.length = 0;
    this.group.clear();
  }
}
