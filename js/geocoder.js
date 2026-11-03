/* ============================================================
   geocoder.js — 地名 → 坐标
   数据源优先级（按请求成本从低到高）：
     1. 本地山峰库 peaks-db（纯本地、零请求；热门山名基本都在这里）
     2. 高德 Web 服务（inputtips 建议 / place-text 精确搜索 / regeo 逆地理）
     3. Mapbox Geocoding v6（兜底：高德 key 失效、超限或查不到时）
   高德返回 GCJ-02（火星坐标），这里统一转成 WGS-84 再交给天气和地图；
   Mapbox 返回的本身就是 WGS-84，无需纠偏。

   两个容易踩的坑：
     · 高德 inputtips 对"乡镇/行政区"类提示（如"大布镇"）不返回 location，
       这里会保留这些候选，等用户点选时再用 place/text + adcode 解析坐标；
     · 空结果不再写缓存：高德瞬时超限/网络抖动时，不会把"没有结果"记住 5 分钟。

   省额度策略：
     - 本地库"强命中"（精确/前缀）时，下拉建议不再请求高德；
     - 所有高德/Mapbox 结果按查询词做 5 分钟内存缓存，重复查询零请求；
     - 只有按下搜索且本地库无结果时才走网络。
============================================================ */
window.App = window.App || {};

