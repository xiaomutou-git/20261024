/**
 * @file competitions.js
 * @description TRAE 社区（forum.trae.cn）赛事专区的内容快照。
 *
 * 数据来源：https://forum.trae.cn/categories 与各赛事专区、赛事官网
 * 采集时间：2026-10-20
 * 用途：作为 3D 场景右侧“社区比赛”标签页的内容源，展示社区正在发生与已经落幕的赛事。
 *
 * @module data/competitions
 */

/**
 * 社区赛事条目。
 * @typedef {Object} CommunityContest
 * @property {string} id          - 赛事唯一标识
 * @property {string} name        - 赛事名称
 * @property {string} status      - 状态标签文案
 * @property {('closed'|'open')} tone - 状态色调，closed 表示已收官，open 表示专区仍在收录
 * @property {string} tagline     - 一句话亮点（奖池 / 赛道特色）
 * @property {string} schedule    - 赛程说明
 * @property {number} topics      - 该专区的话题数
 * @property {string} section     - 专区构成说明
 * @property {string} url         - 赛事在社区中的专区地址
 */

/**
 * 社区赛事列表（按赛事规模排序）。
 * @type {ReadonlyArray<CommunityContest>}
 */
export const COMMUNITY_CONTESTS = Object.freeze([
  {
    id: 'ai-creativity',
    name: 'TRAE AI 创造力大赛',
    status: '已收官',
    tone: 'closed',
    tagline: '113 万现金奖池，单作品最高 35 万现金',
    schedule: '2026.06.16 - 07.15 报名与初赛，8 月线下决赛',
    topics: 226,
    section: '报名 / 初赛 / 复赛 / 交流 四专区',
    url: 'https://forum.trae.cn/c/38-category/38'
  },
  {
    id: 'solo-challenge',
    name: '「AI 无限职场」SOLO 挑战赛',
    status: '已收官',
    tone: 'closed',
    tagline: '职场效率创新 +「Hello AI 科技致善」双赛道',
    schedule: '2026.04.09 - 05.10 作品提交，5 月获奖公示',
    topics: 3529,
    section: '官方作品提交专区',
    url: 'https://forum.trae.cn/c/35-category/35'
  },
  {
    id: 'solo-skill',
    name: 'SOLO 技能创作赛',
    status: '专区开放',
    tone: 'open',
    tagline: '一切皆可 Skill：把工作流封装成可复用的技能',
    schedule: '专区持续收录技能作品',
    topics: 895,
    section: 'SOLO 技能创作赛专区',
    url: 'https://forum.trae.cn/c/37-category/37'
  }
]);

/**
 * 全部赛事专区入口（社区分类总览页）。
 * @type {string}
 */
export const CONTEST_SECTION_URL = 'https://forum.trae.cn/categories';
