/* ============================================================
   peaks-db.js — 本地山峰 / 徒步目的地库（WGS-84 坐标）
   优先级：本地库 > 高德 > Mapbox 兜底。
   目的：热门路线、常见景区、广东徒步路线都在本地命中，减少
   高德 POI 请求次数（高德有日配额/QPS 限制，且 key 可能会过期）。

   字段说明：
     n       主名称
     aliases 别名 / 简称 / 英文名（搜索用）
     lat/lon WGS-84 坐标，指向峰顶或徒步核心区（不是城市中心）
     elev    峰顶海拔（米），没有则运行时用 DEM / 模式高程补
     region  展示用行政区
     cat     分类：hot=热门徒步路线、scenic=常见景区徒步、
             gd=广东热门徒步、world=境外著名山峰

   广东条目坐标来源（2026-10 复核）：
     ① "DEM 定位"：在峰顶附近 90 m 网格采样地形高程，取局部最高点，
        并用公开峰顶海拔校验（误差 <10% 视为吻合）；
     ② 景区型目的地（丹霞山、鼎湖山、英西峰林）与未能定位的条目
        使用徒步核心区坐标，elev 留空由运行时 DEM 决定；
     ③ 起微山、黄牛石顶沿用原有坐标，尚未做 DEM 复核。
============================================================ */
window.App = window.App || {};

/* 分类显示名 */
App.PEAK_CATS = { hot: '热门徒步', scenic: '景区徒步', gd: '广东热门', world: '境外山峰' };

