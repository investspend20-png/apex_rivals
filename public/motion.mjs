import {LENGTH} from './route.mjs';

const fields=['lane','v','slip','headingError'];
const presentationDelay=85;
const forwardSpeed=p=>Math.max(0,(p.v||0)*Math.cos((p.headingError||0)-(p.slip||0)));

export class RaceMotion{
  reset(){
    this.samples=[];
    this.clockOffset=null;
  }
  constructor(){this.reset();}
  push(state,received){
    if(this.clockOffset===null)this.clockOffset=received-state.now;
    if(this.samples.at(-1)?.now>=state.now)return;
    this.samples.push(state);
    if(this.samples.length>14)this.samples.shift();
  }
  render(now){
    if(!this.samples.length)return null;
    const target=now-this.clockOffset-presentationDelay;
    while(this.samples.length>2&&this.samples[1].now<=target)this.samples.shift();
    const a=this.samples[0],b=this.samples[1];
    if(!b||target<=a.now)return a.players;
    const duration=(b.now-a.now)/1000;
    const t=Math.min(1,(target-a.now)/(b.now-a.now));
    return b.players.map((next,index)=>{
      const previous=a.players[index];
      if(!next||!previous)return next;
      const pose={...next};
      for(const field of fields){
        const from=previous[field]??0,to=next[field]??0;
        pose[field]=from+(to-from)*t;
      }
      const first=previous.progress,last=next.progress;
      const distance=Math.max(0,last-first);
      const entry=Math.min(distance*1.5,forwardSpeed(previous)*duration);
      const exit=Math.min(distance*1.5,forwardSpeed(next)*duration);
      const tt=t*t,ttt=tt*t;
      pose.progress=first+(3*tt-2*ttt)*distance+(ttt-2*tt+t)*entry+(ttt-tt)*exit;
      if(t===1&&b.winner===null&&b.start&&b.now>=b.start){
        // Bridge short late packets, then wait on the last known safe trajectory.
        const ahead=Math.min(.080,Math.max(0,(target-b.now)/1000));
        pose.progress=Math.min(LENGTH,last+(next.scraping?0:forwardSpeed(next)*ahead));
      }
      return pose;
    });
  }
}
