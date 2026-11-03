/* ============================================================
   weather.js — Open-Meteo 天气数据请求（含多模型对比）
   - 主预报是必需项；多模型对比只是加分项，失败自动降级为 null
   - 12s 超时 + 一次自动重试（AbortController，超时/取消真正生效）
   - 内存缓存（10 分钟 TTL）
   - 新请求自动取消旧请求，避免快速切换地点时数据错乱
   - 天气请求不依赖任何 CDN 脚本，接口可达即可出数据
============================================================ */
window.App = window.App || {};

App.weather = (function(){
  const CACHE_TTL = 10 * 60 * 1000;
  const REQUEST_TIMEOUT = 12000;
  const COMPARE_MAX_WAIT = 4000;   // 多模型对比最多等 4s，避免拖慢首屏
  const cache = new Map();
  let mainController = null;

  function abortError(){
    const e = new Error('请求已取消');
    e.name = 'AbortError';
    return e;
  }

  /* 单次请求：把"外部取消信号"和"超时信号"合并到一个 controller 上 */
  async function requestJson(url, signal){
    if(signal && signal.aborted) throw abortError();
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, REQUEST_TIMEOUT);
    const onAbort = () => ctrl.abort();
    if(signal) signal.addEventListener('abort', onAbort, { once: true });
    try{
      const res = await window.fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if(!res.ok) throw new Error('天气服务异常 (' + res.status + ')');
      return await res.json();
    }catch(e){
      if(timedOut){ const t = new Error('天气服务响应超时（12 秒）'); t.name = 'TimeoutError'; throw t; }
      if(signal && signal.aborted) throw abortError();
      throw e;
    }finally{
      clearTimeout(timer);
      if(signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /* 网络抖动 / 瞬时 5xx 时自动重试一次 */
  async function requestJsonRetry(url, signal){
    try{
      return await requestJson(url, signal);
    }catch(e){
      if(e.name === 'AbortError') throw e;
      if(signal && signal.aborted) throw abortError();
      await new Promise(r => setTimeout(r, 800));
      return requestJson(url, signal);
    }
  }

  function cacheKey(lat, lon, days){
    return lat.toFixed(3) + ',' + lon.toFixed(3) + '|' + days;
  }

  /* 主查询：返回 { main, cmp }，cmp 可能为 null */
  async function fetch(lat, lon){
    const cfg = App.CONFIG;
    const days = App.STATE.days;
    if(typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)){
      throw new Error('坐标无效，无法查询天气');
    }
    const key = cacheKey(lat, lon, days);
    const hit = cache.get(key);
    if(hit && Date.now() - hit.t < CACHE_TTL) return hit.data;

    // 取消上一次未完成的主请求
    if(mainController) mainController.abort();
    const controller = new AbortController();
    mainController = controller;
    const signal = controller.signal;

    const hourlyVars = 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,uv_index,cape,weather_code';
    const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max';

    const base = `${cfg.WEATHER_URL}?latitude=${lat}&longitude=${lon}`;
    const mainUrl = `${base}&hourly=${hourlyVars}&daily=${dailyVars}` +
      `&timezone=${cfg.TIMEZONE}&forecast_days=${days}`;
    const cmpUrl = `${base}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,precipitation_probability_max` +
      `&timezone=${cfg.TIMEZONE}&forecast_days=${days}` +
      `&models=ecmwf_ifs025,gfs_seamless,icon_seamless`;

    // 多模型对比：失败只降级，绝不影响主预报
    const cmpTask = requestJsonRetry(cmpUrl, signal).catch(err => {
      console.warn('[weather] 多模型对比请求失败，本次不展示对比卡片：', err && err.message);
      return null;
    });

    let main;
    try{
      main = await requestJsonRetry(mainUrl, signal);
    }finally{
      if(mainController === controller) mainController = null;
    }
    if(!main || !main.hourly || !main.daily){
      throw new Error('天气服务返回的数据不完整，请稍后重试');
    }

    const cmp = await Promise.race([
      cmpTask,
      new Promise(resolve => setTimeout(() => resolve(null), COMPARE_MAX_WAIT))
    ]);

    if(signal.aborted) throw abortError();
    const data = { main: main, cmp: cmp };
    cache.set(key, { t: Date.now(), data: data });
    return data;
  }

  return { fetch: fetch };
})();
