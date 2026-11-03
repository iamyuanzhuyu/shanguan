/* ============================================================
   storage.js — localStorage 记忆：上次地点、偏好、预报天数
   file:// 下同源存储可用；异常时静默降级不影响主流程
============================================================ */
window.App = window.App || {};

App.storage = (function(){
  const KEY = 'shanguan_state_v1';

  function save(){
    try{
      const S = App.STATE;
      localStorage.setItem(KEY, JSON.stringify({
        lat: S.lat, lon: S.lon, placeName: S.placeName,
        days: S.days, tripDay: S.tripDay, prefs: S.prefs
      }));
    }catch(e){ /* 隐私模式等场景忽略 */ }
  }

  function restore(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return false;
      const d = JSON.parse(raw);
      const S = App.STATE;
      if(typeof d.lat === 'number' && typeof d.lon === 'number'){
        S.lat = d.lat; S.lon = d.lon;
        S.placeName = d.placeName || S.placeName;
      }
      if(d.days === 3 || d.days === 7) S.days = d.days;
      if(Number.isInteger(d.tripDay)) S.tripDay = d.tripDay;
      if(d.prefs) Object.assign(S.prefs, d.prefs);
      return true;
    }catch(e){ return false; }
  }

  return { save, restore };
})();
