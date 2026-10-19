import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sharedPaperTextures } from './paper.ts';

/**
 * Photo-space modelling.
 * Every vertex is written as [px, py, s]: the pixel where it sits in the reference photo,
 * and its distance s (in photo pixels) from the animal's mid-plane, toward the camera.
 * The hero camera reproduces the photo's view, so the near side lands exactly on the photo;
 * the far side is the mirror image across the mid-plane.
 *
 * After building, everything lives in the animal frame used by games:
 * +Z = forward (nose), +Y = up, feet on y = 0, height 1. `heroMatrix` puts it back into the photo's view.
 */
export interface Rig {
  /** Reference photo size in pixels. */
  w: number;
  h: number;
  /** Vertical field of view (deg), camera elevation above the horizon (deg), distance to target. */
  fov: number;
  elev: number;
  dist: number;
  /** Mid-plane yaw (deg): 0 = the mid-plane is parallel to the photo, positive turns screen-right toward the camera. */
  yaw: number;
  /** Which way along the mid-plane the head points: 1 = screen-right (default), -1 = screen-left. */
  forward?: 1 | -1;
  /** Paper colours: front face and the reverse side of the sheet. */
  paper: number;
  reverse?: number;
  /** Background colour of the photo, for the matching hero render. */
  bg: string;
  /** CSS background behind the canvas (gradient that matches the photo). */
  bgCss?: string;
  /** Key light direction in the hero view (x right, y up, z toward the hero camera). */
  light?: [number, number, number];
  /** Vertex that touches the floor; its height defines the floor for 'g' vertices. */
  groundAt?: string;
  /** Paper-edge line colours: the thin lit edge and the soft shadow beside it. */
  edge?: { light: number; dark: number };
  /** Ambient (hemisphere) light strength; defaults to 0.8. */
  ambient?: number;
  /** Key light strength; defaults to 3. */
  keyStrength?: number;
}

/** [px, py, s]; s = 'g' puts the point where its pixel ray meets the floor (a foot touching the ground). */
export type V3 = [number, number, number | 'g'];

/**
 * A rigid part that turns about a pivot. `verts` are vertex names; a name ending in `'` is the mirrored copy.
 * `sided` parts exist twice: as written (near side) and mirrored (far side, addressed as `name'`).
 */
export interface BoneSpec {
  parent?: string;
  /** Vertex names whose average is the pivot. */
  pivot: string[];
  /** Two vertex names: the hinge axis for `hinge` rotation (wings). */
  axis?: [string, string];
  verts: string;
  sided?: boolean;
}

export interface Spec {
  rig: Rig;
  v: Record<string, V3>;
  /**
   * One polygon per string, vertex names separated by spaces (fan-triangulated from the first).
   * Flags: `!` = do not mirror, `*` = reverse colour, `^n` = lift n paper layers off the body.
   * A name ending in `'` refers to that vertex mirrored to the far side.
   */
  faces: string[];
  /** How much each polygon bows outward (fraction of its size). */
  bulge?: number;
  /** Extra paper edges to draw (flap borders lying on top of other paper), as vertex chains. */
  lines?: string[];
  /** Movable parts; vertices not listed belong to the body (the root). */
  bones?: Record<string, BoneSpec>;
}

/** Local motion of one part, in the animal frame (radians / height units). */
export interface PartPose {
  rx?: number; ry?: number; rz?: number;
  /** Rotation about the bone's `axis`. */
  hinge?: number;
  dx?: number; dy?: number; dz?: number;
}
export interface Pose {
  /** The whole animal: lift, pitch (rx, + = nose down), turn (ry), roll (rz), all about the body centre. */
  root?: PartPose;
  /** Per part; far-side copies of sided parts are keyed `name'`. */
  parts?: Record<string, PartPose>;
  /**
   * 1 = folded animal, 0 = the flat square sheet it is folded from.
   * 0 → SHEET_PHASE: the square is folded in half twice; SHEET_PHASE → 1: the folded square spins up into the air,
   * swaps for the animal at the fastest point of the spin, and the animal spins down and lands.
   */
  fold?: number;
}

