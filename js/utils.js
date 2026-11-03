/* ============================================================
   utils.js — 通用工具：提示、格式化、气象换算
============================================================ */
window.App = window.App || {};

App.utils = {
  toast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2200);
  },

  escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },

  fmtTemp(t){ return (t==null||isNaN(t)) ? '—' : Math.round(t)+'°'; },
  fmtPerc(p){ return (p==null||isNaN(p)) ? '—' : Math.round(p)+'%'; },
  fmtTime(iso){
    if(!iso) return '—';
    const t = iso.split('T')[1] || '';
    return t.slice(0,5);
  },

  // 蒲福风级（入参 km/h）
  beaufort(kmh){
    if(kmh==null) return '—';
    const b = [[1,1],[6,2],[12,3],[20,4],[29,5],[39,6],[50,7],[62,8]];
    for(let i=0;i<b.length;i++) if(kmh<b[i][0]) return (i+1)+'级';
    return '8级+';
  },

  deg2dir(d){
    if(d==null) return '—';
    const dirs = ['北','东北偏北','东北','东北偏东','东','东南偏东','东南','东南偏南','南','西南偏南','西南','西南偏西','西','西北偏西','西北','西北偏北'];
    return dirs[Math.round(d/22.5)%16];
  },

  wmoCode(c){
    const m = {0:'晴',1:'大部晴',2:'多云',3:'阴',45:'雾',48:'冻雾',51:'小毛毛雨',53:'毛毛雨',55:'浓毛毛雨',
      56:'冻毛毛雨',57:'强冻毛毛雨',61:'小雨',63:'中雨',65:'大雨',66:'冻雨',67:'强冻雨',
      71:'小雪',73:'中雪',75:'大雪',77:'雪粒',80:'小阵雨',81:'阵雨',82:'强阵雨',
      85:'小阵雪',86:'大阵雪',95:'雷暴',96:'雷暴伴冰雹',99:'强雷暴冰雹'};
    return m[c] || ('代码'+c);
  },

  // 数组区间均值：自动跳过 null/NaN，无有效值时返回 null
  avg(arr, i0, i1){
    const s = arr.slice(i0, i1).filter(v => v != null && !isNaN(v));
    if(!s.length) return null;
    return s.reduce((a,b) => a+b, 0)/s.length;
  },

  // 在 hourly.time 中定位某天某小时的索引
  timeToIdx(hTimes, targetDateStr, hour){
    const hh = String(hour).padStart(2,'0');
    for(let i=0;i<hTimes.length;i++){
      if(hTimes[i].startsWith(targetDateStr) && hTimes[i].slice(11,13)===hh) return i;
    }
    return -1;
  },

  // 防抖
  debounce(fn, wait){
    let timer = null;
    return function(...args){
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
};
