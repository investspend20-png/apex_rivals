import {drive} from './driving.mjs';

const numeric=['progress','lane','v','headingError','slip','boost'];
export class LocalDriver{
  constructor(){this.reset();}
  reset(){
    this.car=null;this.history=[];this.last=null;this.received=0;this.start=0;
    this.error={progress:0,lane:0,headingError:0};
  }
  reconcile(state,received,sent){
    const snapshot=state.players[state.index];
    if(!snapshot)return;
    const stamp=received-Math.min(1000,Math.max(0,received-sent))/2;
    const former=this.car&&{...this.car};
    this.car={...snapshot,keys:0,steer:0,throttle:0,brake:0};
    this.received=received;
    this.start=received+(state.start-state.now);
    this.history=this.history.filter(frame=>frame.end>stamp);
    for(const frame of this.history){
      const dt=Math.min(frame.dt,Math.max(0,(frame.end-stamp)/1000));
      if(frame.end>=this.start){Object.assign(this.car,frame.input);drive(this.car,true,dt);}
    }
    if(former&&Math.abs(former.progress-this.car.progress)<65){
      for(const field of Object.keys(this.error))this.error[field]+=former[field]-this.car[field];
    }else this.error={progress:0,lane:0,headingError:0};
    if(this.last===null)this.last=received;
  }
  render(now,input,active){
    if(!this.car)return null;
    const elapsed=Math.min(.05,Math.max(0,(now-this.last)/1000));
    this.last=now;
    if(active&&now>=this.start&&now-this.received<1300){
      let remaining=elapsed;
      while(remaining>0){
        const dt=Math.min(remaining,1/60);
        Object.assign(this.car,input);drive(this.car,true,dt);remaining-=dt;
      }
      this.history.push({end:now,dt:elapsed,input:{...input}});
      this.history=this.history.filter(frame=>now-frame.end<1600);
    }
    const pose={...this.car};
    const decay=Math.exp(-elapsed*9);
    for(const field of Object.keys(this.error)){
      this.error[field]*=decay;
      pose[field]+=this.error[field];
    }
    for(const field of numeric)if(!Number.isFinite(pose[field]))return null;
    return pose;
  }
}
