/**
 * @file config.js
 * @description 全局配置与设计令牌（Design Tokens）。
 *
 * 设计思路：
 *  - 所有场景尺寸、配色、动效时长集中在此文件，便于统一调整，避免散落在各模块中的“魔法数字”；
 *  - 配色来源于“清爽科技青”主视觉（#06B6D4 / #0891B2 / #0E7490），并保留矩阵绿、暖橙两套备选主题；
 *  - 方块总数固定为 1024，呼应 2^10 = 1024 的程序员节语义。
 *
 * @module config
 */

/**
 * 5x7 点阵字模，字符 '1' 表示该像素被点亮。
 * 同时收录数字 '1' '0' '2' '4' 与字母 'T' 'R' 'A' 'E'，
 * 使「1024」与凝聚后的「TRAE」可以复用同一套字形生成逻辑。
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const GLYPH_5X7 = Object.freeze({
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111']
});

/**
 * 按住不放时中央字形凝聚成的字符序列（TRAE）。
 * @type {ReadonlyArray<string>}
 */
export const MORPH_CHARS = Object.freeze(['T', 'R', 'A', 'E']);

/**
 * 点阵字模的行数（高度方向单元数）。
 * @type {number}
 */
export const GLYPH_ROWS = 7;

/**
 * 点阵字模的列数（宽度方向单元数）。
 * @type {number}
 */
export const GLYPH_COLS = 5;

/**
 * 相邻字符之间空出的列数，用于拉开 "1024" 的字符间距。
 * @type {number}
 */
export const GLYPH_GAP_COLS = 1;

/**
 * 单个点阵单元在空间中的边长（略大于方块尺寸，形成呼吸缝隙）。
 * 取值需与中央 logo 的整体尺寸配合：logo 点阵宽 39 格、高 23 格，
 * 0.8 时整体约 31×18 世界单位，正好落在上下两簇头像之间。
 * @type {number}
 */
export const CELL_SIZE = 0.8;

/**
 * 单个方块的几何尺寸。
 * @type {number}
 */
export const VOXEL_SIZE = 0.68;

/**
 * logo 沿 Z 轴挤出的层数，决定立体厚度。
 * logo 点阵像素数约 450，乘以 5 层后约 2200 个方块，兼顾立体感与渲染开销。
 * @type {number}
 */
export const LOGO_DEPTH = 5;

/**
 * 主题令牌集合。
 * accent      主色，用于字形高亮与关键 UI
 * accentDeep  主色按压/深色态
 * secondary   二次强调色（薄荷/青蓝），用于脉冲波与点缀
 * glow        辉光色，用于 Bloom 溢出与悬停瞬间
 * diffuser    环境方块的基础漫反射色
 * bgTop/bgBottom  场景背景径向渐变的中心色与边缘色
 * tone        明暗基调：dark 为深色背景 + 浅色文字（默认），light 为浅色背景 + 深色文字
 *
 * @type {ReadonlyArray<{id: string, name: string, accent: string, accentDeep: string, secondary: string, glow: string, diffuser: string, bgTop: string, bgBottom: string, tone?: 'dark'|'light'}>}
 */
export const THEMES = Object.freeze([
  {
    id: 'azure',
    name: '科技青',
    accent: '#06B6D4',
    accentDeep: '#0E7490',
    secondary: '#22D3EE',
    glow: '#A5F3FC',
    diffuser: '#16323F',
    bgTop: '#0A2230',
    bgBottom: '#040C14'
  },
  {
    id: 'matrix',
    name: '矩阵绿',
    accent: '#22C55E',
    accentDeep: '#15803D',
    secondary: '#4ADE80',
    glow: '#BBF7D0',
    diffuser: '#12301F',
    bgTop: '#0A2318',
    bgBottom: '#03100A'
  },
  {
    id: 'amber',
    name: '暖橙',
    accent: '#F59E0B',
    accentDeep: '#B45309',
    secondary: '#FBBF24',
    glow: '#FDE68A',
    diffuser: '#3A2810',
    bgTop: '#2A1B08',
    bgBottom: '#100803'
  },
  {
    id: 'violet',
    name: '霓虹紫',
    accent: '#8B5CF6',
    accentDeep: '#6D28D9',
    secondary: '#C4B5FD',
    glow: '#EDE9FE',
    diffuser: '#261C42',
    bgTop: '#1C1233',
    bgBottom: '#080614'
  },
  {
    // 白色主题：偏暖的宣纸白底 + 墨青色主色，避免纯白刺眼
    id: 'paper',
    name: '宣纸白',
    tone: 'light',
    accent: '#0E7490',
    accentDeep: '#155E75',
    secondary: '#0F766E',
    glow: '#0891B2',
    diffuser: '#C9D6DD',
    bgTop: '#F7F5EF',
    bgBottom: '#E4E0D6'
  },
  {
    // 灰色主题：中性浅灰底 + 石墨色主色，整体克制无彩色倾向
    id: 'graphite',
    name: '石墨灰',
    tone: 'light',
    accent: '#374151',
    accentDeep: '#1F2937',
    secondary: '#4B5563',
    glow: '#4B5563',
    diffuser: '#BFC5CC',
    bgTop: '#EEF0F3',
    bgBottom: '#D6DAE0'
  }
]);

