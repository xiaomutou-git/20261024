import { GLYPH_5X7, GLYPH_ROWS, GLYPH_COLS, GLYPH_GAP_COLS, CELL_SIZE, LOGO_DEPTH } from '../config.js';

/**
 * @file core/glyph.js
 * @description 字形工具：把 5×7 点阵字符转译为空间中的体素目标位置，并提供缓动函数。
 *
 * 设计思路：中央「1024」字形与「TRAE」汇聚形态都需要“按点阵生成等量方块位置”的能力，
 * 因此把这段逻辑抽成共享模块，避免两处各写一份而逐渐走样。
 *
 * @module core/glyph
 */

/**
 * 统计一组字符的点阵中被点亮的像素总数。
 *
 * @param {ReadonlyArray<string>} chars - 字符序列，每个字符都需在 GLYPH_5X7 中存在
 * @returns {number} 点亮的像素格数量
 * @throws 无显式抛出：字符缺失时按 0 个像素处理
 */
export function countGlyphPixels(chars) {
  let total = 0;
  for (const ch of chars) {
    const rows = GLYPH_5X7[ch];
    if (!rows) continue;
    for (const row of rows) {
      for (const cell of row) {
        if (cell === '1') total += 1;
      }
    }
  }
  return total;
}

/**
 * 把一组字符的点阵转译为空间中的体素位置，并保证位置数量严格等于 totalCount。
 *
 * 执行逻辑：
 *  1. 逐个字符逐行扫描点阵，收集被点亮像素的平面坐标（X 横向、Y 纵向，整体居中对齐）；
 *  2. 以 totalCount / 像素数 推导挤出层数，把像素沿 Z 轴堆叠成立体字形；
 *  3. 无法整除的余数分配给前若干像素各多堆一层，使位置总量精确等于 totalCount。
 *
 * @param {ReadonlyArray<string>} chars - 字符序列
 * @param {number} totalCount - 期望生成的位置总数（必须为正整数）
 * @param {number} [layerStep=CELL_SIZE * 0.86] - Z 向层间距，默认略小于单元格以求体块紧凑
 * @returns {{positions: Float32Array, depth: number, pixelCount: number}} 位置数组（长度 3×totalCount）、基础挤出层数与像素数
 * @throws 无显式抛出：当 totalCount 小于像素数时自动按 1 层截断，不会越界写入
 */
export function buildGlyphTargets(chars, totalCount, layerStep = CELL_SIZE * 0.86) {
  const pixels = [];
  const totalCols = chars.length * GLYPH_COLS + (chars.length - 1) * GLYPH_GAP_COLS;
  const centerCol = (totalCols - 1) / 2;
  const centerRow = (GLYPH_ROWS - 1) / 2;

  chars.forEach((ch, charIndex) => {
    const rows = GLYPH_5X7[ch];
    if (!rows) return;
    const colOffset = charIndex * (GLYPH_COLS + GLYPH_GAP_COLS);
    rows.forEach((row, rowIndex) => {
      for (let col = 0; col < row.length; col += 1) {
        if (row[col] !== '1') continue;
        pixels.push({
          x: (colOffset + col - centerCol) * CELL_SIZE,
          y: (centerRow - rowIndex) * CELL_SIZE
        });
      }
    });
  });

  const pixelCount = pixels.length;
  const baseDepth = Math.max(1, Math.floor(totalCount / Math.max(1, pixelCount)));
  const remainder = Math.max(0, totalCount - baseDepth * pixelCount);
  const positions = new Float32Array(totalCount * 3);
  let index = 0;

  for (let p = 0; p < pixelCount && index < totalCount; p += 1) {
    const layers = Math.min(baseDepth + (p < remainder ? 1 : 0), totalCount - index);
    for (let layer = 0; layer < layers; layer += 1) {
      positions[index * 3] = pixels[p].x;
      positions[index * 3 + 1] = pixels[p].y;
      positions[index * 3 + 2] = (layer - (layers - 1) / 2) * layerStep;
      index += 1;
    }
  }

  return { positions, depth: baseDepth, pixelCount };
}