App.PEAKS_DB = [
  /* ============================================================
     一、常见景区徒步路线（三山五岳 / 佛教道教名山）
     ============================================================ */
  {n:'黄山光明顶', aliases:['黄山'], lat:30.1330, lon:118.1587, elev:1860, region:'安徽 · 黄山', cat:'scenic', home:2},
  {n:'泰山玉皇顶', aliases:['泰山'], lat:36.2580, lon:117.1010, elev:1532.7, region:'山东 · 泰安', cat:'scenic', home:9},
  {n:'华山南峰', aliases:['华山'], lat:34.4709, lon:110.0850, elev:2154.9, region:'陕西 · 渭南', cat:'scenic', home:10},
  {n:'衡山祝融峰', aliases:['衡山','南岳衡山'], lat:27.2530, lon:112.8640, elev:1300.2, region:'湖南 · 衡阳', cat:'scenic', home:11},
  {n:'嵩山峻极峰', aliases:['嵩山','中岳嵩山'], lat:34.5160, lon:113.0080, elev:1491.7, region:'河南 · 登封', cat:'scenic'},
  {n:'恒山天峰岭', aliases:['恒山','北岳恒山'], lat:39.6700, lon:113.7300, elev:2016.1, region:'山西 · 大同', cat:'scenic'},
  {n:'庐山含鄱口', aliases:['庐山'], lat:29.5500, lon:115.9800, region:'江西 · 九江', cat:'scenic'},
  {n:'雁荡山', aliases:['雁荡'], lat:28.3700, lon:121.1300, region:'浙江 · 温州', cat:'scenic'},
  {n:'武夷山', aliases:['武夷'], lat:27.7200, lon:117.9800, region:'福建 · 南平', cat:'scenic'},
  {n:'峨眉山金顶', aliases:['峨眉山','峨眉'], lat:29.5230, lon:103.3340, elev:3079, region:'四川 · 乐山', cat:'scenic', home:12},
  {n:'九华山天台', aliases:['九华山'], lat:30.2800, lon:117.8200, elev:1306, region:'安徽 · 池州', cat:'scenic'},
  {n:'普陀山', aliases:['普陀'], lat:29.9900, lon:122.3800, region:'浙江 · 舟山', cat:'scenic'},
  {n:'五台山北台', aliases:['五台山'], lat:39.0700, lon:113.5500, elev:3061.1, region:'山西 · 忻州', cat:'scenic'},
  {n:'天柱山', aliases:['天柱'], lat:30.7300, lon:116.4500, elev:1489.8, region:'安徽 · 安庆', cat:'scenic'},
  {n:'三清山', aliases:['三清'], lat:28.9100, lon:118.0700, elev:1819.9, region:'江西 · 上饶', cat:'scenic'},
  {n:'龙虎山', aliases:['龙虎'], lat:28.1100, lon:116.9900, region:'江西 · 鹰潭', cat:'scenic'},
  {n:'武当山', aliases:['武当'], lat:32.4000, lon:111.0000, elev:1612.1, region:'湖北 · 十堰', cat:'scenic'},
  {n:'青城山', aliases:['青城'], lat:30.9000, lon:103.4700, elev:1260, region:'四川 · 都江堰', cat:'scenic'},
  {n:'长白山天池', aliases:['长白山','天池'], lat:42.0060, lon:128.0550, region:'吉林 · 延边', cat:'scenic'},
  {n:'神农架', aliases:['神农顶'], lat:31.4500, lon:110.6700, elev:3106.2, region:'湖北 · 神农架', cat:'scenic'},
  {n:'张家界国家森林公园', aliases:['张家界'], lat:29.3200, lon:110.4300, region:'湖南 · 张家界', cat:'scenic'},
  {n:'天门山', aliases:['天门'], lat:29.0500, lon:110.4800, elev:1518.6, region:'湖南 · 张家界', cat:'scenic'},
  {n:'崀山', aliases:['崀'], lat:26.3000, lon:110.8000, region:'湖南 · 邵阳', cat:'scenic'},
  {n:'九寨沟', aliases:['九寨'], lat:33.2600, lon:103.9200, region:'四川 · 阿坝', cat:'scenic'},
  {n:'黄龙', aliases:['黄龙景区'], lat:32.7500, lon:103.8200, region:'四川 · 阿坝', cat:'scenic'},
  {n:'色达五明佛学院', aliases:['色达','五明佛学院'], lat:32.2700, lon:100.6700, region:'四川 · 甘孜', cat:'scenic'},
  {n:'丹巴', aliases:['甲居藏寨'], lat:30.8800, lon:101.8900, region:'四川 · 甘孜', cat:'scenic'},
  {n:'光雾山', aliases:['光雾'], lat:32.4000, lon:106.7000, region:'四川 · 巴中', cat:'scenic'},
  {n:'玉龙雪山', aliases:['玉龙'], lat:27.1000, lon:100.1800, elev:5596, region:'云南 · 丽江', cat:'scenic'},
  {n:'苍山', aliases:['苍山洱海'], lat:25.6800, lon:100.0900, region:'云南 · 大理', cat:'scenic'},
  {n:'贺兰山', aliases:['贺兰'], lat:38.7000, lon:106.0000, elev:3556.1, region:'宁夏 · 银川', cat:'scenic'},
  {n:'六盘山', aliases:['六盘'], lat:35.5000, lon:106.2000, region:'宁夏 · 固原', cat:'scenic'},
  {n:'兴隆山', aliases:['兴隆'], lat:35.8000, lon:104.1000, region:'甘肃 · 榆中', cat:'scenic'},
  {n:'莽山', aliases:['莽山国家森林公园'], lat:24.9300, lon:112.9500, region:'湖南 · 郴州', cat:'scenic'},
  {n:'猫儿山', aliases:['桂林猫儿山','华南第一峰'], lat:25.8660, lon:110.4130, elev:2141.5, region:'广西 · 桂林', cat:'scenic'},
  {n:'圣堂山', aliases:['大瑶山','金秀圣堂山'], lat:23.9580, lon:110.1170, elev:1979, region:'广西 · 来宾', cat:'scenic'},
  {n:'大明山', aliases:['南宁大明山'], lat:23.4000, lon:108.4300, region:'广西 · 南宁', cat:'scenic'},
  {n:'梵净山', aliases:['铜仁梵净山'], lat:27.8950, lon:108.7030, elev:2572, region:'贵州 · 铜仁', cat:'scenic'},
  {n:'雷公山', aliases:['黔东南雷公山'], lat:26.3830, lon:108.1830, elev:2178.8, region:'贵州 · 黔东南', cat:'scenic'},
  {n:'五指山', aliases:['海南五指山'], lat:18.9000, lon:109.7000, elev:1867, region:'海南 · 五指山', cat:'scenic'},
  {n:'鹦哥岭', aliases:['海南鹦哥岭'], lat:19.0500, lon:109.5200, region:'海南 · 白沙', cat:'scenic'},

  /* ============================================================
     二、中国热门徒步路线（两三天以上、以徒步为目的）
     ============================================================ */
  {n:'武功山金顶', aliases:['武功山','武功山穿越'], lat:27.4686, lon:114.1714, elev:1918.3, region:'江西 · 萍乡', cat:'hot', home:1},
  {n:'四姑娘山大峰', aliases:['大峰'], lat:31.0840, lon:102.8730, elev:5025, region:'四川 · 阿坝', cat:'hot', home:5},
  {n:'四姑娘山二峰', aliases:['二峰'], lat:31.0700, lon:102.9000, elev:5276, region:'四川 · 阿坝', cat:'hot'},
  {n:'四姑娘山三峰', aliases:['三峰'], lat:31.0500, lon:102.9200, elev:5355, region:'四川 · 阿坝', cat:'hot'},
  {n:'四姑娘山幺妹峰', aliases:['幺妹峰'], lat:31.1030, lon:102.9010, elev:6250, region:'四川 · 阿坝', cat:'hot'},
  {n:'贡嘎山', aliases:['贡嘎','蜀山之王'], lat:29.5920, lon:101.8880, elev:7556, region:'四川 · 甘孜', cat:'hot', home:6},
  {n:'那玛峰', aliases:['那玛'], lat:29.5300, lon:101.9200, elev:5588, region:'四川 · 甘孜', cat:'hot'},
  {n:'田海子山', aliases:['田海子'], lat:29.9500, lon:102.0800, region:'四川 · 甘孜', cat:'hot'},
  {n:'牛背山', aliases:['牛背'], lat:29.7800, lon:102.3600, elev:3660, region:'四川 · 雅安', cat:'hot'},
  {n:'达瓦更扎', aliases:['达瓦'], lat:30.8000, lon:102.7500, region:'四川 · 雅安', cat:'hot'},
  {n:'轿顶山', aliases:['轿顶'], lat:29.4000, lon:102.8000, region:'四川 · 雅安', cat:'hot'},
  {n:'光头山', aliases:['光头'], lat:29.9000, lon:102.4000, region:'四川 · 雅安', cat:'hot'},
  {n:'海螺沟', aliases:['海螺'], lat:29.5800, lon:102.0700, region:'四川 · 甘孜', cat:'hot'},
  {n:'新都桥', aliases:['新都'], lat:30.0500, lon:101.4900, region:'四川 · 甘孜', cat:'hot'},
  {n:'稻城亚丁', aliases:['亚丁','稻城'], lat:28.4210, lon:100.1550, region:'四川 · 甘孜', cat:'hot', home:7},
  {n:'三神山·仙乃日', aliases:['仙乃日'], lat:28.3800, lon:100.3300, elev:6032, region:'四川 · 甘孜', cat:'hot'},
  {n:'三神山·央迈勇', aliases:['央迈勇'], lat:28.3700, lon:100.2800, elev:5958, region:'四川 · 甘孜', cat:'hot'},
  {n:'三神山·夏诺多吉', aliases:['夏诺多吉'], lat:28.4000, lon:100.2500, elev:5958, region:'四川 · 甘孜', cat:'hot'},
  {n:'格聂神山', aliases:['格聂'], lat:29.6500, lon:99.7500, elev:6204, region:'四川 · 甘孜', cat:'hot'},
  {n:'雀儿山', aliases:['雀儿'], lat:31.9000, lon:99.1000, elev:6168, region:'四川 · 甘孜', cat:'hot'},
  {n:'年保玉则', aliases:['年保'], lat:33.4000, lon:101.1000, elev:5369, region:'青海 · 久治', cat:'hot'},
  {n:'莲宝叶则', aliases:['莲宝'], lat:33.3000, lon:101.0000, region:'四川 · 阿坝', cat:'hot'},
  {n:'莫斯卡', aliases:['莫斯'], lat:31.1000, lon:101.3000, region:'四川 · 甘孜', cat:'hot'},
  {n:'大瓦山', aliases:['大瓦'], lat:29.3000, lon:103.0000, region:'四川 · 乐山', cat:'hot'},
  {n:'雨崩村', aliases:['雨崩'], lat:28.3750, lon:98.7360, region:'云南 · 迪庆', cat:'hot', home:3},
  {n:'梅里雪山·卡瓦格博', aliases:['梅里雪山','卡瓦格博','梅里'], lat:28.4400, lon:98.6800, elev:6740, region:'云南 · 迪庆', cat:'hot'},
  {n:'虎跳峡', aliases:['虎跳'], lat:27.1830, lon:100.0830, region:'云南 · 丽江', cat:'hot', home:4},
  {n:'哈巴雪山', aliases:['哈巴'], lat:27.3600, lon:100.0900, elev:5396, region:'云南 · 迪庆', cat:'hot'},
  {n:'丙中洛', aliases:['丙中'], lat:28.0200, lon:98.6300, region:'云南 · 怒江', cat:'hot'},
  {n:'无底湖', aliases:['无底'], lat:28.1000, lon:99.8000, region:'云南 · 迪庆', cat:'hot'},
  {n:'太白山拔仙台', aliases:['太白山','拔仙台'], lat:33.9500, lon:107.7700, elev:3771.2, region:'陕西 · 宝鸡', cat:'hot'},
  {n:'鳌山', aliases:['鳌'], lat:33.9000, lon:107.4000, elev:3476, region:'陕西 · 宝鸡', cat:'hot'},
  {n:'鳌太线·导航架', aliases:['鳌太线','鳌太','导航架'], lat:34.0000, lon:107.5000, region:'陕西 · 秦岭', cat:'hot', home:8},
  {n:'冰晶顶', aliases:['冰晶'], lat:33.8500, lon:108.8000, elev:3015.1, region:'陕西 · 西安', cat:'hot'},
  {n:'小五台山', aliases:['小五台','小五'], lat:39.9000, lon:115.0000, elev:2882, region:'河北 · 张家口', cat:'hot'},
  {n:'海坨山', aliases:['海坨'], lat:40.5500, lon:115.8200, elev:2241, region:'北京 · 延庆', cat:'hot'},
  {n:'东灵山', aliases:['东灵','灵山'], lat:39.9700, lon:115.5000, elev:2303, region:'北京 · 门头沟', cat:'hot'},
  {n:'南迦巴瓦峰', aliases:['南迦巴瓦'], lat:29.5900, lon:95.0600, elev:7782, region:'西藏 · 林芝', cat:'hot'},
  {n:'珠穆朗玛峰', aliases:['珠峰','Mount Everest','Everest'], lat:27.9880, lon:86.9250, elev:8848.86, region:'西藏 · 日喀则', cat:'hot'},
  {n:'珠峰大本营', aliases:['大本营'], lat:28.1400, lon:86.8500, region:'西藏 · 日喀则', cat:'hot'},
  {n:'冈仁波齐', aliases:['冈仁波齐峰','神山'], lat:31.0700, lon:81.3100, elev:6656, region:'西藏 · 阿里', cat:'hot'},
  {n:'纳木那尼峰', aliases:['纳木那尼'], lat:30.4000, lon:81.3000, elev:7694, region:'西藏 · 阿里', cat:'hot'},
  {n:'墨脱', aliases:['墨脱县'], lat:29.3300, lon:95.3300, region:'西藏 · 林芝', cat:'hot'},
  {n:'洛堆峰', aliases:['洛堆'], lat:29.6000, lon:90.9000, region:'西藏 · 拉萨', cat:'hot'},
  {n:'玉珠峰', aliases:['玉珠'], lat:35.6500, lon:94.2500, elev:6178, region:'青海 · 格尔木', cat:'hot'},
  {n:'慕士塔格峰', aliases:['慕士塔格'], lat:38.2800, lon:75.1200, elev:7546, region:'新疆 · 克州', cat:'hot'},
  {n:'博格达峰', aliases:['博格达'], lat:43.8000, lon:88.3500, elev:5445, region:'新疆 · 昌吉', cat:'hot'},
  {n:'喀纳斯', aliases:['喀纳斯湖'], lat:48.7000, lon:87.0000, region:'新疆 · 阿勒泰', cat:'scenic'},
  {n:'禾木村', aliases:['禾木'], lat:48.5800, lon:87.4300, region:'新疆 · 阿勒泰', cat:'scenic'},
  {n:'那拉提草原', aliases:['那拉提'], lat:43.3000, lon:84.0000, region:'新疆 · 伊犁', cat:'scenic'},
  {n:'飞来寺', aliases:['飞来'], lat:28.4500, lon:98.8800, region:'云南 · 迪庆', cat:'scenic'},
  {n:'老山', aliases:['老山战役'], lat:22.9500, lon:104.8500, region:'云南 · 文山', cat:'scenic'},

  /* —— 湖南（南岭北麓、南岳） —— */
  {n:'狮子口', aliases:['郴州狮子口'], lat:25.6878, lon:113.2184, region:'湖南 · 郴州', cat:'hot'},
  {n:'瑶峰', aliases:['天鹅峰','瑶岭','瑶岗仙'], lat:25.6679, lon:113.3112, region:'湖南 · 郴州', cat:'hot'},
  {n:'酃峰', aliases:['神农峰','斗笠顶','湖南最高峰'], lat:26.3140, lon:113.9830, elev:2115.2, region:'湖南 · 株洲', cat:'hot'},
  {n:'齐云山', aliases:['桂东齐云山'], lat:25.6500, lon:113.9700, region:'湖南 · 郴州', cat:'hot'},
  {n:'八面山', aliases:['郴州八面山'], lat:26.0000, lon:113.5500, region:'湖南 · 郴州', cat:'hot'},
  {n:'韭菜岭', aliases:['永州韭菜岭'], lat:25.5300, lon:111.3200, elev:2009.3, region:'湖南 · 永州', cat:'hot'},

  /* ============================================================
     三、广东热门徒步路线（两步路高频线路）
     ============================================================ */
  {n:'船底顶',
   aliases:['船底顶穿越','罗坑船底顶','广东徒步圣地'],
   lat:24.4810, lon:113.2620, elev:1586,        // DEM 定位 1578 m，与公开 1586 m 吻合
   region:'广东 · 韶关/曲江', cat:'gd'},
  {n:'云髻山',
   aliases:['新丰云髻山','亚婆髻','广东香格里拉'],
   lat:24.1160, lon:114.1620, elev:1422,        // DEM 定位 1347 m
   region:'广东 · 韶关/新丰', cat:'gd'},
  {n:'狗尾嶂',
   aliases:['乳源狗尾嶂'],
   lat:24.9440, lon:113.2310,                   // DEM 定位 1581 m
   region:'广东 · 韶关/乳源', cat:'gd'},
  {n:'丹霞山',
   aliases:['丹霞','韶关丹霞山','长老峰'],
   lat:24.9710, lon:113.7280,                   // 景区核心区（非最高峰）
   region:'广东 · 韶关/仁化', cat:'gd'},
  {n:'石坑崆',
   aliases:['猛坑石','广东第一峰','南岭石坑崆'],
   lat:24.9260, lon:112.9910, elev:1902,        // DEM 定位 1835 m
   region:'广东 · 清远/阳山', cat:'gd'},
  {n:'天堂岭',
   aliases:['连州天堂岭'],
   lat:25.1870, lon:112.4430,                   // DEM 定位 1697 m
   region:'广东 · 清远/连州', cat:'gd'},
  {n:'天井山',
   aliases:['广东天井山','天井山原始森林'],
   lat:24.7000, lon:112.8970,                   // DEM 定位 1675 m
   region:'广东 · 清远/阳山', cat:'gd'},
  {n:'大东山',
   aliases:['连州大东山'],
   lat:24.6960, lon:113.2150,                   // DEM 定位 1323 m
   region:'广东 · 清远/连州', cat:'gd'},
  {n:'大雾山',
   aliases:['连山大雾山'],
   lat:24.8420, lon:112.1560,                   // DEM 定位 1285 m
   region:'广东 · 清远/连山', cat:'gd'},
  {n:'起微山',
   aliases:['连南起微山'],
   lat:24.4714, lon:112.1958,                   // 沿用原坐标，未做 DEM 复核
   region:'广东 · 清远/连南', cat:'gd'},
  {n:'英西峰林',
   aliases:['英西峰林走廊','九龙峰林','洞天仙境'],
   lat:24.0500, lon:112.8600,                   // 徒步走廊核心区（喀斯特谷地）
   region:'广东 · 清远/英德', cat:'gd'},
  {n:'罗浮山',
   aliases:['飞云顶','博罗罗浮山','罗浮山飞云顶'],
   lat:23.2830, lon:114.0160, elev:1296,        // DEM 定位 1266 m（飞云顶）
   region:'广东 · 惠州/博罗', cat:'gd'},
  {n:'南昆山',
   aliases:['惠州南昆山','天堂顶','南昆山天堂顶'],
   lat:23.7080, lon:113.7740,                   // DEM 定位 1066 m（天堂顶）
   region:'广东 · 惠州/龙门', cat:'gd'},
  {n:'象头山',
   aliases:['博罗象头山','象头山保护区'],
   lat:23.4780, lon:114.2780,                   // DEM 定位 832 m
   region:'广东 · 惠州/博罗', cat:'gd'},
  {n:'银瓶山',
   aliases:['银瓶嘴','东莞银瓶山','东莞第一峰'],
   lat:22.8970, lon:114.2550, elev:898,         // DEM 定位 932 m
   region:'广东 · 东莞/清溪', cat:'gd'},
  {n:'黄牛石顶',
   aliases:['连平黄牛石'],
   lat:24.5092, lon:114.4564,                   // 沿用原坐标，未做 DEM 复核
   region:'广东 · 河源/连平', cat:'gd'},
  {n:'大雾岭',
   aliases:['茂名大雾岭','云雾山','信宜大雾岭'],
   lat:22.2920, lon:111.2160, elev:1704,        // DEM 定位 1646 m
   region:'广东 · 茂名/信宜', cat:'gd'},
  {n:'阴那山',
   aliases:['梅州阴那山','五指峰'],
   lat:24.3940, lon:116.4140, elev:1297,        // DEM 定位 1211 m
   region:'广东 · 梅州/梅县', cat:'gd'},
  {n:'凤凰山',
   aliases:['潮州凤凰山','凤凰髻','乌岽顶'],
   lat:23.9100, lon:116.5970,                   // DEM 定位 1441 m（乌岽顶）
   region:'广东 · 潮州/潮安', cat:'gd'},
  {n:'鼎湖山',
   aliases:['肇庆鼎湖山','鸡笼山'],
   lat:23.1600, lon:112.5300,                   // 景区核心区
   region:'广东 · 肇庆/鼎湖', cat:'gd'},
  {n:'梧桐山',
   aliases:['深圳梧桐山','大梧桐','深圳第一峰'],
   lat:22.5805, lon:114.2098, elev:943.7,
   region:'广东 · 深圳', cat:'gd'},
  {n:'七娘山',
   aliases:['深圳七娘山','大鹏七娘山'],
   lat:22.5244, lon:114.5673, elev:869,
   region:'广东 · 深圳', cat:'gd'},
  {n:'大云雾山',
   aliases:['云浮大云雾山','罗定大云雾山'],
   lat:22.7051, lon:111.9576, elev:1140,
   region:'广东 · 云浮', cat:'gd'},
  {n:'天露山',
   aliases:['天露山旅游度假区','新兴天露山'],
   lat:22.4847, lon:112.2384, elev:1250,
   region:'广东 · 江门/新兴', cat:'gd'},

  /* ============================================================
     四、境外著名山峰
     ============================================================ */
  {n:'K2 乔戈里峰', aliases:['K2','乔戈里'], lat:35.8800, lon:76.5100, elev:8611, region:'巴基斯坦 · 中国', cat:'world'},
  {n:'干城章嘉峰', aliases:['干城章嘉'], lat:27.7000, lon:88.1500, elev:8586, region:'尼泊尔 · 印度', cat:'world'},
  {n:'安纳普尔纳峰', aliases:['Annapurna','安纳普尔纳'], lat:28.6000, lon:83.8200, elev:8091, region:'尼泊尔', cat:'world'},
  {n:'富士山', aliases:['富士','Fuji','Mount Fuji'], lat:35.3600, lon:138.7300, elev:3776, region:'日本', cat:'world'},
  {n:'马特洪峰', aliases:['Matterhorn'], lat:45.9800, lon:7.6500, elev:4478, region:'瑞士 · 意大利', cat:'world'},
  {n:'勃朗峰', aliases:['Mont Blanc','白朗峰'], lat:45.8300, lon:6.8700, elev:4808.7, region:'法国 · 意大利', cat:'world'},
  {n:'乞力马扎罗山', aliases:['Kilimanjaro','乞力马扎罗'], lat:-3.0700, lon:37.3500, elev:5895, region:'坦桑尼亚', cat:'world'},
  {n:'阿空加瓜山', aliases:['Aconcagua'], lat:-32.6500, lon:-70.0100, elev:6961, region:'阿根廷', cat:'world'},
  {n:'麦金利山', aliases:['Denali','迪纳利'], lat:63.0700, lon:-151.0000, elev:6190, region:'美国 · 阿拉斯加', cat:'world'},
  {n:'厄尔布鲁士山', aliases:['Elbrus','厄尔布鲁士'], lat:43.3500, lon:42.4400, elev:5642, region:'俄罗斯', cat:'world'}
];

