import type { Spec } from './engine.ts';

/**
 * refs/crane.png (1374×1145): classic crane seen from above-front.
 * The mid-plane holds the neck and the tail; the near wing (right) mirrors to the far wing (upper left).
 */
export const crane: Spec = {
  rig: {
    w: 1374, h: 1145, fov: 22, elev: 31, dist: 7, yaw: -51, forward: -1, paper: 0xf7f0e6,
    bg: '#cfbfae', bgCss: 'linear-gradient(105deg, #e0d0bf 0%, #d4c3b0 45%, #a8957f 100%)', light: [-0.1, 1, 1], ambient: 1.1,
  },
  v: {
    // head (reverse-folded tip of the neck)
    hT: [456, 337, 5], hB: [482, 343, 0], hL: [468, 405, 5], beak: [330, 507, 0],
    // neck: a narrow double-layer flap in the mid-plane
    nT: [482, 343, 0], nL: [462, 560, 8], nC: [520, 700, 16], nR: [600, 700, 8], nB: [515, 938, 0],
    // tail
    tT: [1062, 85, 0], tL: [822, 605, 10], tC: [880, 620, 18], tR: [905, 672, 10], tB: [570, 960, 0],
    // body: the raised pyramid on the back, wing roots, lower body
    P: [715, 525, 0], Cn: [606, 625, 0], Ct: [822, 605, 0], Cw1: [640, 700, 60], Cw2: [785, 720, 60],
    A: [595, 785, 65], R: [900, 670, 60], Bm: [860, 880, 50],
    // near wing
    W: [1305, 878, 765], Bw: [880, 886, 260],
    // far wing, traced separately (the paper crane is not perfectly symmetric)
    fW: [62, 348, -720], fBw: [345, 712, -330],
  },
  faces: [
    'beak hT hB hL',
    'nT nL nC', 'nL nB nC', 'nT nC nR', 'nC nB nR',
    'tT tL tC', 'tT tC tR', 'tL tB tC', 'tC tB tR',
    'P Cn Cw1', 'P Cw1 Cw2', 'P Cw2 Ct',
    'Cn Cw1 A', 'Cw1 Cw2 R A', 'Cw2 Ct R',
    'A R Bm', 'A Bm tB', 'A tB nB',
    'A R W ^1 !', 'A W Bw ^1 !',
    "A' R' fW ^1 !", "A' fW fBw ^1 !",
  ],
  bones: {
    neck: { pivot: ['nB', 'Cn'], verts: 'nT nL nC' },
    head: { parent: 'neck', pivot: ['nT'], verts: 'hT hL beak' },
    tail: { pivot: ['tB', 'Ct'], verts: 'tT tL tC' },
    wingN: { pivot: ['A', 'R'], axis: ['A', 'R'], verts: 'W Bw' },
    wingF: { pivot: ["A'", "R'"], axis: ["R'", "A'"], verts: 'fW fBw' },
  },
  lines: ['Cn Cw1 Cw2 Ct', 'A R'],
};
