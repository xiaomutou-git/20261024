/**
 * @file data/showcase.js
 * @description 按住 TRAE 满 5 秒后在其背后轮播的图片清单（image2 目录）。
 *
 * 说明：使用 import.meta.glob 在构建期收集，图片会被打包成带哈希的静态资源，
 * 运行时按需加载（同一时刻只解码当前与下一张），不会一次性把 50 多张大图读进显存。
 *
 * @type {ReadonlyArray<string>}
 */
const MODULES = import.meta.glob('/image2/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default'
});

/** 按路径排序，保证每次构建的轮播顺序稳定 */
export const SHOWCASE_IMAGES = Object.freeze(
  Object.keys(MODULES)
    .sort()
    .map((key) => MODULES[key])
);
