/* ============================================================
   训练日记 · 离线单文件构建器（tools/build-offline.js）
   目的：生成一个**完全不依赖任何服务器（包括 GitHub Pages）**的单文件 HTML，
   内联全部样式 / 脚本 / 图片，可直接：
     · 用手机浏览器打开后「保存到本地」离线使用；
     · 拷到任意静态空间托管（无需仓库）；
     · 作为交付包里的「构建产物」。
   用法：node tools/build-offline.js   →  dist/offline.html
   说明：桌宠图片与壁纸以 base64 内联，文件体积约 1MB，属预期。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'offline.html');

const read = p => fs.readFileSync(path.join(ROOT, p));
const text = p => read(p).toString('utf8');
const du = (p, mime) => 'data:' + mime + ';base64,' + read(p).toString('base64');

const ASSET_MAP = {
  'assets/icon.svg':           du('assets/icon.svg', 'image/svg+xml'),
  'assets/icon-192.png':       du('assets/icon-192.png', 'image/png'),
  'assets/icon-512.png':       du('assets/icon-512.png', 'image/png'),
  'assets/nahida-card.webp':   du('assets/nahida-card.webp', 'image/webp'),
  'assets/nahida-icon.webp':   du('assets/nahida-icon.webp', 'image/webp'),
};

let html = text('index.html');
const css = text('styles.css');
const app = text('app.js');

// 1) 内联样式（去掉原 <link rel="stylesheet">）
// 注意：必须用**函数形式**的替换 —— 若直接传字符串，源码里出现的 $' / $& / $`
// 会被 replace 当作特殊符号展开，把 HTML 尾部注入到脚本中间（真实踩过的坑）
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, () => '<style>\n' + css + '\n</style>');
// 2) 内联脚本（defer 去掉，直接同步执行保证 boot 时机一致）
html = html.replace(/<script src="app\.js" defer><\/script>/, () => '<script>\n' + app + '\n</script>');
// 3) manifest 移除（单文件无独立 manifest；PWA 安装请用在线版）
html = html.replace(/<link rel="manifest" href="manifest\.json">/, '');
// 4) 预加载指令对 dataURI 无意义，移除
html = html.replace(/<link rel="preload" href="styles\.css" as="style">\s*/, '');
html = html.replace(/<link rel="preload" href="app\.js" as="script">\s*/, '');
// 5) 所有静态资源引用 → data URI（styles.css 内的引用已被 1) 一并内联进 html）
for (const [k, v] of Object.entries(ASSET_MAP)) {
  html = html.split(k).join(v);
}
// 6) 关键：单文件不再注册 Service Worker（file:// 下本就无效，省一次报错）
html = html.replace(
  /if\('serviceWorker' in navigator[\s\S]*?navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(\(\)=>\{\}\);\s*\}/,
  () => "/* 离线单文件版：不注册 Service Worker（无 sw.js 可缓存，全部资源已内联） */"
);
// 7) 标注构建信息
html = html.replace(
  '<!--\n  训练日记 · 居家哑铃训练记录 App（纯前端单页，数据只存本机）',
  () => '<!--\n  训练日记 · 离线单文件构建版（由 tools/build-offline.js 生成，请勿手改）\n  在线正式版：https://wage98.github.io/boji-diary/\n  仓库：https://github.com/wage98/boji-diary\n  ——\n  原始：训练日记 · 居家哑铃训练记录 App（纯前端单页，数据只存本机）'
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('✔ 已生成 dist/offline.html（' + kb + ' KB）');
// 自检：产物里不得再出现任何本地资源引用
const bad = ['styles.css"', 'app.js"', 'assets/icon', 'assets/nahida'].filter(k => html.indexOf(k) >= 0);
if (bad.length) { console.error('✘ 仍有未内联引用：', bad); process.exit(1); }
console.log('✔ 自检通过：无外部资源引用，可完全离线打开');
