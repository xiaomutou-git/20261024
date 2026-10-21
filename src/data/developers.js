/**
 * @file developers.js
 * @description 社区开发者名单（用于三维场景四周的像素头像墙）。
 *
 * 说明：本仓库不包含任何真实社区成员的昵称、账号名或头像素材。
 * 所有身份标识均为占位符，头像图片需由使用者自备并放入 image/ 目录
 * （按文件名自动匹配；详见 README.md）。
 *
 * @module data/developers
 */

/**
 * 社区开发者条目。
 * @typedef {Object} CommunityDeveloper
 * @property {string} username    - 社区唯一账号名（像素头像的确定性种子）
 * @property {string} name        - 社区展示昵称
 * @property {string} displayName - 头像牌上实际展示的名字
 * @property {string} role        - 社区身份标签
 * @property {string} [avatarPath] - 社区远程头像模板地址（公开仓库中保持为空）
 * @property {string|null} localAvatar - 本地真实头像资源地址，未匹配到时为 null
 */

/**
 * 基础名单（占位成员，共 48 位）。
 * @type {ReadonlyArray<Omit<CommunityDeveloper, 'localAvatar'>>}
 */
const BASE_DEVELOPERS = Object.freeze([
  { username: 'member_001', name: '成员001', role: '社区管理员', avatarPath: '' },
  { username: 'member_002', name: '成员002', role: '社区版主', avatarPath: '' },
  { username: 'member_003', name: '成员003', role: '社区版主', avatarPath: '' },
  { username: 'member_004', name: '成员004', role: '社区伙伴', avatarPath: '' },
  { username: 'member_005', name: '成员005', role: '社区伙伴', avatarPath: '' },
  { username: 'member_006', name: '成员006', role: '社区伙伴', avatarPath: '' },
  { username: 'member_007', name: '成员007', role: '社区伙伴', avatarPath: '' },
  { username: 'member_008', name: '成员008', role: '社区伙伴', avatarPath: '' },
  { username: 'member_009', name: '成员009', role: '社区伙伴', avatarPath: '' },
  { username: 'member_010', name: '成员010', role: '社区伙伴', avatarPath: '' },
  { username: 'member_011', name: '成员011', role: '社区伙伴', avatarPath: '' },
  { username: 'member_012', name: '成员012', role: '社区伙伴', avatarPath: '' },
  { username: 'member_013', name: '成员013', role: '社区伙伴', avatarPath: '' },
  { username: 'member_014', name: '成员014', role: '社区伙伴', avatarPath: '' },
  { username: 'member_015', name: '成员015', role: '社区伙伴', avatarPath: '' },
  { username: 'member_016', name: '成员016', role: '社区伙伴', avatarPath: '' },
  { username: 'member_017', name: '成员017', role: '社区伙伴', avatarPath: '' },
  { username: 'member_018', name: '成员018', role: '社区伙伴', avatarPath: '' },
  { username: 'member_019', name: '成员019', role: '社区伙伴', avatarPath: '' },
  { username: 'member_020', name: '成员020', role: '社区伙伴', avatarPath: '' },
  { username: 'member_021', name: '成员021', role: '社区伙伴', avatarPath: '' },
  { username: 'member_022', name: '成员022', role: '社区伙伴', avatarPath: '' },
  { username: 'member_023', name: '成员023', role: '社区伙伴', avatarPath: '' },
  { username: 'member_024', name: '成员024', role: '社区伙伴', avatarPath: '' },
  { username: 'member_025', name: '成员025', role: '社区伙伴', avatarPath: '' },
  { username: 'member_026', name: '成员026', role: '社区伙伴', avatarPath: '' },
  { username: 'member_027', name: '成员027', role: '社区伙伴', avatarPath: '' },
  { username: 'member_028', name: '成员028', role: '社区伙伴', avatarPath: '' },
  { username: 'member_029', name: '成员029', role: '社区伙伴', avatarPath: '' },
  { username: 'member_030', name: '成员030', role: '社区伙伴', avatarPath: '' },
  { username: 'member_031', name: '成员031', role: '社区伙伴', avatarPath: '' },
  { username: 'member_032', name: '成员032', role: '社区伙伴', avatarPath: '' },
  { username: 'member_033', name: '成员033', role: '社区伙伴', avatarPath: '' },
  { username: 'member_034', name: '成员034', role: '社区伙伴', avatarPath: '' },
  { username: 'member_035', name: '成员035', role: '社区伙伴', avatarPath: '' },
  { username: 'member_036', name: '成员036', role: '社区伙伴', avatarPath: '' },
  { username: 'member_037', name: '成员037', role: '社区伙伴', avatarPath: '' },
  { username: 'member_038', name: '成员038', role: '社区伙伴', avatarPath: '' },
  { username: 'member_039', name: '成员039', role: '社区伙伴', avatarPath: '' },
  { username: 'member_040', name: '成员040', role: '社区伙伴', avatarPath: '' },
  { username: 'member_041', name: '成员041', role: '社区伙伴', avatarPath: '' },
  { username: 'member_042', name: '成员042', role: '社区伙伴', avatarPath: '' },
  { username: 'member_043', name: '成员043', role: '社区伙伴', avatarPath: '' },
  { username: 'member_044', name: '成员044', role: '社区伙伴', avatarPath: '' },
  { username: 'member_045', name: '成员045', role: '社区伙伴', avatarPath: '' },
  { username: 'member_046', name: '成员046', role: '社区伙伴', avatarPath: '' },
  { username: 'member_047', name: '成员047', role: '社区伙伴', avatarPath: '' },
  { username: 'member_048', name: '成员048', role: '优秀校园伙伴', avatarPath: '' }
]);

/**
 * 构建期收集 image/ 目录下的真实头像图片，并转换为可直接使用的资源地址。
 *
 * 说明：仓库已通过 .gitignore 排除 image/ 目录，import.meta.glob 在无图时返回空对象，
 * 整个匹配链路会自动降级为确定性生成的像素头像，构建不报错、运行不崩溃。
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
 * 若使用者引入了私有头像模板，可以把模板字段填回 BASE_DEVELOPERS 对应条目。
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
 * 公开仓库中默认不提供真实社区总人数，统一为占位值。
 * @type {number}
 */
export const COMMUNITY_MEMBER_TOTAL = 0;

/**
 * 开发者在社区中的主页地址。
 *
 * @param {string} username - 占位账号名
 * @returns {string} 社区首页，公开仓库中不返回真实成员主页
 * @throws 无显式抛出
 */
export function buildProfileUrl(username) {
  return 'https://forum.trae.cn/';
}
