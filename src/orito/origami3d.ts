/**
 * Bridge between the 折りGO web app and the Three.js origami models in `src/origami`.
 *
 * - mountAnimal(): a live, animated animal inside any element. All live views share ONE offscreen
 *   WebGL renderer and are copied into their own 2D canvas, so pages never run out of GL contexts.
 * - portrait(): a still image (object URL) of an animal for lists, cards and dialogs.
 * - playNightFold(): the written sheet folds itself up into the animal after saving.
 * - OrigamiXR: draws the animals, placement reticle and play area into a WebXR immersive-ar session.
 *
 * Every entry point degrades to the bundled SVGs when WebGL is unavailable, and honours
 * prefers-reduced-motion by holding still poses and skipping fold/unfold motion.
 */
import * as THREE from 'three';
import { createOrigamiAnimal, DEFAULT_PAPER, PAPERS, type AnimalId, type Loop, type OrigamiAnimal, type PaperId } from '../origami/index.ts';
import { SHEET_PHASE } from '../origami/engine.ts';

export type Kind = AnimalId;
export type Paper = PaperId;
export type EmoteRole = 'surrender' | 'escape' | 'cheer';

const KINDS: Kind[] = ['crane', 'rabbit', 'fox'];
const isKind = (kind: unknown): kind is Kind => KINDS.includes(kind as Kind);
const paperOf = (kind: Kind, paper?: unknown): Paper => {
  if (typeof paper !== 'string' || !(paper in PAPERS)) return DEFAULT_PAPER[kind];
  const soft = `soft-${paper}`;
  return (soft in PAPERS ? soft : paper) as Paper;
};

/** Which one-shot each animal uses for a role in the story. */
const EMOTE: Record<EmoteRole, Record<Kind, string>> = {
  surrender: { crane: 'bow', rabbit: 'lookBack', fox: 'lookBack' },
  escape: { crane: 'flap', rabbit: 'jump', fox: 'pounce' },
  cheer: { crane: 'flap', rabbit: 'jump', fox: 'pounce' },
};

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const fallbackSrc = (kind: string) => `assets/animal-${isKind(kind) ? kind : 'crane'}.svg`;

// ---------------------------------------------------------------------------------------------
// Shared offscreen renderer

let shared: THREE.WebGLRenderer | null | undefined;
let bufferW = 0, bufferH = 0;
function sharedRenderer(): THREE.WebGLRenderer | null {
  if (shared !== undefined) return shared;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault());
    shared = renderer;
  } catch {
    shared = null;
  }
  return shared;
}
/** True when the origami models can be drawn on this device. */
export function origamiAvailable(): boolean {
  return sharedRenderer() !== null;
}

/** Render `scene` from `camera` at w×h device pixels on the shared renderer and copy it into `ctx`. */
function drawInto(ctx: CanvasRenderingContext2D, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
  const renderer = sharedRenderer();
  if (!renderer) return;
  if (w > bufferW || h > bufferH) {
    bufferW = Math.max(bufferW, w);
    bufferH = Math.max(bufferH, h);
    renderer.setSize(bufferW, bufferH, false);
  }
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(true);
  renderer.render(scene, camera);
  ctx.clearRect(0, 0, w, h);
  // GL rows start at the bottom, so the rendered block sits at the bottom of the buffer.
  ctx.drawImage(renderer.domElement, 0, bufferH - h, w, h, 0, 0, w, h);
}

// ---------------------------------------------------------------------------------------------
// Stage: lights, floor shadow and a camera that can look down on the sheet while it is flat

interface CameraOptions {
  /** 'side' keeps the three-quarter view; 'auto' looks down on the flat sheet so the writing reads. */
  mode?: 'side' | 'auto';
  /** > 1 moves the camera back to leave room for jumps. */
  zoom?: number;
}

