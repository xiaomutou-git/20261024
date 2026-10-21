/**
 * @file developers.js
 * @description TRAE 社区开发者名单（用于三维场景四周的像素头像墙）。
 *
 * 数据来源：
 *  1. https://forum.trae.cn 各分类页的 users 字段（基础名单，共 132 位社区成员，本文件取 48 位）；
 *  2. 项目 image/ 目录下由使用者提供的真实头像图片（按社区昵称命名，构建期自动匹配）。
 *
 * 头像取用优先级：
 *  本地真实图片（image/，同源无跨域问题） → 社区远程头像（forum.trae.cn，需网络与 CORS 允许）
 *  → 两者都不可用时，退化为按账号名确定性生成的像素头像。
 *
 * @module data/developers
 */

/**
 * 社区开发者条目。
 * @typedef {Object} CommunityDeveloper
 * @property {string} username    - 社区唯一账号名（像素头像的确定性种子）
 * @property {string} name        - 社区展示昵称
 * @property {string} displayName - 头像牌上实际展示的名字：有本地图片时取图片名，保证“名字与头像严格对应”
 * @property {string} role        - 社区身份标签
 * @property {string} [avatarPath] - 社区远程头像模板地址（含 {size} 占位符，可能不存在）
 * @property {string|null} localAvatar - 本地真实头像资源地址，未匹配到时为 null
 */

/**
 * 基础名单（来自社区 users 接口的 48 位成员，官方成员与活跃社区伙伴混排）。
 * @type {ReadonlyArray<Omit<CommunityDeveloper, 'localAvatar'>>}
 */
