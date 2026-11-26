import {LENGTH} from './route.mjs';

const fields=['lane','v','slip','headingError'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const forwardSpeed=p=>Math.max(0,(p.v||0)*Math.cos((p.headingError||0)-(p.slip||0)));

export class RaceMotion{
  reset(){
    this.samples=[];
    this.clockOffset=null;
    this.delay=85;
    this.gap=48;
    this.previousFrame=null;
    this.target=null;
    this.positions=[];
  }
  constructor(){this.reset();}
  push(state,received,sent=received){
    const former=this.samples.at(-1);
    if(former?.now>=state.now)return;
    const transit=Math.max(0,received-sent);
    const remote=!state.practice;
    const midpoint=received-transit/2-state.now;
    if(this.clockOffset===null)this.clockOffset=midpoint;
    else this.clockOffset+=clamp(midpoint-this.clockOffset,-20,20)*.08;
    if(former)this.gap=.83*this.gap+.17*Math.min(490,state.now-former.now);
    const desired=remote?clamp(this.gap*1.23+transit*.56+30,95,370):85;
    this.delay+=(desired-this.delay)*(desired>this.delay?.24:.045);
    this.samples.push(state);
    if(this.samples.length>18)this.samples.shift();
  }
  render(now){
    if(!this.samples.length)return null;
    const ideal=now-this.clockOffset-this.delay;
    const elapsed=this.previousFrame===null?0:Math.max(0,now-this.previousFrame);
    this.previousFrame=now;
    if(this.target===null||elapsed>750)this.target=ideal;
    else{
      const natural=this.target+elapsed;
      const correction=clamp((ideal-natural)*.065,-elapsed*.25,elapsed*.22);
      this.target=natural+correction;
    }
    const target=this.target;
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
        const ahead=Math.min(.125,Math.max(0,(target-b.now)/1000));
        pose.progress=Math.min(LENGTH,last+(next.scraping?0:forwardSpeed(next)*ahead));
      }
      if(b.winner===null){
        pose.progress=Math.max(this.positions[index]??0,pose.progress);
        this.positions[index]=pose.progress;
      }
      return pose;
    });
  }
}