function buildStage(animal: OrigamiAnimal, { mode = 'side', zoom = 1 }: CameraOptions) {
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.add(animal.group);
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x9a7650, 0.8));
  const key = new THREE.DirectionalLight(0xfff4e6, 3);
  key.position.set(-2.7, 5.1, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.radius = 5;
  key.shadow.bias = -0.003;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
  const fill = new THREE.DirectionalLight(0xe8eef8, 0.55);
  fill.position.set(-5, 2, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(key, fill, floor);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  const lookY = 0.45 + (zoom - 1) * 0.5;
  const sideCam = new THREE.Vector3(-1.5, 0.95, 2.35).sub(new THREE.Vector3(0, 0.45, 0)).multiplyScalar(zoom).add(new THREE.Vector3(0, lookY, 0));
  const sideLook = new THREE.Vector3(0, lookY, 0);
  const topCam = new THREE.Vector3(0, 3.5, 1.05);
  const topLook = new THREE.Vector3(0, 0, 0);
  const look = new THREE.Vector3();
  let k = mode === 'auto' && animal.foldAmount < SHEET_PHASE + 0.02 ? 1 : 0;
  const aim = (dt: number) => {
    if (mode === 'auto') {
      const f = animal.foldAmount;
      const want = f < SHEET_PHASE + 0.02 ? 1 : f < SHEET_PHASE + 0.2 ? 1 - (f - SHEET_PHASE - 0.02) / 0.18 : 0;
      k += (want - k) * Math.min(1, dt * 8);
    }
    camera.position.lerpVectors(sideCam, topCam, k);
    look.lerpVectors(sideLook, topLook, k);
    camera.lookAt(look);
  };
  aim(1);
  const dispose = () => {
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    key.shadow.map?.dispose();
  };
  return { scene, camera, holder, aim, dispose };
}

// ---------------------------------------------------------------------------------------------
// Live views

export interface MountOptions extends CameraOptions {
  kind: Kind;
  paper?: Paper | string;
  /** Task text written on the sheet (visible while folding and unfolding). */
  text?: string;
  loop?: Loop;
  /** Starting yaw in radians (0 faces the viewer's right shoulder, +π/2 faces screen right). */
  heading?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /** Start as the flat sheet instead of the folded animal. */
  flat?: boolean;
  label?: string;
}

export interface OrigamiView {
  readonly kind: Kind;
  readonly animal: OrigamiAnimal;
  play(loop: Loop): void;
  /** Plays the animal's one-shot for a story beat; returns its length in seconds (0 when skipped). */
  emote(role: EmoteRole): number;
  /** Fold up from the flat sheet; returns the length in seconds (0 under reduced motion). */
  fold(): number;
  unfoldTo(target: number, seconds?: number): void;
  setText(text: string): void;
  setHeading(radians: number, immediate?: boolean): void;
  setSpeed(speed: number): void;
  dispose(): void;
}

interface LiveView extends OrigamiView {
  host: HTMLElement;
  seen: boolean;
  tick(dt: number): void;
}

const views = new Set<LiveView>();
let frame = 0, lastTime = 0;
function loop(now: number) {
  frame = views.size ? requestAnimationFrame(loop) : 0;
  const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
  lastTime = frame ? now : 0;
  // Views under a modal dialog or outside the viewport are not drawn.
  const modals = [...document.querySelectorAll('dialog[open]')];
  const vw = innerWidth, vh = innerHeight;
  for (const view of views) {
    if (!view.host.isConnected) {
      // Views whose markup was replaced clean themselves up.
      if (view.seen) view.dispose();
      continue;
    }
    view.seen = true;
    if (document.hidden) continue;
    const box = view.host.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < 0 || box.right < 0 || box.top > vh || box.left > vw) continue;
    if (modals.length && !modals.some((dialog) => dialog.contains(view.host))) continue;
    view.tick(dt);
  }
}
const ensureLoop = () => { if (!frame) { lastTime = 0; frame = requestAnimationFrame(loop); } };

