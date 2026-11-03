/* ============================================================
   map-module.js — Mapbox GL JS 地图封装
   - 初始化户外风格底图
   - 选点标记、点击选点、轨迹绘制
============================================================ */
window.App = window.App || {};

App.mapModule = {
  map: null,
  marker: null,
  _trailLoaded: false,

  init(){
    // 地图库缺失（CDN 被拦截且备用源也失败）时只降级地图，天气照常可用
    if(typeof mapboxgl === 'undefined'){
      console.warn('[map] Mapbox GL JS 未加载，地图模块降级');
      return false;
    }
    const cfg = App.CONFIG;
    mapboxgl.accessToken = cfg.MAPBOX_TOKEN;

    this.map = new mapboxgl.Map({
      container: 'map',
      style: cfg.MAP_STYLE,
      center: [App.STATE.lon, App.STATE.lat],
      zoom: 10,
      attributionControl: true
    });
    this.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // 选点标记
    this.marker = new mapboxgl.Marker({ draggable: true, color: '#e07b3a' })
      .setLngLat([App.STATE.lon, App.STATE.lat])
      .addTo(this.map);

    // 拖拽标记 = 移动选点
    this.marker.on('dragend', () => {
      const ll = this.marker.getLngLat();
      this._selectPoint(ll.lat, ll.lng, null);
    });

    // 点击地图选点
    this.map.on('click', e => {
      this._selectPoint(e.lngLat.lat, e.lngLat.lng, null);
    });

    this.map.on('load', () => {
      try{ this._initTerrain(); }catch(e){ console.warn('[map] 地形加载失败', e); }
      try{ this._initTrailLayers(); }catch(e){ console.warn('[map] 轨迹图层初始化失败', e); }
    });
    return true;
  },

  /* ===== Mapbox 地形（DEM），用于峰顶实测海拔；pitch=0 时视图不变 ===== */
  _initTerrain(){
    if(!this.map.getSource('terrain-source')){
      this.map.addSource('terrain-source', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
    }
    this.map.setTerrain({ source: 'terrain-source', exaggeration: 1 });
  },

  /* 采样某点地形海拔（米）；地形未就绪或境外失败时返回 null */
  sampleElevation(lat, lon){
    try{
      if(!this.map || !this.map.getTerrain()) return null;
      const v = this.map.queryTerrainElevation([lon, lat]);
      return (v == null || isNaN(v)) ? null : v;
    }catch(e){ return null; }
  },

  /* 内部：选点（reverse 为 null 时触发反向地理编码） */
  async _selectPoint(lat, lon, name){
    App.STATE.lat = lat;
    App.STATE.lon = lon;
    if(this.marker) this.marker.setLngLat([lon, lat]);
    if(name){
      App.STATE.placeName = name;
    }else{
      // 逆地理编码失败不能阻塞天气查询：失败时用坐标兜底作地名
      const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      try{
        App.STATE.placeName = await App.geocoder.reverse(lat, lon);
      }catch(e){
        App.STATE.placeName = fallback;
      }
    }
    App.loadWeather();
  },

  /* 外部调用：飞到指定点并更新标记（不触发天气请求） */
  flyTo(lat, lon){
    if(!this.map) return;
    if(this.marker) this.marker.setLngLat([lon, lat]);
    this.map.flyTo({ center: [lon, lat], zoom: 11, duration: 800 });
  },

  /* ===== 轨迹图层（GeoJSON 线 + 关键点） ===== */
  _initTrailLayers(){
    const empty = this._emptyTrailGeo();
    this.map.addSource('trail', { type: 'geojson', data: empty });
    this.map.addLayer({
      id: 'trail-line',
      type: 'line',
      source: 'trail',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e07b3a', 'line-width': 3 }
    });
    this.map.addLayer({
      id: 'trail-points',
      type: 'circle',
      source: 'trail',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#2d5a4a',
        'circle-stroke-width': 2
      }
    });

    // 点击关键点弹出信息
    this.map.on('click', 'trail-points', e => {
      const p = e.features[0].properties;
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<b>${App.utils.escapeHtml(p.name || '关键点')}</b>` + (p.alt ? `<br>${Math.round(p.alt)} m` : ''))
        .addTo(this.map);
    });
    this.map.on('mouseenter', 'trail-points', () => this.map.getCanvas().style.cursor = 'pointer');
    this.map.on('mouseleave', 'trail-points', () => this.map.getCanvas().style.cursor = '');
    this._trailLoaded = true;
    // 若轨迹在地图 load 前已上传，补画
    if(App.STATE.trail) this.drawTrail(App.STATE.trail);
  },

  _emptyTrailGeo(){
    return { type: 'FeatureCollection', features: [] };
  },

  drawTrail(trail){
    if(!this.map || !this._trailLoaded) return;
    const line = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: trail.points.map(p => [p.lon, p.lat])
      },
      properties: {}
    };
    const points = trail.nodes.map(n => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
      properties: { name: n.name, alt: n.alt }
    }));
    const data = { type: 'FeatureCollection', features: [line, ...points] };

    const apply = () => {
      this.map.getSource('trail').setData(data);
      const bounds = new mapboxgl.LngLatBounds();
      trail.points.forEach(p => bounds.extend([p.lon, p.lat]));
      this.map.fitBounds(bounds, { padding: 40, duration: 800 });
    };
    if(this._trailLoaded) apply();
  }
};
