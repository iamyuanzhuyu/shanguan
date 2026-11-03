/* ============================================================
   coord-dialog.js — 手动输入经纬度对话框
   - 搜索没有命中时自动弹出，也可在空状态 / 失败卡片里手动打开
   - 支持 WGS-84 / GCJ-02（高德） / BD-09（百度）三种坐标系，
     内部统一转成 WGS-84 再查天气（否则峰顶会偏几百米）
============================================================ */
window.App = window.App || {};

App.coordDialog = (function(){
  let mask, latEl, lonEl, sysEl, nameEl, errEl;
  let lastFocus = null;
  let ready = false;

  function $(id){ return document.getElementById(id); }

  function init(){
    if(ready) return true;
    mask = $('coordModal');
    latEl = $('coordLat');
    lonEl = $('coordLon');
    sysEl = $('coordSys');
    nameEl = $('coordName');
    errEl = $('coordError');
    if(!mask || !latEl || !lonEl || !sysEl) return false;

    $('coordCancel').onclick = close;
    $('coordSubmit').onclick = apply;
    mask.addEventListener('click', e => { if(e.target === mask) close(); });
    document.addEventListener('keydown', e => {
      if(!mask || mask.hidden) return;
      if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
      if(e.key === 'Enter' && (document.activeElement === latEl || document.activeElement === lonEl || document.activeElement === nameEl)){
        e.preventDefault();
        apply();
      }
    });
    ready = true;
    return true;
  }

  function open(opts){
    if(!init()) return;
    const o = opts || {};
    if(o.lat != null) latEl.value = o.lat;
    if(o.lon != null) lonEl.value = o.lon;
    if(o.sys) sysEl.value = o.sys;
    nameEl.value = o.name || '';
    showError('');
    lastFocus = document.activeElement;
    mask.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => { try{ latEl.focus(); latEl.select(); }catch(e){} }, 30);
  }

  function close(){
    if(!mask || mask.hidden) return;
    mask.hidden = true;
    document.body.style.overflow = '';
    if(lastFocus && lastFocus.focus){ try{ lastFocus.focus(); }catch(e){} }
  }

  function showError(msg){
    if(!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  /* 按所选坐标系转换到 WGS-84 */
  function toWgs(lon, lat, sys){
    const ct = App.coordTransform;
    if(sys === 'gcj02'){
      const w = ct.gcjToWgs(lon, lat);
      return { lat: w.lat, lon: w.lng };
    }
    if(sys === 'bd09'){
      const g = ct.bd09ToGcj(lon, lat);
      const w = ct.gcjToWgs(g.lng, g.lat);
      return { lat: w.lat, lon: w.lng };
    }
    return { lat: lat, lon: lon };
  }

  function apply(){
    const rawLat = parseFloat(latEl.value);
    const rawLon = parseFloat(lonEl.value);
    if(!isFinite(rawLat) || !isFinite(rawLon)){
      showError('请输入有效的纬度和经度数字，例如：27.4686 / 114.1714');
      return;
    }
    if(rawLat < -90 || rawLat > 90){ showError('纬度必须在 -90 ~ 90 之间'); return; }
    if(rawLon < -180 || rawLon > 180){ showError('经度必须在 -180 ~ 180 之间'); return; }
    if(rawLat === 0 && rawLon === 0){ showError('0, 0 通常是空白海域，请确认坐标是否有误'); return; }

    const wgs = toWgs(rawLon, rawLat, sysEl.value);
    if(!isFinite(wgs.lat) || !isFinite(wgs.lon) || Math.abs(wgs.lat) > 90 || Math.abs(wgs.lon) > 180){
      showError('坐标换算失败，请检查输入');
      return;
    }

    const label = (nameEl.value || '').trim();
    const shown = `${rawLat.toFixed(4)}, ${rawLon.toFixed(4)}`;
    App.STATE.lat = wgs.lat;
    App.STATE.lon = wgs.lon;
    App.STATE.placeName = label ? label + '（手动坐标）' : '自定义坐标 ' + shown;

    const inputEl = $('algoliaSearch');
    if(inputEl) inputEl.value = label || shown;

    close();
    if(App.mapModule && App.mapModule.map) App.mapModule.flyTo(wgs.lat, wgs.lon);
    App.loadWeather();
  }

  return { init: init, open: open, close: close };
})();