const BASE_DEVELOPERS = Object.freeze([
  { username: 'TRAE-小阳', name: 'TRAE-小阳', role: '社区管理员', avatarPath: '/user_avatar/forum.trae.cn/trae-小阳/{size}/5101_2.png' },
  { username: '骆谦实', name: '骆谦实', role: '社区版主', avatarPath: '/user_avatar/forum.trae.cn/骆谦实/{size}/1494_2.png' },
  { username: 'JasonShane', name: 'JasonShane', role: '社区版主', avatarPath: '/user_avatar/forum.trae.cn/jasonshane/{size}/5557_2.png' },
  { username: 'TRAE-肥肥3鸭鸭', name: '肥肥3鸭鸭', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/trae-肥肥3鸭鸭/{size}/239066_2.png' },
  { username: 'u3604651566699008', name: '悟思品', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/u3604651566699008/{size}/247199_2.png' },
  { username: '斗战', name: '斗战', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/斗战/{size}/43402_2.png' },
  { username: '小木', name: '小木', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/小木/{size}/48226_2.png' },
  { username: '耿家威PhpJavaGo用户17', name: '耿家威', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/耿家威phpjavago用户17/{size}/463_2.png' },
  { username: '守一', name: '守一', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/守一/{size}/215_2.png' },
  { username: '赴月', name: '赴月', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/赴月/{size}/229617_2.png' },
  { username: '迟迟', name: '迟迟', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/迟迟/{size}/52618_2.png' },
  { username: '硬气一点', name: '硬气一点', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/硬气一点/{size}/14675_2.png' },
  { username: '浮世千寻沫', name: 'jack', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/浮世千寻沫/{size}/232562_2.png' },
  { username: '醒明AI研究院成员星图蓝恩希', name: '蓝恩希', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/醒明ai研究院成员星图蓝恩希/{size}/213913_2.png' },
  { username: 'smileRabbit', name: 'smileRabbit', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/smilerabbit/{size}/235668_2.png' },
  { username: 'u1905866741388899', name: 'Piano_CN', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/u1905866741388899/{size}/240866_2.png' },
  { username: 'xcsweb', name: 'xcsweb', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/xcsweb/{size}/1647_2.png' },
  { username: 'GeneralC', name: 'GeneralC', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/generalc/{size}/238840_2.png' },
  { username: 'Damond', name: 'Damond', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/damond/{size}/234419_2.png' },
  { username: 'trae.美好', name: '江湖虾客', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/trae.美好/{size}/4604_2.png' },
  { username: '琦哈哈', name: '琦哈哈', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/琦哈哈/{size}/231805_2.png' },
  { username: 'pollllliiii', name: '老实的农村入', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/pollllliiii/{size}/247020_2.png' },
  { username: 'lanhua', name: '兰花', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/lanhua/{size}/234254_2.png' },
  { username: '皮卡丘不爱喝牛奶', name: '先热爱再创造', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/皮卡丘不爱喝牛奶/{size}/231120_2.png' },
  { username: 'HancksLiu', name: '科学怪人', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/hancksliu/{size}/58074_2.png' },
  { username: 'AllenCheng', name: 'AllenCheng', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/allencheng/{size}/22008_2.png' },
  { username: 'Kamfai', name: 'Kamfai', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/kamfai/{size}/47323_2.png' },
  { username: '司徒晟昱', name: '司徒晟昱', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/司徒晟昱/{size}/45210_2.png' },
  { username: '超级无敌小熊蛋', name: '超级无敌小熊蛋', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/超级无敌小熊蛋/{size}/154188_2.png' },
  { username: '暖行者', name: '暖行者', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/暖行者/{size}/55274_2.png' },
  { username: 'TRAE_小晨儿', name: 'TRAE_小晨儿', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/trae_小晨儿/{size}/18601_2.png' },
  { username: '那个语', name: '那个语', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/那个语/{size}/358_2.png' },
  { username: 'CC3', name: 'CC3', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/cc3/{size}/233633_2.png' },
  { username: '老子道', name: '老子道', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/老子道/{size}/45065_2.png' },
  { username: '小郁', name: '小郁', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/小郁/{size}/31764_2.png' },
  { username: '八娥夨', name: '八娥夨', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/八娥夨/{size}/24561_2.png' },
  { username: 'AI小龙', name: 'AI小龙', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/ai小龙/{size}/10309_2.png' },
  { username: '微风', name: '微风', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/微风/{size}/21016_2.png' },
  { username: '汤圆', name: '汤圆', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/汤圆/{size}/220514_2.png' },
  { username: '4682B4', name: '4682B4', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/4682b4/{size}/31434_2.png' },
  { username: 'AI发明家', name: 'AI发明家', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/ai发明家/{size}/51854_2.png' },
  { username: 'Dlcr', name: 'Dlcr', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/dlcr/{size}/215069_2.png' },
  { username: 'u2081813625048026', name: '藤真亚', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/u2081813625048026/{size}/217980_2.png' },
  { username: '青桃三花', name: '青桃三花', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/青桃三花/{size}/149086_2.png' },
  { username: 'DuBaDu', name: 'DuBaDu', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/dubadu/{size}/223602_2.png' },
  { username: 'LuckyOneTwoThree', name: 'LuckyOneTwoThree', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/luckyonetwothree/{size}/219056_2.png' },
  { username: 'vitoriga', name: 'vitoriga', role: '社区伙伴', avatarPath: '/user_avatar/forum.trae.cn/vitoriga/{size}/22013_2.png' },
  { username: 'HUNAU_徐智航', name: '徐智航', role: '优秀校园伙伴', avatarPath: '/user_avatar/forum.trae.cn/hunau_徐智航/{size}/1487_2.png' }
]);

/**
 * 构建期收集 image/ 目录下的真实头像图片，并转换为可直接使用的资源地址。
 *
 * 说明：这里使用 import.meta.glob 而非运行时拼接路径，
 * 目的是让打包器在构建阶段就把这些图片纳入产物（自动带上内容哈希，避免 404）。
 * @type {Record<string, string>}
 */
const LOCAL_AVATAR_MODULES = import.meta.glob('/image/*.{png,jpg,jpeg,webp,avif,gif}', {
  eager: true,
  query: '?url',
  import: 'default'
});

/**
 * 归一化名称，用于把图片文件名与社区昵称做宽松匹配
 *
 * @param {string} value - 待归一化的名称
 * @returns {string} 去掉空白、下划线、短横线与点号并转小写后的字符串
 * @throws 无显式抛出
 */
function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]/g, '');
}

/**
 * 建立“归一化文件名 → { 文件名, 资源地址 }”的索引。
 *
 * @param {Record<string, string>} modules - import.meta.glob 的返回结果
 * @returns {Map<string, {fileName: string, url: string}>} 索引表
 * @throws 无显式抛出
 */
function buildLocalAvatarIndex(modules) {
  const index = new Map();
  for (const [filePath, url] of Object.entries(modules)) {
    const fileName = filePath.split('/').pop().replace(/\.[^.]+$/, '');
    index.set(normalizeName(fileName), { fileName, url });
  }
  return index;
}

/** @type {Map<string, {fileName: string, url: string}>} 本地头像索引 */
const LOCAL_AVATAR_INDEX = buildLocalAvatarIndex(LOCAL_AVATAR_MODULES);

/**
 * 为某位成员匹配本地真实头像：只在图片名与社区昵称/账号名完全一致时命中。
 *
 * 说明：这里刻意**不做**“包含 / 简称”之类的模糊匹配——模糊匹配会出现张冠李戴
 * （例如把图片「CC」硬塞给昵称「CC3」的成员），与使用者“名字必须一一对应”的要求冲突。
 * 未能精确匹配的图片会作为独立的社区伙伴单独展示，其名字即图片名。
 *
 * @param {string} name - 社区昵称
 * @param {string} username - 社区账号名
 * @param {Set<string>} usedFiles - 已被其他成员占用的图片文件名集合，避免同一张图片被重复匹配
 * @returns {{fileName: string, url: string}|null} 命中的本地头像；未命中返回 null
 * @throws 无显式抛出
 */
function matchLocalAvatar(name, username, usedFiles) {
  const candidates = [normalizeName(name), normalizeName(username)].filter(Boolean);

  for (const candidate of candidates) {
    const hit = LOCAL_AVATAR_INDEX.get(candidate);
    if (hit && !usedFiles.has(hit.fileName)) return hit;
  }

  return null;
}

/**
 * 组装最终展示名单：
 *  1. 为每位基础成员匹配本地真实头像；
 *  2. 名单之外、但使用者提供了图片的成员一并纳入（视为社区伙伴）；
 *  3. 有真实头像的成员排在最前，因为头像环按数组顺序填充，前排会落在更显眼的位置。
 *
 * @returns {ReadonlyArray<CommunityDeveloper>} 最终名单
 * @throws 无显式抛出
 */
function buildDeveloperList() {
  const usedFiles = new Set();

  const matched = BASE_DEVELOPERS.map((developer) => {
    const hit = matchLocalAvatar(developer.name, developer.username, usedFiles);
    if (hit) usedFiles.add(hit.fileName);
    return {
      ...developer,
      // 展示名与头像保持一致：有本地图片时用图片名，否则用社区昵称
      displayName: hit ? hit.fileName : developer.name,
      localAvatar: hit ? hit.url : null
    };
  });

  // 名单之外、但使用者提供了图片的成员，作为独立社区伙伴展示，名字即图片名
  const extras = [];
  for (const [, hit] of LOCAL_AVATAR_INDEX) {
    if (usedFiles.has(hit.fileName)) continue;
    usedFiles.add(hit.fileName);
    extras.push({
      username: hit.fileName,
      name: hit.fileName,
      displayName: hit.fileName,
      role: '社区伙伴',
      avatarPath: '',
      localAvatar: hit.url
    });
  }

  // 有真实头像的成员排在最前（头像环按顺序填充，前排落在更显眼的位置）
  return Object.freeze([
    ...matched.filter((developer) => developer.localAvatar),
    ...extras,
    ...matched.filter((developer) => !developer.localAvatar)
  ]);
}

/**
 * 最终展示名单：本地真实头像成员在前，其余社区成员按原顺序补足。
 * @type {ReadonlyArray<CommunityDeveloper>}
 */
export const COMMUNITY_DEVELOPERS = buildDeveloperList();

/**
 * 已匹配到本地真实头像的成员数量。
 * @type {number}
 */
export const LOCAL_AVATAR_COUNT = COMMUNITY_DEVELOPERS.filter((item) => item.localAvatar).length;

/**
 * 社区站点地址，远程头像资源挂在其下。
 * @type {string}
 */
export const COMMUNITY_ORIGIN = 'https://forum.trae.cn';

/**
 * 远程头像请求边长（像素）。取值 240 既保证采样到 8×8 像素时的色彩足够准确，又控制体积。
 * @type {number}
 */
export const AVATAR_REQUEST_SIZE = 240;

/**
 * 把远程头像模板地址转换为可直接请求的完整 URL（含中文路径编码）。
 *
 * @param {string} template - 头像模板，形如 '/user_avatar/forum.trae.cn/xxx/{size}/123_2.png'
 * @param {number} [size=AVATAR_REQUEST_SIZE] - 请求的头像边长（像素）
 * @returns {string} 完整可请求的 URL；模板为空时返回空字符串
 * @throws 无显式抛出：模板非法或编码失败时返回空字符串，由调用方按“无头像”处理
 */
export function buildAvatarUrl(template, size = AVATAR_REQUEST_SIZE) {
  try {
    if (!template) return '';
    const path = String(template).replace('{size}', String(size));
    // 社区账号名可能包含中文，这里整体做 URI 编码，避免请求 400
    return encodeURI(`${COMMUNITY_ORIGIN}${path}`);
  } catch (error) {
    console.warn('[developers] 头像地址生成失败：', error);
    return '';
  }
}

/**
 * 社区成员总数（本次快照中共抓取到的去重用户数）。
 * @type {number}
 */
export const COMMUNITY_MEMBER_TOTAL = 132;

/**
 * 生成某位开发者在社区中的主页地址。
 *
 * @param {string} username - 社区唯一账号名
 * @returns {string} 形如 https://forum.trae.cn/u/<username> 的主页地址
 * @throws 无显式抛出：username 为空时返回社区首页
 */
export function buildProfileUrl(username) {
  const slug = String(username || '').trim().toLowerCase();
  return slug ? `https://forum.trae.cn/u/${slug}` : 'https://forum.trae.cn/';
}
