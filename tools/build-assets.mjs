/**
 * 重新生成图片资源。需要先 `npm install sharp`（本仓库没有 package.json，
 * 装在你自己的开发目录即可）。
 *
 *   node tools/build-assets.mjs icons    # icons-source/*.png -> champions/*.webp
 *   node tools/build-assets.mjs share    # favicon.svg -> 图标位图 + og-cover.png
 *   node tools/build-assets.mjs          # 两个都跑
 *
 * icons-source/ 是本地素材目录（.gitignore 里已忽略），放 128x128 的 PNG，
 * 文件名必须等于 data.xlsx 里的英雄名。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(REPO, 'icons-source');
const ICON_DIR = path.join(REPO, 'champions');
const ICON_SIZE = 96;   // 卡片显示 44px，96 已覆盖 2 倍屏
const ICON_QUALITY = 82;

async function buildIcons(sharp) {
  if (!fs.existsSync(SRC_DIR)) {
    console.log(`跳过头像：没有找到 ${SRC_DIR}`);
    console.log('把 128x128 的 PNG 放进去再跑一次（文件名必须是英雄名）。');
    return;
  }

  fs.mkdirSync(ICON_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter(f => f.toLowerCase().endsWith('.png'));
  if (files.length === 0) {
    console.log(`跳过头像：${SRC_DIR} 里没有 PNG`);
    return;
  }

  let before = 0;
  let after = 0;
  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const dest = path.join(ICON_DIR, path.basename(file, path.extname(file)) + '.webp');
    await sharp(src).resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' }).webp({ quality: ICON_QUALITY }).toFile(dest);
    before += fs.statSync(src).size;
    after += fs.statSync(dest).size;
  }
  console.log(`头像 ${files.length} 张：${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024 / 1024).toFixed(2)}MB`);
}

async function buildShareAssets(sharp) {
  const svg = path.join(REPO, 'favicon.svg');
  if (!fs.existsSync(svg)) {
    console.log('跳过图标：没有找到 favicon.svg');
    return;
  }

  for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]]) {
    await sharp(svg, { density: 400 }).resize(size, size).png({ compressionLevel: 9 })
      .toFile(path.join(REPO, name));
  }

  // 分享封面：深底 + 金色菱形 + 标题
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#1a1a2e"/>
    <path d="M600 96 L664 160 L600 224 L536 160 Z" fill="#d4a853"/>
    <path d="M600 122 L638 160 L600 198 L562 160 Z" fill="#1a1a2e"/>
    <text x="600" y="330" text-anchor="middle" font-family="Microsoft YaHei, sans-serif"
          font-size="72" font-weight="bold" fill="#ffffff">符文大乱斗</text>
    <text x="600" y="400" text-anchor="middle" font-family="Microsoft YaHei, sans-serif"
          font-size="34" fill="#c9cdd6">英雄属性调整 · 实时查询</text>
    <rect x="500" y="448" width="200" height="3" fill="#d4a853"/>
    <text x="600" y="530" text-anchor="middle" font-family="Microsoft YaHei, sans-serif"
          font-size="26" fill="#8b93a1">biantaoya.github.io</text>
  </svg>`;
  await sharp(Buffer.from(cover)).png({ compressionLevel: 9 }).toFile(path.join(REPO, 'og-cover.png'));

  console.log('图标与分享封面已重新生成');
}

const { default: sharp } = await import('sharp');
const target = process.argv[2] || 'all';
if (target === 'icons' || target === 'all') await buildIcons(sharp);
if (target === 'share' || target === 'all') await buildShareAssets(sharp);
