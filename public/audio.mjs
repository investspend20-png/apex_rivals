export class RaceAudio{
 constructor(button){
  this.button=button;
  try{this.enabled=localStorage.getItem('apexSound')!=='off';}catch{this.enabled=true;}
  button.onclick=()=>{this.enabled=!this.enabled;try{localStorage.setItem('apexSound',this.enabled?'on':'off');}catch{}this.unlock();this.paint();};
  this.paint();
  addEventListener('pointerdown',()=>this.unlock(),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.silence();});
  addEventListener('apex-background',()=>this.silence());
 }
 paint(){this.button.textContent=this.enabled?'Sound on':'Sound off';this.button.setAttribute('aria-pressed',String(this.enabled));}
 unlock(){
  if(!this.enabled)return;
  try{
   if(!this.context){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    const c=this.context=new Audio();
    this.engine=c.createOscillator();this.engine.type='sawtooth';
    this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=450;
    this.volume=c.createGain();this.volume.gain.value=0;
    this.engine.connect(this.filter);this.filter.connect(this.volume);this.volume.connect(c.destination);this.engine.start();
    const buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),values=buffer.getChannelData(0);
    for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;
    this.noise=c.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
    const band=c.createBiquadFilter();band.type='bandpass';band.frequency.value=1900;band.Q.value=3;
    this.tires=c.createGain();this.tires.gain.value=0;
    this.noise.connect(band);band.connect(this.tires);this.tires.connect(c.destination);this.noise.start();
   }
   if(this.context.state==='suspended')this.context.resume().catch(()=>{});
  }catch{this.enabled=false;this.paint();}
 }
 silence(){
  if(!this.context)return;
  this.volume.gain.setTargetAtTime(0,this.context.currentTime,.04);
  this.tires.gain.setTargetAtTime(0,this.context.currentTime,.04);
 }
 update(car,active,throttle){
  if(!this.context)return;
  if(!this.enabled||!active||document.hidden){this.silence();return;}
  const c=this.context,t=c.currentTime,speed=car.v||0;
  const gear=Math.min(5,1+Math.floor(speed/19));
  const rpm=45+(speed%19)*3.6+throttle*13;
  this.engine.frequency.setTargetAtTime(rpm,t,.07);
  this.filter.frequency.setTargetAtTime(350+speed*3+gear*18,t,.12);
  this.volume.gain.setTargetAtTime(.012+throttle*.012,t,.08);
  this.tires.gain.setTargetAtTime(car.drifting?.026:car.scraping?.017:0,t,.07);
 }
}