export interface Model {
  /** Add this to the scene and move it around: faces +Z, feet on y = 0, height 1. */
  group: THREE.Group;
  /** Animal frame → the photo's world, for the matching hero camera. */
  heroMatrix: THREE.Matrix4;
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  /** Paper-edge lines (not meshes for AO purposes). */
  lines: THREE.Group;
  /** Part names, far-side copies included (`haunch'`). */
  parts: string[];
  /** Body centre in the animal frame (where root rotations pivot). */
  centre: THREE.Vector3;
  setPose(pose: Pose): void;
  /** Write the task on the flat sheet (visible while folding up and unfolding). */
  setText(text: string): void;
  /** Fold amount of the last pose (1 = animal, 0 = flat sheet). */
  foldAmount: number;
  setResolution(w: number, h: number): void;
  dispose(): void;
}

const LAYER = 0.003;
const SUB = 4;
const SHEET = 1.6;
/** Share of the fold timeline spent on the plain square sheet before the animal rises. */
export const SHEET_PHASE = 0.42;

export function heroCamera(rig: Rig): { camera: THREE.PerspectiveCamera; target: THREE.Vector3 } {
  const camera = new THREE.PerspectiveCamera(rig.fov, rig.w / rig.h, 0.05, 100);
  const target = new THREE.Vector3(0, 0, 0);
  const e = THREE.MathUtils.degToRad(rig.elev);
  camera.position.set(0, Math.sin(e) * rig.dist, Math.cos(e) * rig.dist);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { camera, target };
}

