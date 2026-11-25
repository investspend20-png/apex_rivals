import {LENGTH,WIDTH,route,district,halfWidth,TURNS} from './route.mjs';

const canvas=document.getElementById('track');
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'high-performance'});
const overlay=document.getElementById('effects');
const fx=overlay.getContext('2d');
overlay.hidden=true;
const css=(r,g,b)=>[r/255,g/255,b/255];
const curb=css(134,145,151), road=css(43,48,53), white=css(193,182,152);
const cyan=css(51,200,228), amber=css(255,171,86), glass=css(24,43,58);
function program(){
  if(!gl)return null;
  const v=`
    attribute vec3 aPos,aNormal,aColor; attribute float aGlow;
    uniform mat4 uModel,uView; varying vec3 vPos,vNormal,vColor; varying float vGlow;
    void main(){
      vec4 pos=uModel*vec4(aPos,1.); vPos=pos.xyz;
      vNormal=(uModel*vec4(aNormal,0.)).xyz; vColor=aColor; vGlow=aGlow;
      gl_Position=uView*pos;
    }`;
  const f=`
    precision highp float; varying vec3 vPos,vNormal,vColor; varying float vGlow;
    uniform vec3 uEye,uLight; uniform float uTime;
    void main(){
      vec3 n=normalize(vNormal), toL=uLight-vPos, toEye=uEye-vPos;
      float d=length(toEye);
      float sun=max(dot(n,normalize(vec3(-.45,.78,-.22))),0.);
      float point=max(dot(n,normalize(toL)),0.)*(1.-smoothstep(4.,25.,length(toL)));
      float shine=pow(max(dot(n,normalize(normalize(toL)+normalize(toEye))),0.),20.)*point;
      float grain=fract(dot(floor(vPos.xz*7.),vec2(.618034,.381966)));
      vec3 color=vColor*(.53+sun*.58+point*.7+grain*.085)+vec3(.36,.43,.64)*shine*.35;
      color+=vGlow*vColor*(.52+.1*sin(uTime*2.));
      vec3 mist=mix(vec3(.23,.22,.33),vec3(.34,.27,.34),clamp((vPos.y+8.)/100.,0.,1.));
      gl_FragColor=vec4(mix(color,mist,smoothstep(82.,380.,d)),1.);
    }`;
  const p=gl.createProgram();
  for(const [kind,code] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){
    const sh=gl.createShader(kind);gl.shaderSource(sh,code);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p,sh);
  }
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);return p;
}
let shader;
try{shader=program();}catch(error){console.error(error);}
export const supported=Boolean(shader);
const attr={},uniform={};
if(shader){
  for(const name of ['aPos','aNormal','aColor','aGlow'])attr[name]=gl.getAttribLocation(shader,name);
  for(const name of ['uModel','uView','uEye','uLight','uTime'])uniform[name]=gl.getUniformLocation(shader,name);
  for(const index of Object.values(attr))gl.enableVertexAttribArray(index);
  gl.enable(gl.DEPTH_TEST);
}
function sub(a,b){return a.map((x,i)=>x-b[i]);}
function dot(a,b){return a.reduce((n,x,i)=>n+x*b[i],0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){const d=Math.hypot(...a)||1;return a.map(n=>n/d);}
class Mesh{
  data=[];
  quad(a,b,c,d,color,glow=0){
    const n=unit(cross(sub(b,a),sub(c,a)));
    for(const v of [a,b,c,a,c,d])this.data.push(...v,...n,...color,glow);
  }
  solid(x,y,z,w,h,d,color,glow=0){this.prism(x,y,z,w,d,w,d,h,color,glow);}
  prism(x,y,z,w,d,topW,topD,h,color,glow=0,offset=0){
    const ring=(y,W,D,Z)=>[[x-W/2,y,Z-D/2],[x+W/2,y,Z-D/2],[x+W/2,y,Z+D/2],[x-W/2,y,Z+D/2]];
    const b=ring(y,w,d,z),t=ring(y+h,topW,topD,z+offset);
    for(let i=0;i<4;i++){const j=(i+1)%4;this.quad(b[i],t[i],t[j],b[j],color,glow);}
    this.quad(t[3],t[2],t[1],t[0],color,glow);
  }
  tire(x,y,z){
    const color=css(19,21,24),hub=css(120,130,139);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
      const p=(angle,side,r)=>[x+side,y+Math.cos(angle)*r,z+Math.sin(angle)*r];
      this.quad(p(a,-.14,.34),p(b,-.14,.34),p(b,.14,.34),p(a,.14,.34),color);
      const side=x<0?-.145:.145;
      this.quad([x+side,y,z],p(a,side,.26),p(b,side,.26),[x+side,y,z],hub);
    }
  }
  finish(){
    if(!shader)return null;
    const b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.data),gl.STATIC_DRAW);
    return {buffer:b,count:this.data.length/10};
  }
}
function point(s,lane,height=0){const p=route(s,lane);return [p.x,p.y+height,p.z];}
function strip(m,a,b,l,r,h,c,glow=0){
  const ka=halfWidth(a)/(WIDTH/2),kb=halfWidth(b)/(WIDTH/2);
  m.quad(point(a,l*ka,h),point(a,r*ka,h),point(b,r*kb,h),point(b,l*kb,h),c,glow);
}
function marker(mesh,s,side){
  const p=route(s,side*(halfWidth(s)+.65));
  mesh.solid(p.x,p.y,p.z,.12,1.55,.12,curb);
  const a=point(s,side*(halfWidth(s)+.12),1.12),b=point(s,side*(halfWidth(s)+1.16),1.12);
  const c=[b[0],b[1]+.57,b[2]],d=[a[0],a[1]+.57,a[2]];
  mesh.quad(a,b,c,d,amber,.5);
}
function gantry(mesh,s,finish){
  const p=route(s),z=p.z,x=p.x,y=p.y;
  for(const off of [-9,9])mesh.solid(x+off,y,z,.45,6,1,curb);
  mesh.solid(x,y+5.2,z,18,1,1.4,css(23,57,77));
  for(let i=0;i<18;i++)mesh.solid(x-8.5+i,y+5.37,z+0.72,.63,.48,.06,
    finish?(i%2?white:glass):cyan,finish?0:.7);
}
let seed=403;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function building(m,x,z,width,depth,height,style,side){
  const y=-1.6,c=[css(77,88,99),css(99,95,107),css(61,78,92),css(113,105,108)][style];
  m.solid(x,y,z,width,height,depth,c);
  m.solid(x,y+height,z,width+1,.9,depth+1,css(94,106,115));
  if(style===1 || style===3){
    m.solid(x,y+1,z,width+.8,.7,depth+.55,css(58,66,74));
    m.solid(x,y+4.8,z,width+1.2,.64,depth+.8,style===1?css(69,103,131):css(139,66,69));
    for(const column of [-width*.41,-width*.19,width*.19,width*.41])
      m.solid(x+column,y+.3,z+depth*.505,.35,4.2,.38,curb);
  }
  if(height>36)m.solid(x+2,y+height,z-2,width*.44,3,depth*.45,glass);
  const cool=css(82,135,167), warm=css(226,164,105);
  for(let floor=2;floor<height-2;floor+=4.6){
    for(let col=-width*.42;col<width*.43;col+=4.7){
      const lit=rand();
            const wx=x+col, wy=y+floor, wz=z+depth/2+.08;
      m.quad([wx-1.4,wy,wz],[wx+1.4,wy,wz],[wx+1.4,wy+1.9,wz],[wx-1.4,wy+1.9,wz],
        lit>.67?warm:lit>.43?cool:glass,lit>.56?.62:0);
    }
    for(let col=-depth*.39;col<depth*.42;col+=5.3){
      const lit=rand();
            const wx=x+side*(width/2+.08), wy=y+floor, wz=z+col;
      m.quad([wx,wy,wz+1.45*side],[wx,wy,wz-1.45*side],[wx,wy+1.8,wz-1.45*side],[wx,wy+1.8,wz+1.45*side],
        lit>.74?warm:glass,lit>.74?.51:0);
    }
  }
}
const chunks=[];
if(shader)for(let start=-120;start<LENGTH+120;start+=120){
  const m=new Mesh();
  const end=start+120,p=route(start+60),a=route(start),b=route(end);
  m.quad([p.x-900,-1.7,a.z],[p.x+900,-1.7,a.z],[p.x+900,-1.7,b.z],[p.x-900,-1.7,b.z],css(56,60,68));
  for(let s=start;s<end;s+=6){
    strip(m,s,s+6,-WIDTH/2,WIDTH/2,0,road);
    for(const [l,r] of [[-8.7,-8.28],[8.28,8.7]])strip(m,s,s+6,l,r,.08,curb);
    for(const lane of [-2.78,2.78]){
      if(s%18===0)strip(m,s,s+5,lane-.08,lane+.08,.028,white);
    }
    const corner=TURNS.find(turn=>turn.label&&s>=turn.start-42&&s<turn.end+30);
    if(corner&&s%12===0){
      const side=-Math.sign(corner.delta);
      marker(m,s,side);
      const edge=side*8.06;
      strip(m,s,s+6,Math.min(edge,side*8.45),Math.max(edge,side*8.45),.09,
        s%24===0?amber:css(231,228,216));
    }
    const elev=route(s).y;
    if(elev<.5){
      for(const side of [-1,1]){
        const inner=Math.min(side*8.7,side*13),outer=Math.max(side*8.7,side*13);
        strip(m,s,s+6,inner,outer,-.055,css(88,85,87));
      }
      if(s>=175&&s%138<17){
        strip(m,s,s+6,-43,-8.7,-.095,road);
        strip(m,s,s+6,8.7,43,-.095,road);
        if(s%138===0)for(let stripe=0;stripe<15;stripe++){
          const side=-8+stripe*1.13;
          strip(m,s+1,s+4.2,side,side+.49,.034,white);
        }
      }
    }
    if(elev>3 || s>2840){
      for(const lane of [-8.9,8.9]){
        strip(m,s,s+6,lane-.19,lane+.19,.72,curb);
        m.quad(point(s,lane*halfWidth(s)/8.5,.72),point(s,lane*halfWidth(s)/8.5,-.35),point(s+6,lane*halfWidth(s+6)/8.5,-.35),point(s+6,lane*halfWidth(s+6)/8.5,.72),css(94,102,113));
        if(s%30===0&&elev>3){
          const support=route(s,lane*.72);
          m.solid(support.x,-1.7,support.z,1.4,elev+1.6,2.2,curb);
        }
      }
    }
    if(s%24===0 && s>=0){
      const lamp=route(s,(s%48===0?-1:1)*(halfWidth(s)+1));
      m.solid(lamp.x,lamp.y,lamp.z,.19,6,.19,css(98,103,123));
      m.solid(lamp.x,lamp.y+5.8,lamp.z,.64,.16,1.0,amber,.95);
    }
  }
  for(let s=start+15;s<end;s+=31)for(const side of [-1,1]){
    const p=route(s,side*(35+rand()*18));
    const industrial=s>2950&&s<3820;
    const height=industrial?9+rand()*19:18+rand()*68;
    building(m,p.x,p.z,15+rand()*11,16+rand()*9,height,Math.floor(rand()*4),-side);
    if(s%2===0){
      const q=route(s+5,side*(79+rand()*33));
      building(m,q.x,q.z,23,25,height*.74,2,-side);
    }
  }
  for(const mark of [0,1050,2110,3080,LENGTH])if(mark>=start&&mark<end)gantry(m,mark,mark===LENGTH);
  if(LENGTH>=start&&LENGTH<end){
    for(let i=0;i<16;i++)for(let j=0;j<2;j++)strip(m,LENGTH+j*.9,LENGTH+(j+1)*.9,-8+i,-7+i,.04,(i+j)%2?white:glass);
  }
  chunks.push({start,end,mesh:m.finish()});
}
function sportsCar(color){
  const m=new Mesh(),rubber=css(26,28,34),metal=css(172,181,192);
  m.prism(0,.26,0,1.88,4.2,1.84,3.96,.45,color);
  m.prism(0,.69,-.04,1.67,2.02,1.25,1.15,.47,glass,0,.08);
  m.solid(0,1.15,.02,1.25,.065,1.11,color);
  m.prism(0,.29,2.04,1.83,.32,1.61,.29,.26,rubber);
  m.solid(0,.7,1.98,1.35,.055,.25,color);
  m.solid(0,.31,2.157,1.48,.07,.13,css(56,65,71));
  for(const side of [-1,1]){
    m.prism(side*.79,.63,1.06,.3,1.62,.15,1.15,.12,color);
    m.solid(side*.57,.7,1.81,.06,.11,.12,metal);
  }
  m.solid(0,.81,1.92,1.52,.055,.25,color);
  for(const side of [-1,1]){
    for(const z of [-1.25,1.3])m.tire(side*.87,.37,z);
    m.solid(side*.63,.52,2.05,.41,.13,.07,css(255,45,71),1.05);
    m.solid(side*.62,.54,-2.04,.39,.11,.08,css(180,223,255),.8);
    m.solid(side*.61,.34,2.19,.17,.08,.08,metal);
    m.solid(side*.89,.92,-.4,.20,.12,.25,color);
  }
  m.solid(0,.48,2.11,.36,.12,.026,metal);
  return m.finish();
}
const cars=shader?[sportsCar(css(23,154,203)),sportsCar(css(214,56,88))]:[];
const contactShadow=shader?(()=>{
  const m=new Mesh(),shadow=css(27,30,34),edge=css(34,38,43);
  m.quad([-1.07,0,-2.15],[1.07,0,-2.15],[1.02,0,2.16],[-1.02,0,2.16],shadow);
  m.quad([-1.26,0,-1.7],[-1.07,0,-2.15],[-1.02,0,2.16],[-1.23,0,1.83],edge);
  m.quad([1.07,0,-2.15],[1.26,0,-1.7],[1.23,0,1.83],[1.02,0,2.16],edge);
  return m.finish();
})():null;
const flame=shader?(()=>{const m=new Mesh();m.prism(0,0,0,.20,.95,.06,.31,.24,cyan,1.5);return m.finish();})():null;
function model(x=0,y=0,z=0,yaw=0){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, x,y,z,1]);
}
function view(eye,target,aspect,fov){
  const z=unit(sub(eye,target)),x=unit(cross([0,1,0],z)),y=cross(z,x);
  const m=[x[0],x[1],x[2],-dot(x,eye), y[0],y[1],y[2],-dot(y,eye), z[0],z[1],z[2],-dot(z,eye)];
  const out=new Float32Array(16), k=1/Math.tan(fov/2), a=-1.00104,b=-.28015;
  for(let i=0;i<4;i++){out[i*4]=m[i]*k/aspect;out[i*4+1]=m[i+4]*k;out[i*4+2]=m[i+8]*a+(i===3?b:0);out[i*4+3]=-m[i+8];}
  return out;
}
const identity=model();
function draw(mesh,transform=identity){
  if(!mesh)return;
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
  for(const [name,size,offset] of [['aPos',3,0],['aNormal',3,12],['aColor',3,24],['aGlow',1,36]])
    gl.vertexAttribPointer(attr[name],size,gl.FLOAT,false,40,offset);
  gl.uniformMatrix4fv(uniform.uModel,false,transform);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
}
const mobile=matchMedia('(pointer: coarse)').matches;
let scale=Math.min(devicePixelRatio,mobile?1.09:1.45);
let previous=0,cameraLane=null,cameraBoost=0,slowFrames=0,lastLayout=0;
let canvasWidth=0,canvasHeight=0;
function resize(now){
  // Read layout occasionally rather than on every frame while the HUD updates.
  if(now-lastLayout<160&&canvasWidth&&canvasHeight)return;
  lastLayout=now;
  canvasWidth=canvas.clientWidth;canvasHeight=canvas.clientHeight;
  const w=Math.max(1,Math.floor(canvasWidth*scale));
  const h=Math.max(1,Math.floor(canvasHeight*scale));
  if(canvas.width!==w||canvas.height!==h){
    canvas.width=w;canvas.height=h;
    overlay.width=Math.max(1,Math.floor(w*.63));overlay.height=Math.max(1,Math.floor(h*.63));
  }
}
export function drawRace(players,index,started,now){
  if(!shader)return;
  const elapsed=previous?now-previous:16.67;
  const dt=Math.min(.05,elapsed/1000);previous=now;
  if(elapsed>22&&elapsed<150)slowFrames++;
  else slowFrames=Math.max(0,slowFrames-2);
  if(slowFrames>38&&scale>.82){
    scale=Math.max(.82,scale-.13);slowFrames=0;lastLayout=-1000;
  }
  resize(now);
  const p=players[index]||{progress:0,lane:-2,v:0};
  const progress=p.progress||0;
  const intro=!started?Math.sin(now*.00036)*3.8:0;
  const lane=(p.lane||0)+intro;
  if(cameraLane===null||!started)cameraLane=lane;
  else cameraLane+=(lane-cameraLane)*(1-Math.exp(-dt*10));
  cameraBoost+=((p.nitro?1:0)-cameraBoost)*(1-Math.exp(-dt*7));
  const anchor=route(progress-9-2.2*cameraBoost,cameraLane*.96);
  const target=route(progress+11,cameraLane*.91);
  const ride=started?Math.sin(now*.013)*Math.min(.025,p.v*.00024):0;
  const camera=[anchor.x,anchor.y+3.25+ride,anchor.z];
  const aspect=canvas.width/canvas.height;
  const own=route(progress,p.lane||0);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(.24,.23,.34,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(uniform.uView,false,view(camera,[target.x,target.y+1.5,target.z],aspect,(aspect<1?.98:.84)+(.14*cameraBoost)));
  gl.uniform3fv(uniform.uEye,camera);gl.uniform3fv(uniform.uLight,[own.x,own.y+2,own.z-7]);gl.uniform1f(uniform.uTime,now/1000);
  for(const chunk of chunks)if(chunk.end>progress-42&&chunk.start<progress+400)draw(chunk.mesh);
  players.forEach((player,i)=>{
    if(!player||Math.abs((player.progress||0)-progress)>400)return;
    const q=route(player.progress||0,player.lane||0);
    const yaw=q.heading-(player.headingError||0)-(player.slip||0)*.65;
    draw(contactShadow,model(q.x,q.y+.018,q.z,q.heading));
    draw(cars[i===index?0:1],model(q.x,q.y+.035,q.z,yaw));
    if(player.nitro)for(const side of [-1,1]){
      const x=side*.62,z=2.43+Math.sin(now*.047)*.15;
      draw(flame,model(q.x+x*Math.cos(yaw)+z*Math.sin(yaw),q.y+.29,q.z-x*Math.sin(yaw)+z*Math.cos(yaw),yaw));
    }
  });
  drawEffects(p,now);
}
function drawEffects(player,now){
  const active=Boolean(player.scraping||player.nitro);
  if(overlay.hidden===active)overlay.hidden=!active;
  if(!active)return;
  const w=overlay.width,h=overlay.height;
  fx.clearRect(0,0,w,h);
  if(player.scraping){
    const side=Math.sign(player.lane)||1;
    fx.strokeStyle='#ff9e59cf';fx.lineWidth=Math.max(1,w/650);
    for(let i=0;i<12;i++){
      const phase=(i*.137+now*.004)%1;
      const x=w*(.5+side*(.11+phase*.11)), y=h*(.69+phase*.10+(i%4)*.008);
      fx.beginPath();fx.moveTo(x,y);fx.lineTo(x+side*w*.025,y+h*.024);fx.stroke();
    }
  }
  if(player.nitro){
    fx.lineWidth=Math.max(1,w/490);fx.strokeStyle='#b7edff61';
    for(let i=0;i<21;i++){
      const side=i%2?1:-1,m=(i*.109+now*.0013)%1;
      const x=w*(.5+side*(.25+m*.25)),y=h*(.21+(i*53%83)/130+m*.14);
      fx.beginPath();fx.moveTo(x,y);fx.lineTo(x+side*w*.067,y+h*.047);fx.stroke();
    }
  }
}
export {district};






