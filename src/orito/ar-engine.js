/**
 * MorningExperience: a dependency-free, local-only experience surface.
 * Real AR: WebXR immersive-ar + horizontal hit-test + DOM overlay. Positions
 * are metres in XR local space. Capture checks DEVICE-to-character distance,
 * never a body position or evidence of leaving a bed.
 * Camera/demo: deliberately labelled simulations; advanceDemo is explicit.
 * No recording, image extraction, upload, fetch, or analytics occur here.
 * Animals are the Three.js origami models (./origami3d.ts); animalSVG stays as the no-WebGL fallback.
 *
 * constructor({mount, onState, onCapture, onError})
 * start({mode:'ar'|'camera'|'demo', multiple, count, animal, animals, colors, volume, muted}) -> Promise<void>
 * stop() -> Promise<void>; reset(); setMuted(bool); advanceDemo() -> boolean
 * capture() -> boolean: capture-ready is required; proximity never auto-captures.
 * callbacks: onError(Error with .code), onCapture() once, onState({...}).
 * Explicit user exit additionally emits {ended:true}; programmatic stop does not.
 * Start must be called from a user click for camera, WebXR and WebAudio consent.
 */

import { mountAnimal, OrigamiXR } from './origami3d.ts';

const LIMITS = Object.freeze({ chaseSeconds: 30, radius: 1.15, speed: .62, turnSeconds: 1.8, escapeDistance: .95, escapeCooldown: 1.4, settleSeconds: 4, placementMinimum: 2, placementMaximum: 3.5, captureDistance: 1.3, dwellSeconds: .8, minimumMovement: .8, demoTurnSeconds: 1.45 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const error = (code, message) => Object.assign(new Error(message), { code });
const svg = (body) => `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

function animalSVG(animal) {
  if (animal === 'crane') return svg('<path fill="#f6f0df" d="m100 107-82-58 31 89 51-10 66 11 23-89z"/><path fill="#d8d2bf" d="m100 107-51 31 48-8-27 48 39-44 57 5z"/><path fill="#fffaf0" d="m100 107 29-67 8 5-15 62 30 16-44 11z"/><path fill="#d3cbb7" d="m129 40 27 11-19-6z"/><path fill="#2c4861" d="m134 44 3 1-1 3-3-1z"/>');
  if (animal === 'rabbit') return svg('<path fill="#e6e9e1" d="m54 80-5-67 24 8 18 63 20-64 26-8-3 70 28 40-38 46-57-4-32-42z"/><path fill="#fffdf1" d="m54 80 37 4 43-2-21 53-46 29-32-42z"/><path fill="#c5d2cf" d="m91 84 22 51 49-13-28-40z"/><path fill="#d1b3a2" d="m56 27 13 3 10 43-15-6zm66 46 2-44 9-8-4 49z"/><path fill="#30485b" d="m69 103 6-2 3 8-6 2zm51-1 6 2-3 7-6-2z"/><path fill="#c88a74" d="m91 117 14 0-7 8z"/>');
  return svg('<path fill="#ce7444" d="m31 43 48 32 41-2 48-33-13 82-54 49-59-45z"/><path fill="#edab68" d="m31 43 48 32 23 54-60-3z"/><path fill="#df8d53" d="m120 73 48-33-13 82-53 7z"/><path fill="#f8e9cc" d="m42 126 39-17 21 20 22-21 31 14-54 49z"/><path fill="#a45738" d="m40 58 24 20-19 20zm115-3-22 23 18 20z"/><path fill="#283d4b" d="m69 100 8-2 2 9-8 2zm55-2 8 2-2 9-8-2zm-30 35 16 0-8 10z"/>');
}

const STYLES = `
.morning-stage{position:relative;width:100%;height:100%;min-height:520px;overflow:hidden;isolation:isolate;background:#d8e1d3;color:#173c54;font-family:inherit;border-radius:24px}
.morning-stage *{box-sizing:border-box}.morning-stage button{font:inherit;font-size:18px;font-weight:700;min-height:48px;border:0;border-radius:16px;padding:12px 18px;cursor:pointer;touch-action:manipulation}.morning-stage button:focus-visible{outline:4px solid #d1a85d;outline-offset:4px}.morning-stage button:disabled{cursor:default;opacity:.65}.morning-stage button:active:not(:disabled){transform:translateY(2px)}
.morning-stage__camera,.morning-stage__gl,.morning-stage__landscape{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.morning-stage__landscape{background:radial-gradient(ellipse at 68% 27%,#fff2c9 0 11%,transparent 11.4%),linear-gradient(#d6e4df 0 57%,#aec5ab 57% 61%,#789c83 61% 72%,#496f63 72%)}
.morning-stage__landscape:before,.morning-stage__landscape:after{content:'';position:absolute;width:150%;height:38%;left:-20%;bottom:-9%;border-radius:50%;background:#386258;box-shadow:0 -6px 9px #193e4420;transform:rotate(8deg)}.morning-stage__landscape:after{bottom:13%;left:28%;height:22%;background:#88aa90;transform:rotate(-14deg)}
.morning-stage__grain{position:absolute;inset:0;pointer-events:none;opacity:.15;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.65' d='M0 0h200v200H0z'/%3E%3C/svg%3E")}
.morning-stage__top{position:absolute;z-index:4;left:16px;right:16px;top:max(16px,env(safe-area-inset-top));display:flex;align-items:start;justify-content:space-between;gap:10px}.morning-stage__badge{font-size:18px;line-height:1.35;font-weight:800;letter-spacing:.03em;color:#173c54;background:#fff9ecee;border:1px solid #e3d6bf;padding:10px 12px;border-radius:13px;box-shadow:0 3px 0 #203d421a}.morning-stage__top button{background:#fff9eced;color:#173c54;padding:10px 14px;white-space:nowrap}
.morning-stage__creatures{position:absolute;inset:0;overflow:hidden;pointer-events:none}.morning-stage__animal{position:absolute;left:50%;top:52%;width:180px;height:180px;transform:translate(-50%,-50%);filter:drop-shadow(0 13px 5px #142e3d40);will-change:transform}.morning-stage__animal svg{width:100%;height:100%;display:block}.morning-stage__animal[data-small]{width:125px;height:125px}.morning-stage__animal.is-surrendered{filter:drop-shadow(0 13px 5px #142e3d40) drop-shadow(0 0 16px #fff6cc66)}
.morning-stage.is-capture-ready .morning-stage__animal{pointer-events:auto;cursor:pointer}.morning-stage.is-capturing .morning-stage__creatures{opacity:0}.morning-stage__feedback{position:absolute;inset:0;z-index:3;display:grid;place-content:center;justify-items:center;gap:20px;pointer-events:none;padding-bottom:80px}.morning-stage__feedback strong{font-size:30px;line-height:1.4;color:#173c54;background:#fff9eef2;padding:12px 22px;border-radius:18px;box-shadow:0 4px 0 #203d4220}.morning-stage__check{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fffdf0;background:#3f705d;box-shadow:0 7px 0 #173c5430;animation:morning-stamp .5s both}.morning-stage__check svg{width:64px;height:64px}.morning-stage__caught{width:210px;height:210px;filter:drop-shadow(0 16px 8px #173c5440);animation:morning-catch 1s both}.morning-stage__caught svg{width:100%;height:100%}.morning-stage[data-phase=placing] .morning-stage__animal{opacity:.55}.morning-stage__animal.has-origami{width:230px;height:230px;filter:none}.morning-stage__animal.has-origami[data-small]{width:170px;height:170px}.morning-stage__animal.has-origami.is-surrendered{filter:drop-shadow(0 0 18px #fff6cc99)}.morning-stage .origami-canvas{display:block;width:100%;height:100%}.morning-stage__caught.has-origami{width:260px;height:260px;filter:none}@keyframes morning-stamp{0%{transform:scale(.65);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}@keyframes morning-catch{0%{transform:scale(.7) rotate(0)}9%{transform:scale(.7) rotate(-9deg)}18%{transform:scale(.7) rotate(9deg)}27%{transform:scale(.7) rotate(-7deg)}45%{transform:scale(1.13) rotate(0)}65%,100%{transform:scale(1) rotate(0)}}
.morning-stage__bottom{position:absolute;z-index:4;left:16px;right:16px;bottom:max(16px,env(safe-area-inset-bottom));padding:20px;background:#fff9eeed;border-radius:23px;box-shadow:0 5px 0 #1c3b4129;display:grid;gap:14px;text-align:center}.morning-stage__status{margin:0;font-size:23px;line-height:1.45;font-weight:750;text-wrap:balance}.morning-stage__actions{display:flex;justify-content:center;flex-wrap:wrap;gap:10px}.morning-stage__primary{background:#F24E1E;color:#1a1715;box-shadow:0 4px 0 #bc3b13}.morning-stage__secondary{color:#234e61;background:transparent;border:1px solid #7e918d!important}.morning-stage__progress{height:7px;background:#d2dacd;border-radius:9px;overflow:hidden}.morning-stage__progress>i{display:block;height:100%;background:#467366;width:0;transition:width .12s linear}.morning-stage [hidden]{display:none!important}
.morning-stage.is-capturing .morning-stage__bottom{visibility:hidden;pointer-events:none}.morning-stage.is-capturing .morning-stage__status{visibility:visible;position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.morning-stage.is-capturing .morning-stage__feedback{padding-bottom:0}.morning-stage.is-capturing .morning-stage__feedback:before{content:'';position:absolute;z-index:-1;left:50%;top:46%;width:min(86vw,470px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#fff6c5c9 0%,#fff3bd62 42%,transparent 70%);transform:translate(-50%,-50%);animation:morning-glow .9s both}.morning-stage.is-capturing .morning-stage__feedback:after{content:'';position:absolute;z-index:-1;left:50%;top:43%;width:8px;height:13px;border-radius:1px;background:#d3b36b;box-shadow:-128px -80px 0 #d3b36b,118px -92px 0 #96b29b,-145px 34px 0 #edf0d8,138px 48px 0 #d3b36b,-92px 105px 0 #96b29b,83px 118px 0 #edf0d8,-42px -132px 0 #edf0d8,49px -140px 0 #d3b36b;animation:morning-confetti .95s both}@keyframes morning-glow{0%{opacity:0;transform:translate(-50%,-50%) scale(.65)}45%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes morning-confetti{0%,20%{opacity:0;transform:scale(.55) rotate(-18deg)}55%{opacity:.9;transform:scale(1) rotate(-8deg)}100%{opacity:.55;transform:translateY(14px) scale(1.08) rotate(2deg)}}
.morning-stage:fullscreen{border-radius:0}.morning-stage:xr-overlay{border-radius:0;background:transparent;min-height:0}.morning-stage:xr-overlay .morning-stage__gl{display:none}
@media(max-width:420px){.morning-stage__animal.has-origami{width:190px;height:190px}.morning-stage__animal.has-origami[data-small]{width:140px;height:140px}.morning-stage__caught.has-origami{width:230px;height:230px}.morning-stage{min-height:490px}.morning-stage__bottom{left:12px;right:12px;padding:17px}.morning-stage__status{font-size:22px}.morning-stage__animal{width:155px;height:155px}.morning-stage__top{left:12px;right:12px}.morning-stage__badge{max-width:180px}.morning-stage__top button{font-size:18px}}
@media(prefers-reduced-motion:reduce){.morning-stage__progress>i{transition:none}.morning-stage__animal{will-change:auto}.morning-stage__check,.morning-stage__caught,.morning-stage.is-capturing .morning-stage__feedback:before,.morning-stage.is-capturing .morning-stage__feedback:after{animation:none}}
`;

export class MorningExperience {
  constructor({ mount, onState = () => {}, onCapture = () => {}, onError = () => {} }) {
    if (!(mount instanceof HTMLElement)) throw new TypeError('MorningExperience needs a mount element.');
    Object.assign(this, { mount, onState, onCapture, onError, active: false, token: 0, muted: false, phase: 'preparing' });
    this._visibility = () => this._handleVisibility();
    this._pagehide = () => { void this.stop(); };
    this._reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  async capabilities() {
    let ar = false;
    if (window.isSecureContext && navigator.xr?.isSessionSupported) {
      try { ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* unavailable */ }
    }
    return { ar, camera: Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia) };
  }

  async start({ chaseSeconds = LIMITS.chaseSeconds, mode = 'demo', multiple = false, count = 3, animal = 'fox', animals, colors, volume = .5, muted = false, audioContext = null } = {}) {
    if (this.active || this.session || this.stream) await this.stop();
    if (!['ar', 'camera', 'demo'].includes(mode)) throw new TypeError('Unknown experience mode.');
    const token = ++this.token;
    Object.assign(this, { chaseSeconds: clamp(Number(chaseSeconds) || LIMITS.chaseSeconds, 4, 120), active: true, captured: false, trackingValid: false, mode, multiple, animal: ['fox', 'crane', 'rabbit'].includes(animal) ? animal : 'fox', volume: clamp(Number(volume) || 0, 0, 1), paused: false, elapsed: 0, lastFrame: 0, moves: 0, dwell: 0, origin: null, placement: null, initialViewer: null, phase: 'preparing', muted: Boolean(muted) });
    const suppliedKinds = Array.isArray(animals) ? animals.filter(kind => ['fox', 'crane', 'rabbit'].includes(kind)).slice(0, multiple ? 3 : 1) : [];
    this.kinds = suppliedKinds.length ? suppliedKinds : this.multiple ? [this.animal, ...['fox', 'crane', 'rabbit'].filter(kind => kind !== this.animal)].slice(0, clamp(Math.floor(Number(count)) || 3, 1, 3)) : [this.animal];
    this.animal = this.kinds[0];
    this.multiple = this.kinds.length > 1;
    // Paper colour of the task each animal carries (same order as kinds).
    this.papers = suppliedKinds.length && Array.isArray(colors) ? colors.slice(0, this.kinds.length) : [];
    this._buildSurface();
    this.setMuted(this.muted);
    document.addEventListener('visibilitychange', this._visibility);
    window.addEventListener('pagehide', this._pagehide);
    this.sharedAudio = audioContext;
    this._prepareAudio();
    this._state('preparing', mode === 'camera' ? 'カメラを準備しています' : mode === 'ar' ? 'ARを準備しています' : '朝がやってきたよ');
    this._startAlarm();
    try {
      if (mode === 'ar') await this._startAR(token);
      else {
        if (mode === 'camera') await this._startCamera(token);
        if (token !== this.token || !this.active) return;
        this._prepareDemoPlacement();
        this.animationFrame = requestAnimationFrame((time) => this._demoFrame(time));
      }
    } catch (cause) {
      if (token !== this.token) return;
      const failure = this._friendlyError(cause);
      await this.stop();
      this.onError(failure);
      throw failure;
    }
  }

  _buildSurface() {
    if (!document.getElementById('morning-experience-styles')) {
      const style = document.createElement('style');
      style.id = 'morning-experience-styles'; style.textContent = STYLES; document.head.append(style);
    }
    const stage = document.createElement('section');
    stage.className = 'morning-stage'; stage.setAttribute('aria-label', '朝の追いかけっこ');
    stage.innerHTML = `<div class="morning-stage__landscape" ${this.mode === 'demo' ? '' : 'hidden'}></div><video class="morning-stage__camera" autoplay muted playsinline ${this.mode === 'camera' ? '' : 'hidden'}></video><canvas class="morning-stage__gl" ${this.mode === 'ar' ? '' : 'hidden'} aria-hidden="true"></canvas><div class="morning-stage__grain" ${this.mode === 'demo' ? '' : 'hidden'}></div><div class="morning-stage__creatures" ${this.mode === 'ar' ? 'hidden' : ''}></div><div class="morning-stage__feedback" hidden aria-hidden="true"></div><div class="morning-stage__top"><span class="morning-stage__badge">${this.mode === 'ar' ? 'AR' : this.mode === 'camera' ? 'カメラ DEMO' : 'DEMO'}</span></div><div class="morning-stage__bottom"><p class="morning-stage__status" role="status" aria-live="polite"></p><div class="morning-stage__progress" aria-hidden="true"><i></i></div><div class="morning-stage__actions"><button type="button" class="morning-stage__primary" data-action="primary" disabled>ここから始める</button><button type="button" class="morning-stage__secondary" data-action="reset">やり直す</button></div></div>`;
    this.mount.replaceChildren(stage); this.stage = stage;
    this.video = stage.querySelector('video'); this.canvas = stage.querySelector('canvas');
    this.status = stage.querySelector('[role=status]'); this.primary = stage.querySelector('[data-action=primary]'); this.progress = stage.querySelector('.morning-stage__progress i'); this.muteButton = stage.querySelector('[data-action=mute]'); this.feedback = stage.querySelector('.morning-stage__feedback');
    this.creatures = []; this.views = [];
    const types = this.kinds;
    types.forEach((kind, index) => {
      const element = document.createElement('div'); element.className = 'morning-stage__animal';
      if (index) element.dataset.small = '';
      element.addEventListener('click', () => this.capture()); stage.querySelector('.morning-stage__creatures').append(element); this.creatures.push(element);
      // Live origami in DEMO/camera; WebXR draws the same models in the session instead.
      const view = this.mode === 'ar' ? null : mountAnimal(element, { kind, paper: this.papers[index], zoom: 1.3, heading: .25 });
      if (view) element.classList.add('has-origami'); else element.innerHTML = animalSVG(kind);
      this.views.push(view);
    });
    stage.querySelector('[data-action=reset]').onclick = () => this.reset();
    this.primary.onclick = () => {
      if (this.paused) { void this._resume(); return; }
      if (this.phase === 'capture-ready') { this.capture(); return; }
      if (this.mode === 'ar') this._place(); else if (this.phase === 'placing') this._placementSuccess(); else this.advanceDemo();
    };
    this.canvas.addEventListener('click', () => this.capture());
    stage.addEventListener('click', event => { if (event.target === stage && this.mode === 'ar') this.capture(); });
    // DOM controls must not also fire an XR select/placement event.
    stage.addEventListener('beforexrselect', event => { if (event.target.closest('button')) event.preventDefault(); });
  }

  _state(phase, message, extra = {}) {
    this.phase = phase;
    if (this.stage?.dataset) this.stage.dataset.phase = phase;
    if (this.status) this.status.textContent = message;
    this.onState({ phase, message, mode: this.mode, ...extra });
  }

  async _startCamera(token) {
    if (!window.isSecureContext) throw error('insecure', 'カメラにはHTTPS接続が必要です。');
    if (!navigator.mediaDevices?.getUserMedia) throw error('camera-unavailable', 'このブラウザではカメラを使えません。デモで体験できます。');
    let abandoned = false, acquiredStream = null, timer, cancel;
    const releasePending = () => {
      abandoned = true;
      if (acquiredStream) {
        if (this.stream === acquiredStream) this._releaseCamera();
        else acquiredStream.getTracks().forEach(track => track.stop());
        acquiredStream = null;
      }
    };
    const cancelled = new Promise(resolve => { cancel = () => { releasePending(); resolve(); }; });
    this._cancelCameraStart = cancel;
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (token !== this.token || !this.active) { cancel(); return; }
        releasePending();
        reject(error('CAMERA_TIMEOUT', 'カメラの準備に時間がかかっています。カメラの許可を確認して、もう一度ためしてね。'));
      }, 20000);
    });
    try {
      // The browser may leave permission pending indefinitely. The losing
      // promise remains observed so a late denial never becomes unhandled.
      const camera = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }).then(async stream => {
        if (abandoned || token !== this.token || !this.active) { stream.getTracks().forEach(track => track.stop()); return; }
        acquiredStream = stream; this.stream = stream;
        const video = this.video;
        video.srcObject = stream;
        const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
        video.classList.toggle('is-mirrored', facing !== 'environment');
        await video.play();
        if (abandoned || token !== this.token || !this.active) { releasePending(); return; }
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
          if (!this.active || this.paused || token !== this.token) return;
          this._pause('カメラが止まりました');
        }, { once: true }));
      });
      await Promise.race([camera, deadline, cancelled]);
    } finally {
      clearTimeout(timer);
      if (this._cancelCameraStart === cancel) this._cancelCameraStart = null;
    }
  }

  _prepareDemoPlacement() {
    this.demoFrom = [0, -.03]; this.demoTarget = [0, -.03]; this.elapsed = 0; this.lastFrame = 0;
    this.primary.hidden = false; this.primary.disabled = false; this.primary.textContent = 'ここから始める（デモ）';
    this.progress.style.width = '0%';
    this._state('placing', '床の位置を決めよう（デモ）');
  }

  _placementSuccess() {
    if (!this.active || this.paused || !['placing', 'placed'].includes(this.phase)) return false;
    clearTimeout(this.placementTimer);
    this.primary.disabled = true;
    if (this.feedback) {
      this.feedback.innerHTML = '<span class="morning-stage__check"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="m14 33 12 12 25-27" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>準備できた！</strong>';
      this.feedback.hidden = false;
    }
    this._state('placed', '準備できた！');
    const token = this.token;
    this.placementTimer = setTimeout(() => {
      this.placementTimer = null;
      if (token === this.token && this.active && !this.paused && this.phase === 'placed') this._beginChase();
    }, 800);
    return true;
  }

  _beginChase() {
    if (this.feedback) this.feedback.hidden = true;
    this.elapsed = 0; this.dwell = 0; this.moves = 0; this.lastFrame = 0; this.nextTurn = LIMITS.turnSeconds; this.lastEscape = -Infinity; this.demoFrom = [0, 0]; this.demoTarget = [0, 0]; this.demoStep = -1;
    this.primary.disabled = true; this.primary.hidden = this.mode === 'ar'; this.primary.textContent = '追いかけっこ中';
    this._state('chasing', this.mode === 'ar' ? 'ゆっくり追いかけよう' : 'どこへ行くのかな？');
    this._startAlarm();
  }

  _demoFrame(time) {
    if (!this.active || this.mode === 'ar') return;
    this.animationFrame = requestAnimationFrame(t => this._demoFrame(t));
    // .1 s cap: the 3D creatures can drop slower devices below 20 fps, and the chase must still last 30 s.
    const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, .1) : 0;
    this.lastFrame = time;
    if (this.paused) return;
    if (this.phase === 'chasing') {
      this.elapsed += dt;
      const segment = Math.floor(this.elapsed / LIMITS.demoTurnSeconds);
      if (segment !== this.demoStep) {
        // Screen-space movement is only a demo: it never implies that a
        // camera frame or the user's body has been tracked.
        this.demoFrom = this.demoTarget; this.demoStep = segment; this.moves++;
        // Pick a spot at a new depth and side: higher on screen = farther away = smaller.
        let next;
        for (let tries = 0; tries < 8; tries++) {
          next = [(Math.random() * 2 - 1) * .34, -.22 + Math.random() * .38];
          if (Math.hypot((next[0] - this.demoFrom[0]) * 1.4, next[1] - this.demoFrom[1]) > .26) break;
        }
        this.demoTarget = next;
        if (segment % 3 === 2) this._emote('escape');
      }
      if (this.elapsed >= this.chaseSeconds) this._surrender();
    }
    const resting = ['surrendered', 'capture-ready', 'capturing'].includes(this.phase);
    const progress = resting ? 1 : Math.min(1, (this.elapsed % LIMITS.demoTurnSeconds) / 1.1);
    const ease = progress * progress * (3 - 2 * progress);
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    const target = resting ? [0, -.03] : this.demoTarget;
    const from = resting ? [0, -.03] : this.demoFrom;
    const x = (from[0] + (target[0] - from[0]) * ease) * width;
    const y = (from[1] + (target[1] - from[1]) * ease) * height;
    const running = this.phase === 'chasing';
    const depthOf = value => clamp(.55 + (value + .22) / .38 * .7, .55, 1.25);
    const dx = target[0] - from[0], dy = target[1] - from[1];
    const heading = running ? Math.atan2(dx * 1.4, dy * 1.6) * .9 : .25;
    this.creatures.forEach((element, index) => {
      const view = this.views[index];
      // The origami run cycles carry their own hop; the CSS bounce is for the SVG fallback only.
      if (view) { view.play(running ? 'run' : 'idle'); view.setHeading(heading); }
      const offset = index ? (index === 1 ? -1 : 1) * Math.min(width * .17, 90) : 0;
      const edge = Math.max(0, width / 2 - (element.clientWidth || 155) / 2 - 16);
      const jump = view || this._reduced || this.phase !== 'chasing' ? 0 : Math.abs(Math.sin(this.elapsed * 6 + index)) * 18;
      const tilt = view || this._reduced || this.phase !== 'chasing' ? 0 : Math.sin(this.elapsed * 5 + index) * 7;
      element.style.transform = `translate(calc(-50% + ${clamp(x + offset, -edge, edge)}px),calc(-50% + ${y + (index ? 22 : 0) - jump}px)) rotate(${tilt}deg) scale(${(resting ? 1 : depthOf(y / height)).toFixed(3)})`;
    });
    this.progress.style.width = `${Math.min(this.elapsed / this.chaseSeconds, 1) * 100}%`;
  }

  _surrender() {
    this.dwell = 0; this.primary.hidden = false; this.primary.disabled = this.mode === 'ar'; this.primary.textContent = this.mode === 'ar' ? '近づいて、つかまえる' : '近づく（デモ）';
    this.stage?.classList?.remove('is-capture-ready');
    this.creatures.forEach(element => element.classList.add('is-surrendered'));
    this._emote('surrender');
    this._state('surrendered', this.mode === 'ar' ? '近づいて、タップでつかまえよう' : 'つかまえて、の合図！');
    if (this.mode !== 'ar') this._readyToCapture();
  }

  _emote(role) {
    this.views?.forEach(view => view?.emote(role));
    if (this.mode === 'ar') this.renderer?.emote(role);
  }

  advanceDemo() {
    // Camera/demo never infer physical proximity from image size or a timer.
    if (!this.active || this.paused || this.mode === 'ar' || this.phase !== 'surrendered' || this.captured) return false;
    this._readyToCapture(); return true;
  }

  _readyToCapture() {
    this.primary.hidden = false; this.primary.disabled = false; this.primary.textContent = 'つかまえる';
    this.stage?.classList?.add('is-capture-ready');
    this._state('capture-ready', 'タップでつかまえよう');
  }

  _isNear() {
    if (!this.viewer || !this.position || !this.initialViewer) return false;
    const centre = [this.position[0], this.position[1] + .14, this.position[2]];
    return planarDistance(this.viewer, this.initialViewer) >= LIMITS.minimumMovement && distance(this.viewer, centre) <= LIMITS.captureDistance && planarDistance(this.viewer, this.position) <= .48;
  }

  capture() {
    if (this.captured || !this.active || this.paused || this.phase !== 'capture-ready') return false;
    if (this.mode === 'ar' && (!this.trackingValid || !this._isNear() || this.dwell < LIMITS.dwellSeconds)) return false;
    this.captured = true;
    this.primary.disabled = true;
    if (this.muteButton) this.muteButton.disabled = true;
    this.stage?.classList?.remove('is-capture-ready'); this.stage?.classList?.add('is-capturing');
    clearInterval(this.alarmTimer);
    if (this.master && this.audio) this.master.gain.setValueAtTime(0, this.audio.currentTime);
    this.audio?.suspend().catch(() => {});
    if (this.feedback) {
      this.feedback.innerHTML = '<div class="morning-stage__caught"></div><strong>捕まえた！</strong>';
      const holder = this.feedback.querySelector('.morning-stage__caught');
      const view = mountAnimal(holder, { kind: this.animal, paper: this.papers[0], zoom: 1.25, heading: .25 });
      if (view) { holder.classList.add('has-origami'); view.emote('cheer'); } else holder.innerHTML = animalSVG(this.animal);
      this.feedback.hidden = false;
    }
    this._state('capturing', '捕まえた！');
    globalThis.navigator?.vibrate?.([35, 45, 60]);
    const token = this.token;
    this.captureTimer = setTimeout(async () => {
      this.captureTimer = null;
      if (token !== this.token || !this.active || this.paused || this.phase !== 'capturing') return;
      await this.stop();
      // stop increments the token once; a second stop/start invalidates this
      // completion while asynchronous camera/audio/XR teardown is in flight.
      if (this.token === token + 1) this.onCapture();
    }, 1000);
    return true;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.audio?.state !== 'closed') this.master.gain.setTargetAtTime(this.muted ? 0 : 1.8, this.audio.currentTime, .03);
    if (this.muteButton) { this.muteButton.textContent = this.muted ? '音を鳴らす' : '音を止める'; this.muteButton.setAttribute('aria-pressed', String(this.muted)); }
    if (!this.muted && !this.paused) this.audio?.resume().catch(() => {});
  }

  reset() {
    if (!this.active) return;
    clearTimeout(this.placementTimer); clearTimeout(this.captureTimer);
    if (this.feedback) this.feedback.hidden = true;
    this.stage?.classList?.remove('is-capture-ready', 'is-capturing');
    if (this.muteButton) this.muteButton.disabled = false;
    if (this.master && this.audio) this.master.gain.setValueAtTime(this.muted ? 0 : 1.8, this.audio.currentTime);
    this.captured = false; this.elapsed = 0; this.dwell = 0; this.moves = 0; this.lastFrame = 0;
    this.creatures.forEach(element => element.classList.remove('is-surrendered'));
    if (this.mode === 'ar') {
      this.origin = null; this.placement = null; this.initialViewer = null; this.target = null; this.savedPhase = null; this.trackingPhase = null;
      // Reset is a user gesture and must leave a paused XR session usable.
      // Otherwise the placement button remains disabled behind paused=true.
      this.paused = false; this.audio?.resume().catch(() => {});
      this.primary.hidden = false; this.primary.disabled = true; this.primary.textContent = 'ここから始める'; this.progress.style.width = '0%';
      this._state('placing', '3m四方を空けて、2m先の床を映そう');
    } else if (this.paused) { this.savedPhase = 'placing'; void this._resume(); }
    else { this.audio?.resume().catch(() => {}); this._prepareDemoPlacement(); }
    this._startAlarm();
  }

  _pause(message) {
    if (this.paused || !this.active) return;
    this.paused = true; this.savedPhase = this.phase === 'tracking-lost' ? this.trackingPhase || (this.origin ? 'chasing' : 'placing') : this.phase; this.lastFrame = 0; this.dwell = 0;
    if (['capture-ready', 'capturing'].includes(this.savedPhase)) this.savedPhase = 'surrendered';
    clearTimeout(this.placementTimer); clearTimeout(this.captureTimer); this.captured = false;
    if (this.feedback) this.feedback.hidden = true;
    this.stage?.classList?.remove('is-capture-ready', 'is-capturing');
    if (this.muteButton) this.muteButton.disabled = false;
    if (this.mode === 'camera') this._releaseCamera();
    this.audio?.suspend().catch(() => {});
    this.primary.hidden = false; this.primary.disabled = false; this.primary.textContent = this.mode === 'camera' ? 'カメラを再開' : '続きを見る';
    this._state('tracking-lost', message);
  }

  async _resume() {
    if (!this.active || !this.paused || this.resuming) return;
    this.resuming = true; this.primary.disabled = true;
    const token = this.token;
    try {
      if (this.master && this.audio) this.master.gain.setValueAtTime(this.muted ? 0 : 1.8, this.audio.currentTime);
      this.audio?.resume().catch(() => {});
      if (this.mode === 'camera') await this._startCamera(token);
      if (token !== this.token || !this.active) return;
      this.paused = false; this.lastFrame = 0; const phase = this.savedPhase || 'chasing';
      if (phase === 'surrendered') { this._surrender(); this._startAlarm(); }
      else if (phase === 'placed') { this._state('placed', '準備できた！'); this._placementSuccess(); }
      else if (phase === 'placing') { if (this.mode === 'ar') this.reset(); else this._prepareDemoPlacement(); }
      else { this.primary.hidden = this.mode === 'ar'; this.primary.disabled = true; this.primary.textContent = '追いかけっこ中'; this._state('chasing', this.mode === 'ar' ? 'ゆっくり追いかけよう' : 'どこへ行くのかな？'); }
    } catch (cause) {
      if (token !== this.token) return;
      this._releaseCamera(); this.audio?.suspend().catch(() => {});
      this.primary.disabled = false; const failure = this._friendlyError(cause); this._state('tracking-lost', failure.message); this.onError(failure);
    } finally { this.resuming = false; }
  }

  _handleVisibility() {
    if (!this.active) return;
    if (document.hidden) this._pause('ひと休み中。準備ができたら再開しよう');
  }

  _prepareAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      this.audio = this.sharedAudio || new Audio(); this.master = this.audio.createGain(); this.master.gain.value = this.muted ? 0 : 1.8; this.comp = this.audio.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 12; this.master.connect(this.comp); this.comp.connect(this.audio.destination);
      if (!this.muted) this.audio.resume().then(() => { if(this.active) this._startAlarm(); }).catch(() => {});
    } catch { this.audio = null; }
  }

  _startAlarm() {
    clearInterval(this.alarmTimer);
    const play = () => {
      if (!this.active || this.paused || this.muted || !this.audio || this.audio.state !== 'running' || this.phase === 'capturing') return;
      const time = this.audio.currentTime;
      [659.25, 783.99, 987.77].forEach((hz, i) => {
        const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
        oscillator.type = 'square'; oscillator.frequency.value = hz; oscillator.connect(gain); gain.connect(this.master);
        gain.gain.setValueAtTime(0, time + i * .15); gain.gain.linearRampToValueAtTime(1, time + i * .15 + .01); gain.gain.setValueAtTime(1, time + i * .15 + .12); gain.gain.exponentialRampToValueAtTime(.001, time + i * .15 + .19);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(time + i * .15); oscillator.stop(time + i * .15 + .21);
      });
    };
    play(); this.alarmTimer = setInterval(play, 1800);
  }

  _releaseCamera() {
    const stream = this.stream; this.stream = null;
    stream?.getTracks().forEach(track => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
  }

  async _exit() {
    const mode = this.mode;
    await this.stop(); this.onState({ phase: 'preparing', message: '体験を終了しました', mode, ended: true });
  }

  async stop() {
    this.active = false; this.token++; this.resuming = false;
    clearTimeout(this.placementTimer); clearTimeout(this.captureTimer);
    this._cancelCameraStart?.();
    clearInterval(this.alarmTimer); cancelAnimationFrame(this.animationFrame);
    document.removeEventListener('visibilitychange', this._visibility); window.removeEventListener('pagehide', this._pagehide);
    this._releaseCamera();
    const audio = this.audio; this.audio = null;
    this.master?.disconnect?.(); this.master = null; this.comp?.disconnect?.(); this.comp = null;
    if (audio && audio.state !== 'closed') { try { if(this.sharedAudio) await audio.suspend(); else await audio.close(); } catch { /* already released */ } }
    this.sharedAudio = null;
    try { this.hitSource?.cancel(); } catch { /* session already ended */ } this.hitSource = null;
    const session = this.session; this.session = null;
    this.renderer?.loop(null);
    if (session) {
      session.removeEventListener('end', this._xrEnded); session.removeEventListener('visibilitychange', this._xrVisibility); session.removeEventListener('select', this._xrSelected);
      try { await session.end(); } catch { /* browser may have ended it */ }
    }
    this.renderer?.dispose(); this.renderer = null;
    this.views?.forEach(view => view?.dispose()); this.views = [];
    this.mount.replaceChildren(); this.stage = null;
  }

  _friendlyError(cause) {
    if (cause?.code && typeof cause.code === 'string') return cause;
    if (cause?.name === 'NotAllowedError' || cause?.name === 'SecurityError') return error('permission', 'カメラを許可して、もう一度始めよう。');
    if (cause?.name === 'NotFoundError') return error('no-camera', 'カメラが見つかりません。デモで体験できます。');
    if (cause?.name === 'NotReadableError') return error('camera-busy', 'ほかのアプリのカメラを閉じて、もう一度試そう。');
    if (cause?.name === 'NotSupportedError') return error('unsupported', 'この端末ではARを使えません。カメラデモで体験できます。');
    return error('start-failed', this.mode === 'ar' ? 'ARを開始できませんでした。もう一度試そう。' : 'カメラを開始できませんでした。もう一度試そう。');
  }

  async _startAR(token) {
    if (!window.isSecureContext || !navigator.xr) throw error('unsupported', 'このブラウザではARを使えません。カメラデモで体験できます。');
    // Overlay keeps placement, capture and recovery controls reachable.
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test', 'dom-overlay'], optionalFeatures: ['local-floor'], domOverlay: { root: this.stage } });
    if (token !== this.token || !this.active) { await session.end(); return; }
    this.session = session;
    this._xrEnded = () => { if (this.active) void this._exit(); };
    this._xrVisibility = () => { if (session.visibilityState !== 'visible') this._pause('ARを一時停止しています'); };
    this._xrSelected = () => this.capture();
    session.addEventListener('end', this._xrEnded); session.addEventListener('visibilitychange', this._xrVisibility); session.addEventListener('select', this._xrSelected);
    // Three.js owns the XR layer and camera; the reference space prefers local-floor, else local.
    let xr;
    try { xr = new OrigamiXR(this.canvas); } catch { throw error('webgl', 'この端末でARの描画を開始できませんでした。'); }
    this.renderer = xr;
    this.reference = await xr.attach(session);
    if (token !== this.token || !this.active) return;
    xr.cast(this.kinds, this.papers);
    const viewer = await session.requestReferenceSpace('viewer');
    if (token !== this.token || !this.active) return;
    const hitSource = await session.requestHitTestSource({ space: viewer });
    if (token !== this.token || !this.active) { try { hitSource.cancel(); } catch { /* ended */ } return; }
    this.hitSource = hitSource;
    this._state('placing', '3m四方を空けて、2m先の床を映そう');
    xr.loop((time, frame) => this._arFrame(time, frame));
  }

  _place() {
    if (!this.active || this.mode !== 'ar' || this.phase !== 'placing' || !this.placement || !this.viewer) return;
    this.origin = [...this.placement]; this.position = [...this.origin]; this.initialViewer = [...this.viewer];
    const dx = this.origin[0] - this.viewer[0], dz = this.origin[2] - this.viewer[2], length = Math.hypot(dx, dz) || 1;
    this.forward = [dx / length, 0, dz / length];
    // The final point is away from the initial device; waiting at the start
    // cannot satisfy capture, even when noisy position estimates fluctuate.
    this.finalTarget = [this.origin[0] + this.forward[0] * .85, this.origin[1], this.origin[2] + this.forward[2] * .85];
    this.target = this._randomTarget(); this._placementSuccess();
  }

  _randomTarget(awayFromViewer = false) {
    // Every endpoint and its connecting segment stays within the circle the
    // user cleared during placement. This does not infer obstacle-free rooms.
    const rotation = Math.random() * Math.PI * 2;
    const candidates = Array.from({ length: 16 }, (_, index) => {
      const angle = rotation + index / 16 * Math.PI * 2, radius = .65 + Math.random() * .5;
      return [this.origin[0] + Math.cos(angle) * radius, this.origin[1], this.origin[2] + Math.sin(angle) * radius];
    });
    const longLegs = candidates.filter(point => planarDistance(point, this.position) >= .65);
    const choices = longLegs.length ? longLegs : candidates;
    if (!awayFromViewer || !this.viewer) return choices[Math.floor(Math.random() * choices.length)];
    return choices.reduce((best, point) => planarDistance(point, this.viewer) + planarDistance(point, this.position) * .25 > planarDistance(best, this.viewer) + planarDistance(best, this.position) * .25 ? point : best);
  }

  _arFrame(time, frame) {
    // Called by the Three.js XR animation loop (OrigamiXR.loop), which also schedules the next frame.
    if (!this.active || !this.session || !this.renderer || !frame) return;
    const xr = this.renderer;
    const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, .05) : 0; this.lastFrame = time;
    const pose = frame.getViewerPose(this.reference);
    if (this.phase === 'capturing') { xr.show({}); xr.render(dt); return; }
    if (!pose || pose.emulatedPosition || this.paused || this.session.visibilityState !== 'visible') {
      this.trackingValid = false; this.dwell = 0; this.lastFrame = 0;
      if (this.phase === 'capture-ready') this._surrender();
      if (!this.paused && this.phase !== 'tracking-lost') { this.trackingPhase = this.phase; this._state('tracking-lost', '床をゆっくり映してね'); }
      if (!this.paused) this.primary.disabled = true;
      xr.show({}); xr.render(0);
      return;
    }
    this.trackingValid = true;
    if (this.phase === 'tracking-lost') {
      const phase = this.trackingPhase || (this.origin ? 'chasing' : 'placing');
      if (phase === 'surrendered' || phase === 'capture-ready') this._surrender();
      else if (phase === 'placed') { this._state('placed', '準備できた！'); this._placementSuccess(); }
      else this._state(phase, phase === 'placing' ? '床を映して、場所を選ぼう' : 'ゆっくり追いかけよう');
    }
    const p = pose.transform.position; this.viewer = [p.x, p.y, p.z];
    if (!this.origin) {
      this.placement = null;
      for (const result of frame.getHitTestResults(this.hitSource)) {
        const hit = result.getPose(this.reference);
        if (!hit || hit.transform.matrix[5] < .92) continue; // horizontal, upward facing
        const hp = hit.transform.position, point = [hp.x, hp.y, hp.z], gap = planarDistance(point, this.viewer);
        if (gap < LIMITS.placementMinimum || gap > LIMITS.placementMaximum || this.viewer[1] - hp.y < .3) continue;
        this.placement = point; break;
      }
      this.primary.disabled = !this.placement;
    } else if (this.phase === 'chasing') {
      this.elapsed += dt;
      const finishing = this.elapsed >= this.chaseSeconds - LIMITS.settleSeconds;
      if (finishing) this.target = this.finalTarget;
      else if (planarDistance(this.viewer, this.position) < LIMITS.escapeDistance && this.elapsed - this.lastEscape >= LIMITS.escapeCooldown) {
        this.target = this._randomTarget(true); this.lastEscape = this.elapsed; this.nextTurn = this.elapsed + LIMITS.turnSeconds; this.moves++;
        this._emote('escape');
      } else if (this.elapsed >= this.nextTurn || planarDistance(this.position, this.target) < .06) {
        this.target = this._randomTarget(); this.nextTurn = this.elapsed + LIMITS.turnSeconds; this.moves++;
      }
      const remaining = planarDistance(this.position, this.target), step = Math.min(remaining, LIMITS.speed * dt);
      if (remaining > .001) { this.position[0] += (this.target[0] - this.position[0]) / remaining * step; this.position[2] += (this.target[2] - this.position[2]) / remaining * step; }
      this.progress.style.width = `${Math.min(this.elapsed / this.chaseSeconds, 1) * 100}%`;
      // Frequent arrivals never surrender early. Four seconds allow the final
      // in-bounds leg to finish, then the 30-second ceiling guarantees rest.
      if (this.elapsed >= this.chaseSeconds) { this.position = [...this.finalTarget]; this._surrender(); }
    } else if (this.phase === 'surrendered' || this.phase === 'capture-ready') {
      // Distance is from the real XR device to the rendered animal's centre.
      // The horizontal bound additionally requires approach to its floor point.
      const capturePoint = [this.position[0], this.position[1] + .14, this.position[2]];
      const gap = distance(this.viewer, capturePoint);
      const near = this._isNear();
      this.dwell = near ? Math.min(LIMITS.dwellSeconds, this.dwell + dt) : 0;
      this.progress.style.width = `${Math.min(1, this.dwell / LIMITS.dwellSeconds) * 100}%`;
      if (!near && this.phase === 'capture-ready') this._surrender();
      else if (this.dwell >= LIMITS.dwellSeconds && this.phase !== 'capture-ready') this._readyToCapture();
      if (this.phase !== 'capture-ready' && (!this.distanceAt || time - this.distanceAt > 500)) {
        this.distanceAt = time; this.onState({ phase: 'surrendered', message: '近づいて、タップでつかまえよう', distance: gap, mode: 'ar' });
      }
    }
    xr.show({ reticle: !this.origin ? this.placement : null, area: this.origin, radius: LIMITS.radius, animals: Boolean(this.origin) });
    if (this.origin) {
      const positions = this.multiple ? [[0, 0, 0], [-.11, 0, .1], [.11, 0, .1]].slice(0, this.kinds.length) : [[0, 0, 0]];
      const resting = this.phase === 'surrendered' || this.phase === 'capture-ready';
      positions.forEach((offset, index) => {
        // The origami run cycle carries the hop, so the floor point is used as is.
        const at = this.position.map((v, axis) => v + offset[axis]);
        const direction = resting ? this.viewer : this.target;
        xr.place(index, at, Math.atan2(direction[0] - at[0], direction[2] - at[2]), this.phase === 'chasing');
      });
    }
    xr.render(dt);
  }
}