/** Loads the brush face used on the sheet, then writes `text`. */
function writeWhenReady(view: OrigamiView, text: string) {
  view.animal.setText(text);
  document.fonts?.load("800 64px 'Shippori Mincho'", text).then(() => view.animal.setText(text), () => {});
}

/**
 * Mount a live origami animal into `host` (sized by CSS). Returns null when WebGL is unavailable,
 * in which case the caller keeps its SVG fallback.
 */
export function mountAnimal(host: HTMLElement, options: MountOptions): OrigamiView | null {
  if (!isKind(options.kind) || !sharedRenderer()) return null;
  let animal: OrigamiAnimal;
  try { animal = createOrigamiAnimal(options.kind, paperOf(options.kind, options.paper)); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.className = 'origami-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  if (options.label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', options.label); canvas.removeAttribute('aria-hidden'); }
  const ctx = canvas.getContext('2d');
  if (!ctx) { animal.dispose(); return null; }
  host.append(canvas);

  const reduced = reducedMotion();
  animal.play(options.loop ?? 'idle');
  if (options.flat) animal.unfoldTo(0, 0);
  animal.update(0);
  const stage = buildStage(animal, options);
  let heading = options.heading ?? 0, wantHeading = heading, speed = options.speed ?? 1;
  stage.holder.rotation.y = heading;
  let disposed = false;

  const view: LiveView = {
    kind: options.kind, animal, host, seen: false,
    play(next) { animal.play(next); },
    emote(role) {
      if (reduced) return 0;
      try { return animal.emote(EMOTE[role][options.kind]) / speed; } catch { return 0; }
    },
    fold() {
      if (reduced) { animal.play('idle'); return 0; }
      return animal.fold() / speed;
    },
    unfoldTo(target, seconds = 0.7) { animal.unfoldTo(target, reduced ? 0 : seconds * speed); },
    setText(text) { writeWhenReady(view, text); },
    setHeading(radians, immediate = false) { wantHeading = radians; if (immediate || reduced) heading = radians; },
    setSpeed(next) { speed = Math.max(0.1, next); },
    tick(dt) {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      // Reduced motion holds one still pose; manual unfold steps still land (they use 0-length easing).
      animal.update(reduced ? 0 : dt * speed);
      heading += (wantHeading - heading) * Math.min(1, dt * 7);
      stage.holder.rotation.y = heading;
      stage.aim(reduced ? 1 : dt);
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
      animal.setResolution(w, h);
      drawInto(ctx, stage.scene, stage.camera, w, h);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      views.delete(view);
      animal.dispose();
      stage.dispose();
      canvas.remove();
    },
  };
  if (options.text) view.setText(options.text);
  views.add(view);
  ensureLoop();
  return view;
}

/** Replace the first <img> inside `host` with a live animal, keeping the image as the fallback. */
export function upgradeImage(host: Element | null, options: MountOptions): OrigamiView | null {
  if (!(host instanceof HTMLElement)) return null;
  const img = host.querySelector('img');
  const view = mountAnimal(host, options);
  if (view) { img?.remove(); host.classList.add('has-origami'); }
  return view;
}

// ---------------------------------------------------------------------------------------------
// Portraits for lists and dialogs

