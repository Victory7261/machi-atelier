(function(root){
'use strict';
const E=root.CityEngine;
function CityRenderer(canvas){
 const ctx=canvas.getContext('2d');let g=ctx,N=E.N,TW=20,TH=10,mapScale=1,light=0,grid=[],view='region',city=null,world=null;
 const NEIGHBOR_DEPTH=5;let edges=[],connectionHits=[],connectionHover=null;
 const cache=document.createElement('canvas');const CACHE_LOGICAL=2048;let cacheScale=1.5;cache.width=Math.round(CACHE_LOGICAL*cacheScale);cache.height=Math.round(CACHE_LOGICAL*cacheScale);let key='',w=1,h=1,dpr=1;
 const hash=E.hash,clamp=E.clamp;
// Orthographic orbit camera. Keep every map overlay and picking on this projection.
let yaw=0,pitch=30,cosYaw=1,sinYaw=0,depthX=1,depthY=1,lift=1;
function orient(camera){
 yaw=((Number.isFinite(camera.angle)?camera.angle:0)%360+360)%360;
 pitch=clamp(Number.isFinite(camera.pitch)?camera.pitch:30,25,75);
 const a=yaw*Math.PI/180,p=pitch*Math.PI/180;
 cosYaw=Math.cos(a);sinYaw=Math.sin(a);
 depthX=cosYaw+sinYaw;depthY=cosYaw-sinYaw;
 if(Math.abs(depthX)<1e-10)depthX=0;if(Math.abs(depthY)<1e-10)depthY=0;
 TH=TW*Math.sin(p);lift=Math.cos(p)/Math.cos(Math.PI/6);
}
function project(x,y,z=0){
 x-=N/2;y-=N/2;
 return [(x*depthY-y*depthX)*TW,(x*depthX+y*depthY)*TH-z*lift*mapScale];
}
function unproject(px,py,z=0){
 const u=px/TW,v=(py+z*lift*mapScale)/TH;
 return {x:N/2+(u*depthY+v*depthX)/2,y:N/2+(-u*depthX+v*depthY)/2};
}
function depthOrder(a,b){
 const d=(a.x-b.x)*depthX+(a.y-b.y)*depthY;
 return Math.abs(d)>1e-8?d:(a.x-b.x)*depthY-(a.y-b.y)*depthX;
}
function frontTile(x,y,w=1,h=1){
 return {x:x+((depthX>0||depthX===0&&depthY>0)?w-1:0),y:y+((depthY>0||depthY===0&&depthX<0)?h-1:0)};
}
function atFront(t,x,y,w,h){const p=frontTile(x,y,w,h);return t.x===p.x&&t.y===p.y;}
// Faces use outward winding; screen area also handles the opposite side of a roof.
function face(points,color){
 const p=points.map(v=>project(...v));let area=0;
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}
 if(area>1e-7)poly(p,color);
}
function orbit(camera,angle,newPitch=camera.pitch){
 orient(camera);
 const pivot=unproject(-camera.x/camera.zoom,-camera.y/camera.zoom);
 camera.angle=((Number.isFinite(angle)?angle:0)%360+360)%360;
 camera.pitch=clamp(Number.isFinite(newPitch)?newPitch:30,25,75);
 orient(camera);
 const p=project(pivot.x,pivot.y);
 camera.x=-p[0]*camera.zoom;camera.y=-p[1]*camera.zoom;
}
function pick(sx,sy,camera){
 orient(camera);const o=origin(camera),p=[(sx-o.x)/camera.zoom,(sy-o.y)/camera.zoom],ground=unproject(...p);
 const radius=Math.ceil(100*(view==='region'?.24:1)*lift*mapScale/(Math.SQRT2*TH))+2,candidates=[];
 for(let y=Math.max(0,Math.floor(ground.y)-radius);y<Math.min(N,Math.floor(ground.y)+radius+1);y++)
  for(let x=Math.max(0,Math.floor(ground.x)-radius);x<Math.min(N,Math.floor(ground.x)+radius+1);x++)candidates.push({x,y});
 candidates.sort((a,b)=>depthOrder(b,a));
 for(const t of candidates)if(inside(p,groundPoly(t.x,t.y)))return view==='region'?{cityId:Math.floor(t.y/E.N)*E.R+Math.floor(t.x/E.N)}:t;
 return null;
}

function tone(hex){if(!light||typeof hex!=='string'||!hex.startsWith('#')||hex.length!==7)return hex;const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const f=light===1?[1,.83,.72]:[.4,.55,.66];return '#'+a.map((v,i)=>Math.round(clamp(v*f[i]+(light===1?[5,5,8][i]:[0,3,8][i]),0,255)).toString(16).padStart(2,'0')).join('')}
function poly(points,color,stroke){g.beginPath();points.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fillStyle=tone(color);g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=.6;g.stroke()}}
function line(points,color,width=1){g.beginPath();points.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.strokeStyle=tone(color);g.lineWidth=width;g.lineCap='round';g.lineJoin='round';g.stroke()}
function ellipse(x,y,rx,ry,color){g.beginPath();g.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);g.fillStyle=tone(color);g.fill()}
function flat(x,y,w,d,color,z=9){poly([project(x,y,z),project(x+w,y,z),project(x+w,y+d,z),project(x,y+d,z)],color)}
function box(x,y,w,d,h,z,top,left,right){
 const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],dd=[x,y+d,z],up=v=>[v[0],v[1],z+h],aa=up(a),bb=up(b),cc=up(c),d0=up(dd);
 face([b,c,cc,bb],right||left);face([dd,d0,cc,c],left);
 face([a,b,bb,aa],left);face([dd,a,aa,d0],right||left);
 face([aa,bb,cc,d0],top);
}

function shadow(x,y,size=13){const p=project(x,y,9);ellipse(p[0]+6,p[1]+3,size,size*.43,'rgba(24,64,46,.18)')}
function tree(x,y,scale=1,variant=0){const p=project(x,y,9),s=scale*mapScale*.70,h=(14+variant*7.4)*s*lift;shadow(x,y,7.4*s);line([[p[0],p[1]],[p[0],p[1]-h*.68]],'#746f4c',2.05*s);
 if(variant>.56){poly([[p[0],p[1]-h-7.4*s],[p[0]-7.4*s,p[1]-h*.35],[p[0]+7.4*s,p[1]-h*.35]],'#619660');poly([[p[0],p[1]-h-7.4*s],[p[0],p[1]-h*.3],[p[0]+7.4*s,p[1]-h*.35]],'#397f55');poly([[p[0]-4.1*s,p[1]-h*.75],[p[0],p[1]-h*.34],[p[0]-7.4*s,p[1]-h*.35]],'#7ca870')}
 else{ellipse(p[0],p[1]-h,8.2*s,9.0*s,'#558f5b');ellipse(p[0]-3.3*s,p[1]-h-1.6*s,5.7*s,6.6*s,'#84b875');ellipse(p[0]+4.1*s,p[1]-h+1.6*s,4.9*s,6.6*s,'#397e54');ellipse(p[0]-2.5*s,p[1]-h-4.9*s,4.1*s,3.3*s,'#a0c989')}
}
function windows(x,y,w,d,h,z,level,color='#a0c7c9'){
 const floors=Math.max(1,Math.floor(h/10)),cols=level>=5?5:level===4?4:level===3?3:2;
 for(let f=0;f<floors;f++)for(let j=0;j<cols;j++){
  const height=z+5+f*9,ww=w/(cols+1)*.46,dd=d/(cols+1)*.5,lit=light===2&&hash(x+j,y+f,31)>.26,col=lit?'#ffe4a0':color;
  const a=x+(j+1)*w/(cols+1),b=y+(j+1)*d/(cols+1),yy=depthY>0?y+d+.006:y-.006,xx=depthX>0?x+w+.006:x-.006;
  if(depthY!==0)poly([project(a,yy,height),project(a+ww,yy,height),project(a+ww,yy,height+3.5),project(a,yy,height+3.5)],col);
  if(depthX!==0)poly([project(xx,b,height),project(xx,b+dd,height),project(xx,b+dd,height+3.5),project(xx,b,height+3.5)],col);
 }
}

function roof(x,y,w,d,z,color,side){
 const a=[x-.025,y-.025,z],b=[x+w+.025,y-.025,z],c=[x+w+.025,y+d+.025,z],dd=[x-.025,y+d+.025,z],r1=[x+w*.5,y-.025,z+7],r2=[x+w*.5,y+d+.025,z+7];
 face([a,r1,r2,dd],color);face([r1,b,c,r2],side);
 face([dd,r2,c],'#ebe8d7');face([a,b,r1],'#dcd9c8');
}

