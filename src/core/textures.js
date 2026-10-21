import * as THREE from 'three';

/**
 * @file textures.js
 * @description 程序化生成纹理工具集（运行时用 Canvas 绘制，避免额外静态资源请求）。
 *
 * 设计思路：
 *  - 页面只依赖 three.js 一个第三方包，所有贴图均由代码生成，保证零外部资源、离线可用；
 *  - 所有 Canvas DOM 操作均包裹 try-catch，绘制失败时返回 null，由调用方退化为纯色渲染，不影响主流程。
 *
 * @module core/textures
 */

/**
 * 生成径向渐变光晕纹理（中心亮、边缘透明）。
 * 适用场景：地面光晕、粒子柔光点。
 *
 * @param {string} [color='#ffffff'] - 光晕中心颜色，支持任意 CSS 颜色字符串
 * @param {number} [size=256] - 纹理边长（像素），建议为 2 的幂，默认 256
 * @returns {THREE.CanvasTexture|null} 生成的纹理对象；当 Canvas 绘制不可用或发生异常时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null，调用方需判空处理
 */
export function createRadialGlowTexture(color = '#ffffff', size = 256) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const half = size / 2;
    // 由中心向外做多段停止点渐变，形成柔和的辉光衰减
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.32, hexToRgba(color, 0.42));
    gradient.addColorStop(0.68, hexToRgba(color, 0.1));
    gradient.addColorStop(1, hexToRgba(color, 0));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    console.warn('[textures] 生成光晕纹理失败，将退化为纯色渲染：', error);
    return null;
  }
}

/**
 * 生成单个数字字符（0 / 1）纹理，用于三维二进制数据雨。
 *
 * @param {('0'|'1')} [digit='1'] - 需要绘制的字符，默认 '1'
 * @param {number} [size=128] - 纹理边长（像素），默认 128
 * @returns {THREE.CanvasTexture|null} 生成的纹理对象；异常或上下文不可用时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null
 */
export function createDigitTexture(digit = '1', size = 128) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(size * 0.78)}px "SFMono-Regular", Consolas, "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 轻微偏移以补偿等宽字体基线，使字符在点精灵中视觉居中
    ctx.fillText(digit, size / 2, size / 2 + size * 0.04);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    console.warn('[textures] 生成数字纹理失败，数据雨将退化为纯色方块：', error);
    return null;
  }
}

/**
 * 生成一段文字（透明底、白色字）的纹理，用于数据雨中掉落的祝福语与 TRAE 字样。
 *
 * 说明：文字统一画成白色，实际颜色交给材质的 color 决定，
 * 这样切换主题时只需改材质颜色，无需重新绘制纹理。
 *
 * @param {string} text - 要绘制的文字内容
 * @param {Object} [options] - 可选参数
 * @param {number} [options.fontSize=72] - 字号（像素），默认 72
 * @param {number} [options.padding=24] - 左右留白（像素），默认 24
 * @param {number} [options.maxWidth=1024] - 画布最大宽度（像素），超长文字会自动缩小字号，默认 1024
 * @returns {{texture: THREE.CanvasTexture, aspect: number}|null} 纹理与其宽高比；绘制失败时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null
 */
export function createTextTexture(text, { fontSize = 72, padding = 24, maxWidth = 1024 } = {}) {
  try {
    const label = String(text ?? '').trim();
    if (!label) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontOf = (size) => `600 ${size}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    // 先量宽再定画布尺寸；超长文字逐级缩小字号直到能装进 maxWidth
    let size = fontSize;
    ctx.font = fontOf(size);
    let textWidth = ctx.measureText(label).width;
    while (textWidth + padding * 2 > maxWidth && size > 28) {
      size -= 4;
      ctx.font = fontOf(size);
      textWidth = ctx.measureText(label).width;
    }

    canvas.width = Math.ceil(Math.min(textWidth + padding * 2, maxWidth));
    canvas.height = Math.ceil(size * 1.7);

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = fontOf(size);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2 + size * 0.03);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, aspect: canvas.width / canvas.height };
  } catch (error) {
    console.warn('[textures] 生成文字纹理失败，将跳过该条文字：', error);
    return null;
  }
}

/**
 * 生成“竖排文字”纹理：每个字符占一行，自上而下堆叠，用于数字雨里的竖排祝福语。
 *
 * 说明：竖排是以字符为单位逐行居中绘制，而不是把横排整体旋转 90°——
 * 旋转会让汉字侧躺，竖排则保持每个字正立，符合中文竖排阅读习惯。
 *
 * @param {string} text - 要绘制的文字内容（逐字符拆分成行）
 * @param {Object} [options] - 可选参数
 * @param {number} [options.fontSize=64] - 单字字号（像素），默认 64
 * @param {number} [options.padding=16] - 上下左右留白（像素），默认 16
 * @param {number} [options.maxChars=16] - 最多绘制多少个字符，超出部分截断，默认 16
 * @returns {{texture: THREE.CanvasTexture, aspect: number, charCount: number}|null} 纹理、宽高比与字符数；生成失败时返回 null
 * @throws 无显式抛出：内部捕获异常并返回 null
 */
export function createVerticalTextTexture(text, { fontSize = 64, padding = 16, maxChars = 16 } = {}) {
  try {
    // 去掉空白字符：竖排时空格没有意义，只保留可见字符
    const chars = Array.from(String(text ?? '').replace(/\s+/g, '')).slice(0, maxChars);
    if (chars.length === 0) return null;

    const lineHeight = Math.round(fontSize * 1.18);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(fontSize * 1.3) + padding * 2;
    canvas.height = lineHeight * chars.length + padding * 2;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    chars.forEach((ch, index) => {
      const cy = padding + lineHeight * (index + 0.5) + fontSize * 0.03;
      ctx.fillText(ch, canvas.width / 2, cy);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, aspect: canvas.width / canvas.height, charCount: chars.length };
  } catch (error) {
    console.warn('[textures] 生成竖排文字纹理失败，将跳过该条文字：', error);
    return null;
  }
}

/**
 * 将十六进制颜色转换为带透明度的 rgba 字符串。
 * @param {string} hex - 十六进制颜色，支持 #RGB / #RRGGBB 两种写法
 * @param {number} alpha - 透明度，取值区间 [0, 1]
 * @returns {string} rgba(...) 形式的 CSS 颜色字符串；当输入无法解析时回退为 `rgba(255,255,255,${alpha})`
 * @throws 无显式抛出：非法输入按兜底值处理
 */
export function hexToRgba(hex, alpha) {
  try {
    let value = String(hex).trim().replace('#', '');
    if (value.length === 3) {
      value = value.split('').map((ch) => ch + ch).join('');
    }
    if (value.length !== 6) {
      return `rgba(255, 255, 255, ${alpha})`;
    }
    const int = Number.parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch (error) {
    console.warn('[textures] 颜色解析失败，使用白色兜底：', error);
    return `rgba(255, 255, 255, ${alpha})`;
  }
}