const portraits = new Map<string, string>();
const paperSamples = new Map<string, string>();
/** Sample the lit sheet, not its unlit material hex, so CSS paper matches the fold. */
export function paperDisplayColor(paper: string): string {
  if (paperSamples.has(paper)) return paperSamples.get(paper)!;
  const colour = paperOf('crane', paper);
  const fallback = `#${PAPERS[colour].paper.toString(16).padStart(6, '0')}`;
  if (!sharedRenderer()) return fallback;
  const animal = createOrigamiAnimal('crane', colour);
  const stage = buildStage(animal, { mode: 'auto' });
  try {
    animal.unfoldTo(0, 0);
    animal.update(0);
    stage.aim(1);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    animal.setResolution(64, 64);
    drawInto(ctx, stage.scene, stage.camera, 64, 64);
    const pixels = ctx.getImageData(24, 24, 16, 16).data;
    const sum = [0, 0, 0]; let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 250) continue;
      sum.forEach((_, c) => { sum[c] += pixels[i + c]; }); count++;
    }
    const result = count ? `#${sum.map(v => Math.round(v / count).toString(16).padStart(2, '0')).join('')}` : fallback;
    paperSamples.set(paper, result);
    return result;
  } finally { animal.dispose(); stage.dispose(); }
}
/** A still of the folded animal in its paper colour (object URL), or the SVG when WebGL is missing. */
export function portrait(kind: string, paper?: string): string {
  if (!isKind(kind)) return fallbackSrc(kind);
  const colour = paperOf(kind, paper);
  const key = `${kind}|${colour}`;
  const cached = portraits.get(key);
  if (cached) return cached;
  const renderer = sharedRenderer();
  if (!renderer) return fallbackSrc(kind);
  let url = fallbackSrc(kind);
  try {
    const animal = createOrigamiAnimal(kind, colour);
    animal.play('idle');
    animal.update(0);
    const stage = buildStage(animal, { zoom: 0.94 });
    stage.holder.rotation.y = 0.15;
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    animal.setResolution(size, size);
    stage.camera.aspect = 1;
    stage.camera.updateProjectionMatrix();
    drawInto(ctx, stage.scene, stage.camera, size, size);
    const data = atob(canvas.toDataURL('image/png').split(',')[1]);
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    animal.dispose();
    stage.dispose();
  } catch {
    return fallbackSrc(kind);
  }
  portraits.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------------------------
// Night: the saved sheet folds itself into the animal

/**
 * Lays the written sheet over `sheet` and folds it up into its animal, then lets it hop away.
 * Returns false (and does nothing) under reduced motion or without WebGL.
 */
export function playNightFold(sheet: HTMLElement | null, { kind, paper, text }: { kind: string; paper?: string; text: string }): boolean {
  if (!sheet || reducedMotion() || !isKind(kind) || !origamiAvailable()) return false;
  sheet.querySelector('.origami-fold')?.remove();
  const layer = document.createElement('div');
  layer.className = 'origami-fold';
  layer.setAttribute('aria-hidden', 'true');
  sheet.append(layer);
  const speed = 1.35;
  const view = mountAnimal(layer, { kind, paper, text, mode: 'auto', flat: true, speed, zoom: 1.15 });
  if (!view) { layer.remove(); return false; }
  sheet.classList.add('is-origami-folding');
  const length = view.fold();
  setTimeout(() => view.emote('cheer'), length * 1000 + 150);
  setTimeout(() => { layer.classList.add('is-leaving'); sheet.classList.remove('is-origami-folding'); }, length * 1000 + 1500);
  setTimeout(() => { view.dispose(); layer.remove(); }, length * 1000 + 2200);
  return true;
}

// ---------------------------------------------------------------------------------------------
// WebXR

function blobShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,30,25,0.42)');
  grad.addColorStop(1, 'rgba(20,30,25,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = -1;
  return mesh;
}

function ringLine(radius: number, colour: number): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * radius, 0.008, Math.sin(a) * radius)); }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: colour }));
}

interface XRActor { kind: Kind; animal: OrigamiAnimal; holder: THREE.Group; shadow: THREE.Mesh; running: boolean }

/** Real size of an animal on the floor, in metres. */
const XR_HEIGHT = 0.27;