function building(t){const x=t.x,y=t.y,z=9,v=t.variant,L=t.level,type=t.type;if(!type||type==='road')return;
 if(type==='res'){
  const w=.60+(v>.5?.06:0),d=.64,xx=x+.17,yy=y+.17,h=L===1?13:L===2?31:56;
  shadow(x+.6,y+.55,20);const walls=v<.35?['#fbecd7','#e4d6bb','#c4c5b4']:v<.7?['#f5f5df','#dce3cc','#b9cec1']:['#e3eded','#c3d6d6','#99b9bf'];
  box(xx,yy,w,d,h,z,...walls);windows(xx,yy,w,d,h,z,L,L===3?'#6795a9':'#739bae');
  if(L===1){const colors=v<.33?['#d39880','#b87465']:v<.66?['#8eaaa8','#658b90']:['#a8ac83','#838c65'];roof(xx,yy,w,d,z+h,...colors);box(xx+.12,yy+.1,.09,.1,5,z+h+4,'#e0d9cd','#b9b4a7','#989b96');const door=xx+.28;if(depthY>0)poly([project(door,yy+d+.01,z),project(door+.13,yy+d+.01,z),project(door+.13,yy+d+.01,z+7),project(door,yy+d+.01,z+7)],'#9d8d6c')}
  else{box(xx-.025,yy-.025,w+.05,d+.05,2,z+h,'#f8f4df','#e4dec7','#b6c9c0');box(xx+.13,yy+.13,.27,.22,4,z+h+2,'#dae3df','#b7c9c2','#8caaa9');if(L===3){box(xx+.05,yy+.44,.50,.13,2,z+h+2,'#88b592','#719476','#619678');line([project(xx+.45,yy+.28,z+h+6),project(xx+.45,yy+.28,z+h+15)],'#a6bcba',1)}}
  if(v>.3&&L<3)tree(x+.83,y+.78,.43,.25);
 }else if(type==='com'){
  const h=L===1?14:L===2?30:59;shadow(x+.56,y+.58,20);box(x+.12,y+.12,.76,.76,h,z,'#d5e7e3','#b2d1ce','#79aabb');
  windows(x+.12,y+.12,.76,.76,h,z,L,'#5992aa');box(x+.09,y+.09,.82,.82,2,z+h,'#f1efda','#d5dfcf','#a9c4bc');
  if(L===1){for(let i=0;i<5;i++)flat(x+.12+i*.152,y+.82,.152,.18,i%2?'#f3ebd2':'#c0836a',z+8);poly([project(x+.12,y+1,z+8),project(x+.88,y+1,z+8),project(x+.88,y+1,z+5),project(x+.12,y+1,z+5)],'#b0715f')}
  else {box(x+.25,y+.25,.26,.25,4,z+h+2,'#bad4d2','#96b9b4','#719b9e');if(L===3){for(let f=1;f<6;f++)line([project(x+.12,y+.88,z+f*9),project(x+.88,y+.88,z+f*9),project(x+.88,y+.12,z+f*9)],'#c4dfd9',1.3)}}
  flat(x+.35,y+.95,.18,.06,'#ddd7b8',9);
 }else if(type==='ind'){
  const h=12+L*4;shadow(x+.6,y+.58,21);box(x+.1,y+.15,.8,.7,h,z,'#d7cbbb','#b6b2a1','#999e98');
  for(let i=0;i<3;i++)box(x+.11+i*.25,y+.16,.21,.66,3,z+h,'#eee6cc','#c5bdab','#a5b6aa');
  windows(x+.1,y+.15,.8,.7,h,z,2,'#779b9e');box(x+.64,y+.24,.15,.15,24+L*3,z,'#aaa9a0','#8e9791','#728d89');box(x+.64,y+.24,.15,.15,3,z+17+L*3,'#eed5bd','#d4bda7','#b7af9c');
  flat(x+.19,y+.9,.24,.1,'#c5b58f',9);box(x+.16,y+.95,.22,.15,4,z,'#ba9c69','#a8895f','#937d58');
 }else if(type==='park'){
  flat(x+.13,y+.13,.74,.74,'#99bf80');flat(x+.16,y+.43,.69,.13,'#e5d8af');flat(x+.44,y+.16,.12,.69,'#e5d8af');tree(x+.29,y+.32,.60,.25);tree(x+.73,y+.62,.64,.76);
  box(x+.25,y+.64,.21,.10,2.5,z,'#b99b69','#938452','#888553');line([project(x+.25,y+.75,11.5),project(x+.48,y+.75,11.5)],'#d4b98b',1.7);const p=project(x+.65,y+.29,9);ellipse(p[0],p[1],3.3,1.6,'#dbd9b9');ellipse(p[0],p[1]-.45,2.3,1.2,'#79b7c4');
 }else if(type==='power'){
  box(x+.08,y+.08,.24,.75,9,z,'#eee9d6','#d3d9c8','#a9beb1');
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){const a=x+.4+i*.27,b=y+.12+j*.39;box(a,b,.23,.31,3,z+3,'#447e99','#426679','#426a7a');flat(a+.015,b+.015,.20,.28,'#427a9e',z+7);line([project(a+.12,b,z+7.1),project(a+.12,b+.30,z+7.1)],'#8abbc6',.6);line([project(a,b+.15,z+7.1),project(a+.23,b+.15,z+7.1)],'#8abbc6',.6)}
  const p=project(x+.20,y+.44,z+10);g.fillStyle='#f6d585';g.font='bold 11px sans-serif';g.textAlign='center';g.fillText('ϟ',p[0],p[1]);
 }else if(type==='water'){
  const p=project(x+.5,y+.5,z),col='#b3c7c1';for(const [a,b] of [[.29,.29],[.71,.29],[.29,.71],[.71,.71]])line([project(x+a,y+b,z),project(x+a,y+b,z+23)],col,2.5);
  box(x+.24,y+.24,.52,.52,18,z+18,'#dfe9df','#a0c8c8','#79aeb8');box(x+.19,y+.19,.62,.62,3,z+36,'#eef0db','#c8dcd1','#aacfc7');line([project(x+.32,y+.77,z+24),project(x+.7,y+.77,z+24)],'#d8ece2',2);line([project(x+.24,y+.24,z+18),project(x+.76,y+.76,z)],'#94b0a9',1);
 }else if(type==='school'){
  box(x+.08,y+.24,.84,.55,21,z,'#f1d0a0','#e6c294','#c2b18b');roof(x+.08,y+.24,.84,.55,z+21,'#859e9b','#5c828b');windows(x+.08,y+.24,.84,.55,21,z,2);box(x+.37,y+.3,.24,.49,24,z,'#eae3c9','#efdfb9','#cecaaf');line([project(x+.78,y+.15,z),project(x+.78,y+.15,z+37)],'#a1b4ac',1.3);const p=project(x+.78,y+.15,z+37);poly([p,[p[0]+10,p[1]+2],[p[0]+8,p[1]+7],[p[0],p[1]+5]],'#dc9b7d');
 }else if(type==='clinic'){
  box(x+.14,y+.14,.73,.73,25,z,'#f5f1e2','#e0e6d8','#bed7ce');windows(x+.14,y+.14,.73,.73,25,z,2);box(x+.10,y+.10,.81,.81,3,z+25,'#b0cecc','#8cb9b5','#71a4a9');flat(x+.44,y+.25,.13,.5,'#e8f0dd',z+28.2);flat(x+.26,y+.42,.49,.13,'#e8f0dd',z+28.2);box(x+.33,y+.80,.37,.16,9,z,'#9bc1be','#b0d3cf','#6d9c9f');
 }else if(type==='townhall'){
  box(x+.1,y+.11,.8,.78,27,z,'#f8efd8','#e6d9b9','#bbc9b7');windows(x+.1,y+.11,.8,.78,27,z,2,'#709f9e');roof(x+.08,y+.09,.84,.82,z+27,'#83a5a0','#5c898f');
  box(x+.39,y+.4,.25,.3,44,z,'#f1e8d0','#ded4b4','#bbccbc');roof(x+.37,y+.38,.29,.34,z+44,'#6d9390','#4d7d87');const p=project(x+.52,y+.705,z+37);ellipse(p[0],p[1],3.2,4.1,'#fbf0ce');line([[p[0],p[1]-2],[p[0],p[1]],[p[0]+1.5,p[1]+1]],'#6b8f8d',.8);box(x+.32,y+.88,.4,.13,3,z,'#e9deba','#b8c2a9','#a3b6a6');
 }
}

 function ownerAt(x,y){
  if(view==='region')return x>=0&&y>=0&&x<N&&y<N?world.cities[Math.floor(y/E.N)*E.R+Math.floor(x/E.N)]:null;
  const gx=city.cx*E.N+x,gy=city.cy*E.N+y,total=E.N*E.R;
  return gx>=0&&gy>=0&&gx<total&&gy<total?world.cities[Math.floor(gy/E.N)*E.R+Math.floor(gx/E.N)]:null;
 }
 function rawTile(x,y){const owner=ownerAt(x,y),lx=((x%E.N)+E.N)%E.N,ly=((y%E.N)+E.N)%E.N;return owner?.tiles[ly*E.N+lx]||null;}
 function neighborTile(x,y){return view==='city'&&(x<0||y<0||x>=N||y>=N);}

 function heightAt(x,y){let t=rawTile(x,y);return t?Math.max(0,t.h)*(view==='region'?.24:1):0}
 function vertex(x,y){let values=[];for(let yy=y-1;yy<=y;yy++)for(let xx=x-1;xx<=x;xx++){let t=rawTile(xx,yy);if(t)values.push(Math.max(0,t.h))}return values.length?values.reduce((a,b)=>a+b,0)/values.length*(view==='region'?.24:1):0}
 function groundPoly(x,y){if(rawTile(x,y)?.h<=0)return [project(x,y,0),project(x+1,y,0),project(x+1,y+1,0),project(x,y+1,0)];return [project(x,y,vertex(x,y)),project(x+1,y,vertex(x+1,y)),project(x+1,y+1,vertex(x+1,y+1)),project(x,y+1,vertex(x,y+1))]}
 function surface(t,x,y,layer){let z=Math.max(0,t.h),v=hash(x,y,17),color=t.h<=0?'#419da9':t.h<3?'#ddd3a1':z>72?'#a4b39b':z>48?'#75a27a':z>24?'#83b984':v>.5?'#91c687':'#8cc283';let pts=groundPoly(x,y);if(t.h<=0)pts=[project(x,y,0),project(x+1,y,0),project(x+1,y+1,0),project(x,y+1,0)];poly(pts,color);if(t.h>0&&layer==='normal'&&view!=='region'&&hash(x,y,22)>.76){let p=project(x+.55,y+.5,z);line([[p[0]-2,p[1]],[p[0]-3,p[1]-2]],'#76ad76',.7)}
 for(const [visible,a,b] of [[x===N-1&&depthX>0&&!rawTile(x+1,y),pts[1],pts[2]],[x===0&&depthX<0&&!rawTile(x-1,y),pts[3],pts[0]],[y===N-1&&depthY>0&&!rawTile(x,y+1),pts[2],pts[3]],[y===0&&depthY<0&&!rawTile(x,y-1),pts[0],pts[1]]])if(visible)poly([a,b,[b[0],b[1]+8*lift*mapScale],[a[0],a[1]+8*lift*mapScale]],t.h<=0?'#308c9a':'#537f70');
 }
 function heatColor(value){let a=clamp(value/100,0,1);return 'rgba('+Math.round(35+205*a)+','+Math.round(171-112*a)+','+Math.round(130-52*a)+',.68)'}

 const ROAD_STYLES={
  street:{half:.16,asphalt:'#a1aaa1',shoulder:'#cdd4c4',median:null},
  road:{half:.25,asphalt:'#73838a',shoulder:'#c6cfc4',median:null},
  avenue:{half:.36,asphalt:'#657581',shoulder:'#d6d9c8',median:'#93b783'},
  highway:{half:.43,asphalt:'#384d61',shoulder:'#b7c4c9',median:'#d1c3a0'}
 };
 function roadGraphic(t,x,y,z,ns,layer){
  const style=ROAD_STYLES[t.road]||ROAD_STYLES.road,half=style.half,xx=x+.5,yy=y+.5,base=z+1;
  const junction=ns.length>2,bend=ns.length===2&&(ns[0][0]!==-ns[1][0]||ns[0][1]!==-ns[1][1]),interrupted=junction||bend;
  function edgeHeight(dx,dy){const q=rawTile(x+dx,y+dy);if(!E.networksMeet(t,q,'road'))return base;const scale=view==='region'?.24:1,qz=Math.max(Math.max(0,q.h)*scale,q.h<=0?5*scale:0);return (base+qz+1)/2;}
  function arm(dx,dy,a,b,offset,width,color,liftZ=.04){
   const vx=-dy,vy=dx,h=width/2,dz=edgeHeight(dx,dy)-base,za=base+dz*a*2+liftZ,zb=base+dz*b*2+liftZ;
   poly([project(xx+dx*a+vx*(offset-h),yy+dy*a+vy*(offset-h),za),project(xx+dx*b+vx*(offset-h),yy+dy*b+vy*(offset-h),zb),project(xx+dx*b+vx*(offset+h),yy+dy*b+vy*(offset+h),zb),project(xx+dx*a+vx*(offset+h),yy+dy*a+vy*(offset+h),za)],color);
  }
  function pavement(extra,color){
   const h=half+extra;flat(xx-h,yy-h,h*2,h*2,color,base);
   for(const [dx,dy]of ns){const q=rawTile(x+dx,y+dy),next=q?.road?ROAD_STYLES[q.road]||ROAD_STYLES.road:style,edge=(half+next.half)/2+extra,vx=-dy,vy=dx,ez=edgeHeight(dx,dy);
    poly([project(xx+vx*h,yy+vy*h,base),project(xx+dx*.5+vx*edge,yy+dy*.5+vy*edge,ez),project(xx+dx*.5-vx*edge,yy+dy*.5-vy*edge,ez),project(xx-vx*h,yy-vy*h,base)],color);
   }
  }
  if(t.h<=0)box(x+.40,y+.40,.20,.20,Math.max(0,z-1),1,'#c6cbbb','#a1b9ae','#7eaaa5');
  pavement(t.road==='street'?.055:.04,t.h<=0?'#d8d6bf':style.shoulder);pavement(0,style.asphalt);
  // Markings are polygons in map coordinates, so their widths rotate with the road.
  for(const [dx,dy]of ns){
   if(t.road==='road')arm(dx,dy,.21,.44,0,.025,'#f5edc7');
   if(t.road==='avenue'||t.road==='highway'){
    const from=interrupted?.31:0,median=t.road==='avenue'?.09:.045;
    arm(dx,dy,from,.5,0,median+.035,t.road==='avenue'?'#d5dfc0':'#f0e6c9');
    arm(dx,dy,from,.5,0,median,style.median,.06);
    for(const side of [-1,1]){
     arm(dx,dy,.27,.44,side*(t.road==='avenue'?.19:.23),.018,'#edf1e8');
     if(t.road==='highway'){
      arm(dx,dy,interrupted?.31:0,.5,side*(half-.035),.021,'#f0f2e9');
      arm(dx,dy,interrupted?.34:0,.5,side*(half+.025),.017,'#d9e5e6',.15);
     }
    }
   }
  }
 }
 function network(t,x,y,z,kind,layer){
  let col=kind==='rail'?'#717d79':kind==='pipe'?'#43bbdc':kind==='sewerPipe'?'#bf91d7':kind==='subway'?'#a778dd':'#f0c260',width=kind==='rail'?TW*.20:kind==='subway'?4:2.5,p=project(x+.5,y+.5,z+1),ns=[];
  const a=ownerAt(x,y);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const q=rawTile(x+dx,y+dy),b=ownerAt(x+dx,y+dy),crossing=a&&b&&a!==b;
   if(crossing&&['road','rail'].includes(kind)){
    if(E.crossesBorder(a,b,t,q,kind))ns.push([dx,dy]);
   }else if(E.networksMeet(t,q,kind))ns.push([dx,dy]);
  }
  if(kind==='road'){roadGraphic(t,x,y,z,ns,layer);return;}
  if(!ns.length)ns=[[1,0],[-1,0]];
  // Power lines are infrastructure, not the visual foreground.  On occupied tiles
  // (roads, buildings, facilities and rail), keep poles/wires at the parcel edge so
  // they do not run through road markings or the middle of a building.
  if(kind==='powerLine'){
   const poleAnchor=(q,qx,qy)=>{
    if(!q)return [qx+.5,qy+.5];
    const roadDirs=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>rawTile(qx+dx,qy+dy)?.road),
     vertical=roadDirs.some(([,dy])=>dy),horizontal=roadDirs.some(([dx])=>dx);
    if(q.road)return [vertical&&!horizontal?qx+.18:horizontal&&!vertical?qx+.50:qx+.18,
                      horizontal&&!vertical?qy+.18:vertical&&!horizontal?qy+.50:qy+.18];
    if(q.level||q.facility||q.zone||q.rail)return [qx+.12,qy+.12];
    return [qx+.5,qy+.5];
   };
   const [ax,ay]=poleAnchor(t,x,y),base=project(ax,ay,z),top=project(ax,ay,z+20);
   line([base,top],'rgba(151,154,143,.92)',1.15);
   line([project(ax-.14,ay,z+17),project(ax+.14,ay,z+17)],'rgba(108,126,119,.92)',1.35);
   for(const [dx,dy] of ns){
    const q=rawTile(x+dx,y+dy),[bx,by]=poleAnchor(q,x+dx,y+dy),qz=q?Math.max(0,q.h):z;
    line([project(ax,ay,z+18),project(bx,by,qz+18)],'rgba(83,116,109,.82)',.62);
   }
   return;
  }
  for(const [dx,dy]of ns){const end=project(x+.5+dx*.5,y+.5+dy*.5,z+1);line([p,end],col,width);
   if(kind==='rail')for(let i=0;i<5;i++){let a=i/5,px=p[0]+(end[0]-p[0])*a,py=p[1]+(end[1]-p[1])*a;line([[px-3,py-1.5],[px+3,py+1.5]],'#c8c9af',1);}
  }
 }

