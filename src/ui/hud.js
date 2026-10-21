import { COMMUNITY_TOPICS, COMMUNITY_ENTRY_URL } from '../data/community.js';
import { COMMUNITY_CONTESTS, CONTEST_SECTION_URL } from '../data/competitions.js';

/**
 * @file ui/hud.js
 * @description 页面覆盖层（HUD）控制器：负责主题色块、操作按钮、社区动态抽屉、状态文案与 CSS 变量同步。
 *
 * 设计思路：
 *  - HUD 只做“显示与转发”，不持有三维对象，所有需要影响场景的动作都通过构造函数注入的回调交回 App；
 *  - 所有 DOM 查询与操作均包裹 try-catch，任一节点缺失或操作异常都不会中断三维场景渲染；
 *  - 主题切换时改写 :root 上的 CSS 变量，使面板、按钮、背景渐变与三维内容配色保持一致。
 *
 * @module ui/hud
 */

/**
 * 安全获取 DOM 元素。
 *
 * @param {string} id - 元素 id
 * @returns {HTMLElement|null} 命中时返回元素，未命中或发生异常时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null
 */
function safeGetElement(id) {
  try {
    return document.getElementById(id);
  } catch (error) {
    console.warn(`[hud] 获取元素 #${id} 失败：`, error);
    return null;
  }
}

export class Hud {
  /**
   * @param {Object} options - 构造参数
   * @param {(id: string) => void} [options.onTheme=null] - 用户点击主题色块时的回调，参数为主题 id
   * @param {() => void} [options.onReplay=null] - 点击“重播聚合”按钮时的回调
   * @param {() => void} [options.onPulse=null] - 点击“点亮中心”按钮时的回调
   * @param {string} [options.initialThemeId='azure'] - 初始主题 id，用于高亮对应的色块
   * @throws 无显式抛出
   */
  constructor({ onTheme = null, onReplay = null, onPulse = null, initialThemeId = 'azure' } = {}) {
    /** @type {((id: string) => void)|null} */
    this.onTheme = onTheme;
    /** @type {(() => void)|null} */
    this.onReplay = onReplay;
    /** @type {(() => void)|null} */
    this.onPulse = onPulse;
    /** @type {string} 当前主题 id */
    this.currentThemeId = initialThemeId;
    /** @type {boolean} 社区抽屉是否展开 */
    this.panelOpen = false;

    /** @type {HTMLElement|null} */
    this.panel = null;
    /** @type {HTMLElement|null} */
    this.communityButton = null;
    /** @type {HTMLElement|null} */
    this.countElement = null;
    /** @type {HTMLElement|null} */
    this.panelTitle = null;
    /** @type {HTMLElement|null} */
    this.panelSub = null;
    /** @type {Record<string, HTMLElement|null>} 标签页内容容器 */
    this.panes = {};
    /** @type {HTMLElement[]} 标签按钮集合 */
    this.tabs = [];
    /** @type {string} 当前标签页标识：'topics' 或 'contests' */
    this.currentTab = 'topics';
    /** @type {HTMLElement|null} */
    this.bootElement = null;
    /** @type {HTMLElement[]} */
    this.swatches = [];

    this._boundKeydown = this._onKeydown.bind(this);
  }

  /**
   * 初始化 HUD：渲染社区列表、绑定全部交互事件。
   *
   * @returns {void}
   * @throws 无显式抛出：所有分支均做了空值保护
   */
  init() {
    this.panel = safeGetElement('community-panel');
    this.communityButton = safeGetElement('btn-community');
    this.countElement = safeGetElement('stat-count');
    this.bootElement = safeGetElement('boot');
    this.panelTitle = safeGetElement('panel-title');
    this.panelSub = safeGetElement('panel-sub');
    this.panes = {
      topics: safeGetElement('pane-topics'),
      contests: safeGetElement('pane-contests')
    };

    this._renderTopics();
    this._renderContests();
    this._bindEvents();
    this.setActiveTheme(this.currentThemeId);
  }