/**
 * 生成中央品牌 logo 的体素布局。
 *
 * 图形构成（与 TRAE 社区图标一致）：
 *  1. 一块圆角矩形描边组成的“前板”；
 *  2. 一块向左下错开的前板，形成双层叠放的观感；
 *  3. 前板内部的两只“眼睛”，分别由数字 1、0 与 2、4 的点阵构成——
 *     两只眼睛连起来读正好是 1024，即“1024 是 logo 的眼睛”。
 *
 * 坐标约定：点阵以 row（自上而下）与 col（自左向右）为整数格，
 * 最终按整体包围盒居中换算到世界坐标；沿 Z 轴按 depth 层挤出。
 *
 * @param {number} [depth=LOGO_DEPTH] - 沿 Z 轴挤出的层数
 * @param {number} [cellSize=CELL_SIZE] - 单个点阵单元的世界边长
 * @returns {{positions: Float32Array, depth: number, pixelCount: number}} 位置数组（长度 3×像素数×层数）、挤出层数与点阵像素数
 * @throws 无显式抛出：depth 小于 1 时按 1 层处理
 */
export function buildLogoLayout(depth = LOGO_DEPTH, cellSize = CELL_SIZE) {
  /** @type {Map<string, {row: number, col: number}>} 以 “row,col” 为键去重，避免两块板重叠处重复放置方块 */
  const cells = new Map();

  /**
   * 标记一个点阵格。
   *
   * @param {number} row - 行号（自上而下）
   * @param {number} col - 列号（自左向右）
   * @returns {void}
   * @throws 无显式抛出
   */
  const mark = (row, col) => cells.set(`${row},${col}`, { row, col });

  /**
   * 描出一个矩形边框（只描边、不填充）。
   *
   * @param {number} row0 - 上边行号
   * @param {number} col0 - 左边列号
   * @param {number} row1 - 下边行号
   * @param {number} col1 - 右边列号
   * @param {number} thickness - 描边厚度（格）
   * @returns {void}
   * @throws 无显式抛出
   */
  const strokeRect = (row0, col0, row1, col1, thickness) => {
    for (let row = row0; row <= row1; row += 1) {
      for (let col = col0; col <= col1; col += 1) {
        const onEdge =
          row < row0 + thickness ||
          row > row1 - thickness ||
          col < col0 + thickness ||
          col > col1 - thickness;
        if (onEdge) mark(row, col);
      }
    }
  };

  /**
   * 把 5×7 点阵字符盖印到指定位置。
   *
   * @param {string} ch - 字符（需存在于 GLYPH_5X7）
   * @param {number} row - 盖印起始行号
   * @param {number} col - 盖印起始列号
   * @returns {void}
   * @throws 无显式抛出：字符不存在时跳过
   */
  const stampGlyph = (ch, row, col) => {
    const rows = GLYPH_5X7[ch];
    if (!rows) return;
    rows.forEach((pattern, rowIndex) => {
      for (let colIndex = 0; colIndex < pattern.length; colIndex += 1) {
        if (pattern[colIndex] === '1') mark(row + rowIndex, col + colIndex);
      }
    });
  };

  // 背板：向左下错开 3 格，先画在底层，前板覆盖其上形成叠放效果
  strokeRect(3, -3, 22, 32, 3);
  // 前板：logo 主体
  strokeRect(0, 0, 19, 35, 3);

  // 两只眼睛：左眼「10」、右眼「24」，合起来即 1024
  stampGlyph('1', 6, 6);
  stampGlyph('0', 6, 12);
  stampGlyph('2', 6, 19);
  stampGlyph('4', 6, 25);

  // 求包围盒以居中，避免整块 logo 在视觉上偏向一角
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const { row, col } of cells.values()) {
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }

  const centerRow = (minRow + maxRow) / 2;
  const centerCol = (minCol + maxCol) / 2;
  const pixelCount = cells.size;
  const layers = Math.max(1, Math.floor(depth));

  const positions = new Float32Array(pixelCount * layers * 3);
  let index = 0;
  for (const { row, col } of cells.values()) {
    for (let layer = 0; layer < layers; layer += 1) {
      positions[index * 3] = (col - centerCol) * cellSize;
      positions[index * 3 + 1] = (centerRow - row) * cellSize;
      positions[index * 3 + 2] = (layer - (layers - 1) / 2) * cellSize * 0.86;
      index += 1;
    }
  }

  return { positions, depth: layers, pixelCount };
}

/**
 * 三次缓动函数（缓出），用于入场聚合动画，让方块“减速落位”。
 *
 * @param {number} t - 归一化进度，取值区间 [0, 1]，超出范围会被截断
 * @returns {number} 缓动后的进度值，取值区间 [0, 1]
 * @throws 无显式抛出
 */
export function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * 三次缓入缓出函数，用于「1024 → TRAE」的凝聚过程，使起止两端都平滑无突变。
 *
 * @param {number} t - 归一化进度，取值区间 [0, 1]，超出范围会被截断
 * @returns {number} 缓动后的进度值，取值区间 [0, 1]
 * @throws 无显式抛出
 */
export function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
