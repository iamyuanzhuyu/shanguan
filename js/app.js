/* ============================================================
   app.js — 应用入口：事件绑定、天气加载、启动
   搜索框由 search.js 接管（高德 POI + 坐标识别）

   关键点：
     - 天气请求不依赖 mapbox-gl / echarts / autocomplete 等 CDN 脚本：
       任何一个第三方库加载失败，都只降级对应模块，天气照常出数据
     - 启动时各模块独立 try/catch，互不牵连
     - {main, cmp} 中主预报必需，多模型对比失败自动降级
============================================================ */
(function(){
  const u = App.utils;
  const S = App.STATE;
  let loadSeq = 0;

  /* 第三方库备用 CDN：静态 <script> 被拦截时由 deps.js 补载 */
  const FALLBACK_CDN = {
    mapboxgl: [
      'https://unpkg.com/mapbox-gl@3.6.0/dist/mapbox-gl.js',
      'https://cdn.jsdelivr.net/npm/mapbox-gl@3.6.0/dist/mapbox-gl.js'
    ],
    echarts: [
      'https://cdn.bootcdn.net/ajax/libs/echarts/5.5.0/echarts.min.js',
      'https://cdn.staticfile.net/echarts/5.5.0/echarts.min.js'
    ],
    autocomplete: [
      'https://unpkg.com/autocomplete.js@0.38.1/dist/autocomplete.min.js',
      'https://cdn.jsdelivr.net/npm/autocomplete.js@0.38.1/dist/autocomplete.min.js'
    ]
  };

  /* ===== 天气加载（带竞态保护：仅最后一次请求可渲染） ===== */
  App.loadWeather = async function(){
    const my = ++loadSeq;
    const resultEl = document.getElementById('result');
    document.title = '山观 · 徒步登山天气与景观预测';
    resultEl.innerHTML =
      `<div class="empty"><div class="loading"></div> 正在获取 ${u.escapeHtml(S.placeName)} 的多模型预报…</div>`;
    try{
      const data = await App.weather.fetch(S.lat, S.lon);
      if(my !== loadSeq) return; // 已有更新的请求，丢弃过期响应
      const main = data.main, cmp = data.cmp;
      S.hourly = main.hourly;
      S.daily = main.daily;
      // 出行日越界时自动夹取，防止切换天数后白屏
      S.tripDay = Math.min(S.tripDay, main.daily.time.length - 1);
      // 海拔优先取 Mapbox 地形实测，失败回退天气服务网格值
      let terrainAlt = null;
      try{ terrainAlt = App.mapModule ? App.mapModule.sampleElevation(S.lat, S.lon) : null; }catch(e){}
      S.elevation = terrainAlt != null ? terrainAlt : (main.elevation || S.elevation);
      S.cmp = cmp;
      App.renderer.renderAll();
      App.storage.save();
    }catch(e){
      if(my !== loadSeq) return;
      if(e && (e.name === 'AbortError')) return;
      console.error('[weather] 加载失败', e);
      // 网络类错误给出可读提示，而不是浏览器原生的 "Failed to fetch"
      const msg = (e && e.name === 'TypeError')
        ? '网络连接失败：无法访问天气服务（api.open-meteo.com），请检查网络或代理设置'
        : (e && e.message) || '未知错误';
      resultEl.innerHTML =
        `<div class="empty"><h2>天气数据获取失败</h2>
          <p>${u.escapeHtml(msg)}</p>
          <p style="font-size:12px;color:var(--ink-3);margin-top:6px">请检查网络后重试；也可点击上方热门路线、或手动输入坐标查询。</p>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
            <button id="retryWeather" type="button" style="height:34px;padding:0 18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink-2);font-size:13px">重试</button>
            <button type="button" data-action="coord-dialog" style="height:34px;padding:0 18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink-2);font-size:13px">手动输入经纬度</button>
          </div>
        </div>`;
      const btn = document.getElementById('retryWeather');
      if(btn) btn.onclick = () => App.loadWeather();
    }
  };

  /* ===== 手动输入经纬度入口（空状态 / 天气失败卡片里的按钮） ===== */
  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-action="coord-dialog"]') : null;
    if(!btn) return;
    e.preventDefault();
    if(App.coordDialog) App.coordDialog.open();
  });

  /* ===== 搜索按钮 ===== */
  const searchBtn = document.getElementById('searchBtn');
  if(searchBtn) searchBtn.onclick = () => App.search.submit();

  /* ===== 分享 ===== */
  const shareBtn = document.getElementById('shareBtn');
  if(shareBtn) shareBtn.onclick = async () => {
    const text = `「${S.placeName}」登山天气与景观预测，坐标 ${S.lat.toFixed(4)},${S.lon.toFixed(4)}`;
    if(navigator.share){
      try{ await navigator.share({ title: '山观 · 登山天气', text: text }); }catch(e){}
    }else{
      try{
        await navigator.clipboard.writeText(text);
        u.toast('地点信息已复制，可粘贴分享');
      }catch(e){ u.toast('当前浏览器不支持分享'); }
    }
  };

  /* ===== 定位我 ===== */
  const locateBtn = document.getElementById('locateBtn');
  if(locateBtn) locateBtn.onclick = () => {
    if(!navigator.geolocation){ u.toast('浏览器不支持定位'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      S.lat = pos.coords.latitude; S.lon = pos.coords.longitude;
      S.placeName = await App.geocoder.reverse(S.lat, S.lon).catch(() => '我的位置');
      if(App.mapModule && App.mapModule.map) App.mapModule.flyTo(S.lat, S.lon);
      App.loadWeather();
    }, () => u.toast('定位失败'));
  };

  /* ===== 轨迹上传 ===== */
  const fileInput = document.getElementById('fileInput');
  if(fileInput) fileInput.addEventListener('change', async e => {
    const f = e.target.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      const ext = f.name.split('.').pop().toLowerCase();
      const pts = App.trail.parse(text, ext);
      if(pts.length===0){ u.toast('未能解析轨迹点'); return; }

      const nodes = App.trail.pickNodes(pts);
      const stats = App.trail.stats(pts);
      const rep = App.trail.pickRepresentative(pts);
      if(!rep){ u.toast('轨迹缺少有效坐标'); return; }

      S.trail = { points: pts, nodes: nodes, stats: stats, rep: rep, fileName: f.name };
      App.mapModule.drawTrail(S.trail);
      if(App.mapModule.marker) App.mapModule.marker.setLngLat([rep.lon, rep.lat]);

      document.getElementById('trailInfo').textContent =
        `已加载 ${pts.length} 个轨迹点 · ${(stats.dist/1000).toFixed(1)} km · 爬升 ${Math.round(stats.ascent)} m · 最高点 ${stats.maxAlt!=null?Math.round(stats.maxAlt)+' m':'未知'}`;

      // 天气是区域网格数据：整条轨迹只取一个代表点（默认最高点）查一次，
      // 这份预报即代表轨迹所在区域，不再逐点请求。
      S.lat = rep.lat;
      S.lon = rep.lon;
      S.placeName = trailLabel(f.name, rep);
      App.loadWeather();
    }catch(err){
      u.toast('轨迹解析失败：' + ((err && err.message) || '未知错误'));
      console.warn('[trail] 解析失败', err);
    }finally{
      e.target.value = '';   // 允许再次选择同一个文件
    }
  });

  /* 轨迹面板标题：优先用文件名；太泛的文件名（track/trail/轨迹…）用区域坐标 */
  function trailLabel(fileName, rep){
    const base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
    const generic = !base || /^(gpx|kml|track|trail|route|export|test|untitled|无标题|轨迹|路线|路径|新建)/i.test(base);
    if(generic) return `轨迹区域 ${rep.lat.toFixed(3)}, ${rep.lon.toFixed(3)}`;
    return (base.length > 20 ? base.slice(0, 20) + '…' : base) + ' · 轨迹区域';
  }

  /* ===== 启动：恢复记忆 → 天气优先 → 依赖兜底 → 地图/搜索 ===== */
  async function boot(){
    // 1) 恢复上次地点/偏好（异常不影响主流程）
    try{ App.storage.restore(); }catch(e){ console.warn('[boot] 状态恢复失败', e); }

    // 2) 天气优先：不等待任何第三方 CDN 脚本
    App.loadWeather();

    // 3) 第三方库兜底：静态 CDN 失败时换备用源
    try{
      if(App.deps && App.deps.ensure){
        await Promise.allSettled([
          App.deps.ensure('mapboxgl', FALLBACK_CDN.mapboxgl),
          App.deps.ensure('echarts', FALLBACK_CDN.echarts),
          App.deps.ensure('autocomplete', FALLBACK_CDN.autocomplete)
        ]);
      }
    }catch(e){ console.warn('[boot] 备用 CDN 加载失败', e); }

    // 4) 各模块独立初始化，一个失败不影响其他
    try{ App.mapModule.init(); }catch(e){ console.error('[boot] 地图初始化失败', e); }
    try{ App.search.init(); }catch(e){ console.error('[boot] 搜索初始化失败', e); }
    try{ App.renderer.renderChips(); }catch(e){ console.error('[boot] 热门路线渲染失败', e); }
    try{ if(App.coordDialog) App.coordDialog.init(); }catch(e){ console.warn('[boot] 坐标输入框初始化失败', e); }

    // 5) 若天气先到、图表库后到，补一次重绘（命中缓存，无额外请求）
    if(App.renderer && App.renderer._chartPending && S.hourly){
      try{
        App.renderer.renderAll();
      }catch(e){ console.error('[boot] 补绘失败', e); }
    }
  }

  boot();
})();