/** Task text as ink on a transparent square, wrapped and centred, with a faint fold-mark and a small stamp. */
function drawSheetText(text: string): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const family = "'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif";
  const maxW = S * 0.68;
  const chars = Array.from(text);
  let size = 120, lines: string[] = [];
  for (; size >= 52; size -= 6) {
    g.font = `800 ${size}px ${family}`;
    lines = [];
    let cur = '';
    for (const ch of chars) {
      if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    lines.push(cur);
    if (lines.length * size * 1.45 <= S * 0.6) break;
  }
  g.font = `800 ${size}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = size * 1.45;
  const y0 = S / 2 - ((lines.length - 1) * lh) / 2;
  g.fillStyle = 'rgba(40, 30, 24, 0.9)';
  g.shadowColor = 'rgba(40, 30, 24, 0.25)';
  g.shadowBlur = 2;
  lines.forEach((l, i) => g.fillText(l, S / 2, y0 + i * lh));
  g.shadowBlur = 0;
  // underline rule + hanko stamp
  g.strokeStyle = 'rgba(40, 30, 24, 0.35)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(S * 0.16, S * 0.84); g.lineTo(S * 0.84, S * 0.84); g.stroke();
  g.fillStyle = 'rgba(224, 72, 46, 0.9)';
  g.fillRect(S * 0.76, S * 0.86, 56, 56);
  g.fillStyle = '#fff';
  g.font = `800 40px ${family}`;
  g.fillText('朝', S * 0.76 + 28, S * 0.86 + 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function buildModel(spec: Spec): Model {
  const { rig } = spec;
  const { camera, target } = heroCamera(rig);
  const a = THREE.MathUtils.degToRad(rig.yaw);
  const n = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
  const k = (2 * rig.dist * Math.tan(THREE.MathUtils.degToRad(rig.fov / 2))) / rig.h;
  const C = camera.position.clone();

  // ---- photo space → hero world ----
  let floor = 0;
  const project = ([px, py, s]: V3): THREE.Vector3 => {
    const ndc = new THREE.Vector3((px / rig.w) * 2 - 1, 1 - (py / rig.h) * 2, 0.5);
    const d = ndc.unproject(camera).sub(C).normalize();
    const t = s === 'g' ? (floor - C.y) / d.y : (n.dot(target) + s * k - n.dot(C)) / n.dot(d);
    return C.clone().addScaledVector(d, t);
  };
  const mirrorW = (p: THREE.Vector3) => p.clone().addScaledVector(n, -2 * p.clone().sub(target).dot(n));
  if (rig.groundAt) floor = project(spec.v[rig.groundAt]).y;
  const near = new Map<string, THREE.Vector3>();
  for (const [name, v] of Object.entries(spec.v)) near.set(name, project(v));
  const worldOf = (token: string, flip: boolean): THREE.Vector3 => {
    const mir = token.endsWith("'");
    const name = mir ? token.slice(0, -1) : token;
    const p = near.get(name);
    if (!p) throw new Error(`origami: unknown vertex "${name}"`);
    return mir !== flip ? mirrorW(p) : p.clone();
  };

  // ---- unique vertices (a mid-plane vertex and its mirror are the same vertex) ----
  const restW: THREE.Vector3[] = [];
  const idOfKey = new Map<string, number>();
  const idOfToken = new Map<string, number>();
  const keyOf = (p: THREE.Vector3) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  const vid = (token: string, flip: boolean): number => {
    const p = worldOf(token, flip);
    const key = keyOf(p);
    let id = idOfKey.get(key);
    if (id === undefined) { id = restW.length; restW.push(p); idOfKey.set(key, id); }
    const base = token.endsWith("'") ? token.slice(0, -1) : token;
    idOfToken.set(token.endsWith("'") !== flip ? `${base}'` : base, id);
    return id;
  };

  interface Poly { ids: number[]; alt: boolean; layer: number }
  const polys: Poly[] = [];
  for (const face of spec.faces) {
    const tokens = face.trim().split(/\s+/);
    const names = tokens.filter((t) => !/^[!*^]/.test(t));
    const once = tokens.includes('!');
    const alt = tokens.includes('*');
    const layer = Number(tokens.find((t) => t.startsWith('^'))?.slice(1) ?? 0);
    polys.push({ ids: names.map((t) => vid(t, false)), alt, layer });
    const onPlane = names.every((t) => !t.endsWith("'") && spec.v[t]?.[2] === 0);
    if (!once && !onPlane) polys.push({ ids: names.map((t) => vid(t, true)), alt, layer });
  }
  const lineChains: number[][] = [];
  for (const chain of spec.lines ?? []) {
    const tokens = chain.trim().split(/\s+/);
    const names = tokens.filter((t) => t !== '!');
    for (const flip of tokens.includes('!') ? [false] : [false, true]) lineChains.push(names.map((t) => vid(t, flip)));
  }
  // every named vertex gets an id, even if no face uses it (bone pivots may refer to it)
  for (const name of Object.keys(spec.v)) { vid(name, false); vid(name, true); }
  const idOf = (token: string): number => {
    const id = idOfToken.get(token);
    if (id === undefined) throw new Error(`origami: unknown vertex "${token}"`);
    return id;
  };

  // ---- animal frame: +Z forward, +Y up, feet on y = 0, height 1 ----
  const fwd = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rig.forward ?? 1);
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, fwd);
  const box = new THREE.Box3().setFromPoints(restW);
  const origin = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  origin.addScaledVector(n, -origin.clone().sub(target).dot(n));
  const scale = 1 / (box.max.y - box.min.y);
  const heroMatrix = new THREE.Matrix4().makeBasis(side, up, fwd).scale(new THREE.Vector3(1 / scale, 1 / scale, 1 / scale)).setPosition(origin);
  const toAnimal = heroMatrix.clone().invert();
  const rest = restW.map((p) => p.clone().applyMatrix4(toAnimal));
  const V = rest.length;
  // the animal frame may come out slightly off centre in x/z; recentre on the bounding box
  {
    const b = new THREE.Box3().setFromPoints(rest);
    const shift = new THREE.Vector3(0, -b.min.y, -(b.min.z + b.max.z) / 2);
    rest.forEach((p) => p.add(shift));
    heroMatrix.multiply(new THREE.Matrix4().makeTranslation(-shift.x, -shift.y, -shift.z));
  }
  const centre = new THREE.Vector3();
  rest.forEach((p) => centre.add(p));
  centre.divideScalar(V).setX(0);

  // ---- winding: outward at rest, kept for every pose ----
  for (const poly of polys) {
    const pts = poly.ids.map((i) => rest[i]);
    const fn = new THREE.Vector3();
    for (let i = 1; i < pts.length - 1; i++) {
      fn.add(new THREE.Vector3().subVectors(pts[i], pts[0]).cross(new THREE.Vector3().subVectors(pts[i + 1], pts[0])));
    }
    const mid = pts.reduce((m, p) => m.add(p), new THREE.Vector3()).divideScalar(pts.length);
    if (fn.dot(mid.sub(centre)) < 0) poly.ids = [poly.ids[0], ...poly.ids.slice(1).reverse()];
  }

  // ---- paper edges: polygon borders nobody shares, plus explicit flap borders ----
  const edgeCount = new Map<string, [number, number, number]>();
  for (const poly of polys) {
    for (let i = 0; i < poly.ids.length; i++) {
      const p = poly.ids[i], q = poly.ids[(i + 1) % poly.ids.length];
      const id = p < q ? `${p}|${q}` : `${q}|${p}`;
      const e = edgeCount.get(id);
      if (e) e[2]++;
      else edgeCount.set(id, [p, q, 1]);
    }
  }
  const segs: [number, number][] = [];
  edgeCount.forEach(([p, q, c]) => { if (c === 1) segs.push([p, q]); });
  for (const chain of lineChains) for (let i = 0; i < chain.length - 1; i++) segs.push([chain[i], chain[i + 1]]);

  // ---- bones ----
  interface Bone { key: string; parent: number; pivot: THREE.Vector3; axis: THREE.Vector3 | null }
  const bones: Bone[] = [];
  const boneOf = new Int32Array(V).fill(-1);
  const mirrorTok = (t: string) => (t.endsWith("'") ? t.slice(0, -1) : `${t}'`);
  const avg = (tokens: string[]) => tokens.reduce((m, t) => m.add(rest[idOf(t)]), new THREE.Vector3()).divideScalar(tokens.length);
  const specBones = Object.entries(spec.bones ?? {});
  const instances: { key: string; spec: BoneSpec; far: boolean }[] = [];
  for (const [name, b] of specBones) {
    instances.push({ key: name, spec: b, far: false });
    if (b.sided) instances.push({ key: `${name}'`, spec: b, far: true });
  }
  const keyIndex = new Map<string, number>();
  // parents before children
  const ordered: typeof instances = [];
  const visit = (inst: (typeof instances)[number]) => {
    if (ordered.includes(inst)) return;
    const p = inst.spec.parent;
    if (p) {
      const parentKey = inst.far && spec.bones?.[p]?.sided ? `${p}'` : p;
      const parentInst = instances.find((x) => x.key === parentKey);
      if (!parentInst) throw new Error(`origami: unknown parent bone "${p}"`);
      visit(parentInst);
    }
    ordered.push(inst);
  };
  instances.forEach(visit);
  for (const inst of ordered) {
    const tok = (t: string) => (inst.far ? mirrorTok(t) : t);
    const p = inst.spec.parent;
    const parentKey = p ? (inst.far && spec.bones?.[p]?.sided ? `${p}'` : p) : null;
    const axis = inst.spec.axis
      ? rest[idOf(tok(inst.spec.axis[1]))].clone().sub(rest[idOf(tok(inst.spec.axis[0]))]).normalize()
      : null;
    keyIndex.set(inst.key, bones.length);
    bones.push({ key: inst.key, parent: parentKey ? keyIndex.get(parentKey)! : -1, pivot: avg(inst.spec.pivot.map(tok)), axis });
    for (const t of inst.spec.verts.trim().split(/\s+/)) boneOf[idOf(tok(t))] = bones.length - 1;
  }

  // ---- geometry buffers (fixed topology, positions rewritten per pose) ----
  interface Patch { a: number; b: number; c: number; poly: number; weights: Float32Array; base: number }
  const bulge = spec.bulge ?? 0.012;
  const slots = [0, 1].map(() => ({ patches: [] as Patch[], count: 0, index: [] as number[], uv: [] as number[] }));
  let seed = 1;
  polys.forEach((poly, pi) => {
    const slot = slots[poly.alt ? 1 : 0];
    const pts = poly.ids.map((i) => rest[i]);
    const u = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
    const fn = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0])).normalize();
    const w = new THREE.Vector3().crossVectors(fn, u).normalize();
    const off = [((seed * 0.618) % 1) * 7, ((seed * 0.414) % 1) * 7];
    seed++;
    for (let i = 1; i < poly.ids.length - 1; i++) {
      const base = slot.count;
      const weights = new Float32Array(((SUB + 1) * (SUB + 2)) / 2 * 4);
      let wi = 0;
      for (let r = 0; r <= SUB; r++) {
        for (let c = 0; c <= r; c++) {
          const l1 = 1 - r / SUB, l2 = (r - c) / SUB, l3 = c / SUB;
          const edgeFree = (i === 1 ? 1 : l2) * (i === poly.ids.length - 2 ? 1 : l3);
          weights[wi++] = l1; weights[wi++] = l2; weights[wi++] = l3;
          weights[wi++] = 27 * l1 * l2 * l3 * bulge * (0.6 + 0.4 * edgeFree);
          const p = new THREE.Vector3().addScaledVector(pts[0], l1).addScaledVector(pts[i], l2).addScaledVector(pts[i + 1], l3);
          slot.uv.push(p.dot(u) * 2 + off[0], p.dot(w) * 2 + off[1]);
        }
      }
      const at = (r: number, c: number) => base + (r * (r + 1)) / 2 + c;
      for (let r = 0; r < SUB; r++) {
        for (let c = 0; c <= r; c++) {
          slot.index.push(at(r, c), at(r + 1, c), at(r + 1, c + 1));
          if (c < r) slot.index.push(at(r, c), at(r + 1, c + 1), at(r, c + 1));
        }
      }
      slot.patches.push({ a: poly.ids[0], b: poly.ids[i], c: poly.ids[i + 1], poly: pi, weights, base });
      slot.count += ((SUB + 1) * (SUB + 2)) / 2;
    }
  });

  const { map, bump } = sharedPaperTextures();
  const material = (colour: number) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour).multiplyScalar(1 / 0.87), map, bumpMap: bump, bumpScale: 0.25, roughness: 0.9, metalness: 0,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const materials = [material(rig.paper), material(rig.reverse ?? rig.paper)];
  const group = new THREE.Group();
  /** The folded animal (meshes + edge lines); spun and scaled during the fold transition. */
  const inner = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const posAttrs: (THREE.BufferAttribute | null)[] = [];
  slots.forEach((slot, si) => {
    if (!slot.count) { posAttrs.push(null); return; }
    const g = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(new Float32Array(slot.count * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(slot.uv, 2));
    g.setIndex(slot.index);
    geometries.push(g);
    posAttrs.push(attr);
    const mesh = new THREE.Mesh(g, materials[si]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    inner.add(mesh);
  });

  const lineGeo = new LineSegmentsGeometry().setPositions(new Float32Array(segs.length * 6));
  const shadowMat = new LineMaterial({ color: rig.edge?.dark ?? 0x7a5228, linewidth: 2.0, transparent: true, opacity: 0.38, depthWrite: false });
  const lightMat = new LineMaterial({ color: rig.edge?.light ?? 0xf6dcae, linewidth: 1.3, transparent: true, opacity: 0.75, depthWrite: false });
  const lineMats = [shadowMat, lightMat];
  const lines = new THREE.Group();
  for (const m of lineMats) {
    const l = new LineSegments2(lineGeo, m);
    l.frustumCulled = false;
    lines.add(l);
  }
  inner.add(lines);
  group.add(inner);

  // ---- the plain square sheet (first part of the fold) ----
  // Four quadrants; the right half folds over the left, then the far half over the near one,
  // leaving a small square that the animal then rises out of.
  const sheetGroup = new THREE.Group();
  const half = SHEET / 2;
  const quadGeo = new THREE.PlaneGeometry(half, half, 6, 6).rotateX(-Math.PI / 2);
  // one-sided copies: the front colour is only seen from above, the reverse only from below
  const sheetMats = materials.map((m) => { const c = m.clone(); c.side = THREE.FrontSide; return c; });
  // No polygon offset: the decal already floats above its own quadrant, and an offset would let it
  // show through a flap folded on top of it.
  const inkMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const inkGeos: THREE.BufferGeometry[] = [];
  let inkTex: THREE.CanvasTexture | null = null;
  const quad = (x: number, z: number) => {
    const g = new THREE.Group();
    // ink decal: this quadrant's quarter of the whole-sheet text texture (u: left→right, v: far→near is 1→0)
    const ig = quadGeo.clone();
    const uv = ig.getAttribute('uv') as THREE.BufferAttribute;
    const u0 = x < 0 ? 0 : 0.5, v0 = z < 0 ? 0.5 : 0;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    inkGeos.push(ig);
    const ink = new THREE.Mesh(ig, inkMat);
    ink.position.set(x, 0.0025, z);
    ink.renderOrder = 2;
    g.add(ink);
    const top = new THREE.Mesh(quadGeo, sheetMats[0]);
    const bottom = new THREE.Mesh(quadGeo, sheetMats[1]);
    top.position.set(x, 0.001, z);
    bottom.position.set(x, -0.001, z);
    bottom.rotation.x = Math.PI; // the reverse face, seen from below
    bottom.position.y = 0;
    for (const m of [top, bottom]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    return g;
  };
  // hinges: foldX turns the +x half about the z axis; foldZ turns the -z half about the x axis
  // the near right quarter only takes the first fold; the far right quarter takes both
  const foldXNear = new THREE.Group();
  const foldXFar = new THREE.Group();
  const foldZ = new THREE.Group();
  const nearLeft = quad(-half / 2, half / 2);
  const farLeft = quad(-half / 2, -half / 2);
  const nearRight = quad(half / 2, half / 2);
  const farRight = quad(half / 2, -half / 2);
  foldXNear.add(nearRight);
  foldXFar.add(farRight);
  foldZ.add(farLeft, foldXFar);
  sheetGroup.add(nearLeft, foldXNear, foldZ);
  // crease pattern on the top face (a bird-base style grid of diagonals and mid-lines)
  const crease: number[] = [];
  const cl = (x1: number, z1: number, x2: number, z2: number) => crease.push(x1, 0.003, z1, x2, 0.003, z2);
  cl(-half, -half, half, half); cl(-half, half, half, -half); cl(-half, 0, half, 0); cl(0, -half, 0, half);
  cl(-half, 0, 0, -half); cl(0, -half, half, 0); cl(half, 0, 0, half); cl(0, half, -half, 0);
  const creaseGeo = new LineSegmentsGeometry().setPositions(crease);
  const creaseMat = new LineMaterial({ color: rig.edge?.dark ?? 0x7a5228, linewidth: 1, transparent: true, opacity: 0.25, depthWrite: false });
  lineMats.push(creaseMat);
  const creaseLines = new LineSegments2(creaseGeo, creaseMat);
  sheetGroup.add(creaseLines);
  // sheetSpin turns about the centre of the folded quarter (sheetGroup carries the slide offset)
  const sheetSpin = new THREE.Group();
  sheetSpin.rotation.order = 'YXZ';
  sheetSpin.add(sheetGroup);
  group.add(sheetSpin);

  // ---- posing ----
  const cur = rest.map((p) => p.clone());
  const vnorm = rest.map(() => new THREE.Vector3());
  const boneM = bones.map(() => new THREE.Matrix4());
  const rootM = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const local = (pivot: THREE.Vector3, pp: PartPose | undefined, axis: THREE.Vector3 | null, out: THREE.Matrix4) => {
    out.identity();
    if (!pp) return out;
    e.set(pp.rx ?? 0, pp.ry ?? 0, pp.rz ?? 0, 'YXZ');
    q.setFromEuler(e);
    if (axis && pp.hinge) q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, pp.hinge));
    out.makeTranslation(pivot.x + (pp.dx ?? 0), pivot.y + (pp.dy ?? 0), pivot.z + (pp.dz ?? 0));
    out.multiply(tmp.makeRotationFromQuaternion(q));
    out.multiply(tmp.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    return out;
  };
  const polyN = polys.map(() => new THREE.Vector3());
  const polyFold = new Float32Array(polys.length);
  const vfold = new Float32Array(V);
  const seg6 = (lineGeo.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;

  const SPINS = 3;
  const SWAP = 0.5;
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let lastFold = 1;
  const setPose = (pose: Pose) => {
    const total = pose.fold ?? 1;
    lastFold = total;
    const u = total <= SHEET_PHASE ? 0 : total >= 1 ? 1 : (total - SHEET_PHASE) / (1 - SHEET_PHASE);
    const onSheet = total < SHEET_PHASE || u < SWAP;
    sheetSpin.visible = onSheet;
    inner.visible = !onSheet;
    const lift = 0.5 * Math.sin(Math.PI * u);
    const spin = Math.PI * 2 * SPINS * easeInOut(u);
    if (onSheet) {
      // 1) fold the square in half twice, 2) slide the quarter to the middle
      const v = Math.min(1, total / SHEET_PHASE);
      for (const g of [foldXNear, foldXFar]) {
        g.rotation.z = Math.PI * smooth(v / 0.42);
        g.position.y = 0.004 * smooth(v / 0.42);
      }
      foldZ.rotation.x = -Math.PI * smooth((v - 0.45) / 0.42);
      foldZ.position.y = 0.004 * smooth((v - 0.45) / 0.42);
      creaseLines.visible = v < 0.45;
      const slide = smooth((v - 0.88) / 0.12);
      sheetGroup.position.set((half / 2) * slide, 0, (-half / 2) * slide);
      // 3) the folded square rises, stands on edge and spins faster and faster, shrinking into the swap
      const stand = smooth(u / 0.3);
      sheetSpin.rotation.set(-Math.PI / 2 * stand, spin, 0);
      sheetSpin.scale.setScalar(1 - 0.85 * smooth((u - 0.25) / (SWAP - 0.25)));
      sheetSpin.position.set(0, lift + (half / 4) * stand, 0);
      return;
    }
    // 4) the animal pops out mid-spin (slight overshoot), spins down and lands with a little squash
    const pop = smooth((u - SWAP) / 0.18);
    const size = u >= 1 ? 1 : 0.15 + 0.85 * pop + 0.12 * Math.sin(Math.PI * pop);
    const squash = 1 - 0.12 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.86) / 0.14)));
    inner.rotation.y = u >= 1 ? 0 : spin - Math.PI * 2 * SPINS;
    inner.scale.set(size, size * squash, size);
    inner.position.set(0, u >= 1 ? 0 : lift + centre.y * (1 - size), 0);

    local(centre, pose.root, null, rootM);
    bones.forEach((b, i) => {
      local(b.pivot, pose.parts?.[b.key], b.axis, boneM[i]);
      boneM[i].premultiply(b.parent >= 0 ? boneM[b.parent] : rootM);
    });
    for (let i = 0; i < V; i++) {
      cur[i].copy(rest[i]).applyMatrix4(boneOf[i] >= 0 ? boneM[boneOf[i]] : rootM);
      vfold[i] = 1;
    }
    // polygon normals (outward winding) and fold state
    vnorm.forEach((v) => v.set(0, 0, 0));
    polys.forEach((poly, pi) => {
      const p0 = cur[poly.ids[0]];
      const nrm = polyN[pi].set(0, 0, 0);
      let fsum = 0;
      for (let i = 1; i < poly.ids.length - 1; i++) {
        const ab = new THREE.Vector3().subVectors(cur[poly.ids[i]], p0);
        const ac = new THREE.Vector3().subVectors(cur[poly.ids[i + 1]], p0);
        nrm.add(ab.cross(ac));
      }
      nrm.normalize();
      for (const id of poly.ids) { vnorm[id].add(nrm); fsum += vfold[id]; }
      polyFold[pi] = fsum / poly.ids.length;
    });
    // patches
    const P = new THREE.Vector3();
    slots.forEach((slot, si) => {
      const attr = posAttrs[si];
      if (!attr) return;
      const arr = attr.array as Float32Array;
      for (const patch of slot.patches) {
        const A = cur[patch.a], B = cur[patch.b], Cc = cur[patch.c];
        const poly = polys[patch.poly];
        const nrm = polyN[patch.poly];
        const pf = polyFold[patch.poly];
        const size = Math.sqrt(new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A)).length());
        // flat sheet: stack polygons a hair apart so nothing z-fights
        const lift = poly.layer * LAYER * pf;
        const stack = (1 - pf) * (patch.poly % 7) * 0.0006;
        const w = patch.weights;
        for (let j = 0, o = patch.base * 3; j < w.length; j += 4, o += 3) {
          P.set(0, 0, 0).addScaledVector(A, w[j]).addScaledVector(B, w[j + 1]).addScaledVector(Cc, w[j + 2])
            .addScaledVector(nrm, w[j + 3] * size * pf + lift);
          arr[o] = P.x; arr[o + 1] = P.y + stack; arr[o + 2] = P.z;
        }
      }
      attr.needsUpdate = true;
      geometries[si === 0 || !posAttrs[0] ? 0 : 1].computeVertexNormals();
    });
    // edge lines, pulled a hair outward so they win the depth test against their own paper
    const arr = seg6.array as Float32Array;
    segs.forEach(([p, qd], i) => {
      const np = vnorm[p].lengthSq() ? vnorm[p].clone().normalize() : up;
      const nq = vnorm[qd].lengthSq() ? vnorm[qd].clone().normalize() : up;
      const o = i * 6;
      arr[o] = cur[p].x + np.x * 0.004; arr[o + 1] = cur[p].y + np.y * 0.004; arr[o + 2] = cur[p].z + np.z * 0.004;
      arr[o + 3] = cur[qd].x + nq.x * 0.004; arr[o + 4] = cur[qd].y + nq.y * 0.004; arr[o + 5] = cur[qd].z + nq.z * 0.004;
    });
    seg6.needsUpdate = true;
  };
  setPose({});

  return {
    group, heroMatrix, camera, target, lines, centre,
    parts: bones.map((b) => b.key),
    setPose,
    get foldAmount() { return lastFold; },
    setText(text) {
      inkTex?.dispose();
      inkTex = text.trim() ? drawSheetText(text.trim()) : null;
      inkMat.map = inkTex;
      inkMat.visible = !!inkTex;
      inkMat.needsUpdate = true;
    },
    setResolution(w, h) { lineMats.forEach((m) => m.resolution.set(w, h)); },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sheetMats.forEach((m) => m.dispose());
      inkTex?.dispose(); inkMat.dispose(); inkGeos.forEach((g) => g.dispose());
      lineGeo.dispose(); creaseGeo.dispose(); quadGeo.dispose(); lineMats.forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
}