function zoneBuilding(t,w=1,d=1){
 const x=t.x,y=t.y,z=Math.max(0,t.h)+.4,L=Math.max(1,t.level||1),v=t.variant||0,pad=.10,W=Math.max(.55,w-pad*2),D=Math.max(.55,d-pad*2),xx=x+pad,yy=y+pad;
 const yard=t.zone==='res'?'#a9c690':t.zone==='com'?'#bccdc3':'#c6bd9d';flat(x+.04,y+.04,w-.08,d-.08,yard,z+.03);
 if(t.zone==='res'){
  if(L===1){const hw=Math.min(.92,W*.72),hd=Math.min(.82,D*.48),hx=xx+(W-hw)/2,hy=yy+(D-hd)*(v>.5?.25:.62),hh=9+v*5;shadow(x+w*.52,y+d*.52,10+Math.min(w,d)*4);const walls=v<.33?['#f4e4cb','#dfcfb1','#b9bea8']:v<.66?['#e9efdd','#ced9c4','#a7beb3']:['#e0e9ea','#bfd0d2','#94afb5'];box(hx,hy,hw,hd,hh,z,...walls);roof(hx,hy,hw,hd,z+hh,v<.5?'#a66f61':'#718f8e',v<.5?'#87584e':'#557579');windows(hx,hy,hw,hd,hh,z,1,'#78999c');if(D>1.05){tree(x+w*.24,y+d*.76,.38,.2+v*.6);flat(x+w*.63,y+d*.12,Math.min(.23,w*.15),Math.min(.50,d*.28),'#cbbd9b',z+.15);}return;}
  if(L===2){const blocks=v>.48?2:1,bw=(W-(blocks-1)*.12)/blocks,bh=17+v*10;for(let i=0;i<blocks;i++){const bx=xx+i*(bw+.12);box(bx,yy+.08,bw,D-.16,bh-(i?2:0),z,'#e7e6d4','#cbd4c7','#a5b9b3');windows(bx,yy+.08,bw,D-.16,bh-(i?2:0),z,2,'#729a9f');}return;}
  if(L===3){const blocks=W*D>5&&v>.42?2:1,bw=(W-(blocks-1)*.16)/blocks,bh=34+v*18;for(let i=0;i<blocks;i++){const bx=xx+i*(bw+.16);box(bx,yy+.07,bw,D-.14,bh-(i?6:0),z,'#dfe5d9','#becfc5','#91adae');windows(bx,yy+.07,bw,D-.14,bh-(i?6:0),z,3,'#668fa2');box(bx+.08,yy+.12,Math.max(.2,bw-.16),.16,2,z+bh-(i?6:0),'#c3d5cb','#9fbab2','#7f9fa0');}return;}
  if(L===4){const podium=7,tw=Math.min(W*.62,2.25),td=Math.min(D*.60,2.15),tx=xx+(W-tw)/2,ty=yy+(D-td)/2,h=72+v*45;box(xx,yy,W,D,podium,z,'#d9e0d2','#bccbc0','#9db6b0');box(tx,ty,tw,td,h,z+podium,'#d7e4e1','#adc9c6','#7fa8b2');windows(tx,ty,tw,td,h,z+podium,4,'#568da5');if(W*D>11){const tw2=tw*.55,td2=td*.55;box(xx+.14,yy+.14,tw2,td2,h*.62,z+podium,'#e3e8dc','#bfd0c4','#91afb0');windows(xx+.14,yy+.14,tw2,td2,h*.62,z+podium,3,'#668fa2');}return;}
  // Level 5 is a super-high-rise residential complex, not one household/building.
  const podium=9,baseH=118+v*65,spots=[[.28,.30,1],[.70,.33,.82],[.48,.70,.70]],count=W*D>=20?3:2;box(xx,yy,W,D,podium,z,'#cedbd2','#aebfb8','#8da9a7');for(let i=0;i<count;i++){const [sx,sy,scale]=spots[i],tw=Math.min(1.65,W*.30)*scale,td=Math.min(1.55,D*.29)*scale,tx=xx+W*sx-tw/2,ty=yy+D*sy-td/2,h=baseH*scale;box(tx,ty,tw,td,h,z+podium,'#cfdfdf','#8db6bb','#5e93a4');windows(tx,ty,tw,td,h,z+podium,5,'#467f9a');box(tx+.12,ty+.12,Math.max(.22,tw-.24),Math.max(.22,td-.24),3,z+podium+h,'#b5cbc7','#8dafad','#6c969b');}flat(xx+.14,yy+D*.82,W-.28,Math.min(.32,D*.10),'#86b391',z+podium+.2);return;
 }
 if(t.zone==='com'){
  if(L===1){const shops=Math.max(1,Math.min(4,Math.round(W)));for(let i=0;i<shops;i++){const sw=(W-.08*(shops-1))/shops,bx=xx+i*(sw+.08),hh=9+(i%2)*3+v*4;box(bx,yy+.10,sw,D-.20,hh,z,i%2?'#e6dfc8':'#dce8e4',i%2?'#c7bca0':'#b8d0cb','#8aa9ad');windows(bx,yy+.10,sw,D-.20,hh,z,1,'#5f929e');}return;}
  if(L===2){const h=20+v*12;box(xx,yy,W,D,h,z,'#d6e3df','#aac8c4','#77a5ad');windows(xx,yy,W,D,h,z,2,'#578da1');return;}
  if(L===3){const h=40+v*24;box(xx,yy,W,D,h,z,'#d0e0dc','#9fc1bf','#6e9faa');windows(xx,yy,W,D,h,z,3,'#4f879c');box(xx+.12,yy+.12,W-.24,D-.24,3,z+h,'#e2e8d8','#becfc6','#95b2b0');return;}
  if(L===4){const podium=7,h=78+v*48,tw=Math.min(W*.70,2.6),td=Math.min(D*.68,2.5),tx=xx+(W-tw)/2,ty=yy+(D-td)/2;box(xx,yy,W,D,podium,z,'#cbd8d2','#a9c0ba','#7f9fa4');box(tx,ty,tw,td,h,z+podium,'#c8ddda','#87b4b6','#568a9b');windows(tx,ty,tw,td,h,z+podium,4,'#477f9b');return;}
  const podium=10,h=135+v*75,tw=Math.min(W*.42,2.4),td=Math.min(D*.40,2.3),tx=xx+W*.33-tw/2,ty=yy+D*.43-td/2;box(xx,yy,W,D,podium,z,'#c4d3ce','#9bb8b4','#71969d');box(tx,ty,tw,td,h,z+podium,'#bfd9d8','#72a9b0','#3f8094');windows(tx,ty,tw,td,h,z+podium,5,'#39758f');if(W*D>=18){const tw2=tw*.74,td2=td*.72,tx2=xx+W*.69-tw2/2,ty2=yy+D*.60-td2/2;box(tx2,ty2,tw2,td2,h*.72,z+podium,'#d1e1dd','#8db8b7','#5a909c');windows(tx2,ty2,tw2,td2,h*.72,z+podium,5,'#477f96');}return;
 }
 if(t.density===1||t.industryClass==='agriculture'){
  const rows=Math.max(2,Math.min(7,Math.floor(D*2)));for(let i=0;i<rows;i++)flat(xx,yy+i*D/rows,W,D/rows*.56,i%2?'#9aae72':'#c0b66f',z+.08);const bw=Math.min(1.15,W*.42),bd=Math.min(.85,D*.34);box(xx+.12,yy+D-bd-.12,bw,bd,8,z,'#d9c69f','#b69d78','#8d846f');roof(xx+.12,yy+D-bd-.12,bw,bd,z+8,'#9f6957','#7b5148');return;
 }
 if(L===2){const h=15+v*8;box(xx,yy,W,D,h,z,'#cbc8b9','#afb2a7','#899b98');windows(xx,yy,W,D,h,z,2,'#729397');return;}
 if(L===3){const h=23+v*12;box(xx,yy,W,D,h,z,'#c6c4b6','#a7ada4','#829795');windows(xx,yy,W,D,h,z,3,'#6d9194');for(let i=0;i<2;i++)box(xx+W*(.63+i*.15),yy+D*.18,.17,.19,25+i*6,z,'#a0a099','#878e8a','#708481');return;}
 if(L===4){const h=30+v*18;box(xx,yy,W,D,h,z,'#d1d4c8','#abbcb3','#809f9f');windows(xx,yy,W,D,h,z,4,'#60929a');flat(xx+.12,yy+.12,W-.24,D-.24,'#b8cbb7',z+h+.2);return;}
 const h=38+v*22;box(xx,yy,W,D,h,z,'#dbe5df','#b3ccc3','#82aeb0');windows(xx,yy,W,D,h,z,5,'#5596a2');flat(xx+.10,yy+.10,W-.20,D-.20,'#add0c0',z+h+.2);for(let i=0;i<3;i++)box(xx+W*(.18+i*.27),yy+D*.18,Math.min(.45,W*.12),Math.min(.45,D*.12),8+i*3,z+h,'#c9ddd5','#9fc3bc','#7ca7a8');return;
}

