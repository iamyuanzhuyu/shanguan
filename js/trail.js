/* ============================================================
   trail.js — GPX / KML 轨迹解析、统计、区域代表点
   为什么只取一个点：
     天气预报本身是区域网格数据（Open-Meteo 网格约 1~11 km），
     一条徒步轨迹通常就落在同一个网格里；逐点请求不会更准，
     只会浪费请求数、给出"虚假的精度"。所以整条轨迹只选一个
     代表点（默认最高点/垭口）去查主天气面板，这份预报即代表
     整条轨迹所在区域。
============================================================ */
window.App = window.App || {};

/* 球面距离（米） */
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

App.trail = {
  /* 解析轨迹文件文本，返回点数组 */
  parse(text, ext){
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const pts = [];
    if(ext === 'gpx'){
      doc.querySelectorAll('trkpt,rtept,wpt').forEach(p => {
        const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
        if(isNaN(lat)||isNaN(lon)) return;
        const ele = p.getElementsByTagName('ele')[0];
        const name = p.getElementsByTagName('name')[0];
        pts.push({lat, lon, alt: ele?parseFloat(ele.textContent):null, name: name?name.textContent.trim():null});
      });
    }else{ // kml
      doc.querySelectorAll('coordinates').forEach(c => {
        c.textContent.trim().split(/\s+/).forEach(pair => {
          const parts = pair.split(',').map(Number);
          if(parts.length>=2 && !isNaN(parts[0]) && !isNaN(parts[1])){
            pts.push({lat:parts[1], lon:parts[0], alt: parts[2]||null, name:null});
          }
        });
      });
    }
    return pts;
  },

  /* 从全部轨迹点中提取关键节点（仅用于地图标记展示）：
     起点、最高点、最低点、均匀采样、终点 */
  pickNodes(pts){
    if(pts.length===0) return [];
    const nodes = [];
    nodes.push({...pts[0], name: pts[0].name || '起点'});

    let hi = pts[0], lo = pts[0];
    pts.forEach(p => {
      if(p.alt!=null){
        if(hi.alt==null || p.alt>hi.alt) hi = p;
        if(lo.alt==null || p.alt<lo.alt) lo = p;
      }
    });
    if(hi!==nodes[0]) nodes.push({...hi, name: hi.name || '最高点/垭口'});
    if(lo!==nodes[0] && lo!==hi) nodes.push({...lo, name: lo.name || '最低点/营地'});

    const total = 7;
    while(nodes.length<total && pts.length>nodes.length+1){
      const frac = nodes.length/(total+1);
      const idx = Math.floor(pts.length*frac);
      if(!nodes.find(n => Math.abs(n.lat-pts[idx].lat)<0.0001 && Math.abs(n.lon-pts[idx].lon)<0.0001)){
        nodes.push({...pts[idx], name: pts[idx].name || `途经点 ${nodes.length}`});
      }else break;
    }

    const last = pts[pts.length-1];
    if(!nodes.find(n => Math.abs(n.lat-last.lat)<0.0001 && Math.abs(n.lon-last.lon)<0.0001)){
      nodes.push({...last, name: last.name || '终点'});
    }
    return nodes;
  },

  /* 轨迹统计：总距离、累计爬升/下降、海拔范围、几何中心 */
  stats(pts){
    const out = { dist: 0, ascent: 0, descent: 0, maxAlt: null, minAlt: null, centerLat: 0, centerLon: 0 };
    if(!pts || !pts.length) return out;
    out.centerLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    out.centerLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    for(let i = 0; i < pts.length; i++){
      const p = pts[i];
      if(p.alt != null){
        out.maxAlt = out.maxAlt == null ? p.alt : Math.max(out.maxAlt, p.alt);
        out.minAlt = out.minAlt == null ? p.alt : Math.min(out.minAlt, p.alt);
      }
      if(i > 0){
        const prev = pts[i-1];
        out.dist += haversine(prev.lat, prev.lon, p.lat, p.lon);
        if(prev.alt != null && p.alt != null){
          const d = p.alt - prev.alt;
          if(d > 0) out.ascent += d; else out.descent -= d;
        }
      }
    }
    return out;
  },

  /* 区域代表点：优先轨迹最高点（山顶/垭口，最影响登山安全与日出云海判断）；
     没有海拔数据时退回轨迹几何中心，再退回起点。 */
  pickRepresentative(pts){
    if(!pts || !pts.length) return null;
    let hi = null;
    pts.forEach(p => { if(p.alt != null && (hi == null || p.alt > hi.alt)) hi = p; });
    if(hi) return { lat: hi.lat, lon: hi.lon, alt: hi.alt, kind: 'highest' };
    const st = this.stats(pts);
    if(st.centerLat || st.centerLon){
      return { lat: st.centerLat, lon: st.centerLon, alt: null, kind: 'center' };
    }
    return { lat: pts[0].lat, lon: pts[0].lon, alt: null, kind: 'start' };
  }
};
