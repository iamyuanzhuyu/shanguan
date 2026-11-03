/* ============================================================
   search.js — 搜索框（autocomplete.js）
   数据源按代价从低到高：
     1. 本地山峰库 peaks-db（零请求；热门路线 / 常见景区 / 广东徒步）
     2. 高德 POI（本地库无"强命中"时才请求，省高德配额）
     3. Mapbox 兜底（高德 key 失效 / 超限 / 查不到时）
     4. 经纬度直接识别（"27.47,114.17"）
============================================================ */
window.App = window.App || {};

App.search = (function(){
  let instance;

  function escapeHtml(s){ return App.utils.escapeHtml(s); }

  function init(){
    // autocomplete.js 未加载时降级：搜索按钮仍可用（本地库 + 高德 JSONP）
    if(typeof autocomplete !== 'function'){
      console.warn('[search] autocomplete.js 未加载，搜索下拉降级为按钮搜索');
      bindEnter();
      return false;
    }

    instance = autocomplete('#algoliaSearch', {
      hint: false,
      autoselect: true,
      minLength: 2,
      limit: 10,          // 每个数据源最多 10 条：同一个地名可能有多个行政区（如"大布镇"）
      debug: false,
      debounce: 250,
      appendTo: '.algolia-wrap',
      templates: {
        empty: '<div class="aa-empty">没有匹配结果。可直接输入经纬度（如 27.47,114.17）后回车，或点搜索框右侧「坐标」手动选点。<br><span style="font-size:11px">若高德/地图接口被浏览器扩展拦截，也会出现此提示。</span></div>',
        footer: '<div class="aa-footer">本地山峰库 → 高德 POI → Mapbox 兜底</div>'
      }
    }, [
      /* —— 数据集 1：本地山峰库（同步返回，无网络请求） —— */
      {
        name: 'local',
        source: (query, cb) => {
          cb(App.matchPeaks ? App.matchPeaks(query, 6) : []);
        },
        displayValue: i => i.name,
        templates: {
          header: '<div class="aa-dataset-name">本地山峰库 · 热门路线 / 景区 / 广东徒步</div>',
          suggestion: i =>
            `<div class="aa-item">
              <span class="aa-main">${escapeHtml(i.name)}</span>
              <span class="aa-sub">${escapeHtml(i.sub || '')}</span>
            </div>`
        }
      },

      /* —— 数据集 2：高德 POI（本地强命中时跳过，省额度） —— */
      {
        name: 'amap',
        source: remoteSource(),
        displayValue: i => i.name,
        templates: {
          header: '<div class="aa-dataset-name">高德地图 POI · 高德不可用时 Mapbox 兜底</div>',
          suggestion: i =>
            `<div class="aa-item">
              <span class="aa-main">${escapeHtml(i.name)}</span>
              <span class="aa-sub">${escapeHtml(i.sub || '')}</span>
            </div>`
        }
      },

      /* —— 数据集 3：经纬度 —— */
      {
        name: 'coord',
        source: coordSource(),
        displayValue: i => i.name,
        templates: {
          header: '<div class="aa-dataset-name">坐标</div>',
          suggestion: i =>
            `<div class="aa-item">
              <span class="aa-main">${escapeHtml(i.name)}</span>
              <span class="aa-sub">按经纬度直接选点</span>
            </div>`
        }
      }
    ]);

    instance.on('autocomplete:selected', (e, suggestion) => _select(suggestion));
    bindEnter();
    return true;
  }

  /* 高德建议：本地库已有精确/前缀命中、或输入的是经纬度时完全不请求（省高德配额） */
  function remoteSource(){
    let seq = 0;
    return (query, cb) => {
      const q = String(query == null ? '' : query).trim();
      const my = ++seq;
      if(q.length < 2 || parseCoord(q) || App.hasStrongLocalMatch(q)){ cb([]); return; }
      App.geocoder.suggestions(q)
        .then(list => {
          if(my !== seq) return;
          cb((list || []).filter(x => x.source !== 'local'));
        })
        .catch(() => { if(my === seq) cb([]); });
    };
  }

  /* 坐标识别："lat,lon"、"lat, lon"、"lat lon" */
  function coordSource(){
    return (query, cb) => {
      const c = parseCoord(query);
      cb(c ? [c] : []);
    };
  }

  function parseCoord(text){
    const m = String(text == null ? '' : text)
      .match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if(!m) return null;
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if(isNaN(lat) || isNaN(lon)) return null;
    if(lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { name: lat.toFixed(4) + ', ' + lon.toFixed(4), lat: lat, lon: lon, source: 'coord' };
  }

  /* 下拉未展开时按回车：直接走最佳结果 */
  function bindEnter(){
    const inputEl = document.getElementById('algoliaSearch');
    if(!inputEl || inputEl._bound) return;
    inputEl._bound = true;
    inputEl.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      // 下拉展开时 autocomplete.js 自己处理选中，这里不抢事件
      const open = document.querySelector('.aa-dropdown-menu');
      if(open && open.style.display !== 'none' && open.offsetParent !== null) return;
      submit();
    });
  }

  /* 点「搜索」按钮 / 回车：坐标 → 本地库 → 高德 → Mapbox */
  async function submit(){
    const inputEl = document.getElementById('algoliaSearch');
    const q = (inputEl && inputEl.value ? inputEl.value : '').trim();
    if(!q) return;

    const coord = parseCoord(q);
    if(coord){ _select(coord); return; }

    // 1) 本地山峰库优先：命中即用，不消耗高德额度
    const local = App.matchPeaks ? App.matchPeaks(q, 6) : [];
    if(local.length){ _select(local[0]); return; }

    // 2) 高德 → Mapbox 兜底
    if(inputEl) inputEl.setAttribute('aria-busy', 'true');
    try{
      const list = await App.geocoder.forward(q);
      if(list && list.length){ _select(list[0]); return; }
      // 没有任何命中：弹出对话框让用户手动输入经纬度
      App.utils.toast('未找到该地名，可手动输入经纬度');
      if(App.coordDialog) App.coordDialog.open({ name: q });
    }catch(e){
      App.utils.toast('搜索失败：' + ((e && e.message) || '未知错误'));
      if(App.coordDialog) App.coordDialog.open({ name: q });
    }finally{
      if(inputEl) inputEl.removeAttribute('aria-busy');
    }
  }

  /* 选中候选：没有坐标的行政地名（如"大布镇"）先解析坐标，再查天气 */
  async function _select(item){
    if(!item) return;

    if(item._needResolve){
      App.utils.toast('正在解析「' + item.name + '」的坐标…');
      const resolved = await App.geocoder.resolveTip(item);
      if(!resolved){
        App.utils.toast('未能解析该地名坐标，可手动输入经纬度');
        if(App.coordDialog) App.coordDialog.open({ name: item.name });
        return;
      }
      item = resolved;
    }

    if(typeof item.lat !== 'number' || typeof item.lon !== 'number'){
      App.utils.toast('该结果缺少坐标，请换一个');
      return;
    }
    if(item.source === 'mapbox'){
      App.utils.toast('高德不可用，已使用 Mapbox 近似坐标，请核对位置');
    }
    App.STATE.lat = item.lat;
    App.STATE.lon = item.lon;
    App.STATE.placeName = item.name;
    const inputEl = document.getElementById('algoliaSearch');
    if(inputEl) inputEl.value = item.name;
    if(App.mapModule && App.mapModule.map) App.mapModule.flyTo(item.lat, item.lon);
    App.loadWeather();
  }

  return { init: init, submit: submit };
})();