function scaled(t,type,w=1,h=1){
 if(['res','com','ind'].includes(type)){zoneBuilding(t,w,h);return;}
 const z=Math.max(0,t.h),scale=Math.min(w,h,2.7),p=project(t.x+(w-scale)/2,t.y+(h-scale)/2,z),base=project(0,0,9);
 g.save();g.translate(p[0],p[1]);g.scale(scale,scale);g.translate(-base[0],-base[1]);g.globalAlpha=t.abandoned?.38:(t.condition??100)<45?.62:1;
 building({...t,x:0,y:0,type,level:Math.max(1,t.level||1)});g.restore();
}

 function facilityGraphic(f){let d=E.CATALOG[f.type],t=E.tile(city,f.x,f.y),x=f.x,y=f.y,w=f.w,h=f.h,z=Math.max(0,t.h),center=project(x+w/2,y+h/2,z);flat(x+.04,y+.04,w-.08,h-.08,'#c8d5b9',z+.3);
 if(['coal','gas','oil','nuclear','incinerator'].includes(f.type)){flat(x+.12,y+.12,w-.24,h-.24,'#b9bbae',z+1);box(x+.2,y+.25,w*.62,h*.57,20,z,'#d7d8cc','#b8c2b7','#879f9e');for(let i=0;i<2;i++){let xx=x+w*.72,yy=y+.3+i*h*.38;box(xx,yy,.27,.30,f.type==='nuclear'?34:50,z,'#ddd8c6','#b5b6aa','#839e9a');box(xx,yy,.28,.31,5,z+(f.type==='nuclear'?24:37),'#bd8c79','#a77768','#956f64');}for(let i=0;i<3;i++)box(x+.25+i*w*.18,y+.32,w*.15,h*.44,4,z+20,'#e5dec8','#c4c8b7','#aabbb3');if(f.type==='oil'||f.type==='gas'){let p=project(x+w*.30,y+h*.78,z+6);ellipse(p[0],p[1],w*4,h*2,'#e0ddc6')}return;}
 if(f.type==='wind'){let p=project(x+.5,y+.5,z);line([p,[p[0],p[1]-44]],'#e6ebe0',3);ellipse(p[0],p[1]-45,3,3,'#fbf7df');for(let a=0;a<3;a++){let angle=a*Math.PI*2/3+.35;line([[p[0],p[1]-45],[p[0]+Math.cos(angle)*19,p[1]-45+Math.sin(angle)*19]],'#f4f4e3',2.7)}return;}
 if(['airfield','airport','international'].includes(f.type)){flat(x+.3,y+.4,w-.6,.85,'#819590',z+1);for(let i=0;i<7;i++)flat(x+.5+i*.55,y+.77,.24,.07,'#f4efd7',z+2);box(x+.6,y+2.25,w-1.2,1.15,12,z,'#e7e8d4','#b6ceca','#80b0b8');windows(x+.6,y+2.25,w-1.2,1.15,12,z,3);box(x+w-1,y+1.9,.38,.45,38,z,'#e5e8d5','#a9c4bc','#7aa4a7');box(x+w-1.2,y+1.75,.72,.72,9,z+37,'#d4e5dd','#75a8b3','#528a9e');return;}
 if(f.type==='landfill'){flat(x+.15,y+.15,w-.3,h-.3,'#a89f79',z+1);for(let i=0;i<16;i++){let a=x+.35+hash(i,3,2)*(w-.7),b=y+.35+hash(i,5,4)*(h-.7);box(a,b,.22,.25,3+hash(i,7,3)*6,z+1,['#a1aba1','#c7bc97','#8b9c92'][i%3],'#9aa390','#7f938b')}return;}
 if(f.type==='pump'||f.type==='treatment'||f.type==='recycle'){box(x+.15,y+.18,w*.42,h*.68,15,z,'#e4e9d4','#bdd0b9','#91b3aa');for(let i=0;i<2;i++){flat(x+w*.60,y+.20+i*h*.40,w*.29,h*.32,'#dae6d2',z+3);flat(x+w*.64,y+.24+i*h*.40,w*.20,h*.23,f.type==='recycle'?'#80ad8d':'#62bcc8',z+4)}return;}
 if(f.type==='rail'||f.type==='station'||f.type==='metro'||f.type==='bus'||f.type==='freightStation'){box(x+.12,y+.17,w-.24,h*.58,10,z,'#f0e7cd','#d0d5bf','#8eafa5');box(x+.09,y+.13,w-.18,h*.68,3,z+10,'#91b9b9','#6ea0a2','#4d8a91');let p=project(x+w*.5,y+.55,z+17);g.fillStyle='#f8f3d7';g.font='bold 10px sans-serif';g.textAlign='center';g.fillText(f.type==='bus'?'B':f.type==='metro'?'M':f.type==='freightStation'?'F':'R',p[0],p[1]);return;}
 if(['port','cargoPort'].includes(f.type)){flat(x+.10,y+.10,w-.2,h-.2,'#a5b7ab',z+1);for(let i=0;i<5;i++)box(x+.2+i*.43,y+.30,.38,.65,7,z,['#9ebdba','#c6ae88','#91a4b1'][i%3],'#829e9b','#698f91');line([project(x+w-.6,y+h-.4,z),project(x+w-.6,y+h-.4,z+45),project(x+w-1.4,y+h-.4,z+45)],'#ded3ac',3);return;}
 // Civic facilities use unique silhouettes; recognition must not depend on letter labels.
 if(f.type==='police'){
  flat(x+.06,y+.07,w-.12,h-.13,'#b9c8c5',z+.4);box(x+.12,y+.18,w*.62,h*.60,11,z,'#d9e3e0','#aebfbe','#78979f');box(x+.18,y+.24,w*.28,h*.48,8,z+11,'#e5ece8','#bacbca','#819ca3');flat(x+.53,y+.66,w*.32,h*.18,'#6f7f83',z+1.2);for(let i=0;i<2;i++)box(x+.58+i*.13,y+.69,.09,.13,2.2,z+1.3,i?'#d9e5e7':'#9bb7c2','#71868b','#596f76');line([project(x+.23,y+.25,z+20),project(x+.23,y+.25,z+26)],'#687d84',1.4);ellipse(...project(x+.23,y+.25,z+27),2.6,1.6,'#7fb8cb');return;
 }
 if(f.type==='fire'){
  flat(x+.05,y+.06,w-.10,h-.12,'#c7c0ac',z+.4);box(x+.10,y+.16,w*.72,h*.62,12,z,'#e8dcc6','#cdbd9e','#a88b78');for(let i=0;i<2;i++){let xx=x+.18+i*w*.30;box(xx,y+.56,w*.23,h*.20,8,z,'#9b5349','#7e443e','#643e3b');}box(x+.64,y+.20,w*.20,h*.22,24,z,'#d9c9b2','#b69c83','#8f756a');roof(x+.64,y+.20,w*.20,h*.22,z+24,'#9d5a4f','#78443d');flat(x+.18,y+.80,w*.50,h*.10,'#817c71',z+.6);return;
 }
 if(f.type==='hospital'){
  flat(x+.05,y+.05,w-.10,h-.10,'#c8d8d0',z+.4);box(x+.12,y+.18,w*.76,h*.64,16,z,'#eef2eb','#cfded7','#a7c5c0');box(x+w*.36,y+.08,w*.28,h*.84,24,z,'#f5f4e9','#d6e0d8','#9fbfc0');windows(x+.12,y+.18,w*.76,h*.64,16,z,2,'#76aab5');windows(x+w*.36,y+.08,w*.28,h*.84,24,z,2,'#6b9faa');flat(x+.15,y+h*.80,w*.28,h*.10,'#71968b',z+.8);const hp=project(x+w*.50,y+h*.50,z+27);g.save();g.translate(hp[0],hp[1]);g.strokeStyle=tone('#d35f55');g.lineWidth=3;g.beginPath();g.moveTo(-5,0);g.lineTo(5,0);g.moveTo(0,-5);g.lineTo(0,5);g.stroke();g.restore();return;
 }
 if(f.type==='school'||f.type==='highschool'){
  flat(x+.05,y+.05,w-.10,h-.10,'#b7c99d',z+.3);box(x+.10,y+.18,w*.76,h*.50,13,z,'#ecd5a9','#d5bd91','#aa9b7b');roof(x+.10,y+.18,w*.76,h*.50,z+13,'#78958f','#587877');windows(x+.10,y+.18,w*.76,h*.50,13,z,2,'#779ea3');flat(x+.12,y+h*.73,w*.62,h*.18,'#c7aa78',z+.5);line([project(x+w*.78,y+h*.18,z),project(x+w*.78,y+h*.18,z+28)],'#8d9c91',1.2);const sp=project(x+w*.78,y+h*.18,z+28);poly([sp,[sp[0]+8,sp[1]+2],[sp[0]+7,sp[1]+6],[sp[0],sp[1]+4]],'#d78c68');return;
 }
 if(f.type==='university'){
  flat(x+.04,y+.04,w-.08,h-.08,'#afc49d',z+.4);box(x+.10,y+.18,w*.80,h*.62,18,z,'#ddd4bd','#c2b69d','#968f82');box(x+w*.38,y+.10,w*.24,h*.78,27,z,'#e9e2ce','#cfc4aa','#9f9687');roof(x+w*.38,y+.10,w*.24,h*.78,z+27,'#6f8582','#526a6d');for(let i=0;i<3;i++)line([project(x+.18+i*w*.27,y+h*.83,z+2),project(x+.18+i*w*.27,y+h*.83,z+15)],'#ddd2b6',2);return;
 }
 if(f.type==='library'){
  flat(x+.08,y+.08,w-.16,h-.16,'#b8c5a9',z+.3);box(x+.12,y+.20,w*.76,h*.58,15,z,'#e0d6bd','#c4b99f','#948e81');for(let i=0;i<4;i++)line([project(x+.22+i*w*.15,y+h*.79,z+1),project(x+.22+i*w*.15,y+h*.79,z+14)],'#efe4cb',2);flat(x+.16,y+.14,w*.68,h*.10,'#8a7765',z+16);return;
 }
 if(f.type==='townhall'){
  flat(x+.06,y+.06,w-.12,h-.12,'#c3cdb6',z+.3);box(x+.12,y+.24,w*.76,h*.52,15,z,'#e4dfca','#c9c4ae','#9f9f93');box(x+w*.40,y+.16,w*.20,h*.68,23,z,'#eee7d0','#d1cab2','#a4a095');roof(x+w*.40,y+.16,w*.20,h*.68,z+23,'#7f8f82','#62766d');for(let i=0;i<3;i++)line([project(x+.25+i*w*.25,y+h*.77,z),project(x+.25+i*w*.25,y+h*.77,z+12)],'#ebe4ce',2);return;
 }
 const mapped={solar:'power',tower:'water'}[f.type]||f.type;scaled({...t,x,y,level:2},mapped,w,h);
 }
