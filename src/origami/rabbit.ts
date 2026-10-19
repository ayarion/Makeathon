import type { Spec } from './engine.ts';

/** refs/rabbit.png (1312×1199): sitting rabbit seen from its right side, head turned slightly toward us. */
export const rabbit: Spec = {
  rig: { w: 1312, h: 1199, fov: 22, elev: 8, dist: 7, yaw: 20, paper: 0xf6eadb, bg: '#ab9785', bgCss: 'linear-gradient(#a28e7a, #bda792)', light: [0.3, 0.9, 0.8] },
  v: {
    // head
    ht: [845, 372, 0], hf: [1018, 425, 0], hn: [1083, 545, 0], hc: [1035, 617, 0],
    hj: [875, 612, 70], hnb: [762, 556, 70], hb: [795, 465, 60], hk: [872, 470, 120],
    he: [962, 468, 80], hm: [1000, 585, 60], hs: [1048, 548, 30],
    // near ear (tilted back) and far ear (upright); both folded lengthwise into a V
    eT: [525, 57, 40], eA: [598, 276, 100], eC: [735, 190, 80], eK: [745, 370, 30],
    eB: [795, 468, 60], eCb: [815, 330, 40],
    fT: [772, 22, -40], fL: [752, 205, -20], fR: [882, 192, -20], fRb: [910, 372, -30],
    fK: [848, 362, -70], fLb: [800, 420, -30],
    // back and rump
    bn: [748, 545, 0], bb: [540, 550, 0], br: [420, 600, 0], btt: [335, 700, 40],
    brr: [300, 860, 70], brb: [335, 958, 90], hip: [395, 690, 120], smid: [735, 600, 140],
    // haunch
    hap: [520, 890, 210], hkn: [600, 770, 180], hfr: [640, 925, 180], hfb: [640, 1000, 160],
    hhe: [420, 1060, 120], ftp: [695, 1095, 140], fto: [625, 1012, 160],
    // shoulder, chest, front leg
    sht: [755, 575, 110], shl: [665, 830, 180], shm: [840, 830, 200], shr: [965, 705, 70],
    cht: [870, 605, 60], chf: [968, 625, 0], chm: [982, 712, 0], chb: [962, 805, 0],
    lkn: [725, 915, 170], ltp: [945, 1098, 120], lbk: [830, 1085, 140],
    bel: [720, 975, 130],
    // tail
    t1: [255, 765, 40], t2: [330, 745, 30], t3: [300, 850, 60],
  },
  faces: [
    // head
    'ht hb hk', 'ht hk he', 'ht he hf', 'hf he hs hn', 'he hk hm hs', 'hb hnb hk', 'hnb hj hk',
    'hk hj hm', 'hj hc hm', 'hm hc hn hs',
    "ht hb hb' !", "hb hnb hnb' hb' !", "hnb hj hj' hnb' !",
    // ears
    'eT eA eK !', 'eT eK eC !', 'eA eB eK !', 'eK eB eCb !', 'eK eCb eC !',
    'fT fL fK !', 'fT fK fR !', 'fR fK fRb !', 'fL fLb fK !',
    // back, rump
    'br bb hip', 'bb bn smid hip', 'br hip btt', 'btt hip brr',
    "br btt btt' !", "btt brr brr' btt' !", "brr brb brb' brr' !",
    // haunch
    'hip hkn hap', 'hip hap brr', 'brr hap brb', 'brb hap hhe', 'hkn hfr hap', 'hap hfr hfb', 'hap hfb hhe',
    // body side, neck
    'hip smid hkn', 'smid shl hkn', 'hkn shl lkn hfr', 'hfr lkn bel hfb',
    'bn hnb sht', 'bn sht smid', 'hnb cht sht', "bn hnb hnb' !", 'sht smid shl',
    // shoulder flap and chest
    'sht shl shm ^1', 'sht shm shr ^1', 'sht shr cht', 'cht shr chf', 'chf shr chm', 'chm shr chb', 'shr shm chb',
    // front leg
    'shl shm lkn ^1', 'lkn shm ltp ^1', 'lkn ltp lbk', 'lkn lbk bel',
    // hind foot, tail
    'hhe hfb fto ftp ^1',
    't1 t2 t3', 't1 t3 brr', 't2 btt brr t3',
    // underside, so the far side never shows through the belly
    "hhe hfb hfb' hhe' !", "hfb bel bel' hfb' !", "bel lbk lbk' bel' !", "brb hhe hhe' brb' !",
  ],
  bones: {
    head: { pivot: ['hnb', 'hj'], verts: 'ht hf hn hc hj hk he hm hs hb eB' },
    earN: { parent: 'head', pivot: ['eB', 'eCb'], verts: 'eT eA eC eK' },
    earF: { parent: 'head', pivot: ['fRb', 'fLb'], verts: 'fT fL fR fK' },
    haunch: { pivot: ['hap'], verts: 'hfb hhe ftp fto hfr', sided: true },
    leg: { pivot: ['shl', 'shm'], verts: 'lkn ltp lbk', sided: true },
    tail: { pivot: ['btt', 'brr'], verts: 't1 t2 t3' },
  },
  lines: [
    'sht shl shm shr', 'shm ltp', 'shl lkn ltp', 'shr chb',
    'hip hkn hfr hfb hhe brb brr hip', 'hip smid',
    'hhe ftp fto hfb', 'hnb hj hc', 'hb hnb', 'ht hb',
  ],
};
