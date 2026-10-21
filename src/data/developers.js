/**
 * @file developers.js
 * @description 社区开发者名单（用于三维场景四周的像素头像墙）。
 *
 * 说明：本仓库不含任何真实社区成员的昵称、账号名或头像文件。
 * 所有身份标识均为占位符（avatar_001 ~ avatar_206），与本地
 * 脱敏后的头像文件名一一对应；使用者可自行替换 image/ 目录下的图片
 * 而不需要改动代码。
 *
 * @module data/developers
 */

/**
 * 社区开发者条目。
 * @typedef {Object} CommunityDeveloper
 * @property {string} username    - 社区唯一账号名（像素头像的确定性种子）
 * @property {string} name        - 社区展示昵称（与本地图片文件名对应）
 * @property {string} displayName - 头像牌上实际展示的名字
 * @property {string} role        - 社区身份标签
 * @property {string} [avatarPath] - 远程头像模板地址（公开仓库中保持为空）
 * @property {string|null} localAvatar - 本地真实头像资源地址，未匹配到时为 null
 */

/**
 * 占位成员名单：与 image/ 目录下的 avatar_001.png ~ avatar_206.ext 一一对应。
 * 前几位标记为管理员/版主/优秀校园伙伴，其余统一为社区伙伴。
 * @type {ReadonlyArray<Omit<CommunityDeveloper, 'localAvatar'>>}
 */
function buildPlaceholderList(total) {
  const roles = ['社区管理员', '社区版主', '社区版主'];
  return Object.freeze(
    Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      const name = `avatar_${n.ToString('000')}`;
      return {
        username: name,
        name,
        role: roles[i] ?? '社区伙伴',
        avatarPath: ''
      };
    })
  );
}

const BASE_DEVELOPERS = buildPlaceholderList(206);

/**
 * 构建期收集 image/ 目录下的真实头像图片，并转换为可直接使用的资源地址。
 *
 * 说明：图片文件名已脱敏为 avatar_001.png ~ avatar_206.ext，
 * 与 BASE_DEVELOPERS 中的 name 精确匹配。
 *
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
 * 建立"归一化文件名 → { 文件名, 资源地址 }"的索引。
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
 * @param {string} name - 社区昵称
 * @param {string} username - 社区账号名
 * @param {Set<string>} usedFiles - 已被其他成员占用的图片文件名集合
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
 *  3. 有真实头像的成员排在最前。
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
      displayName: hit ? hit.fileName : developer.name,
      localAvatar: hit ? hit.url : null
    };
  });

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

  return Object.freeze([
    ...matched.filter((developer) => developer.localAvatar),
    ...extras,
    ...matched.filter((developer) => !developer.localAvatar)
  ]);
}

/**
 * 最终展示名单。
 * @type {ReadonlyArray<CommunityDeveloper>}
 */
export const COMMUNITY_DEVELOPERS = buildDeveloperList();

/**
 * 已匹配到本地真实头像的成员数量。
 * @type {number}
 */
export const LOCAL_AVATAR_COUNT = COMMUNITY_DEVELOPERS.filter((item) => item.localAvatar).length;

/**
 * 远程头像请求边长（像素）。
 * @type {number}
 */
export const AVATAR_REQUEST_SIZE = 240;

/**
 * 远程头像请求在公开仓库中默认禁用，始终返回空字符串。
 *
 * @param {string} template - 头像模板，公开仓库中保持为空
 * @param {number} [size=AVATAR_REQUEST_SIZE] - 请求的头像边长（像素）
 * @returns {string} 空字符串（远程头像已屏蔽）
 * @throws 无显式抛出
 */
export function buildAvatarUrl(template, size = AVATAR_REQUEST_SIZE) {
  return '';
}

/**
 * 公开仓库中默认不提供真实社区总人数，等于本地占位成员数。
 * @type {number}
 */
export const COMMUNITY_MEMBER_TOTAL = BASE_DEVELOPERS.length;

/**
 * 开发者主页地址。公开仓库不返回真实成员主页。
 *
 * @param {string} username - 占位账号名
 * @returns {string} 社区首页
 * @throws 无显式抛出
 */
export function buildProfileUrl(username) {
  return 'https://forum.trae.cn/';
}
