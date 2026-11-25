import {LENGTH} from './public/route.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function resetPlayer(player, index) {
  Object.assign(player, {
    lane: index === 0 ? -2.8 : 2.8,
    v: 0, progress: 0, slip: 0, lateral: 0, steer: 0, throttle: 0, brake: 0,
    boost: 100, keys: 0, ready: false, rematch: false, nitro: false, drifting: false
  });
}

// Match the Android 2.1 server's Metro Sprint simulation and analog inputs.
export function drive(p, active, dt) {
  const input = active ? p.keys : 0;
  const gas = input & (1 | 16 | 32) ? 1 : active ? p.throttle : 0;
  const braking = input & 2 ? 1 : active ? p.brake : 0;
  const direction = input & 12
    ? Number(Boolean(input & 8)) - Number(Boolean(input & 4))
    : active ? p.steer : 0;

  p.drifting = Boolean(input & 16) && p.v > 17 && Math.abs(direction) > .06 && braking < .1;
  p.nitro = Boolean(input & 32) && braking < .1 && p.boost > 0 && !p.drifting;
  if (p.nitro) p.boost = Math.max(0, p.boost - 24 * dt);
  else if (p.drifting) p.boost = Math.min(100, p.boost + 15 * dt);
  else if (!(input & 32)) p.boost = Math.min(100, p.boost + 3.5 * dt);

  const cap = p.nitro ? 112 : 82;
  p.v += (gas * 17.6 + (p.nitro ? 16 : 0) - braking * 33 - p.v * (.36 - .19 * gas)) * dt;
  if (p.drifting) p.v -= 2.8 * dt;
  p.v = Math.max(0, p.v > cap ? Math.max(cap, p.v - 20 * dt) : p.v);

  const curve = Math.sin(p.progress / LENGTH * 13.5) * .13 * (p.v / 82) ** 2;
  const target = direction * Math.min(p.v * .39, p.drifting ? 16 : 11) + curve * 7.2;
  p.lateral += (target - p.lateral) * Math.min(1, dt * (p.drifting ? 3.4 : 6.6));
  p.lane += p.lateral * dt;
  if (Math.abs(p.lane) > 7.4) {
    p.lane = clamp(p.lane, -7.4, 7.4);
    if (Math.sign(p.lateral) === Math.sign(p.lane)) {
      p.v = Math.max(0, p.v - (4 + Math.abs(p.lateral)) * dt);
      p.lateral *= .62;
    }
  }
  const slipTarget = direction * (p.drifting ? .31 : .095);
  p.slip += (slipTarget - p.slip) * Math.min(1, dt * 5);
  p.progress = Math.min(LENGTH, p.progress + p.v * dt);
}
