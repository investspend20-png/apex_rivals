import http from 'node:http';
import {attachLobby} from './lobby-server.mjs';
import {voiceSignal,voiceIceServers} from './voice-server.mjs';
const iceServers=voiceIceServers(process.env);
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {LENGTH} from './public/route.mjs';
import {drive, resetPlayer} from './race.mjs';

const files = new Map();
for (const [url, name, type] of [
  ['/', 'index.html', 'text/html'],
  ['/game.js', 'game.js', 'text/javascript'],
  ['/route.mjs', 'route.mjs', 'text/javascript'],
  ['/scene.mjs', 'scene.mjs', 'text/javascript'],
  ['/motion.mjs', 'motion.mjs', 'text/javascript'],
  ['/minimap.mjs', 'minimap.mjs', 'text/javascript'],
  ['/prediction.mjs', 'prediction.mjs', 'text/javascript'],
  ['/driving.mjs', 'driving.mjs', 'text/javascript'],
  ['/online.mjs','online.mjs','text/javascript'],
  ['/audio.mjs','audio.mjs','text/javascript'],
  ['/voice.mjs','voice.mjs','text/javascript'],
  ['/style.css', 'style.css', 'text/css']
]) {
  files.set(url, {data: await readFile(new URL('./public/' + name, import.meta.url)), type});
}
const rooms = new Map();
const hex = size => randomBytes(size).toString('hex').toUpperCase();
const axis = (value, min) => Number.isFinite(value) ? Math.max(min, Math.min(1, value)) : 0;
const error = (status, message) => ({status, body: {error: message}});
const ok = body => ({status: 200, body});

function newPlayer(index, now) {
  const player = {token: hex(24), seen: now};
  resetPlayer(player, index);
  return player;
}
function resetRoom(room) {
  Object.assign(room, {start: 0, finished: 0, winner: null});
  room.players.forEach((p, i) => { if (p) resetPlayer(p, i); });
}
const trackId=value=>['metro','coast','ridge'].includes(value)?value:'metro';
const carId=value=>Number.isInteger(value)&&value>=0&&value<4?value:0;
function snapshot(p) {
  if (!p) return null;
  const {lane, v, progress, ready, rematch, boost, nitro, slip, drifting, headingError, scraping, car} = p;
  return {lane, v, progress, ready, rematch, boost, nitro, slip, drifting, headingError, scraping, car};
}
function handleRace(path, data) {
  const now = Date.now();
  if (path === '/create') {
    if (rooms.size >= 128) return error(503, 'Too many active rooms. Try again shortly.');
    let code;
    do { code = hex(5); } while (rooms.has(code));
    const player = newPlayer(0, now);
    const track=trackId(data.track);player.track=track;player.car=carId(data.car);
    rooms.set(code, {players: [player, null], track, practice: data.practice === true, start: 0, finished: 0, winner: null});
    return ok({code, token: player.token,track});
  }
  const code = typeof data.code === 'string' ? data.code.toUpperCase() : '';
  const room = rooms.get(code);
  if (!room) return error(404, 'Room expired or the invite code is incorrect.');

  let index = room.players.findIndex(p => p && p.token === data.token);
  if (path === '/join') {
    if (room.practice) return error(409, 'This is a solo practice session.');
    if (index === -1) {
      index = room.players.indexOf(null);
      if (index === -1) return error(409, 'Both seats in this room are taken.');
      room.players[index] = newPlayer(index, now);
      room.players[index].track=room.track;room.players[index].car=carId(data.car);
    }
    room.players[index].seen = now;
    return ok({code, token: room.players[index].token,track:room.track});
  }
  if (index === -1) return error(403, 'Your seat expired. Join the room again.');
  if(path==='/voice'){
    if(room.practice)return error(409,'Voice is available in two-player rooms');
    return voiceSignal(room,index,data,iceServers);
  }
  const player = room.players[index];
  if (data.action === 'leave') {
    room.players[index] = null;
    if (room.players[1-index]) resetRoom(room);
    else rooms.delete(code);
    return ok({left: true});
  }
  Object.assign(player, {
    seen: now, keys: Number.isInteger(data.keys) ? data.keys & 63 : 0,
    steer: axis(data.steer, -1), throttle: axis(data.throttle, 0), brake: axis(data.brake, 0)
  });
  if (data.action === 'ready' && !room.start) player.ready = true;
  if (data.action === 'rematch' && room.winner !== null) {
    player.rematch = true;
    if (room.practice || room.players[1-index]?.rematch) {
      resetRoom(room);
      room.players.forEach(p => { if (p) p.ready = true; });
    }
  }
  if (!room.start && room.players[0]?.ready && (room.practice || room.players[1]?.ready)) {
    room.start = now + 3000;
  }
  const {start, winner, finished, practice} = room;
  return ok({index, start, winner, finished, practice, track:room.track, now, players: room.players.map(snapshot)});
}

let lastTick = performance.now();
setInterval(() => {
  const now = Date.now();
  const tick = performance.now();
  const dt = Math.min(.05, (tick - lastTick) / 1000);
  lastTick = tick;
  for (const [code, room] of rooms) {
    let expired = false;
    room.players.forEach((p, i) => {
      if (p && now - p.seen > 55000) {
        room.players[i] = null;
        expired = true;
      }
    });
    if (room.players.every(p => !p)) { rooms.delete(code); continue; }
    if (expired) resetRoom(room);
    if (!room.start || now < room.start || room.winner !== null) continue;
    for (const [index, player] of room.players.entries()) {
      if (!player) continue;
      drive(player, now - player.seen < 1100, dt);
      if (player.progress >= LENGTH) {
        room.winner = index;
        room.finished = now;
        break;
      }
    }
  }
}, 1000 / 60).unref();

function send(res, status, type, bytes) {
  res.writeHead(status, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(bytes);
}
async function readBody(req) {
  let data = '', size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 131072) data += chunk;
  }
  if (size > 131072) throw new Error('Request too large');
  const value = JSON.parse(data);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request');
  return value;
}
const api = new Set(['/create', '/join', '/tick', '/voice']);
const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (path === '/health') return send(res, 200, 'text/plain', 'ok');
    const file = files.get(path);
    if (file) return send(res, 200, file.type, file.data);
  }
  let result;
  if (req.method !== 'POST' || !api.has(path)) result = error(404, 'Page not found.');
  else if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    result = error(415, 'Send application/json.');
  } else {
    try { result = handleRace(path, await readBody(req)); }
    catch { result = error(400, 'Invalid race request.'); }
  }
  send(res, result.status, 'application/json', JSON.stringify(result.body));
});

attachLobby(server,{
 secret:process.env.PLAYER_SECRET||randomBytes(32).toString('hex'),
 validSeat(seat){const room=rooms.get(seat?.code);return Boolean(room?.players.some(p=>p?.token===seat?.token));},
 leaveSeat(seat){handleRace('/tick',{...seat,action:'leave'});},
 createMatch(track,hostCar,guestCar){
   const host=handleRace('/create',{track,car:hostCar});
   if(host.status!==200)throw Error(host.body.error);
   const guest=handleRace('/join',{code:host.body.code,car:guestCar});
   if(guest.status!==200){handleRace('/tick',{...host.body,action:'leave'});throw Error(guest.body.error);}
   return [{...host.body,autoReady:true},{...guest.body,autoReady:true}];
 }
});
server.requestTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Apex Rivals listening on port ' + server.address().port);
});





