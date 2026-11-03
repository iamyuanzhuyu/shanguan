/* ============================================================
   check-peaks.js — 校验本地山峰库（js/peaks-db.js）
   用法：node scripts/check-peaks.js
   校验项：名称/别名重复、坐标范围、分类合法性、海拔范围、行政区缺失
============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'js', 'peaks-db.js');
// 让 sandbox 自己充当 window，这样文件里的 window.App = ... 也能让裸 App 可解析
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'peaks-db.js' });

const App = sandbox.window.App || {};
const db = App.PEAKS_DB || [];
const cats = Object.keys(App.PEAK_CATS || {});
const errors = [];
const names = new Set();
const aliasIndex = new Map();
const homeOrder = new Map();
let gdCount = 0;

db.forEach((p, i) => {
  const tag = `#${i} ${p.n || '(无名)'}`;
  if(!p.n) errors.push(`${tag}: 缺少 n`);
  if(names.has(p.n)) errors.push(`${tag}: 名称重复`);
  names.add(p.n);
  if(typeof p.lat !== 'number' || !(p.lat >= -90 && p.lat <= 90)) errors.push(`${tag}: lat 非法 ${p.lat}`);
  if(typeof p.lon !== 'number' || !(p.lon >= -180 && p.lon <= 180)) errors.push(`${tag}: lon 非法 ${p.lon}`);
  if(!cats.includes(p.cat)) errors.push(`${tag}: cat 非法 ${p.cat}`);
  if(p.elev != null && (typeof p.elev !== 'number' || p.elev < -500 || p.elev > 9000)){
    errors.push(`${tag}: elev 非法 ${p.elev}`);
  }
  if(!p.region) errors.push(`${tag}: 缺少 region`);
  // home 序号：首页"经典"快捷按钮的排序位，必须唯一
  if(p.home != null){
    if(!Number.isInteger(p.home) || p.home < 1 || p.home > 99){
      errors.push(`${tag}: home 序号非法 ${p.home}（应为 1~99 的整数）`);
    }else{
      const prev = homeOrder.get(p.home);
      if(prev) errors.push(`${tag}: home 序号 ${p.home} 与「${prev}」重复`);
      homeOrder.set(p.home, p.n);
    }
  }
  if(p.cat === 'gd') gdCount++;
  [p.n].concat(p.aliases || []).forEach(a => {
    const k = String(a == null ? '' : a).toLowerCase();
    if(!k){ errors.push(`${tag}: 空别名`); return; }
    const prev = aliasIndex.get(k);
    if(prev && prev !== p.n) errors.push(`${tag}: 别名"${a}"与「${prev}」重复`);
    aliasIndex.set(k, p.n);
  });
});

const byCat = {};
db.forEach(p => { byCat[p.cat] = (byCat[p.cat] || 0) + 1; });
console.log(`本地山峰库：${db.length} 条，别名 ${aliasIndex.size} 个`);
cats.forEach(k => console.log(`  ${App.PEAK_CATS[k]}: ${byCat[k] || 0} 条`));
console.log(`首页快捷按钮：经典 ${homeOrder.size} 个（home 序号 1~${Math.max(0, ...homeOrder.keys())}）、广东热门 ${gdCount} 个`);

if(errors.length){
  console.error(`\n发现 ${errors.length} 个问题：`);
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
}
console.log('校验通过 ✔');
