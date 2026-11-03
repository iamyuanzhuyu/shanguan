/* ============================================================
   forecast.js — 景观预测算法：云海概率、日出观赏
============================================================ */
window.App = window.App || {};

App.forecast = {
  /* ===== 云海概率 ===== */
  calcSeaOfCloud(h, d, dayIdx){
    const u = App.utils;
    if(!h || !d) return {score:0, level:0, text:'—', reasons:[], bestTime:'—'};
    const sunriseIso = d.sunrise[dayIdx];
    const dateStr = sunriseIso.slice(0,10);
    const sunriseHour = parseInt(sunriseIso.slice(11,13));
    const sunriseMin = parseInt(sunriseIso.slice(14,16));
    const sunriseTotalMin = sunriseHour*60 + sunriseMin;
    // 窗口：日出前 60 分钟 ~ 日出后 60 分钟
    const h0 = Math.floor((sunriseTotalMin-60)/60);
    const h1 = Math.ceil((sunriseTotalMin+60)/60);
    const i0 = u.timeToIdx(h.time, dateStr, h0);
    const i1 = u.timeToIdx(h.time, dateStr, h1);
    if(i0<0 || i1<0) return {score:0, level:0, text:'数据不足', reasons:['预报窗口数据缺失'], bestTime:'—'};

    const rh = u.avg(h.relative_humidity_2m, i0, i1+1);
    const wind = u.avg(h.wind_speed_10m, i0, i1+1);
    const lowC = u.avg(h.cloud_cover_low, i0, i1+1);
    const midC = u.avg(h.cloud_cover_mid, i0, i1+1);
    const highC = u.avg(h.cloud_cover_high, i0, i1+1);
    const visRaw = u.avg(h.visibility, i0, i1+1);
    const vis = visRaw == null ? null : visRaw / 1000; // null=数据缺失，不臆测为大雾
    const precPrev = d.precipitation_sum[dayIdx-1] || 0;

    let score = 0;
    const reasons = [];
    if(rh == null){ reasons.push('湿度数据缺失，该项不参与评分'); }
    else if(rh>=95){ score+=30; reasons.push(`相对湿度 ${rh.toFixed(0)}%（极高，有利）`); }
    else if(rh>=85){ score+=22; reasons.push(`相对湿度 ${rh.toFixed(0)}%（较高，有利）`); }
    else if(rh>=75){ score+=12; reasons.push(`相对湿度 ${rh.toFixed(0)}%（一般）`); }
    else if(rh>=70){ score+=5; reasons.push(`相对湿度 ${rh.toFixed(0)}%（偏干）`); }
    else { reasons.push(`相对湿度 ${rh.toFixed(0)}%（偏干，不利）`); }

    if(wind == null){ reasons.push('风速数据缺失，该项不参与评分'); }
    else if(wind<=12){ score+=22; reasons.push(`日出前后风速 ${wind.toFixed(0)} km/h（${u.beaufort(wind)}，静稳，有利）`); }
    else if(wind<=20){ score+=14; reasons.push(`风速 ${wind.toFixed(0)} km/h（${u.beaufort(wind)}，可接受）`); }
    else if(wind<=29){ score+=5; reasons.push(`风速 ${wind.toFixed(0)} km/h（${u.beaufort(wind)}，偏大）`); }
    else { reasons.push(`风速 ${wind.toFixed(0)} km/h（${u.beaufort(wind)}，吹散云层，不利）`); }

    if(precPrev>=5){ score+=18; reasons.push(`前夜降水 ${precPrev.toFixed(1)} mm（水汽充足）`); }
    else if(precPrev>=1){ score+=12; reasons.push(`前夜降水 ${precPrev.toFixed(1)} mm（有一定水汽）`); }
    else if(precPrev>0.1){ score+=6; reasons.push(`前夜微量降水`); }
    else { reasons.push('前夜无降水，水汽不足'); }

    if(lowC == null){ reasons.push('低云量数据缺失，该项不参与评分'); }
    else if(lowC>=70){ score+=18; reasons.push(`低云量 ${lowC.toFixed(0)}%（充足）`); }
    else if(lowC>=40){ score+=10; reasons.push(`低云量 ${lowC.toFixed(0)}%（中等）`); }
    else { reasons.push(`低云量仅 ${lowC.toFixed(0)}%（偏低）`); }

    const mh = (midC == null || highC == null) ? null : (midC+highC)/2;
    if(mh == null){ reasons.push('中高云数据缺失，该项不参与评分'); }
    else if(mh<=30){ score+=12; reasons.push(`中高云 ${mh.toFixed(0)}%（通透，能见云海）`); }
    else if(mh<=60){ score+=6; reasons.push(`中高云 ${mh.toFixed(0)}%（一般）`); }
    else { reasons.push(`中高云 ${mh.toFixed(0)}%（偏厚，可能遮蔽）`); }

    if(vis == null){ reasons.push('能见度数据缺失，不臆测大雾'); }
    else if(vis<1){ score-=8; reasons.push(`能见度仅 ${vis.toFixed(1)} km（云顶过高，观景台可能在云里）`); }
    else if(vis<=15){ reasons.push(`能见度 ${vis.toFixed(1)} km（适中）`); }

    score = Math.max(0, Math.min(95, Math.round(score)));
    let level, text;
    if(score<20){level=0;text='概率很低，不建议专门为云海出发';}
    else if(score<40){level=1;text='可以尝试，但要有备选计划';}
    else if(score<60){level=2;text='有一定机会，重点关注清晨湿度与云高';}
    else if(score<80){level=3;text='机会较好，其他条件稳定可考虑前往';}
    else {level=3;text='条件较理想，出发前再次确认实时天气';}
    return {score, level, text, reasons, bestTime: sunriseIso.slice(11,16)+' 前后 1 小时'};
  },

  /* ===== 日出观赏 ===== */
  calcSunriseView(h, d, dayIdx){
    const u = App.utils;
    if(!h || !d) return {score:0, text:'—', detail:''};
    const sunriseIso = d.sunrise[dayIdx];
    const dateStr = sunriseIso.slice(0,10);
    const sh = parseInt(sunriseIso.slice(11,13));
    const sm = parseInt(sunriseIso.slice(14,16));
    const totalMin = sh*60+sm;
    const h0 = Math.floor((totalMin-30)/60);
    const h1 = Math.ceil((totalMin+30)/60);
    const i0 = u.timeToIdx(h.time, dateStr, h0);
    const i1 = u.timeToIdx(h.time, dateStr, h1);
    if(i0<0||i1<0) return {score:0, text:'数据不足', detail:''};

    const lowC = u.avg(h.cloud_cover_low, i0, i1+1);
    const midC = u.avg(h.cloud_cover_mid, i0, i1+1);
    const highC = u.avg(h.cloud_cover_high, i0, i1+1);
    const pop = u.avg(h.precipitation_probability, i0, i1+1);
    const visRaw = u.avg(h.visibility, i0, i1+1);
    const vis = visRaw == null ? null : visRaw/1000;
    const wind = u.avg(h.wind_speed_10m, i0, i1+1);

    const v = x => x == null ? '—' : x.toFixed(0);
    let score, text;
    if(lowC != null && pop != null && vis != null && lowC<30 && pop<20 && vis>5){ score=80; text='观赏条件好'; }
    else if(lowC != null && pop != null && lowC<55 && pop<40){ score=55; text='一般，可能有层次云或朝霞'; }
    else { score=25; text='观赏概率低，云层厚或有降水'; }
    const mh = (midC == null || highC == null) ? null : (midC+highC)/2;
    let detail = `日出前后低云 ${v(lowC)}%、中高云 ${v(mh)}%、降水概率 ${v(pop)}%、能见度 ${vis==null?'—':vis.toFixed(1)} km、风速 ${v(wind)} km/h。`;
    if(wind != null && wind>20) detail += ' 山顶风大，注意保暖防风。';
    return {score, text, detail};
  }
};
