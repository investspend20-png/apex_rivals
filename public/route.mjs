export const LENGTH=4200, WIDTH=17;
export const TURNS=[
  {start:438,end:515,delta:.94,label:'Market Right',advice:'Brake for the tight right',speed:105},
  {start:720,end:960,delta:-.66},
  {start:1510,end:1770,delta:-1.18,label:'Skyway Sweeper',advice:'Hold a smooth left arc',speed:175},
  {start:1990,end:2240,delta:.72},
  {start:2610,end:2790,delta:.42},
  {start:3230,end:3328,delta:-.88,label:'Harbor Chicane',advice:'Brake for left, then right',speed:115},
  {start:3370,end:3466,delta:.91},
  {start:3820,end:4050,delta:-.45}
];
function smooth(a,b,s){
  const t=Math.max(0,Math.min(1,(s-a)/(b-a)));
  return t*t*(3-2*t);
}
export function headingAt(s){
  let heading=0;
  for(const turn of TURNS)heading+=turn.delta*smooth(turn.start,turn.end,s);
  return heading;
}
export function curvatureAt(s){
  let curvature=0;
  for(const {start,end,delta} of TURNS){
    const t=(s-start)/(end-start);
    if(t>0&&t<1)curvature+=delta*6*t*(1-t)/(end-start);
  }
  return curvature;
}
export function halfWidth(s){
  return 8.5-1.35*(smooth(290,410,s)-smooth(560,740,s))
    +1.6*(smooth(1200,1500,s)-smooth(1800,2040,s))
    -2.1*(smooth(3000,3210,s)-smooth(3500,3670,s));
}
const start=-180,step=2,coordinates=[[0,-start]];
for(let s=start;s<LENGTH+182;s+=step){
  const angle=headingAt(s+step/2), [x,z]=coordinates.at(-1);
  coordinates.push([x+Math.sin(angle)*step,z-Math.cos(angle)*step]);
}
export function center(s){
  const grid=Math.max(0,Math.min(coordinates.length-1,(s-start)/step));
  const i=Math.floor(grid), t=grid-i;
  const [x,z]=coordinates[i], [nextX,nextZ]=coordinates[i+1]??coordinates[i];
  const y=11*(smooth(720,1040,s)-smooth(1800,2140,s))
    +15*(smooth(2810,3100,s)-smooth(3700,4010,s));
  return [x+(nextX-x)*t,y,z+(nextZ-z)*t];
}
export function route(s,lane=0){
  const [x,y,z]=center(s), heading=headingAt(s);
  return {x:x+Math.cos(heading)*lane,y,z:z+Math.sin(heading)*lane,heading:-heading};
}
export const district=s=>s<760?'Arts District':s<2080?'Skyway':s<2870?'Financial District':s<4000?'Harbor Expressway':'Waterfront';
export function turnCue(s){
  return TURNS.find(turn=>turn.label&&s>=turn.start-270&&s<=turn.end+(turn.start===3230?140:35));
}

