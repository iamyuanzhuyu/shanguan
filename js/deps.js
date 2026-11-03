/* ============================================================
   deps.js — 第三方 CDN 依赖兜底加载
   静态 <script> 被网络、代理或广告拦截插件挡住时，按备用源顺序
   补载 mapbox-gl / echarts / autocomplete.js，避免"地图库没加载"
   连带拖垮整页（天气查询本身不依赖任何 CDN）。
============================================================ */
window.App = window.App || {};

App.deps = (function(){
  const LOAD_TIMEOUT = 12000;

  /* 动态插入一个 <script>，onload / onerror / 超时 决定成败 */
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = setTimeout(() => {
        s.onload = s.onerror = null;
        s.remove();
        reject(new Error('加载超时：' + src));
      }, LOAD_TIMEOUT + 8000);
      s.src = src;
      s.async = false;
      s.onload = () => { clearTimeout(timer); resolve(src); };
      s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  /* 等待全局变量出现（部分库 onload 之后还要片刻才挂到 window） */
  function waitGlobal(name, timeout){
    if(window[name]) return Promise.resolve(true);
    return new Promise(resolve => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        if(window[name]){ clearInterval(timer); resolve(true); }
        else if(Date.now() - t0 > timeout){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  /* 依次尝试备用地址，直到全局变量可用；全部失败返回 false，不抛错 */
  async function ensure(name, urls){
    if(window[name]) return true;
    for(const url of urls){
      try{ await loadScript(url); }catch(e){ continue; }
      if(await waitGlobal(name, LOAD_TIMEOUT)) return true;
    }
    console.warn('[deps] 备用源也无法加载：', name);
    return false;
  }

  /* 依赖是否就绪 */
  function ready(name){
    return typeof window[name] !== 'undefined';
  }

  return { ensure: ensure, loadScript: loadScript, ready: ready };
})();
