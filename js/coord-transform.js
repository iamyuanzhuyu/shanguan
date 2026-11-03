/* ============================================================
   coord-transform.js — 坐标纠偏
   高德 POI 返回 GCJ-02（火星坐标），Mapbox / Open-Meteo 使用
   WGS-84，需双向转换。算法为公开的 eviltransform 标准实现。
============================================================ */
window.App = window.App || {};

App.coordTransform = (function(){
  const PI = 3.1415926535897932384626;
  const A = 6378245.0;                 // 长半轴
  const EE = 0.00669342162296594323;   // 偏心率平方
  const X_PI = PI * 3000.0 / 180.0;

  function outOfChina(lng, lat){
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(lng, lat){
    let r = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat
          + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    r += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
    return r;
  }
  function transformLng(lng, lat){
    let r = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng
          + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    r += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(lng * PI) + 40.0 * Math.sin(lng / 3.0 * PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(lng / 12.0 * PI) + 300.0 * Math.sin(lng / 30.0 * PI)) * 2.0 / 3.0;
    return r;
  }

  /* GCJ-02 → WGS-84（两步迭代，误差 < 1m） */
  function gcjToWgs(lng, lat){
    if(outOfChina(lng, lat)) return { lng: lng, lat: lat };
    let wgsLng = lng, wgsLat = lat;
    for(let i = 0; i < 2; i++){
      let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
      let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
      const radLat = wgsLat / 180.0 * PI;
      let magic = Math.sin(radLat);
      magic = 1 - EE * magic * magic;
      const sqrtMagic = Math.sqrt(magic);
      dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
      dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
      wgsLat = lat - dLat;
      wgsLng = lng - dLng;
    }
    return { lng: wgsLng, lat: wgsLat };
  }

  /* WGS-84 → GCJ-02（调用高德逆地理前使用） */
  function wgsToGcj(lng, lat){
    if(outOfChina(lng, lat)) return { lng: lng, lat: lat };
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return { lng: lng + dLng, lat: lat + dLat };
  }

  /* BD-09（百度）→ GCJ-02，手动输入百度坐标时使用 */
  function bd09ToGcj(lng, lat){
    const x = lng - 0.0065, y = lat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
    return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
  }

  return { gcjToWgs: gcjToWgs, wgsToGcj: wgsToGcj, bd09ToGcj: bd09ToGcj, X_PI: X_PI };
})();
