/* MACHI ATELIER — host-authoritative WebRTC rooms, protocol 1.
   Native WebRTC data transport. Room-code signaling is provided by PeerJS Cloud; no fixed player cap. */
(function(root){
'use strict';
const VERSION=1,MAX_TEXT=8*1024*1024,CHUNK=2048,ITERATIONS=150000;
const enc=new TextEncoder(),dec=new TextDecoder();
const clone=x=>JSON.parse(JSON.stringify(x));
const clean=(s,n)=>Array.from(String(s??'').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,n).join('');
const hex=a=>Array.from(new Uint8Array(a),v=>v.toString(16).padStart(2,'0')).join('');
function fromHex(s){if(typeof s!=='string'||!/^([a-f0-9]{2})+$/.test(s))throw Error('認証情報が不正です');return Uint8Array.from(s.match(/../g),x=>parseInt(x,16));}
function random(bytes=18){return hex(root.crypto.getRandomValues(new Uint8Array(bytes)));}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function encodeCode(data){const bytes=enc.encode(JSON.stringify(data));let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'MA1.'+root.btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decodeCode(text,type){
  const s=String(text||'').replace(/\s/g,'');if(s.length>300000||!/^MA1\.[A-Za-z0-9_-]+$/.test(s))throw Error('接続情報を先頭から末尾まで貼り付けてください。');
  let o;try{const bin=root.atob(s.slice(4).replace(/-/g,'+').replace(/_/g,'/'));o=JSON.parse(dec.decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));}catch(e){throw Error('接続情報を読み取れません。コピーし直してください。');}
  if(!o||o.v!==VERSION||o.type!==type||!/^[a-f0-9]{36}$/.test(o.room)||!/^[a-f0-9]{36}$/.test(o.sid)||!/^[a-f0-9]{64}$/.test(o.token)||!Number.isFinite(o.expires)||!o.description||o.description.type!==type||typeof o.description.sdp!=='string'||o.description.sdp.length>180000||!o.description.sdp.startsWith('v=0'))throw Error('この版で使える'+(type==='offer'?'招待':'返信')+'情報ではありません。');
  if(o.expires<Date.now())throw Error('招待の有効時間が切れました。ホストに作り直してもらってください。');return o;
}
async function derive(password,salt,iterations=ITERATIONS){
  if(iterations!==ITERATIONS||!/^[a-f0-9]{32}$/.test(salt))throw Error('認証設定が不正です');
  const key=await root.crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await root.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(salt),iterations},key,256));
}
async function proof(keyHex,message){const key=await root.crypto.subtle.importKey('raw',fromHex(keyHex),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await root.crypto.subtle.sign('HMAC',key,enc.encode(message)));}
function validAuth(a){return a===null||!!a&&/^[a-f0-9]{32}$/.test(a.salt)&&/^[a-f0-9]{64}$/.test(a.verifier)&&a.iterations===ITERATIONS;}
function cleanChat(a){if(!Array.isArray(a))return [];return a.slice(-100).filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').map(x=>({id:clean(x.id,64),by:clean(x.by,40),name:clean(x.name,20),text:x.text.slice(0,500),at:Number.isFinite(x.at)?x.at:Date.now(),system:!!x.system}));}

// One ordered stream, bounded messages, and backpressure. State transfer never
// relies on sending a several-hundred-kilobyte data-channel message in one go.
class Wire {
  constructor(dc,onMessage,onFault){this.dc=dc;this.onMessage=onMessage;this.onFault=onFault;this.jobs=[];this.pending=0;this.counter=0;this.partial=null;this.dead=false;dc.bufferedAmountLowThreshold=65536;dc.addEventListener('bufferedamountlow',()=>this.pump());dc.addEventListener('open',()=>this.pump());dc.addEventListener('message',e=>this.receive(e.data));}
  get backlog(){return this.pending+(this.dc.bufferedAmount||0)}
  send(obj){if(this.dead)return false;let text;try{text=JSON.stringify(obj)}catch(e){return false}if(text.length>MAX_TEXT)return false;if(this.pending+text.length>MAX_TEXT){this.onFault('送信待ちが多すぎます。接続をやり直してください。');return false;}const id=++this.counter;this.jobs.push({id,text,pos:0,n:Math.ceil(text.length/CHUNK)});this.pending+=text.length;this.pump();return true;}
  pump(){if(this.dead||this.dc.readyState!=='open')return;let sent=0;try{while(this.jobs.length&&(this.dc.bufferedAmount||0)<131072&&sent<32){const j=this.jobs[0],part=j.text.slice(j.pos,j.pos+CHUNK);this.dc.send(JSON.stringify({p:1,id:j.id,i:Math.floor(j.pos/CHUNK),n:j.n,s:part}));j.pos+=part.length;this.pending-=part.length;sent++;if(j.pos>=j.text.length)this.jobs.shift();}if(this.jobs.length&&(this.dc.bufferedAmount||0)<131072)setTimeout(()=>this.pump(),0);}catch(e){this.onFault('送信が中断されました。再接続してください。');}}
  receive(raw){if(this.dead)return;try{
    if(typeof raw!=='string'||raw.length>14000)throw Error();const p=JSON.parse(raw);
    if(p.p!==1||!Number.isSafeInteger(p.id)||p.id<1||!Number.isInteger(p.i)||!Number.isInteger(p.n)||p.n<1||p.n>Math.ceil(MAX_TEXT/CHUNK)||p.i<0||p.i>=p.n||typeof p.s!=='string'||p.s.length>CHUNK)throw Error();
    if(p.i===0){if(this.partial)throw Error();this.partial={id:p.id,n:p.n,i:0,parts:[],len:0,at:Date.now()};}
    const q=this.partial;if(!q||q.id!==p.id||q.n!==p.n||q.i!==p.i||Date.now()-q.at>60000)throw Error();q.parts.push(p.s);q.i++;q.len+=p.s.length;if(q.len>MAX_TEXT)throw Error();
    if(q.i===q.n){this.partial=null;const obj=JSON.parse(q.parts.join(''));if(!obj||typeof obj!=='object'||Array.isArray(obj)||typeof obj.t!=='string')throw Error();Promise.resolve(this.onMessage(obj)).catch(()=>this.onFault('通信データを処理できませんでした。'));}
  }catch(e){this.onFault('不正な通信データのため、接続を閉じました。');}}
  close(){this.dead=true;this.jobs=[];this.pending=0;this.partial=null;}
}

function sameCompactTile(a,b){if(a===b)return true;if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function sameField(a,b){if(a===b)return true;if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return false;return JSON.stringify(a)===JSON.stringify(b);}
function stateDelta(a,b){
  // Compact tiles are numeric arrays. Direct comparison avoids JSON.stringify on
  // 65,536 tiles every synchronization pass.
  const meta={},cities=[];for(const k of Object.keys(b))if(k!=='cities'&&!sameField(a[k],b[k]))meta[k]=b[k];
  for(let i=0;i<b.cities.length;i++){const ac=a.cities[i],bc=b.cities[i],fields={},tiles=[];for(const k of Object.keys(bc))if(k!=='tiles'&&!sameField(ac[k],bc[k]))fields[k]=bc[k];for(let j=0;j<bc.tiles.length;j++)if(!sameCompactTile(ac.tiles[j],bc.tiles[j]))tiles.push([j,bc.tiles[j]]);if(Object.keys(fields).length||tiles.length)cities.push({id:i,fields,tiles});}return {meta,cities};
}
function applyDelta(a,d){
  if(!a||!d||typeof d.meta!=='object'||!Array.isArray(d.cities)||d.cities.length>a.cities.length)throw Error('差分が不正です');
  // Copy only branches that changed instead of deep-cloning the entire packed map.
  const b={...a,cities:a.cities.slice()},bad=new Set(['__proto__','constructor','prototype','cities','tiles']);
  for(const k of Object.keys(d.meta)){if(bad.has(k)||!Object.hasOwn(b,k))throw Error('差分が不正です');b[k]=d.meta[k];}
  const seen=new Set();for(const c of d.cities){if(!Number.isInteger(c.id)||!b.cities[c.id]||seen.has(c.id)||!c.fields||!Array.isArray(c.tiles)||c.tiles.length>b.cities[c.id].tiles.length)throw Error('差分が不正です');seen.add(c.id);const prev=b.cities[c.id],dest={...prev,tiles:prev.tiles.slice()};b.cities[c.id]=dest;for(const k of Object.keys(c.fields)){if(bad.has(k))throw Error('差分が不正です');Object.defineProperty(dest,k,{value:c.fields[k],writable:true,enumerable:true,configurable:true});}const ts=new Set();for(const pair of c.tiles){if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<0||pair[0]>=dest.tiles.length||ts.has(pair[0])||!Array.isArray(pair[1])||pair[1].length>16||pair[1].some(n=>!Number.isFinite(n)))throw Error('差分が不正です');ts.add(pair[0]);dest.tiles[pair[0]]=pair[1];}}return b;
}

class MachiRoom {
  constructor(options={}){this.o=options;this.RTC=options.RTC||root.RTCPeerConnection;this.role='offline';this.status='offline';this.name='';this.selfId='host';this.peers=new Map();this.members=[];this.chat=[];this.typing=new Map();this.requests=new Map();this.record=null;this.accepting=true;this.seq=0;this.state=null;this.stateText='';this.lastFlush=0;this.dirty=false;this.urgentDirty=false;this.dirtySince=0;this.lastTick=Date.now();this.lastPing=0;this.lastTyping=0;this.generation=0;this.warning='';this.metrics={applyMs:0};this.timer=null;}
  available(){return typeof this.RTC==='function'&&!!root.crypto?.subtle&&!!root.crypto?.getRandomValues;}
  emit(type='status',extra={}){this.o.onEvent?.({type,...extra});}
  isGuest(){return this.role==='guest';}
  connected(){return this.role==='host'||this.role==='guest'&&this.status==='connected';}
  active(){return this.role!=='offline';}
  startTimer(){if(!this.timer)this.timer=setInterval(()=>this.maintenance(),250);}
  view(){return {role:this.role,status:this.status,roomName:this.record?.name||'',selfId:this.selfId,userName:this.name,accepting:this.accepting,members:this.role==='host'?this.roster():this.members,invites:[...this.peers.values()].filter(p=>!p.authorized).map(p=>({id:p.id,label:p.label,status:p.status,expires:p.expires})),chat:this.chat,typing:[...this.typing].filter(([id,x])=>id!==this.selfId&&x.until>Date.now()).map(([id,x])=>({id,name:x.name})),warning:this.warning,hasPassword:!!this.record?.auth||!!this.record?.protected};}
  roster(){return [{id:'host',name:this.name,host:true,status:'connected',rtt:null},...[...this.peers.values()].filter(p=>p.authorized&&!p.closed).map(p=>({id:p.id,name:p.name,host:false,status:p.status,rtt:p.rtt??null,lagging:p.needsState||p.wire?.backlog>262144}))];}
  async host({name,userName,password='',previous=null,reuse=false,iceMode='stun'}){
    if(this.active())throw Error('先に現在のルームを終了してください。');if(!this.available())throw Error('このブラウザではP2P接続を使えません。最新版のブラウザでHTMLを開いてください。');name=clean(name,40);userName=clean(userName,20);if(!name||!userName)throw Error('ルーム名と表示名を入力してください。');if(password&&password.length<8)throw Error('パスワードは8文字以上で設定してください。');if(password.length>128)throw Error('パスワードは128文字以内にしてください。');
    let auth=null;if(reuse&&previous){if(!validAuth(previous.auth))throw Error('保存された認証設定を読み込めません。引き継ぎを解除して再設定してください。');auth=previous.auth;}else if(password){const salt=random(16);auth={salt,iterations:ITERATIONS,verifier:await derive(password,salt)};}
    this.record={v:1,id:previous&&/^[a-f0-9]{36}$/.test(previous.id)?previous.id:random(),name,hostName:userName,auth,chat:cleanChat(previous?.chat)};this.name=userName;this.role='host';this.status='connected';this.iceMode=iceMode;this.selfId='host';this.accepting=true;this.seq=0;this.state=this.o.getState();this.stateText=JSON.stringify(this.state);this.chat=this.record.chat;this.lastTick=Date.now();this.warning='';this.generation++;this.saveRecord();this.startTimer();this.emit();
  }
  saveRecord(){if(this.role==='host'){this.record.chat=this.chat.slice(-100);this.o.onRecord?.(clone(this.record));}}
  rtcConfig(){return {iceServers:this.iceMode==='lan'?[]:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};}
  newPeer(id){const pc=new this.RTC(this.rtcConfig()),p={id,pc,wire:null,name:'参加待ち',status:'preparing',authorized:false,closed:false,seq:-1,ackSeq:-1,needsState:false,expires:Date.now()+10*60*1000,created:Date.now(),rates:{}};this.peers.set(id,p);pc.addEventListener('connectionstatechange',()=>this.connectionChanged(p));return p;}
  attach(p,dc){if(p.wire){dc.close();return;}if(dc.label!=='machi-room-v1'){dc.close();return;}p.dc=dc;p.wire=new Wire(dc,m=>this.receive(p,m),message=>this.drop(p,message));const opened=()=>{if(p.closed||p.opened)return;p.opened=true;p.status='authenticating';if(this.role==='guest')p.wire.send({t:'hello',v:VERSION,token:p.token,name:this.name});this.emit();};dc.addEventListener('open',opened);if(dc.readyState==='open')opened();dc.addEventListener('close',()=>this.drop(p,'接続が終了しました。'));dc.addEventListener('error',()=>this.drop(p,'通信エラーが発生しました。'));}
  async gather(pc){if(pc.iceGatheringState==='complete')return;await new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);pc.removeEventListener('connectionstatechange',check);if(pc.signalingState==='closed')reject(Error('接続の作成を中止しました。'));else if(!pc.localDescription?.sdp?.includes('a=candidate:'))reject(Error('接続先の候補を取得できませんでした。回線の設定を確認してください。'));else resolve();};const check=()=>{if(pc.iceGatheringState==='complete'||pc.signalingState==='closed')finish();};const timer=setTimeout(finish,16000);pc.addEventListener('icegatheringstatechange',check);pc.addEventListener('connectionstatechange',check);check();});}
  async invite(label='友達'){
    if(this.role!=='host'||!this.accepting)throw Error('参加の受け付けを再開してください。');const p=this.newPeer(random());p.label=clean(label,20)||'友達';p.token=random(32);this.attach(p,p.pc.createDataChannel('machi-room-v1',{ordered:true}));this.emit();
    try{await p.pc.setLocalDescription(await p.pc.createOffer());await this.gather(p.pc);if(p.closed||this.role!=='host'||!this.accepting)throw Error('招待は取り消されました。');p.status='invited';const data={v:VERSION,type:'offer',room:this.record.id,name:this.record.name,protected:!!this.record.auth,sid:p.id,token:p.token,expires:p.expires,iceMode:this.iceMode,description:{type:p.pc.localDescription.type,sdp:p.pc.localDescription.sdp}};this.emit();return {id:p.id,code:encodeCode(data)};}catch(e){this.drop(p,e.message);throw e;}
  }
  async accept(text){if(this.role!=='host')throw Error('ホストだけが返信を受け取れます。');const a=decodeCode(text,'answer'),p=this.peers.get(a.sid);if(a.room!==this.record.id||!p||p.closed||p.authorized||!equal(p.token,a.token))throw Error('この招待への返信ではありません。対応する招待情報を確認してください。');if(!this.accepting)throw Error('参加の受け付けを停止しています。');if(p.pc.signalingState!=='have-local-offer')throw Error('この返信はすでに適用されています。接続を待ってください。');await p.pc.setRemoteDescription(a.description);p.status='connecting';this.emit();}
  async join({code,userName,password=''}){
    if(this.active())throw Error('先に現在のルームから退出してください。');if(!this.available())throw Error('このブラウザではP2P接続を使えません。最新版のブラウザでHTMLを開いてください。');const offer=decodeCode(code,'offer');userName=clean(userName,20);if(!userName)throw Error('表示名を入力してください。');if(password.length>128)throw Error('パスワードが長すぎます。');
    this.role='guest';this.status='connecting';this.name=userName;this.selfId=offer.sid;this.record={id:offer.room,name:clean(offer.name,40)||'共同ルーム',protected:!!offer.protected};this.iceMode=offer.iceMode==='lan'?'lan':'stun';this.password=password;this.warning='';this.seq=-1;this.state=null;this.chat=[];this.members=[];this.generation++;this.o.onJoining?.();this.startTimer();const p=this.newPeer(offer.sid);p.token=offer.token;p.expires=offer.expires;p.pc.addEventListener('datachannel',e=>this.attach(p,e.channel));this.emit();
    try{await p.pc.setRemoteDescription(offer.description);await p.pc.setLocalDescription(await p.pc.createAnswer());await this.gather(p.pc);if(p.closed||this.role!=='guest')throw Error('接続を中止しました。');p.status='answer-ready';this.emit();return encodeCode({v:VERSION,type:'answer',room:offer.room,sid:offer.sid,token:offer.token,expires:offer.expires,description:{type:p.pc.localDescription.type,sdp:p.pc.localDescription.sdp}});}catch(e){this.drop(p,e.message);throw e;}
  }
  connectionChanged(p){if(p.closed)return;const s=p.pc.connectionState;if(s==='failed'||s==='closed'){this.drop(p,s==='failed'?'直接接続できませんでした。回線の組み合わせによっては中継サーバーが必要です。':'接続が終了しました。');return;}if(s==='disconnected'){p.status='interrupted';p.disconnectedAt=Date.now();if(this.role==='guest')this.status='interrupted';this.emit();}if(s==='connected'){p.disconnectedAt=null;if(p.authorized){p.status='connected';p.needsState=true;if(this.role==='guest'){this.status='syncing';p.wire?.send({t:'resync'});}this.broadcastRoster();this.emit();}}}
  rate(p,key,limit,windowMs){const n=Date.now(),r=p.rates[key]??{at:n,count:0};if(n-r.at>windowMs){r.at=n;r.count=0;}p.rates[key]=r;return ++r.count<=limit;}
  async receive(p,m){
    if(p.closed||this.role==='offline')return;
    if(this.role==='host'){
      if(!p.authorized){
        if(m.t==='hello'&&!p.nonce&&!p.authBusy){if(!this.accepting||m.v!==VERSION||!equal(m.token,p.token)||Date.now()>p.expires){this.deny(p,'この招待では参加できません。');return;}p.name=clean(m.name,20);if(!p.name){this.deny(p,'表示名を入力してください。');return;}p.nonce=random(32);p.status='authenticating';p.wire.send({t:'challenge',nonce:p.nonce,salt:this.record.auth?.salt||null,iterations:ITERATIONS,room:{id:this.record.id,name:this.record.name,protected:!!this.record.auth}});return;}
        if(m.t==='proof'&&p.nonce&&!p.authBusy){p.authBusy=true;const auth=this.record.auth;const expected=auth?await proof(auth.verifier,p.nonce+'|'+p.token+'|'+this.record.id):'';if(p.closed||this.role!=='host')return;if(!this.accepting||!equal(String(m.value??''),expected)){this.deny(p,'パスワードが違うか、参加の受け付けが停止されています。新しい招待で接続し直してください。');return;}this.flush(true);p.authorized=true;p.status='connected';p.joinedAt=Date.now();p.expires=Infinity;p.wire.send({t:'welcome',room:{id:this.record.id,name:this.record.name,protected:!!auth},selfId:p.id,members:this.roster(),chat:this.chat.slice(-100)});this.sendState(p);this.broadcastRoster();this.system(p.name+' が参加しました。');this.emit();return;}
        this.deny(p,'認証前の操作は受け付けられません。');return;
      }
      if(m.t==='command'){
        if(typeof m.id!=='string'||m.id.length>64)return;if(!this.rate(p,'command',80,1000)){p.wire.send({t:'result',id:m.id,result:{ok:false,error:'操作が多すぎます。少し待ってから操作してください。'}});return;}
        if(p.ackSeq<0){p.wire.send({t:'result',id:m.id,result:{ok:false,error:'最初の同期が完了するまで待ってください。'}});return;}
        let result;try{const start=performance.now();result=this.o.onCommand(m.command,{id:p.id,name:p.name});this.metrics.applyMs=performance.now()-start;}catch(e){result={ok:false,error:'この操作を実行できません。'};}
        p.wire.send({t:'result',id:m.id,result:result||{ok:false,error:'操作が不正です。'}});if(result?.ok)this.markDirty(true);return;
      }
      if(m.t==='chat'){if(!this.rate(p,'chat',6,10000)){p.wire.send({t:'notice',message:'メッセージが多すぎます。少し待ってください。'});return;}this.addChat(p.id,p.name,m.text);return;}
      if(m.t==='typing'){if(this.rate(p,'typing',8,5000))this.updateTyping(p.id,p.name,!!m.active);return;}
      if(m.t==='resync'){if(this.rate(p,'resync',3,10000)){p.needsState=true;this.sendState(p);}return;}
      if(m.t==='state-ack'&&Number.isSafeInteger(m.seq)&&m.seq>=0&&m.seq<=p.seq){p.ackSeq=m.seq;p.lastAck=Date.now();return;}
      if(m.t==='pong'&&m.at===p.pingAt){p.rtt=Date.now()-m.at;return;}
      if(m.t==='bye'){this.drop(p,clean(m.message,120)||'退出しました。');return;}
      return;
    }
    if(m.t==='denied'){this.drop(p,clean(m.message,220)||'参加できませんでした。');return;}
    if(m.t==='challenge'&&!p.authorized&&!p.authBusy){
      if(typeof m.nonce!=='string'||!/^[a-f0-9]{64}$/.test(m.nonce))throw Error();p.authBusy=true;const generation=this.generation;let value='';if(m.salt){const key=await derive(this.password||'',m.salt,m.iterations);value=await proof(key,m.nonce+'|'+p.token+'|'+this.record.id);}if(p.closed||generation!==this.generation)return;p.wire.send({t:'proof',value});return;
    }
    if(m.t==='welcome'&&!p.authorized){if(m.selfId!==this.selfId||m.room?.id!==this.record.id)throw Error();p.authorized=true;p.status='syncing';this.status='syncing';this.password='';this.members=this.cleanMembers(m.members);this.chat=cleanChat(m.chat);this.emit('chat');return;}
    if(!p.authorized)throw Error('認証が完了していません');
    if(m.t==='state'||m.t==='delta'){
      if(!Number.isSafeInteger(m.seq)||m.seq<0)throw Error();if(m.seq<this.seq)return;let next;
      try{if(m.t==='state')next=m.state;else{if(m.base!==this.seq){this.status='syncing';p.wire.send({t:'resync'});this.emit();return;}next=applyDelta(this.state,m.delta);}this.o.onState(next);}
      catch(e){this.status='syncing';if(m.t==='state'){this.drop(p,'受信した地域データを読み込めません。');return;}p.wire.send({t:'resync'});this.emit();return;}
      this.state=next;this.seq=m.seq;this.status='connected';p.status='connected';p.wire.send({t:'state-ack',seq:m.seq});this.emit('state');return;
    }
    if(m.t==='result'){const q=this.requests.get(m.id);if(q){clearTimeout(q.timer);this.requests.delete(m.id);q.resolve(m.result?.ok?m.result:{ok:false,error:clean(m.result?.error,200)||'操作を実行できません。'});}return;}
    if(m.t==='members'){this.members=this.cleanMembers(m.members);this.accepting=!!m.accepting;this.emit();return;}
    if(m.t==='chat-event'){const v=cleanChat([m.entry])[0];if(v&&!this.chat.some(x=>x.id===v.id)){this.chat.push(v);this.chat=this.chat.slice(-100);this.emit('chat');}return;}
    if(m.t==='typing-event'){const id=clean(m.id,40),name=clean(m.name,20);if(m.active)this.typing.set(id,{name,until:Date.now()+4500});else this.typing.delete(id);this.emit('typing');return;}
    if(m.t==='ping'){p.wire.send({t:'pong',at:m.at});return;}
    if(m.t==='notice'){this.emit('notice',{message:clean(m.message,220)});return;}
    if(m.t==='bye'){this.drop(p,clean(m.message,220)||'ホストがルームを終了しました。');return;}
  }
  cleanMembers(a){if(!Array.isArray(a))throw Error();return a.map(x=>({id:clean(x.id,40),name:clean(x.name,20),host:!!x.host,status:['connected','interrupted','syncing'].includes(x.status)?x.status:'syncing',rtt:Number.isFinite(x.rtt)?Math.max(0,x.rtt):null,lagging:!!x.lagging}));}
  deny(p,message){p.wire?.send({t:'denied',message});setTimeout(()=>this.drop(p,message),200);}
  broadcast(obj){for(const p of this.peers.values())if(p.authorized&&!p.closed)p.wire?.send(obj);}
  broadcastRoster(){if(this.role==='host')this.broadcast({t:'members',members:this.roster(),accepting:this.accepting});}
  system(text){this.addChat('system','ルーム',text,true);}
  addChat(by,name,text,system=false){if(typeof text!=='string')return;const value=text.replace(/\r/g,'').trim().slice(0,500);if(!value)return;const entry={id:random(12),by,name,text:value,at:Date.now(),system};this.chat.push(entry);this.chat=this.chat.slice(-100);this.saveRecord();this.broadcast({t:'chat-event',entry});this.emit('chat');}
  sendChat(text){if(!this.connected())throw Error('接続が完了してから送信してください。');if(this.role==='host')this.addChat('host',this.name,text);else this.peers.get(this.selfId)?.wire.send({t:'chat',text:String(text).slice(0,500)});this.sendTyping(false);}
  updateTyping(id,name,active){if(active)this.typing.set(id,{name,until:Date.now()+4500});else this.typing.delete(id);this.broadcast({t:'typing-event',id,name,active});this.emit('typing');}
  sendTyping(active){if(!this.connected())return;if(active&&Date.now()-this.lastTyping<1000)return;this.lastTyping=active?Date.now():0;if(this.role==='host')this.updateTyping('host',this.name,active);else this.peers.get(this.selfId)?.wire.send({t:'typing',active});}
  command(command){if(this.role==='host'){const r=this.o.onCommand(command,{id:'host',name:this.name});if(r?.ok)this.markDirty(true);return Promise.resolve(r);}if(this.role!=='guest'||this.status!=='connected')return Promise.resolve({ok:false,error:'ホストとの同期が完了していません。'});const p=this.peers.get(this.selfId);if(!p?.authorized||p.wire.backlog>262144)return Promise.resolve({ok:false,error:'通信待ちです。少し待ってから操作してください。'});const id=random(12);return new Promise(resolve=>{const timer=setTimeout(()=>{this.requests.delete(id);resolve({ok:false,error:'操作の応答を確認できません。最新の地図を確認してから再操作してください。'});},15000);this.requests.set(id,{resolve,timer});if(!p.wire.send({t:'command',id,command})){clearTimeout(timer);this.requests.delete(id);resolve({ok:false,error:'送信できませんでした。'});}});}
  markDirty(urgent=false){if(this.role==='host'){this.dirty=true;this.urgentDirty=this.urgentDirty||!!urgent;if(!this.dirtySince)this.dirtySince=Date.now();}}
  flush(force=false){if(this.role!=='host'||(!this.dirty&&!force))return;const next=this.o.getState(),text=JSON.stringify(next);this.dirty=false;this.urgentDirty=false;this.dirtySince=0;if(text===this.stateText)return;const base=this.seq;const delta=stateDelta(this.state,next);this.seq++;this.state=next;this.stateText=text;for(const p of this.peers.values()){if(!p.authorized||p.closed)continue;if(p.wire.backlog>262144){p.needsState=true;continue;}if(p.seq===base&&!p.needsState){const message={t:'delta',base,seq:this.seq,delta};if(JSON.stringify(message).length<text.length){if(p.wire.send(message))p.seq=this.seq;else p.needsState=true;}else this.sendState(p);}else this.sendState(p);}}
  sendState(p){if(!p.authorized||p.closed)return;if(p.wire.backlog>131072){p.needsState=true;return;}if(p.wire.send({t:'state',seq:this.seq,state:this.state})){p.seq=this.seq;p.needsState=false;}else p.needsState=true;}
  setAccepting(value){if(this.role!=='host')return;this.accepting=!!value;if(!value)for(const p of [...this.peers.values()])if(!p.authorized)this.drop(p,'参加の受け付けを停止したため、この招待は取り消されました。');this.broadcastRoster();this.emit();}
  kick(id){if(this.role!=='host')return;const p=this.peers.get(id);if(p){p.wire?.send({t:'bye',message:'ホストがこの接続を終了しました。'});setTimeout(()=>this.drop(p,'ホストが接続を終了しました。'),150);}}
  drop(p,message){if(!p||p.closed)return;p.closed=true;p.wire?.close();try{p.dc?.close();p.pc.close();}catch(e){}this.peers.delete(p.id);this.typing.delete(p.id);if(this.role==='host'){if(p.authorized)this.system(p.name+' が退出しました。');this.broadcastRoster();this.emit('notice',{message:clean(message,220)});}else if(this.role==='guest'){this.status='disconnected';this.password='';this.warning=clean(message,220);for(const q of this.requests.values()){clearTimeout(q.timer);q.resolve({ok:false,error:'接続が切れました。操作結果を確認できない場合は、再接続後の地図を確認してください。'});}this.requests.clear();this.emit('disconnected',{message:this.warning});}this.emit();}
  maintenance(){
    const now=Date.now(),dt=Math.min((now-this.lastTick)/1000,1.5);this.lastTick=now;if(!this.active())return;
    if(this.role==='host'){try{this.o.onTick?.(dt);}catch(e){this.warning='ゲームの進行を更新できませんでした。';}if(this.dirty&&now-this.lastFlush>(this.urgentDirty?180:1400)){this.lastFlush=now;this.flush();}for(const p of [...this.peers.values()]){if(!p.authorized&&now>p.expires){this.drop(p,'招待の有効時間が切れました。');continue;}if(p.disconnectedAt&&now-p.disconnectedAt>15000){this.drop(p,'接続が切れました。新しい招待で接続し直せます。');continue;}if(p.needsState)this.sendState(p);}if(now-this.lastPing>5000){this.lastPing=now;for(const p of this.peers.values())if(p.authorized){p.pingAt=now;p.wire.send({t:'ping',at:now});}this.broadcastRoster();}
      const slow=[...this.peers.values()].some(p=>p.authorized&&(p.wire.backlog>262144||p.rtt>1500||p.seq-p.ackSeq>8));this.warning=slow?'通信が遅い参加者がいます。同期が追いつくまで操作を控えるか、参加の受け付けを停止できます。':this.metrics.applyMs>160?'ホストの処理に時間がかかっています。時間の進行を一時停止すると負荷を下げられます。':'';
    }
    let changed=false;for(const [id,x]of this.typing)if(x.until<=now){this.typing.delete(id);changed=true;}if(changed)this.emit('typing');if(now-(this.lastStatus||0)>1000){this.lastStatus=now;this.emit('status');}
  }
  leave(){const was=this.role;this.generation++;if(was==='host')this.saveRecord();for(const p of this.peers.values()){p.wire?.send({t:'bye',message:was==='host'?'ホストが保存してルームを終了しました。':'退出しました。'});p.closed=true;setTimeout(()=>{p.wire?.close();try{p.dc?.close();p.pc.close();}catch(e){}},100);}this.peers.clear();for(const q of this.requests.values()){clearTimeout(q.timer);q.resolve({ok:false,error:'ルームを終了しました。'});}this.requests.clear();this.password='';this.typing.clear();this.role='offline';this.status='offline';this.warning='';if(this.timer)clearInterval(this.timer);this.timer=null;this.emit('left',{previousRole:was});}
}
MachiRoom.protocol={encodeCode,decodeCode,stateDelta,applyDelta,derive,proof,validAuth,Wire};
root.MachiRoom=MachiRoom;
})(typeof window!=='undefined'?window:globalThis);