function diagnosticOverlay(t,x,y,z,layer,focus){
 const utility=['power','water','sewage'].includes(layer),service=['service','health','education','police','fire','park'].includes(layer),pts=groundPoly(x,y);
 if(utility){
  const u=layer==='sewage'?E.sewageStatus(city,t):E.utilityStatus(city,t,layer),relevant=layer==='sewage'?(t.h>0||t.sewerPipe):layer==='water'?(t.h>0||t.pipe):(t.h>0||t.powerLine||t.facility||t.zone);
  if(relevant){const color=u.state==='on'?(layer==='power'?'rgba(255,217,62,.46)':layer==='sewage'?'rgba(174,112,210,.56)':'rgba(35,199,239,.62)'):u.state==='shortage'?(layer==='power'?'rgba(242,161,51,.46)':'rgba(242,161,51,.68)'):u.state==='off'?(layer==='power'?'rgba(231,98,77,.44)':'rgba(231,98,77,.64)'):(layer==='power'?'rgba(76,92,91,.24)':'rgba(137,153,150,.20)');poly(pts,color);if(layer==='power'&&u.state==='on')line([...pts,pts[0]],'rgba(255,239,157,.25)',.55);if(u.state!=='on'&&(t.zone||t.facility||t.pipe||t.sewerPipe||t.powerLine)){for(const a of [.25,.55,.8]){const p=[pts[0][0]+(pts[1][0]-pts[0][0])*a,pts[0][1]+(pts[1][1]-pts[0][1])*a],q=[pts[3][0]+(pts[2][0]-pts[3][0])*a,pts[3][1]+(pts[2][1]-pts[3][1])*a];line([p,q],'rgba(66,32,20,.5)',1);}}}
  if((layer==='water'&&t.pipe)||(layer==='sewage'&&t.sewerPipe)){const undergroundKey=layer==='water'?'pipe':'sewerPipe',col=u.state==='on'?'#9ceaff':u.state==='shortage'?'#ffe2a0':'#ffb2a4',p=project(x+.5,y+.5,z+2);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(rawTile(x+dx,y+dy)?.[undergroundKey])line([p,project(x+.5+dx*.52,y+.5+dy*.52,z+2)],col,4);ellipse(p[0],p[1],2,2,col);}
 }else if(service){const v=layer==='service'?Math.max(t.health||0,t.education||0,t.police||0,t.fire||0,t.park||0):(focus?E.serviceValue(focus,t):t[layer]||0);if(v>0){poly(pts,'rgba(42,194,165,'+(.24+Math.min(v,100)/180)+')');line([...pts,pts[0]],'rgba(163,250,223,.36)',.8);}else poly(pts,'rgba(92,111,116,.22)');}
}

 function rebuildRegion(){
  g=cache.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cache.width,cache.height);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.setTransform(cacheScale,0,0,cacheScale,cache.width/2,cache.height/2);
  const step=Math.max(1,Math.round(E.N/32)),order=[];for(let y=0;y<N;y+=step)for(let x=0;x<N;x+=step){const t=rawTile(x,y);if(t)order.push({x,y,t});}order.sort(depthOrder);
  for(const {x,y,t} of order){const x2=Math.min(N,x+step),y2=Math.min(N,y+step),z=t.h<=0?0:Math.max(0,t.h)*.24,v=hash(x,y,17),color=t.h<=0?'#419da9':t.h<3?'#ddd3a1':t.h>72?'#a4b39b':t.h>48?'#75a27a':t.h>24?'#83b984':v>.5?'#91c687':'#8cc283';poly([project(x,y,z),project(x2,y,z),project(x2,y2,z),project(x,y2,z)],color);if(t.zone||t.facility)flat(x+step*.14,y+step*.14,step*.72,step*.72,t.zone==='ind'?'rgba(196,189,162,.64)':t.zone==='com'?'rgba(192,216,213,.66)':'rgba(225,222,193,.62)',z+.35);if(t.tree&&t.h>0&&hash(x,y,41)>.55){const p=project(x+step*.5,y+step*.5,z+2);ellipse(p[0],p[1],1.2,1.5,'#528d72')}}
  for(const c of world.cities){const x=c.cx*E.N,y=c.cy*E.N;line([project(x,y,1),project(x+E.N,y,1),project(x+E.N,y+E.N,1),project(x,y+E.N,1),project(x,y,1)],'rgba(242,250,232,.62)',1)}g=ctx;
 }

 function rebuild(layer,selectedCity,focusId=0){if(view==='region'){rebuildRegion();return;}g=cache.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cache.width,cache.height);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.setTransform(cacheScale,0,0,cacheScale,cache.width/2,cache.height/2);let order=[],pad=NEIGHBOR_DEPTH;for(let y=-pad;y<N+pad;y++)for(let x=-pad;x<N+pad;x++){if((x<0||x>=N)&&(y<0||y>=N))continue;order.push({x,y,t:rawTile(x,y)});}order.sort(depthOrder);const underground=['water','sewage','subway'].includes(layer),diagnostic=['power','water','sewage','service','health','education','police','fire','park'].includes(layer),focus=focusId&&city?.facilities.find(f=>f.id===focusId),focusInfo=focus&&E.CATALOG[focus.type].service===layer?E.serviceInfo(city,focus):null;const trafficValues=layer==='traffic'?city.tiles.filter(t=>t.road||t.rail||t.subway).map(t=>t.road?(t.traffic||0):(t.trafficTransit||0)).filter(v=>v>0).sort((a,b)=>a-b):[],trafficScale=trafficValues.length?Math.max(1,trafficValues[Math.min(trafficValues.length-1,Math.floor(trafficValues.length*.9))]):1;
 for(let {x,y,t}of order){if(!t)continue;surface(t,x,y,layer);let z=heightAt(x,y);
 if(neighborTile(x,y)){
  // Muted land belongs to the neighboring municipality; its networks are real.
  poly(groundPoly(x,y),'rgba(63,99,105,.27)');
  if(t.zone||t.facility)flat(x+.14,y+.14,.72,.72,'rgba(204,221,204,.45)',z+.2);
  if(t.road)network(t,x,y,Math.max(z,t.h<=0?5:0),'road','normal');
  if(t.rail)network(t,x,y,Math.max(z,t.h<=0?5:0),'rail','normal');
  if(underground&&t[layer==='water'?'pipe':layer==='sewage'?'sewerPipe':'subway'])network(t,x,y,z,layer==='water'?'pipe':layer==='sewage'?'sewerPipe':'subway',layer);
  if(layer==='power'&&t.powerLine)network(t,x,y,z,'powerLine',layer);
  continue;
 }
 if(diagnostic&&view!=='region'&&!underground)poly(groundPoly(x,y),layer==='power'?'rgba(25,52,52,.24)':'rgba(25,52,52,.5)');
 // Electricity coverage belongs on the ground. Draw it before roads/buildings so it
 // never paints over the objects the player is trying to inspect.
 if(layer==='power')diagnosticOverlay(t,x,y,z,layer,focusInfo);
 if(view==='region'){if(t.tree&&t.h>0){let p=project(x+.5,y+.5,z);ellipse(p[0],p[1]-1.2,1.4,1.8,'#528d72')}if(t.road)network(t,x,y,Math.max(z,t.h<=0?1.2:0),'road',layer);if(t.rail)flat(x+.32,y+.32,.35,.35,'#6b8382',z+.3);let root=t.lot!=null?world.cities[Math.floor(y/E.N)*E.R+Math.floor(x/E.N)].tiles[t.lot]:t;let rx=Math.floor(x/E.N)*E.N+root.x,ry=Math.floor(y/E.N)*E.N+root.y;if(root.level&&atFront({x,y},rx,ry,root.lotW||1,root.lotH||1)){box(rx+.12,ry+.12,(root.lotW||1)-.24,(root.lotH||1)-.24,2+root.level*2,heightAt(rx,ry),root.zone==='ind'?'#c4bda2':root.zone==='com'?'#c0d8d5':'#e1dec1','#a8c2b4','#7daba6')}if(t.facility){flat(x+.12,y+.12,.76,.76,'#a4b6b0',z+.3)}continue;}
 if(underground){poly(groundPoly(x,y),'rgba(24,70,70,.60)');if(t.pipe&&layer==='water')network(t,x,y,z,'pipe',layer);if(t.sewerPipe&&layer==='sewage')network(t,x,y,z,'sewerPipe',layer);if(layer==='subway'&&(t.subway||t.facility&&E.facility(city,t)?.type==='metro'))poly(groundPoly(x,y),'rgba(154,95,204,.52)');if(t.subway&&layer==='subway')network(t,x,y,z,'subway',layer);}
 if(!underground){if(t.zone){let col={res:'rgba(80,164,94,.46)',com:'rgba(56,151,204,.40)',ind:'rgba(225,179,56,.43)'}[t.zone];flat(x+.04,y+.04,.92,.92,col,z+.4);if(!t.level&&t.lot==null){let p=project(x+.5,y+.5,z);g.fillStyle={res:'#407745',com:'#3c7b9b',ind:'#a08035'}[t.zone];g.font='9px sans-serif';g.textAlign='center';g.fillText(String(t.density),p[0],p[1]+3)}}if(t.road)network(t,x,y,Math.max(z,t.h<=0?5:0),'road',layer);if(t.rail)network(t,x,y,Math.max(z,t.h<=0?5:0),'rail',layer);}
 if(!t.facility&&!t.level&&t.tree&&!underground&&!diagnostic){g.save();g.translate(0,(9-z)*lift*mapScale);tree(x+.45,y+.5,.54+t.variant*.25,t.variant);g.restore();}
 if(t.powerLine&&(!underground||layer==='power'))network(t,x,y,z,'powerLine',layer);
 let root=t.lot!=null?city.tiles[t.lot]:t;if(root.level&&atFront(t,root.x,root.y,root.lotW||1,root.lotH||1)){g.save();if(underground||diagnostic)g.globalAlpha=layer==='power'?.82:.18;scaled(root,root.zone,root.lotW||1,root.lotH||1);g.restore();}
 if(t.facility){let f=E.facility(city,t);if(f&&atFront(t,f.x,f.y,f.w,f.h)){g.save();if(underground||diagnostic)g.globalAlpha=layer==='power'?.86:.22;facilityGraphic(f);g.restore();}}
 if(['air','pollution','traffic','populationDensity','employment','desirability','landValue','crimeRisk','fireRisk'].includes(layer)){
  const root=t.lot!=null?city.tiles[t.lot]:t,home=root.zone==='res',area=(root.lotW||1)*(root.lotH||1);
  const applicable=layer==='traffic'?!!(t.road||t.rail||t.subway):layer==='populationDensity'?home:layer==='employment'?home&&root.people>0:true;
  let v=layer==='air'?(t.air||0):layer==='pollution'?(t.waterPoll||0):layer==='traffic'?clamp((t.road?(t.traffic||0):(t.trafficTransit||0))/trafficScale*100,0,100):layer==='populationDensity'?clamp(Math.log1p((root.people||0)/area)/Math.log1p(360)*100,0,100):layer==='employment'?clamp((root.employment||0)*100,0,100):layer==='desirability'?(t.desirability??50):layer==='landValue'?(t.landValue??50):layer==='crimeRisk'?(t.crimeRisk||0):(t.fireRisk||0);
  const good=['desirability','landValue','employment'].includes(layer);
  poly(groundPoly(x,y),applicable?heatColor(good?100-v:v):'rgba(29,55,57,.35)');
 }if(diagnostic&&layer!=='power')diagnosticOverlay(t,x,y,z,layer,focusInfo);
 // In the power diagnostic view all surface objects remain readable; only the slim
 // edge-mounted overhead wire is redrawn on top as the infrastructure cue.
 if(layer==='power'&&t.powerLine)network(t,x,y,z,'powerLine',layer);
 }
 if(view==='region'){for(let c of world.cities){let x=c.cx*E.N,y=c.cy*E.N;line([project(x,y,1),project(x+E.N,y,1),project(x+E.N,y+E.N,1),project(x,y+E.N,1),project(x,y,1)],'rgba(242,250,232,.62)',1)}}g=ctx;
 }

 function drawTransportEdges(camera){
  connectionHits=[];const zoom=camera.zoom;
  g.save();
  for(const edge of edges){
   // Trace terrain vertices, so the border and construction targets stay aligned.
   const border=[];for(let i=0;i<=N;i++){const x=edge.dx?(edge.dx>0?N:0):i,y=edge.dy?(edge.dy>0?N:0):i;border.push(project(x,y,vertex(x,y)+1));}
   g.setLineDash([]);line(border,'rgba(38,73,70,.65)',4/zoom);
   g.setLineDash([6/zoom,4/zoom]);line(border,edge.otherId===null?'#93b4b0':'#fff4ca',1.6/zoom);g.setLineDash([]);
   for(const point of edge.points){
    const t=rawTile(point.x,point.y),u=rawTile(point.x+edge.dx,point.y+edge.dy);
    const zt=Math.max(t.h, t.h<=0?5:0),zu=u?Math.max(u.h,u.h<=0?5:0):zt;
    const a=project(point.x+.5,point.y+.5,zt+2),b=project(point.x+.5+edge.dx,point.y+.5+edge.dy,zu+2),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const connected=point.status==='connected',blocked=['height','outside','unfounded'].includes(point.status),color=connected?'#126b52':blocked?'#b04b42':'#9b5a12',fill=connected?'#d9ffdf':blocked?'#ffe3d9':'#ffe7a6';
    if(connected){line([a,b],'rgba(67,241,163,.72)',5/zoom);}else if(point.status==='local-missing'||point.status==='neighbor-missing'){
     const mx=point.x+(point.status==='neighbor-missing'?edge.dx:0),my=point.y+(point.status==='neighbor-missing'?edge.dy:0),pts=groundPoly(mx,my);
     poly(pts,'rgba(255,199,66,.28)');g.setLineDash([3/zoom,3/zoom]);line([...pts,pts[0]],'#ffd36c',1.5/zoom);line([a,b],'#fff0b5',1.5/zoom);g.setLineDash([]);
    }
    const twin=edge.points.some(p=>p.index===point.index&&p.kind!==point.kind),off=twin?(point.kind==='road'?-9:9):0;
    // Screen-sized glyphs remain readable when zooming or rotating.
    const mp=[mid[0]+off/zoom,mid[1]],r=6.5;
    if(off)line([mid,mp],color,1/zoom);
    g.save();g.translate(mp[0],mp[1]);g.scale(1/zoom,1/zoom);g.beginPath();
    if(point.kind==='rail'){g.moveTo(0,-r-2);g.lineTo(r+2,0);g.lineTo(0,r+2);g.lineTo(-r-2,0);g.closePath();}else g.arc(0,0,r,0,Math.PI*2);
    g.fillStyle=fill;g.strokeStyle=color;g.lineWidth=1.8;g.fill();g.stroke();g.lineCap='round';g.lineJoin='round';g.beginPath();
    if(connected){g.moveTo(-3,0);g.lineTo(-.7,2.4);g.lineTo(3.5,-2.7);}else if(blocked){g.moveTo(-2.5,-2.5);g.lineTo(2.5,2.5);g.moveTo(2.5,-2.5);g.lineTo(-2.5,2.5);}else{g.moveTo(0,-3);g.lineTo(0,.5);}g.stroke();if(!connected&&!blocked){g.beginPath();g.arc(0,3,.9,0,Math.PI*2);g.fillStyle=color;g.fill();}g.restore();
    const o=origin(camera);connectionHits.push({x:o.x+mp[0]*zoom,y:o.y+mp[1]*zoom,edge,point});
   }
   if(edge.otherId===null&&!edge.points.length)continue;
   const x=edge.dx?(edge.dx>0?N+NEIGHBOR_DEPTH+.8:-NEIGHBOR_DEPTH-.8):N/2,y=edge.dy?(edge.dy>0?N+NEIGHBOR_DEPTH+.8:-NEIGHBOR_DEPTH-.8):N/2;
   const p=project(x,y,0),small=w<=700,name=small&&Array.from(edge.name).length>6?Array.from(edge.name).slice(0,6).join('')+'…':edge.name,label=edge.label+' · '+name,pending=edge.points.filter(p=>p.status!=='connected').length;
   const sub=edge.otherId===null?(small?'接続不可':'この先には接続できません'):!edge.founded?(small?'未開発':'都市を設立すると接続できます'):small?'道路 '+edge.road+' · 鉄道 '+edge.rail:'道路 '+edge.road+'か所 · 鉄道 '+edge.rail+'か所'+(pending?' · 未接続 '+pending:'');
   const length=Math.hypot(p[0],p[1])||1;p[0]+=p[0]/length*28/zoom;p[1]+=p[1]/length*28/zoom;
   g.save();g.font='600 12px sans-serif';const ww=Math.max(g.measureText(label).width,g.measureText(sub).width*.84)+22,o=origin(camera),sx=o.x+p[0]*zoom;
   if(small&&sx>=0&&sx<=w)p[0]+=(clamp(sx,ww/2+5,w-ww/2-5)-sx)/zoom;
   g.translate(p[0],p[1]);g.scale(1/zoom,1/zoom);
   g.fillStyle='rgba(27,69,68,.92)';g.beginPath();g.roundRect(-ww/2,-18,ww,43,8);g.fill();g.textAlign='center';g.fillStyle='#fff9de';g.fillText(label,0,-2);g.font='10px sans-serif';g.fillStyle=pending?'#ffe1a0':'#c3ead9';g.fillText(sub,0,14);g.restore();
  }
  g.restore();
 }
 function connectionAt(x,y){let result=null,best=16;for(const hit of connectionHits){let d=Math.hypot(hit.x-x,hit.y-y);if(d<best){best=d;result=hit;}}return result;}
 function drawConnectionTooltip(camera){
  if(!connectionHover)return;const hit=connectionAt(connectionHover.x,connectionHover.y);if(!hit)return;
  const {edge,point}=hit,kind=point.kind==='road'?'道路':'鉄道';
  const message={connected:'接続済み', 'local-missing':'このマスに'+kind+'を敷くと接続','neighbor-missing':'隣町側の同じ位置に'+kind+'が必要',height:'標高差が大きいため未接続',unfounded:'両側の都市の設立が必要',outside:'地域の外には接続できません'}[point.status];
  g.save();g.font='600 12px sans-serif';const title=edge.name+' · '+kind+' · X '+point.x+' / Y '+point.y,ww=Math.max(g.measureText(title).width,g.measureText(message).width)+24;
  const xx=clamp(hit.x-ww/2,8,w-ww-8),yy=clamp(hit.y-67,110,h-170);g.fillStyle='rgba(24,56,54,.96)';g.beginPath();g.roundRect(xx,yy,ww,51,8);g.fill();g.fillStyle='#fffbe8';g.textAlign='left';g.fillText(title,xx+12,yy+19);g.font='11px sans-serif';g.fillStyle='#e0ebce';g.fillText(message,xx+12,yy+38);g.restore();
 }

 function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';const q=canvas.getContext('2d');q.imageSmoothingEnabled=true;q.imageSmoothingQuality='high';q.textRendering='optimizeLegibility'}
 function origin(camera){let left=w>980?344:w>700?276:0,right=w>980?(view==='region'?30:285):w>700?(view==='region'?12:234):0;return {x:(w+left-right)/2+camera.x,y:(w<=700?h*.405:h*.55)+camera.y}}
 function fit(camera){orient(camera);let available=w>980?w-(view==='region'?395:650):w>700?w-(view==='region'?308:530):w-30;camera.base=Math.min(available/((N+(view==='city'?NEIGHBOR_DEPTH*2:0))*TW*2),(w<=700?h*.38:h-235)/((N+(view==='city'?NEIGHBOR_DEPTH*2:0))*TH*2+100));camera.base=clamp(camera.base,.13,1.2);camera.zoom=camera.base;camera.x=camera.y=0;}
 function setup(region,id){if(world!==region)key='';world=region;city=id==null?null:region.cities[id];if((city?'city':'region')!==view)connectionHits=[];view=city?'city':'region';N=city?E.N:E.N*E.R;mapScale=city?64/E.N:256/(E.N*E.R);TW=(city?10:2.5)*mapScale;TH=TW/2;grid=city?.tiles||[];}
 function inside(p,pts){let yes=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){let [a,b]=pts[i],[c,d]=pts[j];if((b>p[1])!==(d>p[1])&&p[0]<(c-a)*(p[1]-b)/(d-b)+a)yes=!yes}return yes;}

 // High-DPI render: supersample the city cache and composite on device-pixel-aligned coordinates.
 function render(region,id,camera,layer='normal',hover=null,points=[],selectedCity=0,night=0,time=0,focusId=0){setup(region,id);orient(camera);light=night;const effectiveScale=Math.max(1,camera.zoom*dpr),desiredScale=effectiveScale>2.0?2.5:effectiveScale>1.35?2:1.5;if(desiredScale!==cacheScale){cacheScale=desiredScale;cache.width=Math.round(CACHE_LOGICAL*cacheScale);cache.height=Math.round(CACHE_LOGICAL*cacheScale);key='';}let next=[region.revision,id,layer,night,focusId,yaw,pitch,cacheScale].join('/');if(next!==key){edges=city?E.transportEdges(region,id):[];rebuild(layer,selectedCity,focusId);key=next;}g=ctx;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,night===2?'#142e44':night===1?'#b9c9c3':'#e1e9dd');sky.addColorStop(.43,night===2?'#1d4655':night===1?'#d3c7af':'#b6d3cc');sky.addColorStop(1,night===2?'#163a4f':night===1?'#bda88f':'#81b1ac');g.fillStyle=sky;g.fillRect(0,0,w,h);g.strokeStyle=night===2?'#91bac408':'#f9fff124';g.lineWidth=1;for(let i=0;i<24;i++){let yy=130+i*34;g.beginPath();g.moveTo(0,yy);g.bezierCurveTo(w*.3,yy+7,w*.65,yy-8,w,yy+1);g.stroke()}
 let o=origin(camera);o.x=Math.round(o.x*dpr)/dpr;o.y=Math.round(o.y*dpr)/dpr;g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.save();g.translate(o.x,o.y);g.scale(camera.zoom,camera.zoom);g.drawImage(cache,-CACHE_LOGICAL/2,-CACHE_LOGICAL/2,CACHE_LOGICAL,CACHE_LOGICAL);
 if(view==='region'){let selected=region.cities[hover?.cityId??selectedCity];if(selected){let x=selected.cx*E.N,y=selected.cy*E.N;let pts=[project(x,y,1),project(x+E.N,y,1),project(x+E.N,y+E.N,1),project(x,y+E.N,1)];poly(pts,'rgba(251,251,198,.15)');line([...pts,pts[0]],'#f6edb8',2/camera.zoom)}for(let c of region.cities){let p=project(c.cx*E.N+E.N/2,c.cy*E.N+E.N/2,9);g.save();g.translate(p[0],p[1]);g.scale(1/camera.zoom,1/camera.zoom);g.font=(c.founded?'600 ':'')+'13px sans-serif';g.textAlign='center';let name=c.founded?c.name:String.fromCharCode(65+c.cy)+(c.cx+1),tw=g.measureText(name).width;g.fillStyle=c.founded?'rgba(20,67,69,.87)':'rgba(42,84,73,.60)';g.beginPath();g.roundRect(-tw/2-9,-14,tw+18,24,6);g.fill();g.fillStyle='#fbf9e6';g.fillText(name,0,3);g.restore();}}
 else {if(layer==='normal'){for(let f of city.facilities){if(!(E.CATALOG[f.type].air>15))continue;let t=E.tile(city,f.x,f.y);for(let i=0;i<3;i++){let age=(time*.3+i*.32)%1,p=project(f.x+f.w*.75,f.y+.7,Math.max(0,t.h)+50+age*32);ellipse(p[0]+age*14,p[1],4+age*7,3+age*4,'rgba(230,230,210,'+((1-age)*.25)+')')}}for(let t of city.tiles){if(t.road&&t.traffic>3&&(t.x+t.y)%4===0){let q=(time*.17+t.variant)%1,p=project(t.x+q,t.y+.5,Math.max(0,t.h)+3);ellipse(p[0],p[1],1.2,.65,t.variant>.5?'#f0d6ab':'#dfeddd')}}}for(let p of points){let t=E.tile(city,p.x,p.y);if(t)poly(groundPoly(t.x,t.y),p.route?(p.freight?'rgba(222,153,62,.57)':'rgba(70,169,204,.55)'):p.bad?'rgba(240,87,67,.53)':'rgba(241,236,151,.45)')}if(hover&&hover.x!=null&&!points.length){let pts=groundPoly(hover.x,hover.y);poly(pts,'rgba(255,253,215,.18)');line([...pts,pts[0]],'#fff9d9',1/camera.zoom);}}
 if(view==='city')drawTransportEdges(camera);
 g.restore();drawConnectionTooltip(camera);}
 this.orbit=orbit;this.connectionAt=connectionAt;this.connectionHover=p=>{connectionHover=p;};this.resize=resize;this.setup=setup;this.fit=fit;this.render=render;this.pick=pick;this.origin=origin;this.screen=(x,y,camera)=>{orient(camera);const pts=groundPoly(Math.floor(x),Math.floor(y));let p=[pts.reduce((v,p)=>v+p[0],0)/4,pts.reduce((v,p)=>v+p[1],0)/4],o=origin(camera);return {x:o.x+p[0]*camera.zoom,y:o.y+p[1]*camera.zoom}};resize();
}
root.CityRenderer=CityRenderer;
})(window);
