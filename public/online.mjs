export class OnlineLobby{
 constructor({button,panel,track,car,join,currentSeat}){
  Object.assign(this,{button,panel,track,car,join,currentSeat});
  this.ws=null;this.id=null;this.retries=0;this.joined=null;this.request=null;this.heartbeat=null;this.retry=null;
  this.message=panel.querySelector('[data-online-status]');
  this.list=panel.querySelector('[data-players]');
  this.box=panel.querySelector('[data-request]');
  this.name=panel.querySelector('input');
  try{this.name.value=localStorage.getItem('apexName')||'';this.token=localStorage.getItem('apexPlayerToken');}catch{}
  button.onclick=()=>{
   if(location.protocol!=='https:'){location.href='apexrivals://online';return;}
   panel.hidden=!panel.hidden;
  };
  panel.querySelector('[data-connect]').onclick=()=>{this.intentional=false;this.connect();};
  panel.querySelector('[data-disconnect]').onclick=()=>this.disconnect();
  this.timer=setInterval(()=>this.showRequest(),500);
  addEventListener('pagehide',()=>this.disconnect());
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden){
    this.resumeOnVisible=Boolean(this.ws||this.retry);
    this.disconnect();
   }else if(this.resumeOnVisible){
    this.resumeOnVisible=false;this.intentional=false;this.connect();
   }
  });
 }
 send(data){if(this.ws?.readyState===1){this.ws.send(JSON.stringify(data));return true;}return false;}
 connect(){
  if(this.ws?.readyState===0||this.ws?.readyState===1)return;
  const name=this.name.value.trim();
  if(name.length<2){this.message.textContent='Enter your player name first';return;}
  this.message.textContent='Connecting…';
  const ws=this.ws=new WebSocket(location.origin.replace('https:','wss:')+'/online');
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token:this.token,name}));
  ws.onmessage=async event=>{
   if(this.ws!==ws)return;
   const m=JSON.parse(event.data);
   if(m.type==='identity'){
    this.id=m.id;this.token=m.token;this.retries=0;
    try{localStorage.setItem('apexName',name);localStorage.setItem('apexPlayerToken',m.token);}catch{}
    this.message.textContent='Online · '+name+' · '+m.id.slice(0,6);
    clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.send({type:'ping'}),5000);
    if(this.currentSeat())this.activity(this.currentSeat());return;
   }
   if(m.type==='players'){this.players(m.players);return;}
   if(m.type==='request'){
    const fresh=this.request?.id!==m.request.id;
    this.request=m.request;this.showRequest();
    if(m.request.to===this.id&&m.request.state==='Pending'){
      this.panel.hidden=false;
      if(fresh)this.box.scrollIntoView({behavior:'smooth',block:'center'});
    }
    return;
   }
   if(m.type==='error'){this.message.textContent=m.message;return;}
   if(m.type==='match'&&this.currentSeat()?.token===m.seat.token){this.joined=m.seat.token;return;}
   if(m.type==='match'&&m.seat.token!==this.joined){
    this.joined=m.seat.token;this.request=null;this.showRequest();
    this.message.textContent='Match accepted · loading track';
    try{await this.join(m.seat);}catch(e){this.message.textContent=e.message;this.joined=null;}
   }
  };
  ws.onclose=event=>{
   if(this.ws!==ws)return;
   this.ws=null;clearInterval(this.heartbeat);
   this.message.textContent=event.code===4001?'Connected on another screen':'Offline · reconnecting';
   if(this.intentional||event.code===4001)return;
   clearTimeout(this.retry);
   this.retry=setTimeout(()=>this.connect(),Math.min(15000,800*2**this.retries++));
  };
  ws.onerror=()=>{this.message.textContent='Connection interrupted';};
 }
 disconnect(){
  this.intentional=true;clearTimeout(this.retry);clearInterval(this.heartbeat);
  this.ws?.close();this.ws=null;this.list.replaceChildren();
  this.request=null;this.showRequest();this.message.textContent='Offline';
 }
 activity(seat){
  this.send({type:'activity',seat:seat?{code:seat.code,token:seat.token}:null});
  if(!seat)this.joined=null;
 }
 players(players){
  this.list.replaceChildren();
  for(const p of players.filter(p=>p.id!==this.id)){
   const row=document.createElement('div'),label=document.createElement('span'),invite=document.createElement('button');
   label.textContent=p.name+' · '+p.id.slice(0,6)+' · '+p.status;
   invite.textContent='Invite';invite.disabled=p.status!=='Available'||Boolean(this.currentSeat());
   invite.onclick=()=>this.send({type:'invite',to:p.id,track:this.track(),car:this.car()});
   row.append(label,invite);this.list.append(row);
  }
  if(!this.list.childNodes.length)this.list.textContent='No other online players yet.';
 }
 showRequest(){
  this.box.replaceChildren();const r=this.request;if(!r)return;
  const text=document.createElement('p');
  const incoming=r.to===this.id;
  const seconds=Math.max(0,Math.ceil((r.expires-Date.now())/1000));
  const names={metro:'Metro Sprint',coast:'Coastal Run',ridge:'Ridge Pass'};
  text.textContent=(incoming?r.fromName+' invites you': 'Invitation to '+r.toName)+' · '+names[r.track]+' · '+r.state+(r.state==='Pending'?' · '+seconds+'s':'');
  this.box.append(text);
  if(r.state!=='Pending'||!seconds)return;
  const add=(title,callback)=>{const b=document.createElement('button');b.textContent=title;b.onclick=callback;this.box.append(b);};
  if(incoming){
   add('Accept',()=>this.send({type:'answer',id:r.id,accept:true,car:this.car()}));
   add('Reject',()=>this.send({type:'answer',id:r.id,accept:false}));
  }else add('Cancel request',()=>this.send({type:'cancel',id:r.id}));
 }
}
