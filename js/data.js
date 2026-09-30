(function(root){
'use strict';
const RCI_LABELS={r1:'R$ 低所得住宅',r2:'R$$ 中所得住宅',r3:'R$$$ 高所得住宅',cs1:'CS$ 生活サービス',cs2:'CS$$ 中級サービス',cs3:'CS$$$ 高級サービス',co2:'CO$$ オフィス',co3:'CO$$$ 高級オフィス',ag:'I-Ag 農業',dirty:'I-D 重工業',manufacturing:'I-M 製造業',hightech:'I-HT ハイテク'};
const POLICY_INFO={recycling:{name:'リサイクル推進条例',cost:35,desc:'ごみ発生量を減らし、環境評価を改善します。'},cleanAir:{name:'大気浄化条例',cost:55,desc:'工業・交通由来の大気汚染を抑えます。'},transit:{name:'公共交通利用促進',cost:45,desc:'自動車利用を減らし、バス・鉄道・地下鉄を利用しやすくします。'},waterConservation:{name:'節水条例',cost:25,desc:'住宅・商工業の水使用量を抑えます。'},educationCampaign:{name:'教育振興プログラム',cost:70,desc:'教育サービス効果と高度産業の需要を押し上げます。'},businessPromotion:{name:'企業誘致プログラム',cost:85,desc:'商業・オフィス需要を高めますが、毎月費用がかかります。'}};
const CATALOG={
 street:{name:'街路',cat:'traffic',price:10,upkeep:.2,network:'road',capacity:180,desc:'細い灰色の生活道路。中央線なし。通行容量は小さめ。大きな区画を指定すると自動配置されます。'},
 road:{name:'道路',cat:'traffic',price:25,upkeep:.5,network:'road',capacity:750,desc:'中央に破線がある2車線道路。街路より高速・大容量で、境界へ延ばすと隣町に接続できます。'},
 avenue:{name:'大通り',cat:'traffic',price:65,upkeep:1,network:'road',capacity:2200,desc:'緑の中央分離帯がある幅広い4車線道路。幹線道路向けで、既存道路を更新できます。'},
 highway:{name:'高速道路',cat:'traffic',price:140,upkeep:2,network:'road',capacity:6500,desc:'濃い舗装と白い側線・ガードレールが目印の大容量道路。都市間・長距離交通向けです。'},
 rail:{name:'鉄道',cat:'traffic',price:30,upkeep:.4,network:'rail',desc:'駅で道路と乗り換え。隣町までつなぐと都市間通勤に使えます。'},
 station:{name:'鉄道駅',cat:'traffic',price:500,upkeep:15,w:2,h:1,desc:'周囲2マス以内の道路と線路を結びます。両方が必要。'},
 freightStation:{name:'貨物駅',cat:'traffic',price:1800,upkeep:45,w:2,h:2,desc:'道路と鉄道の両方に接続すると、工業貨物を鉄道で地域外・隣接都市へ搬出します。'},
 bus:{name:'バス停',cat:'traffic',price:100,upkeep:4,desc:'周辺の道路を走る通勤車両を減らします。'},
 subway:{name:'地下鉄線路',cat:'traffic',price:90,upkeep:1,network:'subway',desc:'地下に敷設。地下鉄駅で道路網と接続します。'},
 metro:{name:'地下鉄駅',cat:'traffic',price:700,upkeep:20,desc:'周囲1マスの道路と地下鉄を結びます。'},
 port:{name:'港',cat:'traffic',price:5500,upkeep:120,w:3,h:2,coast:true,desc:'水辺に建設。道路と電力があれば工業の貨物輸送を支えます。'},
 airfield:{name:'小規模飛行場',cat:'traffic',price:6500,upkeep:150,w:4,h:3,air:10,unlock:25000,desc:'人口25,000人で利用可能。商業の外部アクセスを少し改善します。'},
 airport:{name:'都市空港',cat:'traffic',price:16000,upkeep:340,w:5,h:4,air:18,unlock:150000,desc:'人口150,000人で利用可能。商業需要と外部アクセスを高めます。'},
 international:{name:'国際空港',cat:'traffic',price:52000,upkeep:980,w:7,h:5,air:26,unlock:600000,desc:'人口600,000人で利用可能。大規模商業・高所得オフィスを強く支えます。'},
 cargoPort:{name:'大規模貨物港',cat:'traffic',price:14000,upkeep:280,w:5,h:3,coast:true,unlock:200000,desc:'人口200,000人で利用可能。大量の工業貨物を都市外へ送り出します。'},
 powerLine:{name:'送電線',cat:'power',price:8,upkeep:.08,network:'powerLine',desc:'発電所・区画間を接続。道路だけでは電力は届きません。'},
 wind:{name:'風力発電',cat:'power',price:800,upkeep:18,power:500,desc:'公害のない小規模電源。'},
 coal:{name:'石炭発電所',cat:'power',price:6000,upkeep:180,power:15000,air:34,waterPoll:12,w:3,h:3,desc:'大きな供給能力と低い費用。強い公害が発生します。'},
 oil:{name:'石油発電所',cat:'power',price:8500,upkeep:230,power:19000,air:24,waterPoll:8,w:3,h:3,desc:'石炭より公害が少ない大規模電源。'},
 gas:{name:'ガス発電所',cat:'power',price:11000,upkeep:280,power:23000,air:14,waterPoll:3,w:3,h:3,desc:'公害と費用のバランスを取った電源。'},
 solar:{name:'太陽光発電所',cat:'power',price:14000,upkeep:130,power:12000,w:3,h:3,desc:'建設費は高め。大気・水質を汚染しません。'},
 nuclear:{name:'原子力発電所',cat:'power',price:40000,upkeep:850,power:75000,w:4,h:4,unlock:100000,desc:'人口100,000人で利用可能。大容量で運転時の大気汚染なし。'},
 sewerPipe:{name:'下水管',cat:'water',price:7,upkeep:.06,network:'sewerPipe',desc:'地下に敷設。処理施設につながる管から4マス以内の建物の汚水を集めます。'},
 septic:{name:'小型下水処理場',cat:'water',price:1200,upkeep:45,w:2,h:2,sewage:650,desc:'小さな街向けの下水処理施設。道路・電気・下水管が必要です。'},
 sewagePlant:{name:'下水処理場',cat:'water',price:9500,upkeep:230,w:3,h:3,sewage:12000,desc:'大量の生活排水・工業排水を処理します。道路・電気・下水管が必要です。'},
 outfall:{name:'排水口',cat:'water',price:2200,upkeep:55,w:2,h:2,sewage:5000,discharge:22,coast:true,desc:'安価に下水を排出できますが、稼働量に応じて周辺の水質を悪化させます。水辺・道路・電気・下水管が必要です。'},
 pipe:{name:'水道管',cat:'water',price:6,upkeep:.05,network:'pipe',desc:'給水施設から地下に敷設。周囲4マスへ水を供給。境界でも接続できます。'},
 tower:{name:'給水塔',cat:'water',price:500,upkeep:15,water:1200,desc:'電力と配管が必要。水質のよい場所に。'},
 pump:{name:'ポンプ場',cat:'water',price:1800,upkeep:45,water:12000,w:2,h:2,desc:'大量の水を供給。周辺の水質汚染で能力が低下します。'},
 treatment:{name:'浄水施設',cat:'water',price:7000,upkeep:180,w:3,h:2,cleanWater:30,desc:'道路と電力があれば周囲の水質汚染を減らします。'},
 landfill:{name:'ごみ埋立地',cat:'environment',price:900,upkeep:25,w:3,h:3,waste:70,storage:18000,air:6,waterPoll:18,desc:'道路からごみを受け入れます。埋立容量を使い切ると増設が必要。'},
 recycle:{name:'リサイクル施設',cat:'environment',price:3500,upkeep:75,w:2,h:2,waste:55,desc:'道路と電力があればごみを資源化。埋立容量を使いません。'},
 incinerator:{name:'焼却発電施設',cat:'environment',price:11000,upkeep:260,w:3,h:3,waste:250,power:350,air:25,waterPoll:5,desc:'ごみを処理し発電します。公害への対策が必要。'},
 park:{name:'公園',cat:'environment',price:150,upkeep:4,service:'park',radius:5,desc:'近隣の住環境を改善し、大気汚染を少し減らします。'},
 forest:{name:'植樹',cat:'environment',price:8,desc:'空き地に植樹。少しずつ大気汚染を減らします。'},
 police:{name:'警察署',cat:'civic',price:1800,upkeep:70,w:1,h:1,service:'police',radius:8,capacity:18000,desc:'周辺の犯罪を抑え、住環境を改善します。'},
 fire:{name:'消防署',cat:'civic',price:1600,upkeep:65,w:1,h:1,service:'fire',radius:9,capacity:22000,desc:'周辺の火災リスクを下げます。'},
 school:{name:'小学校',cat:'civic',price:2200,upkeep:90,w:1,h:1,service:'education',radius:7,capacity:1200,desc:'周辺の教育を充実させ、発展を支えます。'},
 highschool:{name:'高校',cat:'civic',price:3800,upkeep:130,w:2,h:2,service:'education',radius:11,capacity:2200,desc:'広い範囲の教育を支えます。'},
 university:{name:'大学',cat:'civic',price:12000,upkeep:280,w:2,h:2,service:'education',radius:18,capacity:6500,unlock:100000,desc:'人口100,000人で利用可能。高度な産業と高密度の発展を支えます。'},
 library:{name:'図書館',cat:'civic',price:1000,upkeep:35,w:1,h:1,service:'education',radius:5,capacity:700,desc:'小規模な地域の教育施設。'},
 clinic:{name:'診療所',cat:'civic',price:1200,upkeep:50,service:'health',radius:6,capacity:900,desc:'周囲の健康を支え、公害による悪影響を和らげます。'},
 hospital:{name:'病院',cat:'civic',price:6500,upkeep:220,w:2,h:2,service:'health',radius:14,capacity:4800,desc:'広い範囲をカバーする医療施設。'},
 townhall:{name:'役所',cat:'civic',price:3000,upkeep:45,w:1,h:1,service:'park',radius:6,desc:'まちのシンボル。建設は任意で、道路網の起点にはなりません。'},
 mayorhouse:{name:'市長公邸',cat:'civic',price:4500,upkeep:55,w:1,h:1,service:'park',radius:8,unlock:10000,desc:'人口10,000人で解禁。周辺の地価と住民満足度を高める報奨施設。'},
 museum:{name:'市立博物館',cat:'civic',price:8000,upkeep:160,w:2,h:2,service:'education',radius:12,capacity:3000,unlock:50000,desc:'人口50,000人で解禁。教育と周辺の魅力を高めます。'},
 stadium:{name:'市民スタジアム',cat:'civic',price:18000,upkeep:360,w:5,h:4,service:'park',radius:14,unlock:250000,desc:'人口250,000人で解禁。商業活動と都市の魅力を高めます。'},
 convention:{name:'コンベンションセンター',cat:'civic',price:26000,upkeep:440,w:5,h:3,service:'park',radius:12,unlock:500000,desc:'人口500,000人で解禁。オフィス・商業需要を高めます。'},
 landmark:{name:'ランドマークタワー',cat:'civic',price:60000,upkeep:650,w:4,h:4,service:'park',radius:20,unlock:1000000,desc:'人口1,000,000人で解禁。周辺の地価と高級商業需要を大きく高めます。'},
 raise:{name:'高くする',cat:'terrain',terrain:true,desc:'ドラッグで土地を隆起させます。都市設立前は無料。'},
 lower:{name:'低くする',cat:'terrain',terrain:true,desc:'土地を掘り下げ、海面より下になると水面になります。'},
 smooth:{name:'なだらかに',cat:'terrain',terrain:true,desc:'周囲の高さを平均して傾斜を和らげます。'},
 flatten:{name:'整地',cat:'terrain',terrain:true,desc:'ブラシを置いた地点の高さに土地をそろえます。'},
 inspect:{name:'調べる・移動',cat:'other',desc:'建物・道路をクリックして、入居・通勤・貨物・地価・成長要因まで詳しく確認。ドラッグで地図を移動。'},
 bulldoze:{name:'撤去',cat:'other',price:5,desc:'地上の建物や道路を撤去。地下表示中はその地下設備だけを撤去。'},
 dezone:{name:'区画解除',cat:'zone',price:2,desc:'区画指定と、その上に発展した建物を取り除きます。'}
};
const ZONE_NAMES={
 res:['','戸建住宅','低層集合住宅','中高層住宅','高層住宅','超高層住宅'],
 com:['','近隣商業','商業街','中層業務','高層業務','超高層業務'],
 ind:['','農業','軽工業','製造業','高度工業','ハイテク産業']
};
const ZONE_PRICES=[0,10,16,24,38,55];
for(const z of ['res','com','ind'])for(let d=1;d<=5;d++){const label=ZONE_NAMES[z][d];CATALOG[z+d]={name:label,cat:'zone',zone:z,density:d,price:ZONE_PRICES[d],desc:z==='res'?'指定した段階を上限に、人口・水道・教育・医療・立地が整うと戸建てから段階的に再開発されます。':z==='com'?'指定した段階を上限に、需要と都市規模に応じて商店から大規模業務地区へ発展します。':d===1?'農業用地。人口が増えても農地として維持されます。':'指定した段階を上限に、物流・教育・需要に応じて産業が高度化します。'};}
root.MachiData={RCI_LABELS,POLICY_INFO,CATALOG};
})(typeof window!=='undefined'?window:globalThis);