export class OrigamiXR {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.03, 20);
  private reticle = ringLine(0.16, 0xe6c778);
  private area = ringLine(1, 0xb8d1a8);
  private actors: XRActor[] = [];
  private reduced = reducedMotion();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.xr.enabled = true;
    this.scene.add(new THREE.HemisphereLight(0xfff3e0, 0x8a7a60, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(-1, 3, 1.5);
    this.scene.add(key, this.reticle, this.area);
    this.reticle.visible = this.area.visible = false;
  }

  /** Hands the session to Three.js; prefers a floor-aligned space and falls back to 'local'. */
  async attach(session: XRSession): Promise<XRReferenceSpace> {
    let type: XRReferenceSpaceType = 'local-floor';
    try { await session.requestReferenceSpace('local-floor'); } catch { type = 'local'; }
    this.renderer.xr.setReferenceSpaceType(type);
    await this.renderer.xr.setSession(session);
    const size = this.renderer.getSize(new THREE.Vector2());
    this.actors.forEach((actor) => actor.animal.setResolution(size.x, size.y));
    return this.renderer.xr.getReferenceSpace()!;
  }

  /** Drives the XR frame loop through Three.js. */
  loop(callback: XRFrameRequestCallback | null) {
    this.renderer.setAnimationLoop(callback as never);
  }

  /** The animals taking part, with the paper colour of the task each one carries. */
  cast(kinds: string[], papers: string[] = []) {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.actors.forEach((actor) => { actor.animal.dispose(); actor.holder.removeFromParent(); });
    this.actors = kinds.filter(isKind).map((kind, index) => {
      const animal = createOrigamiAnimal(kind, paperOf(kind, papers[index]));
      animal.play('idle');
      const holder = new THREE.Group();
      holder.scale.setScalar(index ? XR_HEIGHT * 0.82 : XR_HEIGHT);
      holder.add(animal.group);
      const shadow = blobShadow();
      shadow.scale.setScalar(1.1);
      holder.add(shadow);
      holder.visible = false;
      animal.setResolution(size.x, size.y);
      this.scene.add(holder);
      return { kind, animal, holder, shadow, running: false };
    });
  }

  /** Show or hide the placement reticle (at a floor point), the play area and the animals. */
  show({ reticle = null, area = null, radius = 1, animals = false }: { reticle?: number[] | null; area?: number[] | null; radius?: number; animals?: boolean }) {
    this.reticle.visible = !!reticle;
    if (reticle) this.reticle.position.set(reticle[0], reticle[1], reticle[2]);
    this.area.visible = !!area;
    if (area) { this.area.position.set(area[0], area[1], area[2]); this.area.scale.setScalar(radius); }
    this.actors.forEach((actor) => { actor.holder.visible = animals; });
  }

  /** Place animal `index` on the floor at `at`, facing `angle` (radians about +Y). */
  place(index: number, at: number[], angle: number, running: boolean) {
    const actor = this.actors[index];
    if (!actor) return;
    actor.holder.position.set(at[0], at[1], at[2]);
    actor.holder.rotation.y = angle;
    if (actor.running !== running) { actor.running = running; actor.animal.play(running ? 'run' : 'idle'); }
  }

  emote(role: EmoteRole, index?: number) {
    if (this.reduced) return;
    this.actors.forEach((actor, i) => {
      if (index !== undefined && i !== index) return;
      try { actor.animal.emote(EMOTE[role][actor.kind]); } catch { /* no clip */ }
    });
  }

  /** Only a ray through an animal mesh may finish the XR catch. */
  hitAnimal(x: number, y: number) {
    const ray = new THREE.Raycaster();
    const camera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    return this.actors.some(actor => actor.holder.visible && ray.intersectObject(actor.animal.group, true).length > 0);
  }

  hitRay(position: DOMPointReadOnly, orientation: DOMPointReadOnly) {
    const origin = new THREE.Vector3(position.x, position.y, position.z);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w));
    const ray = new THREE.Raycaster(origin, direction);
    return this.actors.some(actor => actor.holder.visible && ray.intersectObject(actor.animal.group, true).length > 0);
  }

  render(dt: number) {
    const step = this.reduced ? 0 : dt;
    this.actors.forEach((actor) => actor.animal.update(step));
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.actors.forEach((actor) => { actor.animal.dispose(); actor.shadow.geometry.dispose(); const m = actor.shadow.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.dispose(); });
    this.actors = [];
    for (const ring of [this.reticle, this.area]) { ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); }
    this.renderer.dispose();
  }
}
