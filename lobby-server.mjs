import {WebSocketServer} from 'ws';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';

export function attachLobby(server,{secret,createMatch,validSeat,leaveSeat}){
 const people=new Map(),requests=new Map();
 const wss=new WebSocketServer({noServer:true,maxPayload:8192});
 const sign=id=>createHmac('sha256',secret).update(id).digest('hex');
 function identity(token){
  if(typeof token!=='string')return null;
  const [id,signature]=token.split('.');
  if(!/^[a-f0-9]{24}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(signature||''))return null;
  return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(id),'hex'))?id:null;
 }
 const send=(p,data)=>{if(p?.ws?.readyState===1)p.ws.send(JSON.stringify(data));};
 function online(p){return p.ws?.readyState===1&&Date.now()-p.seen<18000;}
 function status(p){
  if(!online(p))return 'Offline';
  return p.match&&validSeat(p.match)?'In Game':'Available';
 }
 function finish(request,state){
  if(request.state!=='Pending')return;
  request.state=state;request.updated=Date.now();
  for(const id of [request.from,request.to])send(people.get(id),{type:'request',request:publicRequest(request)});
 }
 function publicRequest(r){
  return {id:r.id,from:r.from,to:r.to,fromName:people.get(r.from)?.name||'Player',
   toName:people.get(r.to)?.name||'Player',track:r.track,state:r.state,expires:r.expires};
 }
 function pending(id){return [...requests.values()].find(r=>r.state==='Pending'&&(r.from===id||r.to===id));}
 function publish(){
  const players=[...people.values()].map(p=>({id:p.id,name:p.name,status:status(p)}));
  for(const p of people.values())if(online(p))send(p,{type:'players',players});
 }
 function cancelFor(id,state='Cancelled'){
  for(const r of requests.values())if(r.from===id||r.to===id)finish(r,state);
 }
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/online'){socket.destroy();return;}
  const origin=req.headers.origin;
  if(origin){
   try{if(new URL(origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  let player=null;
  const timer=setTimeout(()=>{if(!player)ws.close(1008,'Sign in first');},10000);
  ws.on('message',bytes=>{
   try{
    const m=JSON.parse(bytes.toString());
    if(!player){
     if(m.type!=='hello')throw Error('Sign in first');
     if(people.size>=500&&!identity(m.token))throw Error('Lobby is full');
     const id=identity(m.token)||randomBytes(12).toString('hex');
     const name=String(m.name||'').trim().replace(/[\x00-\x1f]/g,'').slice(0,24);
     if(name.length<2)throw Error('Enter a name with at least 2 characters');
     player=people.get(id)||{id,match:null,lastInvite:0};
     const old=player.ws;
     player.ws=ws;player.seen=Date.now();player.name=name;
     people.set(id,player);clearTimeout(timer);
     if(old&&old!==ws)old.close(4001,'Opened on another screen');
     send(player,{type:'identity',id,token:id+'.'+sign(id),name});
     if(player.match&&validSeat(player.match))send(player,{type:'match',seat:player.match});
     const r=pending(id);if(r)send(player,{type:'request',request:publicRequest(r)});
     publish();return;
    }
    if(player.ws!==ws)return;
    player.seen=Date.now();
    if(m.type==='ping'){send(player,{type:'pong'});return;}
    if(m.type==='activity'){
     if(m.seat&&validSeat(m.seat)){player.match=m.seat;cancelFor(player.id);}
     else if(!m.seat){player.match=null;}
     publish();return;
    }
    if(m.type==='invite'){
     if(Date.now()-player.lastInvite<3000)throw Error('Wait a moment before inviting again');
     player.lastInvite=Date.now();
     const target=people.get(m.to);
     if(!target||target.id===player.id||status(target)!=='Available'||status(player)!=='Available')
       throw Error('Both players must be available');
     if(pending(player.id)||pending(target.id))throw Error('An invitation is already pending');
     const track=['metro','coast','ridge'].includes(m.track)?m.track:'metro';
     const r={id:randomBytes(12).toString('hex'),from:player.id,to:target.id,track,car:m.car,state:'Pending',expires:Date.now()+30000};
     requests.set(r.id,r);
     for(const p of [player,target])send(p,{type:'request',request:publicRequest(r)});
     return;
    }
    if(m.type==='answer'||m.type==='cancel'){
     const r=requests.get(m.id);
     if(!r)throw Error('Invitation no longer exists');
     if(m.type==='cancel'&&r.from!==player.id)throw Error('Only the sender can cancel');
     if(m.type==='answer'&&r.to!==player.id)throw Error('Only the invited player can answer');
     if(r.state!=='Pending'){send(player,{type:'request',request:publicRequest(r)});if(r.state==='Accepted'&&player.match&&validSeat(player.match))send(player,{type:'match',seat:player.match});return;}
     if(Date.now()>=r.expires){finish(r,'Expired');return;}
     if(m.type==='cancel'){finish(r,'Cancelled');return;}
     if(m.accept!==true){finish(r,'Rejected');return;}
     const a=people.get(r.from),b=people.get(r.to);
     if(!a||!b||status(a)!=='Available'||status(b)!=='Available'){finish(r,'Cancelled');return;}
     const seats=createMatch(r.track,r.car,m.car);
     a.match=seats[0];b.match=seats[1];
     finish(r,'Accepted');
     send(a,{type:'match',seat:a.match});send(b,{type:'match',seat:b.match});
     publish();return;
    }
    throw Error('Unknown lobby command');
   }catch(error){send(player||{ws},{type:'error',message:error.message});}
  });
  ws.on('close',()=>{
   clearTimeout(timer);
   if(player?.ws===ws){player.ws=null;publish();}
  });
  ws.on('error',()=>{});
 });
 const sweep=setInterval(()=>{
  const now=Date.now();let changed=false;
  for(const r of requests.values()){
   if(r.state==='Pending'&&now>=r.expires)finish(r,'Expired');
   if(r.state!=='Pending'&&now-(r.updated||r.expires)>60000)requests.delete(r.id);
  }
  for(const [id,p] of people){
   if(p.ws&&now-p.seen>18000){p.ws.close();p.ws=null;changed=true;}
   if(!online(p)&&now-p.seen>18000){cancelFor(id);if(p.match){leaveSeat(p.match);p.match=null;changed=true;}}
   if(p.match&&!validSeat(p.match)){p.match=null;changed=true;}
   if(!online(p)&&now-p.seen>120000){people.delete(id);changed=true;}
  }
  if(changed)publish();
 },1000);
 sweep.unref();
 return {close(){clearInterval(sweep);for(const p of people.values())p.ws?.close();wss.close();}};
}
