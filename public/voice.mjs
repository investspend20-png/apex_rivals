export class RoomVoice{
  constructor(button,status){
    this.button=button;this.status=status;this.seat=null;this.peer=null;
    this.stream=null;this.session=null;this.remote=null;this.description=null;this.candidates=[];
    this.remoteCount=0;this.timer=null;this.generation=0;this.busy=false;this.awaitingPermission=false;
    this.audio=new Audio();this.audio.autoplay=true;this.audio.playsInline=true;
    button.onclick=()=>this.stream||this.awaitingPermission?this.stop():this.start();
    this.audio.onclick=()=>this.audio.play().catch(()=>{});
    addEventListener('pagehide',()=>this.stop());
    addEventListener('apex-background',()=>this.stop());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    this.paint('Mic off');
  }
  room(seat,practice){
    if(this.seat?.token!==seat?.token)this.stop();
    this.seat=seat;
    const supported=location.protocol==='https:'&&Boolean(navigator.mediaDevices?.getUserMedia)&&Boolean(window.RTCPeerConnection);
    this.button.disabled=!seat||practice||!supported;
    if(practice)this.paint('Voice available in two-player rooms');
    else if(!supported)this.paint('Voice requires the online HTTPS game');
  }
  paint(text){
    this.button.textContent=this.stream?'Mic on · tap to mute':this.awaitingPermission?'Cancel mic':'Mic off · tap to talk';
    this.button.setAttribute('aria-pressed',String(Boolean(this.stream)));
    this.status.textContent=text;
  }
  async request(body){
    const response=await fetch('/voice',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...this.seat,...body}),signal:AbortSignal.timeout(6000)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Voice service unavailable');
    return data;
  }
  async start(){
    if(this.button.disabled||!this.seat)return;
    const id=++this.generation;
    this.session=crypto.randomUUID();
    this.awaitingPermission=true;this.paint('Allow microphone to talk to your rival');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(id!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.awaitingPermission=false;this.paint('Waiting for your rival to enable mic');
      await this.poll(id);
    }catch(e){
      if(id!==this.generation)return;
      this.stop();this.paint(e.name==='NotAllowedError'?'Microphone permission was denied':e.message);
    }
  }
  closePeer(){
    if(this.peer){this.peer.onconnectionstatechange=null;this.peer.close();}
    this.peer=null;this.audio.srcObject=null;this.remoteCount=0;
    this.description=null;this.candidates=[];
  }
  async poll(id){
    if(id!==this.generation||!this.stream)return;
    try{
      const data=await this.request({enabled:true,session:this.session,description:this.description,candidates:this.candidates});
      if(id!==this.generation)return;
      const other=data.other;
      if(!other?.enabled){
        this.closePeer();this.remote=null;this.paint('Waiting for your rival to enable mic');
      }else{
        if(!this.peer||this.remote!==other.session){
          this.closePeer();this.remote=other.session;
          const pc=this.peer=new RTCPeerConnection({iceServers:data.iceServers});
          for(const track of this.stream.getTracks())pc.addTrack(track,this.stream);
          pc.onicecandidate=e=>{if(e.candidate&&this.peer===pc&&this.candidates.length<80)this.candidates.push(e.candidate.toJSON());};
          pc.ontrack=e=>{
            if(this.peer!==pc)return;
            this.audio.srcObject=e.streams[0]||new MediaStream([e.track]);
            this.audio.play().catch(()=>this.paint('Tap Mic to reconnect audio'));
          };
          pc.onconnectionstatechange=()=>{
            if(this.peer!==pc)return;
            if(pc.connectionState==='connected')this.paint('Voice connected');
            else if(pc.connectionState==='failed')this.paint('Voice blocked by network · a TURN relay may be needed');
            else if(pc.connectionState==='disconnected')this.paint('Voice connection interrupted');
          };
          this.paint('Connecting voice…');
          if(data.index===0){
            await pc.setLocalDescription(await pc.createOffer());
            if(id!==this.generation||this.peer!==pc)return;
            this.description={...pc.localDescription.toJSON(),to:this.remote};
          }
        }
        const pc=this.peer;
        if(other.description?.to===this.session&&!pc.remoteDescription){
          const {type,sdp}=other.description;
          if((data.index===0&&type==='answer')||(data.index===1&&type==='offer')){
            await pc.setRemoteDescription({type,sdp});
            if(type==='offer'){
              await pc.setLocalDescription(await pc.createAnswer());
              if(id!==this.generation||this.peer!==pc)return;
              this.description={...pc.localDescription.toJSON(),to:this.remote};
            }
          }
        }
        if(pc.remoteDescription){
          const candidates=other.candidates||[];
          while(this.remoteCount<candidates.length){
            await pc.addIceCandidate(candidates[this.remoteCount++]);
          }
        }
      }
    }catch(e){
      if(id!==this.generation)return;
      this.paint('Voice reconnecting · '+e.message);
    }
    if(id===this.generation)this.timer=setTimeout(()=>this.poll(id),700);
  }
  stop(){
    const seat=this.seat,session=this.session;
    ++this.generation;clearTimeout(this.timer);
    this.awaitingPermission=false;
    if(this.stream)this.stream.getTracks().forEach(track=>track.stop());
    this.stream=null;this.closePeer();this.remote=null;this.session=null;this.paint('Mic off');
    if(seat&&session){
      fetch('/voice',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
        body:JSON.stringify({...seat,session,enabled:false})}).catch(()=>{});
    }
  }
}
