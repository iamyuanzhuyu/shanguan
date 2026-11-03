/* ============================================================
   config.js — 全局配置（密钥、接口、常量）
============================================================ */
window.App = window.App || {};

App.CONFIG = {
  // 高德 Web 服务 Key（POI 搜索 / 逆地理编码）
  AMAP_KEY: 'YOUR_AMAP_KEY',
  AMAP_TEXT_URL: 'https://restapi.amap.com/v3/place/text',
  AMAP_TIPS_URL: 'https://restapi.amap.com/v3/assistant/inputtips',
  AMAP_REGEO_URL: 'https://restapi.amap.com/v3/geocode/regeo',
  // Mapbox 密钥（仅用于地图渲染）
  MAPBOX_TOKEN: 'YOUR_MAPBOX_TOKEN',
  // Mapbox 地图样式（户外风格，含等高线/地形信息）
  MAP_STYLE: 'mapbox://styles/mapbox/outdoors-v12',
  // 搜索建议数量
  SUGGEST_LIMIT: 10,
  // 本地库命中达到该分数（100=精确、80=前缀）时不再请求高德，省配额
  LOCAL_STRONG_SCORE: 80,
  // 地理编码结果内存缓存时长（毫秒）
  GEO_CACHE_TTL: 5 * 60 * 1000,
  // 天气接口
  WEATHER_URL: 'https://api.open-meteo.com/v1/forecast',
  // Mapbox 地理编码（兜底用；返回 WGS-84，无需坐标纠偏）
  MAPBOX_GEOCODE_URL: 'https://api.mapbox.com/search/geocode/v6',
  // 时区
  TIMEZONE: 'Asia/Shanghai'
};
