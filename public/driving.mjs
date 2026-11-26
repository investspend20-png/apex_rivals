import {LENGTH, curvatureAt, halfWidth} from './route.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function resetPlayer(player, index) {
  Object.assign(player, {
    lane: index === 0 ? -2.8 : 2.8,
    v: 0, progress: 0, slip: 0, headingError: 0, scraping: false, steer: 0, throttle: 0, brake: 0,
    boost: 100, keys: 0, ready: false, rematch: false, nitro: false, drifting: false
  });
}

// Match the Android 2.2 server's Metro Sprint simulation and analog inputs.
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

  const grip = p.drifting ? 10.5 : 18;
  const steeringRate = Math.min(1.32, grip / Math.max(p.v, 8)) * Math.min(1, p.v / 6);
  const roadTurn = curvatureAt(p.progress,p.track);
  const slipTarget = p.drifting ? direction * .23 : 0;
  p.slip += (slipTarget - p.slip) * Math.min(1, dt * 5);

  const forward = Math.cos(p.headingError - p.slip) * p.v;
  p.headingError += (direction * steeringRate - roadTurn * forward - .55 * p.headingError) * dt;
  p.headingError = clamp(p.headingError, -1.06, 1.06);
  p.lane += p.v * Math.sin(p.headingError - p.slip) * dt;
  p.progress = Math.min(LENGTH, p.progress + Math.max(0, forward) * dt);
  const edge = halfWidth(p.progress) - 1.08;
  p.scraping = Math.abs(p.lane) > edge;
  if (p.scraping) {
    p.lane = clamp(p.lane, -edge, edge);
    p.v = Math.max(0, p.v - (9 + .58 * p.v + 12 * Math.abs(p.headingError)) * dt);
    p.headingError = p.headingError * Math.max(0, 1 - 3.2 * dt) - Math.sign(p.lane) * .12 * dt;
  }
}



