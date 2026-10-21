/**
 * @file community.js
 * @description TRAE 社区（forum.trae.cn）「社区伙伴」板块的真实内容快照。
 *
 * 数据来源：https://forum.trae.cn/c/33-category/33
 * 采集时间：2026-10-20
 * 用途：作为 3D 场景右侧“社区动态”面板的内容源，让页面与社区真实运营活动保持一致。
 *
 * @module data/community
 */

/**
 * 社区动态条目。
 * @typedef {Object} CommunityTopic
 * @property {string} id        - 话题唯一标识（用于渲染 key）
 * @property {string} title     - 话题标题
 * @property {string} url       - 话题在论坛中的地址
 * @property {number} replies   - 回复数
 * @property {number} views     - 浏览量
 * @property {string} date      - 最后活动日期（YYYY-MM-DD）
 * @property {string} label     - 归类标签，用于 UI 上的小角标
 */

/**
 * 社区动态列表（按论坛首页顺序排列）。
 * @type {ReadonlyArray<CommunityTopic>}
 */
export const COMMUNITY_TOPICS = Object.freeze([
  {
    id: 'topic-184139',
    title: 'TRAE 社区创作者计划正式招募：寻找 100 位会用、会写、会分享的你',
    url: 'https://forum.trae.cn/t/topic/184139',
    replies: 39,
    views: 293,
    date: '2026-10-16',
    label: '创作者计划'
  },
  {
    id: 'topic-15576',
    title: '社区核心伙伴荣誉墙来了｜快来看看都有谁',
    url: 'https://forum.trae.cn/t/topic/15576',
    replies: 54,
    views: 1421,
    date: '2026-09-28',
    label: '荣誉墙'
  },
  {
    id: 'topic-2279',
    title: 'TRAE 社区贡献者每周评选开启！分享、互动、助人赢好礼',
    url: 'https://forum.trae.cn/t/topic/2279',
    replies: 18,
    views: 1317,
    date: '2026-08-25',
    label: '贡献者激励'
  },
  {
    id: 'topic-183977',
    title: '「本周社区之星」获奖公示 —— 10 月第二周 10.5 - 10.11',
    url: 'https://forum.trae.cn/t/topic/183977',
    replies: 20,
    views: 217,
    date: '2026-10-14',
    label: '社区之星'
  }
]);

/**
 * 社区板块入口地址。
 * @type {string}
 */
export const COMMUNITY_ENTRY_URL = 'https://forum.trae.cn/c/33-category/33';

/**
 * 关于 1024 程序员节的文案事实，用于 HUD 文案与彩蛋展示。
 * @type {ReadonlyArray<{label: string, value: string, note: string}>}
 */
export const EVENT_FACTS = Object.freeze([
  {
    label: '2¹⁰',
    value: '1024',
    note: '1KB = 1024 Byte，程序员节由此得名'
  },
  {
    label: 'Voxels',
    value: '1024',
    note: '场景由 1024 个方块拼合而成'
  },
  {
    label: 'Date',
    value: '10.24',
    note: '每年 10 月 24 日，向每一行代码致敬'
  }
]);
