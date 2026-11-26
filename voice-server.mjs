const voices=new WeakMap();
const validSession=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(value);
export function voiceSignal(room,index,data,iceServers,now=Date.now()){
  let pair=voices.get(room);
  if(!pair){pair=[null,null];voices.set(room,pair);}
  const token=room.players[index].token;
  // Replacing a player must discard their predecessor's signaling state.
  for(let i=0;i<2;i++){
    if(pair[i]&&(pair[i].token!==room.players[i]?.token||now-pair[i].seen>16000))pair[i]=null;
  }
  if(!validSession(data.session))return {status:400,body:{error:'Invalid voice session'}};
  if(data.enabled===false){
    if(pair[index]?.session===data.session)pair[index]=null;
  }else{
    const description=data.description;
    if(description!=null&&(!['offer','answer'].includes(description.type)||typeof description.sdp!=='string'
      ||description.sdp.length>20000||!validSession(description.to))){
      return {status:400,body:{error:'Invalid voice description'}};
    }
    if(!Array.isArray(data.candidates)||data.candidates.length>80
      ||data.candidates.some(c=>!c||typeof c.candidate!=='string'||c.candidate.length>2048)){
      return {status:400,body:{error:'Invalid voice candidates'}};
    }
    const current=pair[index];
    if(current?.session!==data.session&&current&&now-current.seen<3000)
      return {status:409,body:{error:'Voice is already active in another window'}};
    pair[index]={token,session:data.session,seen:now,enabled:true,description,candidates:data.candidates};
  }
  const remote=pair[1-index];
  const other=remote?{session:remote.session,enabled:true,description:remote.description,candidates:remote.candidates}:null;
  return {status:200,body:{index,other,iceServers}};
}
export function voiceIceServers(env){
  const servers=[{urls:'stun:stun.l.google.com:19302'}];
  if(env.TURN_URL&&env.TURN_USERNAME&&env.TURN_CREDENTIAL){
    const urls=env.TURN_URL.split(',').map(s=>s.trim());
    if(urls.some(url=>!/^turns?:[^\s]+$/.test(url)))throw Error('Invalid TURN_URL');
    servers.push({urls,username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
  }
  return servers;
}
