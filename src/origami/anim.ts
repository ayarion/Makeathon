import type { PartPose, Pose } from './engine.ts';

/**
 * Procedural clips. Every clip is a pure function of time (seekable).
 * Animal frame: +Z forward, +Y up. Signs: root rx > 0 = nose down; a limb hanging down with rx > 0
 * swings its foot backward; an ear pointing up with rx < 0 lays back; ry < 0 turns toward the near side.
 */
export interface Clip {
  /** Seconds; loops have one cycle, one-shots their length. */
  duration: number;
  loop: boolean;
  /** One-shots that should stay on their last pose instead of returning to the loop. */
  hold?: boolean;
  pose(t: number): Pose;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
/** 0 → 1 → 0 envelope with soft in/out (fraction `edge` of the clip). */
const env = (u: number, edge = 0.22) => smooth(u / edge) * smooth((1 - u) / edge);
/** A short blip that repeats every `period` seconds. */
const blip = (t: number, period: number, len = 0.18) => { const x = (t % period) / len; return x < 1 ? Math.sin(Math.PI * x) : 0; };

// ---- shared clips ----

/** Fold up from the flat square sheet: two folds, then a spin that turns the folded square into the animal. */
const foldIn: Clip = {
  duration: 4.2, loop: false,
  pose: (t) => ({ fold: clamp01(t / 4.2) }),
};
/** Caught: a startled squash, then the animal unfolds back into a flat sheet and stays there. */
const caught: Clip = {
  duration: 2.6, loop: false, hold: true,
  pose: (t) => {
    const u = clamp01(t / 2.6);
    const squash = Math.sin(Math.PI * clamp01(u / 0.18));
    return { fold: 1 - clamp01((u - 0.15) / 0.85), root: { dy: -0.04 * squash, rx: 0.12 * squash } };
  },
};

// ---- rabbit ----
const rabbit: Record<string, Clip> = {
  idle: {
    duration: 6, loop: true,
    pose: (t) => ({
      root: { dy: 0.004 * Math.sin(t * 2.2) },
      parts: {
        head: { ry: 0.18 * Math.sin(t * 0.7), rx: 0.05 * Math.sin(t * 1.3) },
        earN: { rx: -0.25 * blip(t, 2.3) },
        earF: { rx: -0.2 * blip(t + 1.1, 3.1), rz: 0.1 * blip(t + 1.1, 3.1) },
        tail: { ry: 0.3 * blip(t + 0.5, 1.7, 0.25) },
      },
    }),
  },
  run: {
    // bounding hop: hind legs push, front legs reach, ears swept back
    duration: 0.42, loop: true,
    pose: (t) => {
      const p = (t / 0.42) % 1;
      const hind = 0.75 * Math.sin(TAU * (p + 0.1));
      return {
        root: { dy: 0.15 * Math.max(0, Math.sin(TAU * p)), rx: -0.2 * Math.cos(TAU * p) },
        parts: {
          head: { rx: 0.12 * Math.cos(TAU * p) },
          earN: { rx: -0.55 - 0.15 * Math.sin(TAU * (p - 0.15)) },
          earF: { rx: -0.55 - 0.15 * Math.sin(TAU * (p - 0.2)) },
          haunch: { rx: hind }, "haunch'": { rx: 0.75 * Math.sin(TAU * (p + 0.14)) },
          leg: { rx: -hind }, "leg'": { rx: -0.75 * Math.sin(TAU * (p + 0.06)) },
          tail: { ry: 0.25 * Math.sin(TAU * 2 * p) },
        },
      };
    },
  },
  /** Startled leap with a full spin, ears straight up. */
  jump: {
    duration: 1.0, loop: false,
    pose: (t) => {
      const u = clamp01(t / 1.0);
      const crouch = u < 0.2 ? smooth(u / 0.2) : u > 0.82 ? Math.sin(Math.PI * clamp01((u - 0.82) / 0.18)) : 0;
      const air = clamp01((u - 0.2) / 0.62);
      const inAir = u >= 0.2 && u <= 0.82 ? Math.sin(Math.PI * air) : 0;
      return {
        root: { dy: 0.5 * inAir - 0.035 * crouch, rx: 0.15 * crouch - 0.2 * inAir, ry: TAU * smooth(air) },
        parts: {
          earN: { rx: 0.15 * inAir, rz: -0.35 * inAir }, earF: { rx: 0.15 * inAir, rz: 0.35 * inAir },
          haunch: { rx: 0.7 * inAir }, "haunch'": { rx: 0.7 * inAir },
          leg: { rx: -0.6 * inAir }, "leg'": { rx: -0.6 * inAir },
          tail: { ry: 0.4 * inAir * Math.sin(t * 30) },
        },
      };
    },
  },
  /** Looks back over its shoulder at the chaser, wiggles the tail and thumps a foot. */
  lookBack: {
    duration: 1.9, loop: false,
    pose: (t) => {
      const u = clamp01(t / 1.9), e = env(u);
      const thump = Math.max(0, Math.sin(TAU * 4 * clamp01((u - 0.45) / 0.3))) * (u > 0.45 && u < 0.75 ? 1 : 0);
      return {
        root: { ry: -0.4 * e },
        parts: {
          head: { ry: -1.1 * e, rz: 0.15 * e },
          earN: { rx: -0.3 * e + 0.15 * e * Math.sin(t * 14) }, earF: { rx: 0.1 * e },
          tail: { ry: 0.5 * e * Math.sin(t * 22) },
          haunch: { rx: -0.35 * thump },
        },
      };
    },
  },
  caught,
  fold: foldIn,
};

// ---- fox ----
const fox: Record<string, Clip> = {
  idle: {
    duration: 8, loop: true,
    pose: (t) => ({
      root: { dy: 0.003 * Math.sin(t * 2) },
      parts: {
        head: { ry: -0.3 * Math.sin(t * 0.6), rx: 0.04 * Math.sin(t * 1.1) },
        tail: { ry: 0.22 * Math.sin(t * 1.5) },
        earN: { rx: -0.3 * blip(t, 2.7) }, earF: { rx: -0.3 * blip(t + 1.3, 3.4) },
      },
    }),
  },
  run: {
    // trot: diagonal legs move together
    duration: 0.5, loop: true,
    pose: (t) => {
      const p = (t / 0.5) % 1;
      const A = 0.6 * Math.sin(TAU * p), B = 0.6 * Math.sin(TAU * (p + 0.5));
      return {
        root: { dy: 0.025 * (0.5 - 0.5 * Math.cos(TAU * 2 * p)), rx: 0.04 * Math.sin(TAU * 2 * p) },
        parts: {
          hindN: { rx: A }, frontF: { rx: A }, hindF: { rx: B }, frontN: { rx: B },
          head: { rx: -0.05 * Math.sin(TAU * 2 * p) },
          earN: { rx: -0.35 }, earF: { rx: -0.35 },
          tail: { ry: 0.25 * Math.sin(TAU * p), rx: 0.1 },
        },
      };
    },
  },
  /** The fox's mousing pounce: crouch, leap nose-up, dive nose-first. */
  pounce: {
    duration: 1.3, loop: false,
    pose: (t) => {
      const u = clamp01(t / 1.3);
      const crouch = u < 0.25 ? smooth(u / 0.25) : 0;
      const a = clamp01((u - 0.25) / 0.55);
      const inAir = u >= 0.25 && u <= 0.8 ? Math.sin(Math.PI * a) : 0;
      const land = u > 0.8 ? Math.sin(Math.PI * clamp01((u - 0.8) / 0.2)) : 0;
      const tilt = u >= 0.25 && u <= 0.8 ? -0.6 + 1.5 * smooth(a) : 0;
      return {
        root: { dy: 0.55 * inAir - 0.05 * crouch - 0.03 * land, rx: -0.12 * crouch + tilt * inAir + 0.35 * land },
        parts: {
          frontN: { rx: -0.9 * inAir }, frontF: { rx: -0.9 * inAir },
          hindN: { rx: 0.7 * inAir + 0.3 * crouch }, hindF: { rx: 0.7 * inAir + 0.3 * crouch },
          tail: { rx: -0.3 * inAir },
          earN: { rx: 0.2 * crouch }, earF: { rx: 0.2 * crouch },
        },
      };
    },
  },
  /** Glances back at the chaser with a quick tail flick. */
  lookBack: {
    duration: 1.8, loop: false,
    pose: (t) => {
      const u = clamp01(t / 1.8), e = env(u);
      return {
        root: { ry: -0.3 * e },
        parts: {
          head: { ry: -1.3 * e, rz: 0.12 * e },
          tail: { ry: 0.55 * e * Math.sin(t * 18) },
          earN: { rx: 0.15 * e }, earF: { rx: 0.15 * e },
        },
      };
    },
  },
  caught,
  fold: foldIn,
};

// ---- crane ----
const crane: Record<string, Clip> = {
  idle: {
    duration: 8, loop: true,
    pose: (t) => ({
      root: { dy: 0.004 * Math.sin(t * 1.8) },
      parts: {
        wingN: { hinge: 0.08 * Math.sin(t * 1.6) }, wingF: { hinge: 0.08 * Math.sin(t * 1.6) },
        neck: { rx: 0.06 * Math.sin(t * 1.1) },
        head: { ry: 0.35 * Math.sin(t * 0.5) },
      },
    }),
  },
  run: {
    // a hurried, flapping waddle
    duration: 0.55, loop: true,
    pose: (t) => {
      const p = (t / 0.55) % 1;
      const flap = 0.75 * Math.sin(TAU * p);
      return {
        root: { dy: 0.05 * (0.5 - 0.5 * Math.cos(TAU * p)), rz: 0.07 * Math.sin(TAU * p), rx: 0.05 },
        parts: {
          wingN: { hinge: flap }, wingF: { hinge: flap },
          neck: { rx: 0.15 * Math.sin(TAU * (p + 0.25)) },
          head: { rx: -0.15 * Math.sin(TAU * (p + 0.25)) },
          tail: { rx: 0.1 * Math.sin(TAU * p) },
        },
      };
    },
  },
  /** Three big wingbeats that lift it off the ground and back down. */
  flap: {
    duration: 1.8, loop: false,
    pose: (t) => {
      const u = clamp01(t / 1.8), e = env(u, 0.12);
      return {
        root: { dy: 0.55 * Math.pow(Math.sin(Math.PI * u), 1.3), rx: -0.15 * e },
        parts: {
          wingN: { hinge: 1.1 * e * Math.sin(TAU * 3 * u) }, wingF: { hinge: 1.1 * e * Math.sin(TAU * 3 * u) },
          neck: { rx: -0.2 * e }, tail: { rx: 0.15 * e },
        },
      };
    },
  },
  /** A polite bow: neck and head dip, tail rises. */
  bow: {
    duration: 1.6, loop: false,
    pose: (t) => {
      const e = env(clamp01(t / 1.6), 0.3);
      return {
        root: { rx: 0.15 * e },
        parts: {
          neck: { rx: 0.75 * e }, head: { rx: 0.45 * e },
          tail: { rx: -0.3 * e },
          wingN: { hinge: -0.25 * e }, wingF: { hinge: -0.25 * e },
        },
      };
    },
  },
  caught,
  fold: foldIn,
};

export const CLIPS = { rabbit, fox, crane } as const;

// ---- blending ----
const KEYS = ['rx', 'ry', 'rz', 'hinge', 'dx', 'dy', 'dz'] as const;
function mixPart(a: PartPose | undefined, b: PartPose | undefined, w: number): PartPose {
  const out: PartPose = {};
  for (const k of KEYS) out[k] = (a?.[k] ?? 0) * (1 - w) + (b?.[k] ?? 0) * w;
  return out;
}
/** Linear blend of two poses (w = 0 → a, 1 → b). */
export function mixPose(a: Pose, b: Pose, w: number): Pose {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const parts: Record<string, PartPose> = {};
  for (const key of new Set([...Object.keys(a.parts ?? {}), ...Object.keys(b.parts ?? {})])) {
    parts[key] = mixPart(a.parts?.[key], b.parts?.[key], w);
  }
  return { root: mixPart(a.root, b.root, w), parts, fold: (a.fold ?? 1) * (1 - w) + (b.fold ?? 1) * w };
}
