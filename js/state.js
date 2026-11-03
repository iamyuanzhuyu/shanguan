/* ============================================================
   state.js — 全局状态与静态数据
============================================================ */
window.App = window.App || {};

App.STATE = {
  lat: 27.4686, lon: 114.1714, // 默认武功山金顶
  placeName: '武功山金顶（示例）',
  elevation: 1918,
  days: 7,
  tripDay: 1, // 出行日在 daily 数组中的下标（0=今天, 1=明天）
  hourly: null, daily: null, cmp: null, models: [],
  trail: null, // {points:[{lat,lon,alt,name}], nodes:[...]}
  prefs: { sunrise:true, seaofclouds:true, stars:false, camping:false, newbie:false, night:false, kids:false }
};

/* ============================================================
   首页快捷按钮分组：数据全部来自 peaks-db，这里不再重复维护坐标。
   - pick：从 App.PEAKS_DB 里挑选条目
   - sort：可选排序（未指定则沿用 peaks-db 顺序）
   新增山峰时只需改 peaks-db：
     · 广东条目（cat:'gd'）自动进入"广东热门"横排；
     · 想进"经典"横排就给条目加 home: 序号（1 最靠前）。
============================================================ */
App.CHIP_GROUP_DEFS = [
  { label: '经典', pick: p => typeof p.home === 'number', sort: (a, b) => a.home - b.home },
  { label: '广东热门', pick: p => p.cat === 'gd' }
];

App.buildChipGroups = function(){
  const db = App.PEAKS_DB || [];
  return App.CHIP_GROUP_DEFS.map(def => {
    let list = db.filter(def.pick);
    if(def.sort) list = list.slice().sort(def.sort);
    return {
      label: def.label,
      places: list.map(p => ({ n: p.n, lat: p.lat, lon: p.lon, region: p.region || '', elev: p.elev }))
    };
  }).filter(g => g.places.length);
};

App.PREFS = [
  {k:'sunrise', l:'想看日出'},
  {k:'seaofclouds', l:'想看云海'},
  {k:'stars', l:'想看星空'},
  {k:'camping', l:'计划露营'},
  {k:'newbie', l:'新手'},
  {k:'night', l:'夜爬'},
  {k:'kids', l:'带儿童'},
];
