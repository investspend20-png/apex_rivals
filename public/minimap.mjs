import {LENGTH,route,TURNS} from './route.mjs';

const W=194,H=244,PAD=20;
const cyan='#68edff',pink='#ff74ac';
export function makeMinimap(canvas){
  const ctx=canvas.getContext('2d');
  canvas.width=W;canvas.height=H;
  const base=document.createElement('canvas');
  base.width=W;base.height=H;
  const paint=base.getContext('2d');
  const points=Array.from({length:141},(_,i)=>route(i*LENGTH/140));
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const xScale=(W-2*PAD)/Math.max(1,maxX-minX);
  const zScale=(H-2*PAD)/Math.max(1,maxZ-minZ);
  const scale=Math.min(xScale,zScale);
  const project=p=>[W/2+(p.x-(minX+maxX)/2)*scale,H/2+(p.z-(minZ+maxZ)/2)*scale];
  paint.lineJoin='round';paint.lineCap='round';
  const line=(g,coords)=>{
    g.beginPath();
    coords.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));
  };
  const mapped=points.map(project);
  line(paint,mapped);
  paint.strokeStyle='#080e1a';paint.lineWidth=13;paint.stroke();
  paint.strokeStyle='#75859b';paint.lineWidth=6;paint.stroke();
  for(const turn of TURNS.filter(turn=>turn.label)){
    const [x,y]=project(route(turn.start));
    paint.fillStyle='#ffc36f';
    paint.beginPath();paint.arc(x,y,3,0,2*Math.PI);paint.fill();
  }
  const [sx,sy]=mapped[0];
  paint.fillStyle='#b4bfce';paint.beginPath();paint.arc(sx,sy,4,0,2*Math.PI);paint.fill();
  const [fx,fy]=mapped.at(-1);
  paint.fillStyle='#10131f';paint.fillRect(fx-8,fy-10,16,13);
  for(let x=0;x<4;x++)for(let y=0;y<3;y++){
    paint.fillStyle=(x+y)%2?'#182333':'#eaf2ff';
    paint.fillRect(fx-8+x*4,fy-10+y*4,4,4);
  }
  let previous=-1000;
  return (players,index,now)=>{
    if(now-previous<100)return;
    previous=now;
    const me=players[index], rival=players[1-index];
    if(!me)return;
    ctx.clearRect(0,0,W,H);ctx.drawImage(base,0,0);
    const ownProgress=Math.min(LENGTH,Math.max(0,me.progress));
    const passed=mapped.slice(0,Math.floor(ownProgress/LENGTH*140)+1);
    const myPoint=project(route(ownProgress));
    line(ctx,[...passed,myPoint]);
    ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#4b9eb0';ctx.lineWidth=4;ctx.stroke();
    if(rival){
      let [x,y]=project(route(rival.progress));
      if(Math.hypot(x-myPoint[0],y-myPoint[1])<13)x+=13;
      ctx.fillStyle=pink;ctx.strokeStyle='#111827';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(x,y,6,0,2*Math.PI);ctx.fill();ctx.stroke();
    }
    const ahead=Math.min(LENGTH,ownProgress+12);
    const behind=Math.max(0,ownProgress-12);
    const [x1,y1]=project(route(behind)),[x2,y2]=project(route(ahead));
    ctx.save();ctx.translate(...myPoint);ctx.rotate(Math.atan2(x2-x1,y1-y2));
    ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,6);ctx.lineTo(0,3);ctx.lineTo(-7,6);ctx.closePath();
    ctx.fillStyle=cyan;ctx.strokeStyle='#0c1930';ctx.lineWidth=2.7;ctx.stroke();ctx.fill();ctx.restore();
  };
}