/* Eight-character invitations. PeerJS Cloud brokers connections; game state
   and password proofs are exchanged on the authenticated WebRTC channel. */
(function(root){
'use strict';
const Base=root.MachiRoom,ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',LABEL='machi-room-v1';
const clean=(s,n)=>Array.from(String(s??'').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,n).join('');
const hex=n=>Array.from(root.crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
function makeCode(){return Array.from(root.crypto.getRandomValues(new Uint8Array(8)),x=>ALPHABET[x&31]).join('');}
function normalizeCode(value){const code=String(value??'').normalize('NFKC').toUpperCase().replace(/[\s-]/g,'');if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))throw Error('英数字8文字のルームコードを入力してください。');return code;}
function brokerError(e){return ({'peer-unavailable':'ルームが見つかりません。コードと、ホストがルームを開いていることを確認してください。','unavailable-id':'コードの登録が重複しました。ルームを開き直してください。','network':'接続仲介サービスに接続できません。インターネット接続を確認してやり直してください。','server-error':'接続仲介サービスに接続できません。少し待ってからやり直してください。','socket-error':'接続仲介サービスとの通信に失敗しました。','socket-closed':'接続仲介サービスとの通信が終了しました。','browser-incompatible':'このブラウザは共同プレイに対応していません。最新版のブラウザで開いてください。','webrtc':'直接接続できませんでした。別の回線で試してください。'})[e?.type]||e?.message||'接続できませんでした。もう一度お試しください。';}

class CodeRoom extends Base{
 constructor(options={}){super(options);this.Peer=options.Peer||root.Peer;this.broker=null;this.brokerOnline=false;this.brokerWarning='';this.roomCode='';this.brokerCancel=null;this.brokerRetry=null;this.reconnectAttempts=0;}
 available(){return super.available()&&typeof this.Peer==='function';}
 connected(){return this.role==='host'?this.status==='connected':super.connected();}
 view(){const v=super.view();v.roomCode=this.roomCode;v.brokerOnline=this.brokerOnline;v.warning=[this.brokerWarning,v.warning].filter(Boolean).join(' ');return v;}
 openBroker(id,generation){
  return new Promise((resolve,reject)=>{
   let settled=false,peer,timer;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(this.brokerCancel===cancel)this.brokerCancel=null;if(error){if(this.broker===peer){this.broker=null;this.brokerOnline=false;}peer?.destroy();reject(error);}else resolve(peer);};
   const cancel=()=>finish(Error('接続を中止しました。'));this.brokerCancel=cancel;
   try{peer=new this.Peer(id,{host:'0.peerjs.com',port:443,path:'/',secure:true,key:'peerjs',debug:0,config:this.rtcConfig()});
    // Compatibility: PeerJS docs/builds have used both "raw" and "none"
    // for an unserialized data connection. Accept either spelling.
    if(peer&&peer._serializers){
     if(peer._serializers.raw&&!peer._serializers.none)peer._serializers.none=peer._serializers.raw;
     if(peer._serializers.none&&!peer._serializers.raw)peer._serializers.raw=peer._serializers.none;
    }
    this.broker=peer;}catch(e){finish(e);return;}
   timer=setTimeout(()=>finish(Error('接続仲介サービスから応答がありません。時間をおいてやり直してください。')),20000);
   const current=()=>this.broker===peer&&this.generation===generation&&this.active();
   peer.on('open',()=>{if(!current()){cancel();return;}this.brokerOnline=true;this.brokerWarning='';this.reconnectAttempts=0;clearTimeout(this.brokerRetry);finish();this.emit();});
   peer.on('connection',conn=>{if(!current()||this.role!=='host'){conn.close();return;}this.acceptConnection(conn);});
   peer.on('call',call=>call.close());
   peer.on('error',error=>{if(!settled){finish(error);return;}if(!current())return;const message=brokerError(error);if(this.role==='guest'&&this.status!=='connected'){const p=this.peers.get(this.selfId);if(p)this.drop(p,message);else{this.status='disconnected';this.password='';this.warning=message;this.emit('disconnected',{message});}}else{this.brokerWarning=message;this.emit('notice',{message});}});
   peer.on('disconnected',()=>{if(!current())return;this.brokerOnline=false;this.brokerWarning='接続仲介サービスと再接続しています。接続済みの参加者との共同プレイは続きます。';this.emit();this.scheduleReconnect();});
   peer.on('close',()=>{if(!settled){finish(Error('接続仲介サービスとの接続が終了しました。'));return;}if(!current())return;this.brokerOnline=false;this.brokerWarning='新しい参加者を受け付けられません。ホストは保存してルームを開き直してください。';this.emit();});
  });
 }
 scheduleReconnect(){clearTimeout(this.brokerRetry);if(!this.broker||this.broker.destroyed||!this.active())return;if(this.reconnectAttempts>=3){this.brokerWarning='接続仲介サービスに再接続できません。「再接続」を押すか、保存してルームを開き直してください。';this.emit();return;}const wait=[1500,4000,8000][this.reconnectAttempts++];this.brokerRetry=setTimeout(()=>this.reconnectBroker(),wait);}
 reconnectBroker(){const peer=this.broker;if(!peer||peer.destroyed)return;if(peer.disconnected){try{peer.reconnect();}catch(e){this.brokerWarning=brokerError(e);this.emit();}}if(!this.brokerOnline)this.scheduleReconnect();}
 retryBroker(){this.reconnectAttempts=0;this.reconnectBroker();}
 async host(options){
  await super.host(options);const generation=this.generation;this.status='opening';this.roomCode='';this.brokerWarning='';this.emit();
  try{for(let attempt=0;attempt<5;attempt++){const code=makeCode();try{await this.openBroker('ma-r2-'+code,generation);if(this.generation!==generation||this.role!=='host')throw Error('ルームの作成を中止しました。');this.roomCode=code;this.status='connected';this.emit();return;}catch(e){if(e?.type==='unavailable-id'&&attempt<4&&this.generation===generation)continue;throw e;}}}
  catch(e){if(this.generation===generation)this.leave();throw Error(brokerError(e));}
 }
 acceptConnection(conn){
  const m=conn.metadata;if(conn.label!==LABEL||!['raw','none'].includes(conn.serialization)||!m||m.v!==2||!/^[a-f0-9]{36}$/.test(m.sid)||!/^[a-f0-9]{64}$/.test(m.token)||this.peers.has(m.sid)){conn.close();return;}
  this.bindConnection(conn,m.sid,m.token);
 }
 bindConnection(conn,id,token){
  const p={id,token,conn,pc:conn.peerConnection,wire:null,name:'参加待ち',label:'コードから接続中',status:'connecting',authorized:false,closed:false,seq:-1,ackSeq:-1,needsState:false,expires:Date.now()+35000,created:Date.now(),rates:{},broker:true};this.peers.set(id,p);
  const open=()=>{if(p.closed||p.wire)return;p.pc=conn.peerConnection;const dc=conn.dataChannel;if(!dc||!p.pc){this.drop(p,'接続情報を取得できませんでした。');return;}p.pc.addEventListener('connectionstatechange',()=>this.connectionChanged(p));this.attach(p,dc);};
  conn.on('open',open);conn.on('close',()=>this.drop(p,'ホストがルームを閉じたか、接続が終了しました。'));conn.on('error',e=>this.drop(p,brokerError(e)));if(conn.open)open();
  p.connectTimer=setTimeout(()=>{if(!p.closed&&!p.authorized)this.drop(p,'接続が完了しませんでした。コード・パスワード・ホストの受付状態を確認し、別の回線でもお試しください。');},35000);this.emit();return p;
 }
 async join({code,userName,password=''}){
  if(this.active())throw Error('先に現在のルームから退出してください。');if(!this.available())throw Error('このブラウザでは共同プレイを使えません。最新版のブラウザで開いてください。');code=normalizeCode(code);userName=clean(userName,20);if(!userName)throw Error('表示名を入力してください。');if(password.length>128)throw Error('パスワードが長すぎます。');
  this.role='guest';this.status='connecting';this.name=userName;this.selfId=hex(18);this.record={id:'',name:'ルームに接続中',protected:false};this.roomCode=code;this.iceMode='stun';this.password=password;this.warning='';this.brokerWarning='';this.seq=-1;this.state=null;this.chat=[];this.members=[];this.generation++;const generation=this.generation;this.o.onJoining?.();this.startTimer();this.emit();
  try{const peer=await this.openBroker('ma-g2-'+this.selfId,generation);if(this.generation!==generation||this.role!=='guest')throw Error('接続を中止しました。');const token=hex(32),conn=peer.connect('ma-r2-'+code,{label:LABEL,serialization:'raw',reliable:true,metadata:{v:2,sid:this.selfId,token}});if(!conn)throw Error('ルームに接続できませんでした。');this.bindConnection(conn,this.selfId,token);}
  catch(e){if(this.generation===generation&&this.role==='guest'){this.status='disconnected';this.password='';this.warning=brokerError(e);this.emit('disconnected',{message:this.warning});}throw Error(brokerError(e));}
 }
 async receive(p,m){
  if(this.role==='guest'&&p.broker&&m.t==='challenge'&&!p.authorized){const r=m.room;if(!r||!/^[a-f0-9]{36}$/.test(r.id)||typeof r.name!=='string')throw Error('ルーム情報を読み取れません。');this.record={id:r.id,name:clean(r.name,40),protected:!!r.protected};}
  await super.receive(p,m);if(p.authorized)clearTimeout(p.connectTimer);
 }
 async invite(){if(this.role!=='host'||!this.accepting||!this.roomCode||!this.brokerOnline)throw Error('参加を受け付けられる状態になるまで待ってください。');return {code:this.roomCode};}
 async accept(){throw Error('返信情報の交換は不要です。参加者は8文字のコードを入力してください。');}
 drop(p,message){if(!p||p.closed)return;clearTimeout(p.connectTimer);super.drop(p,message);try{p.conn?.close();}catch(e){}}
 leave(){const peer=this.broker;this.broker=null;this.brokerOnline=false;this.brokerWarning='';this.roomCode='';clearTimeout(this.brokerRetry);this.brokerCancel?.();for(const p of this.peers.values())clearTimeout(p.connectTimer);super.leave();if(peer)setTimeout(()=>peer.destroy(),150);}
}
CodeRoom.codes={makeCode,normalizeCode};root.MachiRoom=CodeRoom;
})(typeof window!=='undefined'?window:globalThis);