/**
 * 默认启用的主题 id。
 * @type {string}
 */
export const DEFAULT_THEME_ID = 'azure';

/**
 * 相机参数配置。
 * @type {Readonly<{fov: number, near: number, far: number, position: [number, number, number], target: [number, number, number]}>}
 */
export const CAMERA_CONFIG = Object.freeze({
  fov: 46,
  near: 0.1,
  far: 320,
  position: [0, 5.5, 40],
  target: [0, 0.5, 0]
});

/**
 * 轨道控制器限制参数。
 * 说明：极角限制收窄在水平线上下约 30° 内，避免用户拖拽时出现大幅俯仰倾斜的廉价 3D 观感。
 * @type {Readonly<{minDistance: number, maxDistance: number, minPolarAngle: number, maxPolarAngle: number, dampingFactor: number}>}
 */
export const CONTROLS_CONFIG = Object.freeze({
  minDistance: 22,
  // 头像数量随社区成员增长（现已 200 余位），相机需要能退到足够远才能让所有头像入镜
  maxDistance: 170,
  minPolarAngle: Math.PI * 0.3,
  maxPolarAngle: Math.PI * 0.68,
  dampingFactor: 0.055
});

/**
 * 二进制数据雨配置（三维空间中缓慢下落的数据字符云）。
 * @type {Readonly<{desktopCount: number, mobileCount: number, spread: number, top: number, bottom: number, minSpeed: number, maxSpeed: number}>}
 */
export const RAIN_CONFIG = Object.freeze({
  // 说明：粒子数量现在由 DataRain 内的“列数 × 每列字符数”推导，
  // 这两个字段仅保留为历史参考，不参与实际布局计算
  desktopCount: 360,
  mobileCount: 150,
  spread: 46,
  top: 26,
  bottom: -18,
  // 下落速度整体放慢：原来 1.4~3.6 偏快，视觉上过于密集急促
  minSpeed: 0.55,
  maxSpeed: 1.35
});

/**
 * 数据雨里穿插掉落的文字内容。
 *
 * 说明：二进制 0/1 保持连续的“数据流”观感，每隔数秒从中掉落一条祝福语或 TRAE 字样，
 * 作为节奏上的呼吸点，而不是满屏文字——保持克制，避免喧宾夺主。
 * @type {Readonly<{phrases: ReadonlyArray<string>, brands: ReadonlyArray<string>}>}
 */
export const RAIN_WORDS = Object.freeze({
  phrases: Object.freeze([
    '1024 快乐',
    '程序员节快乐',
    '向每一行代码致敬',
    '代码即浪漫',
    'Bug 退散',
    '永不宕机',
    '上线大吉',
    '一次跑通',
    'Hello, World',
    '编译通过'
  ]),
  brands: Object.freeze(['TRAE', 'T', 'R', 'A', 'E'])
});

/**
 * 浅色主题下的渲染参数覆盖。
 *
 * 说明：曝光是为“深色背景 + 高亮方块”调的；切到浅底后同样的亮度会整片泛白，
 * 因此浅色主题需要压低曝光，让方块轮廓与贴图细节保持清晰。
 * @type {Readonly<{exposure: number}>}
 */
export const LIGHT_TONE_RENDER = Object.freeze({
  exposure: 0.88
});

/**
 * 交互反馈参数。
 * @type {Readonly<{pulseMaxRadius: number, pulseSpeed: number, hoverLerp: number, idleSpinSpeed: number}>}
 */
export const INTERACTION_CONFIG = Object.freeze({
  // 脉冲只做“局部涟漪”：半径收敛在 9 以内，避免一次点击把全场 1024 个方块全部点亮
  pulseMaxRadius: 9,
  pulseSpeed: 11,
  hoverLerp: 0.16,
  idleSpinSpeed: 0.045
});

/**
 * 根据主题 id 获取主题令牌对象。
 * @param {string} id - 主题标识，取值见 {@link THEMES} 中的 id 字段（如 'azure'）
 * @param {ReadonlyArray<object>} [themes=THEMES] - 候选主题集合，默认使用内置主题表
 * @returns {{id: string, name: string, accent: string, accentDeep: string, secondary: string, glow: string, diffuser: string, bgTop: string, bgBottom: string}} 命中的主题对象；未命中时返回集合首项
 * @throws {TypeError} 当 themes 不是数组时抛出；调用方应传入合法的主题数组
 */
export function resolveTheme(id, themes = THEMES) {
  if (!Array.isArray(themes)) {
    throw new TypeError('resolveTheme 期望 themes 为数组');
  }
  return themes.find((item) => item.id === id) ?? themes[0];
}
