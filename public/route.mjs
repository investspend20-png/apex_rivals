export const LENGTH=4200, WIDTH=17;
export function center(s){
  const t=s/LENGTH;
  const x=170*Math.sin(t*13.5)+100*Math.sin(t*5.4);
  const ramp=(a,b)=>{const m=Math.max(0,Math.min(1,(s-a)/(b-a)));return m*m*(3-2*m);};
  const y=11*(ramp(720,1040)-ramp(1800,2140))+15*(ramp(2810,3100)-ramp(3700,4010));
  return [x,y,-s];
}
export function route(s,lane=0){
  const p=center(s), q=center(s+2), r=center(s-2);
  const dx=q[0]-r[0], dz=q[2]-r[2], n=Math.hypot(dx,dz)||1;
  return {x:p[0]-dz/n*lane,y:p[1],z:p[2]+dx/n*lane,heading:Math.atan2(-dx,-dz)};
}
export const district=s=>s<760?'Arts District':s<2080?'Skyway':s<2870?'Financial District':s<4000?'Harbor Expressway':'Waterfront';