  /**
   * 渲染社区动态列表（数据来自 data/community.js 中的真实社区内容快照）。
   *
   * @returns {void}
   * @throws 无显式抛出：列表容器缺失时静默跳过
   */
  _renderTopics() {
    const list = safeGetElement('topic-list');
    const moreLink = safeGetElement('panel-more');
    if (moreLink) moreLink.href = COMMUNITY_ENTRY_URL;
    if (!list) return;

    try {
      list.textContent = '';
      for (const topic of COMMUNITY_TOPICS) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'topic';
        link.href = topic.url;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';

        const label = document.createElement('span');
        label.className = 'topic__label';
        label.textContent = topic.label;

        const title = document.createElement('h3');
        title.className = 'topic__title';
        title.textContent = topic.title;

        const meta = document.createElement('p');
        meta.className = 'topic__meta';
        const replies = document.createElement('span');
        replies.textContent = `${topic.replies} 回复`;
        const views = document.createElement('span');
        views.textContent = `${topic.views} 浏览`;
        const date = document.createElement('span');
        date.textContent = topic.date;
        meta.append(replies, views, date);

        link.append(label, title, meta);
        item.append(link);
        list.append(item);
      }
    } catch (error) {
      console.warn('[hud] 渲染社区列表失败：', error);
    }
  }

  /**
   * 渲染社区赛事列表（数据来自 data/competitions.js 中的真实赛事快照）。
   * 每张卡片包含赛事名称、状态标签、一句话亮点、赛程与专区话题量，点击直接跳转赛事专区。
   *
   * @returns {void}
   * @throws 无显式抛出：列表容器缺失时静默跳过
   */
  _renderContests() {
    const list = safeGetElement('contest-list');
    const moreLink = safeGetElement('contest-more');
    if (moreLink) moreLink.href = CONTEST_SECTION_URL;
    if (!list) return;

    try {
      list.textContent = '';
      for (const contest of COMMUNITY_CONTESTS) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'contest';
        link.href = contest.url;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';

        const head = document.createElement('div');
        head.className = 'contest__head';

        const name = document.createElement('span');
        name.className = 'contest__name';
        name.textContent = contest.name;

        const status = document.createElement('span');
        status.className = contest.tone === 'open' ? 'contest__status is-open' : 'contest__status';
        status.textContent = contest.status;

        head.append(name, status);

        const tagline = document.createElement('p');
        tagline.className = 'contest__tagline';
        tagline.textContent = contest.tagline;

        const meta = document.createElement('p');
        meta.className = 'contest__meta';
        const schedule = document.createElement('span');
        schedule.textContent = contest.schedule;
        const topics = document.createElement('span');
        topics.textContent = `${contest.topics} 话题`;
        const section = document.createElement('span');
        section.textContent = contest.section;
        meta.append(schedule, topics, section);

        link.append(head, tagline, meta);
        item.append(link);
        list.append(item);
      }
    } catch (error) {
      console.warn('[hud] 渲染社区比赛失败：', error);
    }
  }

  /**
   * 绑定按钮、色块与键盘事件。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  _bindEvents() {
    try {
      this.tabs = Array.from(document.querySelectorAll('.tab'));
      for (const tab of this.tabs) {
        tab.addEventListener('click', () => {
          const name = tab.getAttribute('data-tab');
          if (name) this.switchTab(name);
        });
      }

      const themeButtons = Array.from(document.querySelectorAll('.swatch'));
      this.swatches = themeButtons;

      for (const button of themeButtons) {
        button.addEventListener('click', () => {
          const id = button.getAttribute('data-theme');
          if (!id) return;
          this.setActiveTheme(id);
          if (typeof this.onTheme === 'function') this.onTheme(id);
        });
      }

      const replayButton = safeGetElement('btn-replay');
      if (replayButton) {
        replayButton.addEventListener('click', () => {
          if (typeof this.onReplay === 'function') this.onReplay();
        });
      }

      const pulseButton = safeGetElement('btn-pulse');
      if (pulseButton) {
        pulseButton.addEventListener('click', () => {
          if (typeof this.onPulse === 'function') this.onPulse();
        });
      }

      if (this.communityButton) {
        this.communityButton.addEventListener('click', () => {
          this.togglePanel(!this.panelOpen);
        });
      }

      const closeButton = safeGetElement('btn-close-panel');
      if (closeButton) {
        closeButton.addEventListener('click', () => this.togglePanel(false));
      }

      document.addEventListener('keydown', this._boundKeydown);
    } catch (error) {
      console.warn('[hud] 绑定事件失败：', error);
    }
  }

  /**
   * 键盘快捷键处理：Esc 关闭抽屉。
   *
   * @param {KeyboardEvent} event - 键盘事件
   * @returns {void}
   * @throws 无显式抛出
   */
  _onKeydown(event) {
    if (event.key === 'Escape' && this.panelOpen) {
      this.togglePanel(false);
    }
  }

  /**
   * 展开 / 收起社区动态抽屉。
   *
   * @param {boolean} open - true 展开，false 收起
   * @returns {void}
   * @throws 无显式抛出
   */
  togglePanel(open) {
    try {
      if (!this.panel) return;
      this.panelOpen = Boolean(open);
      this.panel.hidden = !this.panelOpen;
      if (this.communityButton) {
        this.communityButton.setAttribute('aria-expanded', String(this.panelOpen));
        this.communityButton.classList.toggle('is-active', this.panelOpen);
      }
    } catch (error) {
      console.warn('[hud] 切换社区面板失败：', error);
    }
  }

  /**
   * 切换社区内容标签页（社区动态 / 社区比赛），并同步面板标题与副标题。
   *
   * @param {string} name - 标签页标识，取值 'topics'（社区动态）或 'contests'（社区比赛）
   * @returns {void}
   * @throws 无显式抛出：传入未知标识时保持当前标签页不变
   */
  switchTab(name) {
    if (name !== 'topics' && name !== 'contests') return;
    this.currentTab = name;

    try {
      for (const tab of this.tabs) {
        const active = tab.getAttribute('data-tab') === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      }

      for (const [key, pane] of Object.entries(this.panes)) {
        if (pane) pane.hidden = key !== name;
      }

      if (this.panelTitle) {
        this.panelTitle.textContent = name === 'contests' ? '社区比赛' : '社区伙伴';
      }
      if (this.panelSub) {
        this.panelSub.textContent =
          name === 'contests' ? 'forum.trae.cn · 赛事专区' : 'forum.trae.cn · 分类 33';
      }
    } catch (error) {
      console.warn('[hud] 切换社区标签页失败：', error);
    }
  }

  /**
   * 高亮当前主题对应的色块。
   *
   * @param {string} id - 主题 id
   * @returns {void}
   * @throws 无显式抛出
   */
  setActiveTheme(id) {
    this.currentThemeId = id;
    try {
      for (const button of this.swatches) {
        button.classList.toggle('is-active', button.getAttribute('data-theme') === id);
      }
    } catch (error) {
      console.warn('[hud] 更新主题高亮失败：', error);
    }
  }

  /**
   * 把主题令牌同步到 :root 的 CSS 变量，使覆盖层与三维场景配色一致。
   *
   * @param {{accent: string, accentDeep: string, secondary: string, glow: string, bgTop: string, bgBottom: string, tone?: 'dark'|'light'}} theme - 主题令牌对象
   * @returns {void}
   * @throws 无显式抛出：设置失败时保留原有变量值
   */
  applyTheme(theme) {
    if (!theme) return;
    try {
      const root = document.documentElement;
      root.style.setProperty('--c-accent', theme.accent);
      root.style.setProperty('--c-accent-deep', theme.accentDeep);
      root.style.setProperty('--c-secondary', theme.secondary);
      root.style.setProperty('--c-glow', theme.glow);
      root.style.setProperty('--bg-top', theme.bgTop);
      root.style.setProperty('--bg-bottom', theme.bgBottom);

      // 浅色主题（白 / 灰）需要整页切换到深色文字 + 浅色容器，
      // 因此把明暗基调写到 html 上，由 CSS 中 html[data-tone="light"] 统一接管
      root.dataset.tone = theme.tone === 'light' ? 'light' : 'dark';

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme.bgBottom);

      this.setActiveTheme(theme.id);
    } catch (error) {
      console.warn('[hud] 同步主题变量失败：', error);
    }
  }

  /**
   * 设置底部统计里的方块总数（分母），随场景实际方块数变化。
   *
   * @param {number} total - 场景中的方块总数
   * @returns {void}
   * @throws 无显式抛出：节点缺失时静默跳过
   */
  setBlockTotal(total) {
    try {
      const element = safeGetElement('stat-total');
      if (element) element.textContent = String(total);
    } catch (error) {
      console.warn('[hud] 设置方块总数失败：', error);
    }
  }

  /**
   * 更新底部“已点亮方块”统计。
   *
   * @param {number} count - 当前已点亮（去重后）的方块数量，取值区间 [0, 1024]
   * @returns {void}
   * @throws 无显式抛出
   */
  updateLitCount(count) {
    try {
      if (this.countElement) this.countElement.textContent = String(count);
    } catch (error) {
      console.warn('[hud] 更新点亮计数失败：', error);
    }
  }

  /**
   * 淡出并禁用首屏引导层。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  hideBoot() {
    try {
      if (!this.bootElement) return;
      this.bootElement.classList.add('is-hidden');
      window.setTimeout(() => {
        if (this.bootElement && this.bootElement.parentNode) {
          this.bootElement.parentNode.removeChild(this.bootElement);
        }
        this.bootElement = null;
      }, 600);
    } catch (error) {
      console.warn('[hud] 隐藏引导层失败：', error);
    }
  }

  /**
   * 移除 HUD 侧的事件监听。
   *
   * @returns {void}
   * @throws 无显式抛出
   */
  dispose() {
    try {
      document.removeEventListener('keydown', this._boundKeydown);
    } catch (error) {
      console.warn('[hud] 卸载 HUD 失败：', error);
    }
  }
}
