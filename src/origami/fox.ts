import type { Spec } from './engine.ts';

/**
 * refs/fox.png (1374×1145): walking fox, seen from its left side, head turned toward the camera.
 * Orange is the front of the sheet; the cream reverse shows on the tail tip, ears, chest, jaw and belly.
 * Legs and head are not mirror images in the pose, so they are traced one by one (`!`).
 */
export const fox: Spec = {
  rig: {
    w: 1374, h: 1145, fov: 22, elev: 35, dist: 7, yaw: 18, paper: 0xbf4a1c, reverse: 0xf0dcc2, edge: { light: 0xe9a56f, dark: 0x4a1606 },
    bg: '#cbbba9', bgCss: 'linear-gradient(#c1af9c, #d8c8b6)', light: [0.3, 0.8, 1], ambient: 1.3, keyStrength: 2.4, groundAt: 'lf2',
  },
  v: {
    // tail
    tt: [78, 68, 0], tc1: [170, 240, 40], tc2: [298, 175, 0], tc3: [108, 325, 0],
    tr1: [275, 420, 55], tl1: [230, 495, 0], tb1: [415, 590, 0], tb2: [460, 445, 0],
    // back and side
    sp1: [460, 447, 0], sp2: [570, 405, 0], sp3: [860, 458, 0], sp4: [895, 452, 0],
    bk1: [527, 422, 70], bk2: [855, 490, 70],
    thK: [470, 560, 110], thF: [615, 635, 95], thB: [408, 590, 40],
    sd2: [790, 702, 95], bl1: [590, 662, 50], bl2: [795, 745, 50],
    // near hind leg
    hl1: [560, 690, 85], hlT: [450, 700, 95], hlB: [352, 745, 70], hlK: [398, 790, 90],
    hlF: [418, 948, 'g'], hlH: [345, 925, 'g'],
    // far hind leg
    fh1: [560, 695, -60], fh2: [640, 680, -60], fhk: [610, 800, -55], fhm: [585, 790, -60],
    fhf: [675, 887, 'g'], fhb: [640, 885, 'g'],
    // shoulder, near front leg
    s1: [850, 492, 90], s2: [888, 468, 60], s3: [1055, 672, 90], s4: [960, 745, 110],
    s5: [795, 738, 95],
    lk: [870, 850, 100], lr: [948, 850, 105], lf1: [925, 1065, 80], lf2: [968, 1078, 90],
    // far front leg
    ff1: [965, 800, -50], ff2: [1045, 745, -50], ffk: [1040, 880, -45], ffm: [1000, 880, -50],
    fff: [1110, 985, 'g'], ffb: [1085, 985, 'g'],
    // neck and chest
    nk1: [900, 440, 50], nk2: [975, 330, 40], nk3: [1045, 445, 60],
    ch1: [1100, 470, 0], ch2: [1120, 600, 0], ch3: [1050, 760, 0], ch4: [985, 805, 0],
    // head (turned toward the camera)
    T: [1105, 250, 20], B: [1100, 330, 90], Cp: [1195, 330, 70], D: [1318, 505, 160],
    A: [1000, 425, 90], F: [1150, 485, 170], E: [1240, 460, 30], G: [1245, 355, -10],
    // ears
    neT: [1042, 130, 30], neL: [970, 300, 40], neB: [1020, 385, 70], neR: [1102, 262, 40], neI: [1030, 330, 20],
    feT: [1245, 138, -20], feL: [1100, 245, 10], feM: [1190, 262, 0], feR: [1225, 298, -30],
  },
  faces: [
    // tail
    'tt tc3 tc1 *', 'tt tc1 tc2 *', 'tc1 tr1 tc2', 'tc2 tr1 tb2', 'tc1 tc3 tl1', 'tc1 tl1 tr1',
    'tl1 tb1 tr1', 'tr1 tb1 tb2',
    // back, haunch, side, belly
    'sp1 sp2 bk1', 'sp2 sp3 bk2 bk1', 'sp3 sp4 bk2',
    'sp1 bk1 thK', 'sp1 thK thB', 'bk1 thF thK', 'thK thF hl1 ^1',
    'bk1 bk2 sd2 thF', 'thF sd2 bl2 bl1 *', "bl1 bl2 bl2' bl1' * !", "sp1 thB thB' !",
    // near hind leg
    'thK hl1 hlT ! ^1', 'thB thK hlT hlB !', 'hlB hlT hlK !', 'hlT hl1 hlK !', 'hlB hlK hlF hlH !',
    // far hind leg
    "thK' hl1' fh2 fh1 !", 'fh1 fh2 fhk !', 'fh1 fhk fhm !', 'fhm fhk fhf fhb !',
    // shoulder and near front leg
    'bk2 sp4 s2 s1', 's1 s2 s3 s4 ^1', 's1 s4 s5 ^1', 'bk2 s1 s5 sd2',
    's5 s4 lr lk ! ^1', 'lk lr lf2 lf1 !',
    // far front leg
    "s5' s4' ff2 ff1 !", 'ff1 ff2 ffk !', 'ff1 ffk ffm !', 'ffm ffk fff ffb !',
    // neck and chest
    'sp4 nk1 s2', 'nk1 nk2 nk3 s3 s2', 'sp4 nk2 nk1',
    'nk3 ch1 ch2 s3 *', 's3 ch2 ch3 *', 's3 ch3 ch4 s4 *',
    // head
    'T B Cp !', 'A D B !', 'B Cp D !', 'Cp G E D !', 'A D F * !', 'F D E * !', 'T Cp G !',
    'nk2 T B A !', 'nk3 A F !', "T G nk2' !",
    // ears
    'neT neL neB !', 'neT neI neR * !', 'neT neB neI !', 'neI neB neR !',
    'feT feL feM !', 'feT feM feR * !',
  ],
  bones: {
    head: { pivot: ['nk2', 'nk3'], verts: 'T B Cp D A F E G neL neB neR neI feL feM feR' },
    earN: { parent: 'head', pivot: ['neL', 'neR'], verts: 'neT' },
    earF: { parent: 'head', pivot: ['feL', 'feR'], verts: 'feT' },
    tail: { pivot: ['tb1', 'tb2'], verts: 'tt tc1 tc2 tc3 tr1 tl1' },
    hindN: { pivot: ['hlT', 'hlB'], verts: 'hlK hlF hlH' },
    hindF: { pivot: ['fh1', 'fh2'], verts: 'fhk fhm fhf fhb' },
    frontN: { pivot: ['s5', 's4'], verts: 'lk lr lf1 lf2' },
    frontF: { pivot: ['ff1', 'ff2'], verts: 'ffk ffm fff ffb' },
  },
  lines: ['tc3 tc1 tc2', 'bk1 thF', 'thF sd2', 's1 s4 s5', 's2 s3 s4', 'nk3 s3'],
};