/* 本地库匹配：分级打分，查询词至少 2 个字符。
   旧实现 name.includes(q) && q.includes(name) 没有长度门槛，
   单字"山"会命中 70+ 条，等于把选择权丢回给用户。 */
App.matchPeaks = function(query, limit){
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if(q.length < 2) return [];
  const hits = [];
  App.PEAKS_DB.forEach(p => {
    const names = [p.n].concat(p.aliases || []).map(x => String(x).toLowerCase());
    let score = 0;
    for(const name of names){
      if(name === q) score = Math.max(score, 100);
      else if(name.startsWith(q)) score = Math.max(score, 80);
      else if(name.includes(q)) score = Math.max(score, 60);
      else if(q.includes(name) && name.length >= 2) score = Math.max(score, 40);
    }
    if(score > 0){
      hits.push({
        name: p.n,
        sub: (App.PEAK_CATS[p.cat] || '本地库') + ' · ' + (p.region || '') + (p.elev ? ` · ${Math.round(p.elev)} m` : ''),
        lat: p.lat, lon: p.lon, elev: p.elev, cat: p.cat,
        source: 'local',
        _score: score
      });
    }
  });
  // 同分时短名优先：查"华山"时"华山南峰"排在"九华山天台"之前
  hits.sort((a, b) => b._score - a._score || a.name.length - b.name.length);
  return typeof limit === 'number' ? hits.slice(0, limit) : hits;
};

/* 本地库是否有"强命中"（精确或前缀）：有则不必再打高德，省额度 */
App.hasStrongLocalMatch = function(query){
  const hits = App.matchPeaks(query, 3);
  return hits.length > 0 && hits[0]._score >= (App.CONFIG.LOCAL_STRONG_SCORE || 80);
};
