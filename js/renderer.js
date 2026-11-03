/* ============================================================
   renderer.js — 页面渲染：chips、结果卡片、图表
============================================================ */
window.App = window.App || {};

App.renderer = {
  DAY_NAMES: ['今天','明天','后天'],

  dayLabel(idx){
    if(this.DAY_NAMES[idx]) return this.DAY_NAMES[idx];
    const daily = App.STATE.daily;
    if(daily && daily.time && daily.time[idx]) return daily.time[idx].slice(5).replace('-','/');
    return idx===0 ? '今天' : '第 ' + (idx+1) + ' 天';
  },

  /* ===== 首页快捷按钮（经典 / 广东热门）+ 偏好 =====
     线路数据全部来自 peaks-db，这里只负责渲染，不维护坐标 ===== */
  renderChips(){
    const h = document.getElementById('hotList');
    if(!h) return;
    const escape = App.utils.escapeHtml;
    const groups = App.buildChipGroups ? App.buildChipGroups() : [];

    const groupsHtml = groups.map(g =>
      `<div class="chip-group">
         <span class="chip-label">${escape(g.label)}</span>
         ${g.places.map(p => {
           const tip = [p.region, p.elev ? Math.round(p.elev) + ' m' : ''].filter(Boolean).join(' · ');
           return `<button class="chip" data-lat="${p.lat}" data-lon="${p.lon}" data-name="${escape(p.n)}" title="${escape(tip)}">${escape(p.n)}</button>`;
         }).join('')}
       </div>`
    ).join('');
    const prefsHtml = `<div class="chip-group prefs-row">` +
      App.PREFS.map(p =>
        `<label class="pref"><input type="checkbox" data-k="${p.k}" ${App.STATE.prefs[p.k]?'checked':''}>${p.l}</label>`
      ).join('') + `</div>`;
    h.innerHTML = groupsHtml + prefsHtml;

    h.querySelectorAll('.chip').forEach(el => {
      el.onclick = () => {
        App.STATE.lat = parseFloat(el.dataset.lat);
        App.STATE.lon = parseFloat(el.dataset.lon);
        App.STATE.placeName = el.dataset.name;
        document.getElementById('algoliaSearch').value = el.dataset.name;
        App.mapModule.flyTo(App.STATE.lat, App.STATE.lon);
        App.loadWeather();
      };
    });
    h.querySelectorAll('.pref input').forEach(el => {
      el.onchange = () => { App.STATE.prefs[el.dataset.k] = el.checked; };
    });
  },

  /* ===== 结果主渲染 ===== */
  renderAll(){
    const u = App.utils;
    const S = App.STATE;
    const h = S.hourly, d = S.daily;
    if(!h || !d || !d.time){ return; }
    const td = Math.min(S.tripDay, d.time.length - 1);
    S.tripDay = td;
    const dayLabel = this.dayLabel(td);

    let tripOptions = '';
    for(let i=0;i<d.time.length;i++){
      tripOptions += `<option value="${i}" ${S.tripDay===i?'selected':''}>${this.dayLabel(i)}（${d.time[i].slice(5)}）</option>`;
    }

    let html = '';

    /* 位置条 */
    html += `<div class="card">
      <div class="loc-bar">
        <div class="place">${u.escapeHtml(S.placeName)}</div>
        <div class="meta">经纬度 <b>${S.lat.toFixed(4)}°, ${S.lon.toFixed(4)}°</b> · 海拔 <b>${S.elevation?Math.round(S.elevation)+' m':'—'}</b></div>
        <div class="days-select">
          <label style="font-size:12px;color:var(--ink-3);margin-right:6px">出行日期</label>
          <select id="tripDaySel">${tripOptions}</select>
          <select id="daysSel" style="margin-left:6px">
            <option value="3" ${S.days===3?'selected':''}>3 天预报</option>
            <option value="7" ${S.days===7?'selected':''}>7 天预报</option>
          </select>
        </div>
      </div>
    </div>`;

    /* 轨迹概览：天气按代表点（区域）查询，这里只展示轨迹统计 */
    if(S.trail && S.trail.points && S.trail.points.length){
      const st = S.trail.stats || {};
      const rep = S.trail.rep || { lat: S.lat, lon: S.lon };
      const km = ((st.dist || 0) / 1000).toFixed(1);
      html += `<div class="card trail-card" id="trailCard">
        <h3>轨迹概览 <span class="tag">${S.trail.points.length} 个轨迹点</span></h3>
        <div class="trail-summary">
          <div><span>距离</span><b>${km} km</b></div>
          <div><span>累计爬升</span><b>${Math.round(st.ascent || 0)} m</b></div>
          <div><span>最高点</span><b>${st.maxAlt != null ? Math.round(st.maxAlt) + ' m' : '—'}</b></div>
          <div><span>区域代表点</span><b>${rep.lat.toFixed(3)}, ${rep.lon.toFixed(3)}</b></div>
        </div>
        <p class="trail-note">天气预报是区域网格数据（Open-Meteo 网格约 1~11 km），整条轨迹共用代表点${rep.kind === 'highest' ? '（最高点/垭口）' : '（几何中心）'}的一份预报，不再逐点请求。</p>
      </div>`;
    }

    /* 多模型对比 */
    html += this.renderModelCompare();

    /* 逐时图表 */
    html += `<div class="card"><h3>${dayLabel}逐时预报（前后 48 小时） <span class="tag">ECMWF / 多模式融合</span></h3><div id="chart"></div></div>`;

    /* 日出日落 + 云海 */
    const sun = App.forecast.calcSunriseView(h, d, td);
    const sea = App.forecast.calcSeaOfCloud(h, d, td);
    html += `<div class="duo">
      <div class="card sun-card">
        <h3>日出 · 日落（${dayLabel}）</h3>
        <div class="big-row">
          <div class="blk"><div class="v">${u.fmtTime(d.sunrise[td])}</div><div class="l">日出</div></div>
          <div class="blk"><div class="v">${u.fmtTime(d.sunset[td])}</div><div class="l">日落</div></div>
        </div>
        <div class="cond-row">日出观赏：<b style="color:${sun.score>=60?'var(--ok)':sun.score>=35?'var(--amber)':'var(--warn)'}">${sun.text}</b><br>${sun.detail}</div>
      </div>
      <div class="card sea-card">${this.renderSeaGauge(sea)}</div>
    </div>`;

    /* 安全建议 */
    html += this.renderSafety(d, h, td);

    /* 7 天表 */
    html += this.renderWeek(d);

    document.getElementById('result').innerHTML = html;

    document.getElementById('daysSel').onchange = e => { S.days = parseInt(e.target.value); App.loadWeather(); };
    document.getElementById('tripDaySel').onchange = e => { S.tripDay = parseInt(e.target.value); App.renderer.renderAll(); };

    this.drawChart(h, td);
  },

  /* ===== 多模型对比 ===== */
  renderModelCompare(){
    const u = App.utils;
    const c = App.STATE.cmp;
    if(!c || !c.daily) return '';
    const d = c.daily;
    const models = [
      {key:'ecmwf_ifs025', name:'ECMWF IFS'},
      {key:'gfs_seamless', name:'GFS (美国)'},
      {key:'icon_seamless', name:'ICON (德国)'},
    ];
    const idx = App.STATE.tripDay;
    const cells = models.map(m => ({
      m,
      tMax: d[`temperature_2m_max_${m.key}`]?.[idx],
      tMin: d[`temperature_2m_min_${m.key}`]?.[idx],
      prec: d[`precipitation_sum_${m.key}`]?.[idx],
      wind: d[`wind_speed_10m_max_${m.key}`]?.[idx],
      pop:  d[`precipitation_probability_max_${m.key}`]?.[idx]
    }));
    const tMaxSpread = Math.max(...cells.map(x=>x.tMax||0)) - Math.min(...cells.map(x=>x.tMax||0));
    const precSpread = Math.max(...cells.map(x=>x.prec||0)) - Math.min(...cells.map(x=>x.prec||0));
    const windSpread = Math.max(...cells.map(x=>x.wind||0)) - Math.min(...cells.map(x=>x.wind||0));
    const agree = (tMaxSpread<=2 && precSpread<=2 && windSpread<=10);

    return `<div class="card">
      <h3>${this.dayLabel(idx)}多模型对比 <span class="tag ${agree?'':'badge conflict'}">${agree?'模型一致':'分歧较大'}</span></h3>
      <div class="model-grid">
        ${cells.map(c => `
          <div class="model-cell">
            <div class="m-name"><span>${c.m.name}</span></div>
            <div class="m-row"><span>最高 / 最低</span><b>${u.fmtTemp(c.tMax)} / ${u.fmtTemp(c.tMin)}</b></div>
            <div class="m-row"><span>降水量</span><b>${c.prec==null?'—':(Math.round(c.prec*10)/10)+' mm'}</b></div>
            <div class="m-row"><span>最大风速</span><b>${c.wind==null?'—':Math.round(c.wind)+' km/h（'+u.beaufort(c.wind)+'）'}</b></div>
            <div class="m-row"><span>降水概率</span><b>${u.fmtPerc(c.pop)}</b></div>
          </div>`).join('')}
      </div>
      <div class="agree-note ${agree?'good':'bad'}">${agree
        ? '三模型结论基本一致，预报可信度较高，可按计划出行。'
        : '各模型在降水 / 气温 / 风力上分歧较大，存在不确定性，建议按最保守方案（更多降水、更大风）准备装备，并出发前 24 小时再次确认。'}</div>
    </div>`;
  },

  /* ===== 云海仪表盘 ===== */
  renderSeaGauge(sea){
    const r = 42, c = 2*Math.PI*r;
    const off = c * (1 - sea.score/100);
    const color = sea.level===0?'#7c8a84':sea.level===1?'#b8860b':sea.level===2?'#e07b3a':'#3a7d5c';
    return `
      <div class="gauge">
        <svg width="110" height="110">
          <circle cx="55" cy="55" r="${r}" fill="none" stroke="#e8edf0" stroke-width="9"/>
          <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="9"
            stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" style="transition:stroke-dashoffset .6s"/>
        </svg>
        <div class="pct"><b>${sea.score}%</b><span>云海概率</span></div>
      </div>
      <div class="sea-info">
        <div class="level l${sea.level}">${sea.text}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:4px">最佳观测：${sea.bestTime}</div>
        <ul>${sea.reasons.map(r=>`<li>${r}</li>`).join('')}</ul>
      </div>`;
  },

  /* ===== 48 小时图表 ===== */
  drawChart(h, tripDay){
    const el = document.getElementById('chart');
    if(!el || !h) return;
    if(typeof echarts === 'undefined'){
      this._chartPending = true;   // 图表库还没到位：记下来，启动流程补绘
      el.innerHTML = '<div style="padding:18px 4px;font-size:12.5px;color:var(--ink-3)">图表库（ECharts）未加载，逐时曲线暂不可用；下方的多日概览表与安全建议不受影响。</div>';
      return;
    }
    try{
      if(this._chart){ this._chart.dispose(); this._chart = null; }
      const chart = echarts.init(el);
      this._chart = chart;
      this._chartPending = false;
      const targetDate = App.STATE.daily.time[tripDay];
      let startIdx = 0;
      for(let i=0;i<h.time.length;i++){
        if(h.time[i].startsWith(targetDate)){ startIdx = i; break; }
      }
      const N = 48;
      const times = h.time.slice(startIdx, startIdx+N).map(t => t.slice(5,10)+' '+t.slice(11,13)+':00');
      const temp = h.temperature_2m.slice(startIdx, startIdx+N);
      const appT = h.apparent_temperature.slice(startIdx, startIdx+N);
      const precip = h.precipitation.slice(startIdx, startIdx+N);
      const pop = h.precipitation_probability.slice(startIdx, startIdx+N);
      const wind = h.wind_speed_10m.slice(startIdx, startIdx+N);
      const gust = h.wind_gusts_10m.slice(startIdx, startIdx+N);
      const cloudLow = h.cloud_cover_low.slice(startIdx, startIdx+N);

      chart.setOption({
        tooltip:{trigger:'axis', axisPointer:{type:'cross'},
          formatter(params){
            const i = params[0].dataIndex;
            return `<b>${times[i]}</b><br>` +
              `气温 ${temp[i]?.toFixed(1)}°（体感 ${appT[i]?.toFixed(1)}°）<br>` +
              `降水 ${precip[i]?.toFixed(1)} mm（概率 ${pop[i]}%）<br>` +
              `风 ${wind[i]?.toFixed(0)} km/h（阵风 ${gust[i]?.toFixed(0)}）<br>` +
              `低云 ${cloudLow[i]}%`;
          }
        },
        legend:{data:['气温','体感','降水概率','风速','阵风','低云量'], top:0, textStyle:{fontSize:11,color:'#4a5a53'}},
        grid:{left:40,right:40,top:36,bottom:40},
        xAxis:{type:'category',data:times,axisLabel:{fontSize:10,color:'#7c8a84',interval:5}},
        yAxis:[
          {type:'value',name:'温度°',position:'left',axisLabel:{fontSize:10,color:'#7c8a84'},splitLine:{lineStyle:{color:'#eef2ef'}}},
          {type:'value',name:'% / kmh',position:'right',axisLabel:{fontSize:10,color:'#7c8a84'},splitLine:{show:false}},
        ],
        series:[
          {name:'气温',type:'line',data:temp,smooth:true,lineStyle:{color:'#e07b3a',width:2},itemStyle:{color:'#e07b3a'},symbol:'none'},
          {name:'体感',type:'line',data:appT,smooth:true,lineStyle:{color:'#e07b3a',width:1,type:'dashed',opacity:.6},itemStyle:{color:'#e07b3a'},symbol:'none'},
          {name:'降水概率',type:'bar',data:pop,yAxisIndex:1,itemStyle:{color:'rgba(45,90,74,.25)'},barWidth:8},
          {name:'风速',type:'line',data:wind,smooth:true,yAxisIndex:1,lineStyle:{color:'#3a7d5c',width:1.5},itemStyle:{color:'#3a7d5c'},symbol:'none'},
          {name:'阵风',type:'line',data:gust,smooth:true,yAxisIndex:1,lineStyle:{color:'#c0392b',width:1,type:'dotted'},itemStyle:{color:'#c0392b'},symbol:'none'},
          {name:'低云量',type:'line',data:cloudLow,smooth:true,yAxisIndex:1,lineStyle:{color:'#9aa8b0',width:1},itemStyle:{color:'#9aa8b0'},symbol:'none',areaStyle:{color:'rgba(154,168,176,.15)'}},
        ]
      });
      if(!this._resizeBound){
        this._resizeBound = true;
        window.addEventListener('resize', () => { if(this._chart) this._chart.resize(); });
      }
    }catch(err){
      console.error('[chart] 渲染失败', err);
      el.innerHTML = '<div style="padding:18px 4px;font-size:12.5px;color:var(--warn)">逐时图表渲染失败，其他数据不受影响。</div>';
    }
  },

  /* ===== 安全建议 ===== */
  renderSafety(d, h, dayIdx){
    const S = App.STATE;
    const risks = [];
    const gustMax = d.wind_gusts_10m_max[dayIdx];
    if(gustMax>=50){
      risks.push({level:'r-warn', ico:'风', text:`山顶最大阵风 ${gustMax.toFixed(0)} km/h（${App.utils.beaufort(gustMax)}），山脊、垭口、暴露路段风险显著升高，注意抓稳保护，必要时下撤。`});
    }else if(gustMax>=39){
      risks.push({level:'r-amber', ico:'风', text:`山顶阵风 ${gustMax.toFixed(0)} km/h（${App.utils.beaufort(gustMax)}），风口路段注意防风保暖。`});
    }
    const pop = d.precipitation_probability_max[dayIdx];
    const prec = d.precipitation_sum[dayIdx];
    if(pop>=60 || prec>=10){
      risks.push({level:'r-warn', ico:'雨', text:`降水概率 ${pop}%、预计 ${prec.toFixed(1)} mm。需备雨衣、防水鞋袜，谨慎涉水路段；若持续强降水警惕滑坡、溪水上涨。`});
    }else if(pop>=30){
      risks.push({level:'r-amber', ico:'雨', text:`降水概率 ${pop}%，建议携带轻便雨衣。`});
    }
    const dateStr = d.time[dayIdx];
    let maxCape = 0, minVis = Infinity;
    for(let i=0;i<h.time.length;i++){
      if(h.time[i].startsWith(dateStr)){
        if(h.cape && h.cape[i]>maxCape) maxCape = h.cape[i];
        if(h.visibility[i] < minVis) minVis = h.visibility[i];
      }
    }
    if(maxCape>1000 && pop>=40){
      risks.push({level:'r-warn', ico:'电', text:`CAPE 峰值 ${maxCape.toFixed(0)} J/kg，配合上升气流有雷电风险。避免在山脊、孤树、金属设施、开阔高地停留。`});
    }else if(maxCape>500){
      risks.push({level:'r-amber', ico:'电', text:`对流能量中等（CAPE ${maxCape.toFixed(0)}），午后局地雷雨可能性存在，注意天气变化。`});
    }
    if(minVis < 200){
      risks.push({level:'r-warn', ico:'雾', text:`最低能见度仅 ${(minVis/1000).toFixed(1)} km，低于 200 m 时不建议在无向导、无离线轨迹情况下继续前进，及时下撤。`});
    }else if(minVis < 1000){
      risks.push({level:'r-amber', ico:'雾', text:`能见度最低 ${(minVis/1000).toFixed(1)} km，注意路线辨识，携带离线地图与头灯。`});
    }
    const tMin = d.temperature_2m_min[dayIdx];
    if(tMin<=0){
      risks.push({level:'r-warn', ico:'温', text:`夜间最低气温 ${tMin.toFixed(0)}°，接近或低于 0°，注意失温风险；露营需零下睡袋与防风帐篷。`});
    }else if(tMin<=5){
      risks.push({level:'r-amber', ico:'温', text:`夜间最低 ${tMin.toFixed(0)}°，偏冷，需抓绒/羽绒中间层。`});
    }
    if(S.elevation >= 3000){
      risks.push({level:'r-amber', ico:'高', text:`海拔 ${Math.round(S.elevation)} m，注意高原反应：首日避免剧烈运动、多饮水、观察下撤点与手机信号覆盖。`});
    }
    if(S.prefs.camping){
      risks.push({level:'r-info', ico:'营', text:'计划露营：请选择背风营地，避开溪谷与干河道，帐蓬迎风面加地钉。'});
    }
    if(S.prefs.night || S.prefs.sunrise){
      risks.push({level:'r-info', ico:'灯', text:'夜间/日出前后行动：务必携带头灯（备用电池）、保暖帽与手套；结伴而行，保持首尾呼应。'});
    }
    if(S.prefs.newbie){
      risks.push({level:'r-info', ico:'新', text:'新手提示：控制单日里程，预留 2 倍缓冲时间，下撤点提前确认；不要在天气恶化时硬闯。'});
    }
    if(S.prefs.kids){
      risks.push({level:'r-info', ico:'童', text:'带儿童：高频补水补给，每 40 分钟休息一次；关注其体感与情绪变化，随时可下撤。'});
    }
    if(risks.length===0){
      risks.push({level:'r-ok', ico:'安', text:'综合条件平稳，无明显高风险信号。仍需出发前 12-24 小时再次确认最新预报。'});
    }
    return `<div class="card">
      <h3>徒步安全建议 <span class="tag">${risks.length} 条</span></h3>
      <ul class="risk-list">${risks.map(r=>`<li class="${r.level}"><span class="ico">${r.ico}</span><span>${r.text}</span></li>`).join('')}</ul>
    </div>`;
  },

  /* ===== 多日概览表 ===== */
  renderWeek(d){
    const u = App.utils;
    if(!d) return '';
    const wds = ['日','一','二','三','四','五','六'];
    let rows = '';
    for(let i=0;i<d.time.length;i++){
      const dt = new Date(d.time[i]);
      const wd = '周'+wds[dt.getDay()];
      const isTrip = i===App.STATE.tripDay;
      const label = this.dayLabel(i);
      rows += `<tr style="${isTrip?'background:var(--sun-l)':''}">
        <td class="wd ${isTrip?'today':''}">${label}<br><span style="font-weight:400;color:var(--ink-3)">${d.time[i].slice(5)}${isTrip?' · 出行日':''}</span></td>
        <td>${u.wmoCode(d.weather_code[i])}</td>
        <td>${u.fmtTemp(d.temperature_2m_max[i])} / ${u.fmtTemp(d.temperature_2m_min[i])}</td>
        <td>${d.precipitation_probability_max[i]||0}% / ${(d.precipitation_sum[i]||0).toFixed(1)}mm</td>
        <td>${Math.round(d.wind_speed_10m_max[i])} km/h · ${u.beaufort(d.wind_speed_10m_max[i])}</td>
        <td>${u.fmtTime(d.sunrise[i])} / ${u.fmtTime(d.sunset[i])}</td>
      </tr>`;
    }
    return `<div class="card"><h3>${App.STATE.days} 天概览</h3>
      <div style="overflow-x:auto"><table class="week-table">
        <colgroup><col style="width:14%"><col style="width:14%"><col style="width:18%"><col style="width:22%"><col style="width:18%"><col style="width:14%"></colgroup>
        <thead><tr><th>日期</th><th>天气</th><th>高/低温</th><th>降水概率/量</th><th>最大风</th><th>日出/日落</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }
};
