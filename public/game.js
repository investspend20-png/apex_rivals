import {drawRace,district,supported} from './scene.mjs';
import {LENGTH,turnCue} from './route.mjs';
import {RaceMotion} from './motion.mjs';
import {makeMinimap} from './minimap.mjs';

const byId = id => document.getElementById(id);
const arena = document.querySelector('.arena');
const hud = document.querySelector('.hud');
const touch = document.querySelector('.touch');
const motion=new RaceMotion();
const raceMap=byId('raceMap');
const updateMap=makeMinimap(byId('minimap'));
const timeLabel = ms => {
  const seconds=Math.max(0,ms)/1000;
  return Math.floor(seconds/60)+':'+(seconds%60).toFixed(2).padStart(5,'0');
};
let seat=null, state=null, generation=0, keyboard=0, action='', busy=false;
const pressed=new Set(), pointers=new Map(), controls={ArrowUp:1,KeyW:1,ArrowDown:2,KeyS:2,ArrowLeft:4,KeyA:4,ArrowRight:8,KeyD:8,Space:16,ShiftLeft:32,ShiftRight:32};
const reduceKeys=values=>Array.from(values).reduce((mask,key)=>mask|key,0);
const wheel=byId('wheel');
const cockpit={steer:0,throttle:0,brake:0};
let wheelGesture=null;
let paintedSteer=NaN,paintedWheelValue=null;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function steer(value){
  cockpit.steer=clamp(value,-1,1);

}
function wheelAngle(event,gesture){
  return Math.atan2(event.clientY-gesture.y,event.clientX-gesture.x);
}
wheel.onpointerdown=event=>{
  if(wheelGesture)return;
  event.preventDefault();
  const rect=wheel.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const gesture={id:event.pointerId,x,y,r:rect.width/2,startX:event.clientX,rotation:0};
  gesture.angular=Math.hypot(event.clientX-x,event.clientY-y)>gesture.r*.43;
  gesture.last=wheelAngle(event,gesture);
  wheelGesture=gesture;
  wheel.setPointerCapture(event.pointerId);
  wheel.classList.add('grabbed');
};
wheel.onpointermove=event=>{
  const g=wheelGesture;
  if(!g||g.id!==event.pointerId)return;
  if(!g.angular){steer((event.clientX-g.startX)/g.r);return;}
  if(Math.hypot(event.clientX-g.x,event.clientY-g.y)<g.r*.27)return;
  const angle=wheelAngle(event,g),delta=angle-g.last;
  g.rotation=clamp(g.rotation+Math.atan2(Math.sin(delta),Math.cos(delta)),-1.83,1.83);
  g.last=angle;
  steer(g.rotation/1.83);
};
function releaseWheel(event){
  if(!wheelGesture||event.pointerId!==wheelGesture.id)return;
  wheelGesture=null;wheel.classList.remove('grabbed');steer(0);
}
wheel.onpointerup=wheel.onpointercancel=wheel.onlostpointercapture=releaseWheel;
const pedalControls=[];
for(const [id,field] of [['gas','throttle'],['brake','brake']]){
  const pedal=byId(id);
  let pressed=null;
  const set=value=>{
    cockpit[field]=value;
    pedal.style.setProperty('--stroke',value);
  };
  const reset=()=>{pressed=null;set(0);};
  pedalControls.push(reset);
  pedal.onpointerdown=event=>{
    if(pressed)return;
    event.preventDefault();
    pressed={id:event.pointerId,y:event.clientY};
    pedal.setPointerCapture(event.pointerId);
    set(1);
  };
  pedal.onpointermove=event=>{
    if(pressed?.id!==event.pointerId)return;
    set(clamp(1-(event.clientY-pressed.y)/Math.max(38,pedal.clientHeight*.76),0,1));
  };
  pedal.onpointerup=pedal.onpointercancel=pedal.onlostpointercapture=event=>{
    if(pressed?.id===event.pointerId)reset();
  };
  pedal.onkeydown=event=>{
    if(event.code==='Space'||event.code==='Enter'){event.preventDefault();event.stopPropagation();set(1);}
  };
  pedal.onkeyup=event=>{
    if(event.code==='Space'||event.code==='Enter'){event.preventDefault();event.stopPropagation();set(0);}
  };
  pedal.onblur=()=>{if(!pressed)set(0);};
}
function clearControls(){
  pressed.clear(); keyboard=0; pointers.clear();
  wheelGesture=null;wheel.classList.remove('grabbed');steer(0);
  pedalControls.forEach(reset=>reset());
  document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('active'));
}
addEventListener('keydown',e=>{
  if(!state?.start || state.winner!==null || !controls[e.code] || e.target.matches('input')) return;
  e.preventDefault();pressed.add(e.code);keyboard=reduceKeys(Array.from(pressed,k=>controls[k]));
});
addEventListener('keyup',e=>{pressed.delete(e.code);keyboard=reduceKeys(Array.from(pressed,k=>controls[k]));});
addEventListener('blur',clearControls);
document.querySelectorAll('[data-key]').forEach(button=>{
  button.onpointerdown=e=>{
    e.preventDefault();button.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,Number(button.dataset.key));button.classList.add('active');
  };
  button.onlostpointercapture=button.onpointerup=button.onpointercancel=e=>{
    pointers.delete(e.pointerId);
    button.classList.toggle('active',[...pointers.values()].includes(Number(button.dataset.key)));
  };
});
function error(message='') {
  byId('error').hidden=!message;byId('error').textContent=message;
}
async function post(path,data) {
  let response;
  try {
    response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(4500)});
  } catch { throw new Error('Connection lost. Check your network and try again.'); }
  const json=await response.json();
  if(!response.ok) throw Object.assign(new Error(json.error),{status:response.status});
  return json;
}
function showSetup(clearInvite=true) {
  document.body.classList.remove('driving');
  generation++; seat=null; state=null;motion.reset();action='';clearControls();
  if(clearInvite) {
    history.replaceState(null,'',location.pathname);
    byId('setupTitle').textContent='Race a friend';
    byId('intro').textContent='Create a room and share the invite with a friend.';
    byId('create').hidden=byId('practice').hidden=false;
  }
  byId('setup').hidden=false;byId('lobby').hidden=true;
  document.querySelector('.hud').hidden=true;
  document.querySelector('.touch').hidden=true;
  document.querySelector('.arena').classList.remove('racing');
  byId('countdown').textContent='';byId('cornerCue').hidden=true;raceMap.hidden=true;
}
async function enter(path,code,practice=false) {
  if(!supported){error('This device could not start WebGL.');return;}
  if(busy) return;
  busy=true;error();byId('practice').disabled=byId('create').disabled=byId('joinButton').disabled=true;
  try {
    seat=await post(path,{code,practice});
    const url=new URL(location.href);url.searchParams.set('room',seat.code);
    byId('invite').value=url.href;if(!practice)history.replaceState(null,'',url);
    byId('setup').hidden=true;byId('lobby').hidden=false;
    byId('sharing').hidden=practice;
    if(practice)action='ready';
    byId('roomTitle').textContent='Race lobby';byId('status').textContent='Connecting to room…';
    byId('ready').disabled=true;
    poll(++generation);
  } catch(e){error(e.message);}
  finally {busy=false;byId('practice').disabled=byId('create').disabled=byId('joinButton').disabled=false;}
}
byId('create').onclick=()=>enter('/create');
byId('practice').onclick=()=>enter('/create',undefined,true);
byId('join').onsubmit=e=>{e.preventDefault();enter('/join',byId('code').value.trim());};
byId('exit').onclick=byId('leave').onclick=()=>{
  const current=seat;showSetup();error();
  post('/tick',{...current,action:'leave'}).catch(()=>{});
};
byId('copy').onclick=()=>{
  location.href='apexrivals://share?url='+encodeURIComponent(byId('invite').value);
};
byId('ready').onclick=()=>{
  action=state?.winner===null?'ready':'rematch';
  byId('ready').disabled=true;
};
function label(id,value){
  const node=byId(id);
  const text=String(value);
  if(node.textContent!==text)node.textContent=text;
}
function update() {
  const {index,players,start,winner,practice,finished,now}=state;
  const me=players[index], other=players[1-index];
  const racing=Boolean(start)&&winner===null;
  const ended=winner!==null;
  arena.classList.toggle('racing',racing);
  document.body.classList.toggle('driving',racing);
  byId('lobby').hidden=racing;
  hud.hidden=touch.hidden=raceMap.hidden=!racing;
  byId('mapRival').hidden=!other;
  label('district',district(me.progress));
  label('distance',((LENGTH-me.progress)/1000).toFixed(2)+' km left');
  byId('routeProgress').value=me.progress;
  byId('position').textContent=practice?timeLabel(now-start):
    (!other||me.progress>=other.progress?'1st of 2':'2nd of 2');
  label('speed',Math.round(me.v*3.6)+' km/h');
  byId('boost').value=me.boost;
  label('driftState',me.scraping?'CURB CONTACT':me.drifting?'DRIFTING':me.nitro?'BOOSTING':'');
  const turn=racing&&turnCue(me.progress);
  byId('cornerCue').hidden=!turn;
  if(turn){
    const remaining=Math.round(turn.start-me.progress);
    byId('cornerName').textContent=turn.label+(remaining>0?' · '+remaining+' m':'');
    byId('cornerHint').textContent=turn.advice+' · '+turn.speed+' km/h';
    byId('cornerCue').classList.toggle('caution',me.v*3.6>turn.speed+10);
  }
  const remaining=start-now;
  byId('countdown').textContent=racing&&remaining>-650?(remaining>0?Math.ceil(remaining/1000):'GO!'):'';
  if(racing)return;
  clearControls();
  byId('roomTitle').textContent=ended?(practice?'Sprint complete':winner===index?'You win!':'Your rival wins!'):'Race lobby';
  byId('status').textContent=ended
    ? (me.rematch?'Waiting for your rival to accept.':other?.rematch?'Your rival wants a rematch.':
      (winner===index?'Finish time ':'Winning time ')+timeLabel(finished-start))
    : !other?'Waiting for your friend to join.':me.ready?'Waiting for your friend to get ready.':other.ready?'Your friend is ready.':'Both players are connected.';
  byId('ready').textContent=ended?(practice?'Race again':'Rematch'):me.ready?'Ready ✓':'Ready';
  byId('ready').disabled=ended?!!me.rematch:(!other&&!practice)||me.ready;
}
async function poll(id) {
  if(id!==generation||!seat) return;
  const requestStarted=performance.now();
  const sent=action;
  try {
    const next=await post('/tick',{...seat,action:sent,keys:keyboard|reduceKeys(pointers.values()),...cockpit});
    if(id!==generation) return;
    if(action===sent) action='';
    if(state?.start!==next.start||next.winner!==state?.winner)motion.reset();
    motion.push(next,performance.now(),requestStarted);
    state=next;error();update();
  } catch(e){
    if(id!==generation) return;
    if(e.status===404||e.status===403){showSetup(false);error(e.message);return;}
    error('Reconnecting to race…');
  }
  const racing=state?.start&&state.winner===null;
  const interval=racing?(state.practice?48:55):280;
  setTimeout(()=>poll(id),Math.max(0,interval-(performance.now()-requestStarted)));
}
const parked=[{progress:0,lane:-2.8,v:0},{progress:1.1,lane:2.8,v:0}];
function draw(now){
  if(paintedSteer!==cockpit.steer){
    wheel.style.setProperty('--wheel-angle',(cockpit.steer*105)+'deg');
    paintedSteer=cockpit.steer;
    const value=Math.round(cockpit.steer*100);
    if(value!==paintedWheelValue){
      wheel.setAttribute('aria-valuenow',value);
      paintedWheelValue=value;
    }
  }
  const players=motion.render(now)||parked;
  const index=state?.index??0;
  drawRace(players,index,Boolean(state?.start),now);
  if(!raceMap.hidden)updateMap(players,index,now);
  requestAnimationFrame(draw);
}
const invite=new URL(location.href).searchParams.get('room');
if(invite){
  byId('code').value=invite.slice(0,10);
  byId('setupTitle').textContent='You’re invited';
  byId('intro').textContent='Join the room to race your friend.';
  byId('create').hidden=byId('practice').hidden=true;
}
if(supported)requestAnimationFrame(draw);else error('This device could not start WebGL.');