App.geocoder = (function(){
  const CACHE_TTL = 5 * 60 * 1000;
  const REQUEST_TIMEOUT = 9000;
  const cache = new Map();
  let jsonpSeq = 0;

  /* ---------- 内存缓存：undefined 表示未命中，null 也会被缓存 ---------- */
  function cacheGet(key){
    const hit = cache.get(key);
    if(!hit) return undefined;
    if(Date.now() - hit.t > CACHE_TTL){ cache.delete(key); return undefined; }
    return hit.v;
  }
  function cacheSet(key, value){
    if(cache.size > 200) cache.clear();   // 简单容量保护
    cache.set(key, { t: Date.now(), v: value });
    return value;
  }

  /* ---------- 高德：JSONP（file:// 下无 CORS 问题） ---------- */
  function jsonp(baseUrl, params, timeout){
    return new Promise((resolve, reject) => {
      const cbName = 'amapCb_' + (++jsonpSeq) + '_' + Date.now();
      const script = document.createElement('script');
      let timer = null;
      function cleanup(){
        clearTimeout(timer);
        try{ delete window[cbName]; }catch(e){ window[cbName] = undefined; }
        if(script.parentNode) script.parentNode.removeChild(script);
      }
      timer = setTimeout(() => { cleanup(); reject(new Error('高德接口超时')); }, timeout || REQUEST_TIMEOUT);
      window[cbName] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('高德接口网络失败')); };
      const qs = Object.keys(params)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
      script.src = baseUrl + '?' + qs + '&callback=' + cbName;
      document.head.appendChild(script);
    });
  }

  /* 高德 JSONP 失败（网络抖动/瞬时超限）时自动重试一次 */
  async function jsonpRetry(baseUrl, params, timeout){
    try{
      return await jsonp(baseUrl, params, timeout);
    }catch(e){
      await new Promise(r => setTimeout(r, 350));
      return jsonp(baseUrl, params, timeout);
    }
  }

  /* GCJ-02 → WGS-84 */
  function gcjToWgs(lng, lat){
    const w = App.coordTransform.gcjToWgs(lng, lat);
    return { lat: w.lat, lon: w.lng };
  }

  function amapFailReason(data){
    if(!data) return '无响应';
    if(data.status === '1') return '';
    return (data.info || '未知错误') + (data.infocode ? ' (' + data.infocode + ')' : '');
  }

  function wgsFromLocation(loc){
    const parts = String(loc).split(',').map(Number);
    if(parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return null;
    return gcjToWgs(parts[0], parts[1]);
  }

  function shortDistrict(district){
    if(!district) return '';
    const parts = String(district).split(/[省市]/).filter(Boolean);
    return parts[parts.length - 1] || district;
  }

  /* 输入提示：下拉建议用
     - 有坐标的 POI 直接可用；
     - 乡镇/行政区提示高德不给坐标，标记 _needResolve，点选时再解析。 */
  async function amapTips(query){
    const cfg = App.CONFIG;
    const data = await jsonpRetry(cfg.AMAP_TIPS_URL, {
      keywords: query, key: cfg.AMAP_KEY, datatype: 'all', output: 'json'
    });
    if(!data || data.status !== '1'){
      App.geocoder.lastAmapError = amapFailReason(data);
      console.warn('[geocoder] 高德 inputtips 未返回有效结果：', App.geocoder.lastAmapError);
      return [];
    }
    App.geocoder.lastAmapError = '';
    return (data.tips || []).map(t => {
      if(!t || !t.name) return null;
      const district = typeof t.district === 'string' ? t.district : '';
      const adcode = typeof t.adcode === 'string' ? t.adcode : '';
      if(typeof t.location === 'string' && t.location.indexOf(',') > -1){
        const wgs = wgsFromLocation(t.location);
        if(!wgs) return null;
        return {
          name: t.name,
          sub: '高德 · ' + (district || 'POI'),
          lat: wgs.lat, lon: wgs.lon,
          source: 'amap'
        };
      }
      // 没有坐标的行政地名：保留候选，选中时用 adcode 解析
      if(!district && !adcode) return null;
      return {
        name: t.name,
        sub: '高德 · ' + (district || '地名') + '（点击后定位）',
        source: 'amap',
        _needResolve: true,
        district: district,
        adcode: adcode
      };
    }).filter(Boolean);
  }

  /* POI 文本搜索（可按 adcode 限定城市） */
  async function amapForward(query, opts){
    const cfg = App.CONFIG;
    const params = {
      keywords: query, key: cfg.AMAP_KEY, offset: cfg.SUGGEST_LIMIT,
      page: 1, extensions: 'base', output: 'json'
    };
    if(opts && opts.city){ params.city = opts.city; params.citylimit = 'true'; }
    const data = await jsonpRetry(cfg.AMAP_TEXT_URL, params);
    if(!data || data.status !== '1'){
      App.geocoder.lastAmapError = amapFailReason(data);
      console.warn('[geocoder] 高德 place/text 未返回有效结果：', App.geocoder.lastAmapError);
      return [];
    }
    App.geocoder.lastAmapError = '';
    return (data.pois || [])
      .filter(p => p && typeof p.location === 'string' && p.location.indexOf(',') > -1)
      .map(p => {
        const wgs = wgsFromLocation(p.location);
        if(!wgs) return null;
        const region = [p.pname, p.cityname, p.adname]
          .filter((v, i, a) => typeof v === 'string' && v && a.indexOf(v) === i).join(' · ');
        return {
          name: p.name,
          sub: '高德 · ' + (region || 'POI') + (typeof p.type === 'string' && p.type ? '｜' + p.type.split(';')[0] : ''),
          lat: wgs.lat, lon: wgs.lon,
          source: 'amap'
        };
      })
      .filter(Boolean);
  }

  /* 解析"无坐标"的行政地名候选（如 大布镇 → 乳源瑶族自治县大布镇人民政府） */
  async function resolveTip(item){
    if(!item || !item._needResolve) return item;
    const key = 'resolve:' + (item.adcode || '') + ':' + item.name;
    const hit = cacheGet(key);
    if(hit !== undefined) return hit;

    let out = null;
    try{
      const list = await amapForward(item.name, { city: item.adcode || undefined });
      if(list.length){
        const first = list[0];
        const label = shortDistrict(item.district) || shortDistrict(first.sub.replace('高德 · ', '').split('｜')[0]);
        out = {
          name: item.name + (label ? '（' + label + '）' : ''),
          sub: first.sub,
          lat: first.lat, lon: first.lon,
          source: 'amap'
        };
      }
    }catch(e){
      console.warn('[geocoder] 解析行政区坐标失败：', e && e.message);
    }

    // 高德解析不出来时退回 Mapbox 兜底
    if(!out){
      const mb = await mapboxForward(item.district ? item.district + item.name : item.name);
      if(mb && mb.length) out = mb[0];
    }
    return cacheSet(key, out);
  }

  /* 逆地理：坐标 → 地名 */
  async function amapReverse(lat, lon){
    const cfg = App.CONFIG;
    const gcj = App.coordTransform.wgsToGcj(lon, lat);
    const data = await jsonpRetry(cfg.AMAP_REGEO_URL, {
      location: gcj.lng.toFixed(6) + ',' + gcj.lat.toFixed(6),
      key: cfg.AMAP_KEY, extensions: 'base', output: 'json', radius: 1000
    });
    if(data && data.status === '1' && data.regeocode && data.regeocode.formatted_address){
      return data.regeocode.formatted_address;
    }
    if(data && data.status !== '1'){
      App.geocoder.lastAmapError = amapFailReason(data);
      console.warn('[geocoder] 高德 regeo 未返回有效结果：', App.geocoder.lastAmapError);
    }
    return null;
  }

  /* ---------- Mapbox Geocoding v6（兜底） ---------- */
  async function mapboxRequest(path, params){
    const cfg = App.CONFIG;
    const qs = new URLSearchParams(Object.assign({
      access_token: cfg.MAPBOX_TOKEN,
      language: 'zh-Hans'
    }, params)).toString();
    const url = cfg.MAPBOX_GEOCODE_URL + path + '?' + qs;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    try{
      const r = await window.fetch(url, { signal: ctrl.signal });
      if(!r.ok){
        console.warn('[geocoder] Mapbox 地理编码失败 HTTP ' + r.status);
        return null;
      }
      return await r.json();
    }catch(e){
      console.warn('[geocoder] Mapbox 地理编码请求异常：', e && e.message);
      return null;
    }finally{
      clearTimeout(timer);
    }
  }

  function mapboxFeature(f){
    const p = (f && f.properties) || {};
    const c = (f && f.geometry && f.geometry.coordinates) || [];
    if(typeof c[1] !== 'number' || typeof c[0] !== 'number') return null;
    if(p.feature_type === 'postcode') return null;   // 邮编结果没有选点意义
    return {
      name: p.name_preferred || p.name || '未命名地点',
      sub: 'Mapbox 兜底 · ' + (p.place_formatted || p.full_address || '近似结果'),
      lat: c[1], lon: c[0],
      source: 'mapbox'
    };
  }

  async function mapboxForward(query){
    const j = await mapboxRequest('/forward', {
      q: query, limit: 6, country: 'cn'
    });
    if(!j || !Array.isArray(j.features)) return [];
    return j.features.map(mapboxFeature).filter(Boolean);
  }

  async function mapboxReverse(lat, lon){
    const j = await mapboxRequest('/reverse', {
      longitude: lon, latitude: lat, limit: 1,
      types: 'place,locality,neighborhood,address,district,region'
    });
    if(!j || !Array.isArray(j.features) || !j.features.length) return null;
    const item = mapboxFeature(j.features[0]);
    if(!item) return null;
    return item.name;
  }

  /* ---------- 合并与去重：本地库优先 ----------
     同名不代表同一地点（"大布镇"山东、广东都有），所以：
       · 本地库与远端同名 → 本地库优先，去重；
       · 远端与远端同名但行政区/地址不同 → 两条都保留。 */
  function mergeLocalFirst(local, remote, limit){
    const out = local.slice();
    (remote || []).forEach(r => {
      if(!r) return;
      const dup = out.some(x => {
        if(x.name !== r.name) return false;
        if(x.source === 'local' || r.source === 'local') return true;
        return (x.sub || '') === (r.sub || '');
      });
      if(!dup) out.push(r);
    });
    return out.slice(0, limit || App.CONFIG.SUGGEST_LIMIT);
  }

  /* ---------- 对外 API ---------- */

  /* 下拉建议：本地库优先；强命中时直接返回，不打高德 */
  async function suggestions(query){
    const q = String(query == null ? '' : query).trim();
    if(q.length < 2) return [];
    const local = App.matchPeaks(q, 6);
    if(App.hasStrongLocalMatch(q)) return local;

    const key = 'sugg:' + q.toLowerCase();
    let remote = cacheGet(key);
    if(remote === undefined){
      remote = [];
      try{
        remote = await amapTips(q);
      }catch(e){
        console.warn('[geocoder] 高德建议失败，改用 Mapbox 兜底：', e && e.message);
      }
      if(!remote.length) remote = await mapboxForward(q);
      remote = remote.slice(0, 10);
      if(remote.length) cacheSet(key, remote);   // 空结果不缓存，避免瞬时失败被记住 5 分钟
    }
    return mergeLocalFirst(local, remote, App.CONFIG.SUGGEST_LIMIT);
  }

  /* 精确搜索：本地库无结果时调用（高德 → Mapbox） */
  async function forward(query){
    const q = String(query == null ? '' : query).trim();
    if(q.length < 2) return [];
    const key = 'fwd:' + q.toLowerCase();
    let list = cacheGet(key);
    if(list === undefined){
      list = [];
      try{
        list = await amapForward(q);
      }catch(e){
        console.warn('[geocoder] 高德搜索失败，改用 Mapbox 兜底：', e && e.message);
      }
      if(!list.length) list = await mapboxForward(q);
      list = list.slice(0, 8);
      if(list.length) cacheSet(key, list);
    }
    return list;
  }

  /* 兼容旧接口：只走高德输入提示 */
  async function tips(query){
    const q = String(query == null ? '' : query).trim();
    if(q.length < 2) return [];
    try{
      return await amapTips(q);
    }catch(e){
      console.warn('[geocoder] 高德 inputtips 失败：', e && e.message);
      return [];
    }
  }

  /* 逆地理：高德 → Mapbox → null */
  async function reverse(lat, lon){
    if(typeof lat !== 'number' || typeof lon !== 'number') return null;
    const key = 'rev:' + lat.toFixed(4) + ',' + lon.toFixed(4);
    const hit = cacheGet(key);
    if(hit !== undefined) return hit;
    let name = null;
    try{
      name = await amapReverse(lat, lon);
    }catch(e){
      console.warn('[geocoder] 高德逆地理失败，改用 Mapbox 兜底：', e && e.message);
    }
    if(!name) name = await mapboxReverse(lat, lon);
    return cacheSet(key, name);
  }

  return {
    suggestions: suggestions,
    forward: forward,
    tips: tips,
    reverse: reverse,
    resolveTip: resolveTip,
    lastAmapError: ''
  };
})();
