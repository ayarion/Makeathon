/**
 * MorningExperience: a local-only experience surface.
 * Real AR: WebXR immersive-ar + horizontal hit-test + DOM overlay. Positions
 * are metres in XR local space. Capture checks DEVICE-to-character distance,
 * never a body position or evidence of leaving a bed.
 * Camera: 8th Wall SLAM tracks device position and floor surfaces without a marker.
 * Camera pixels are processed in memory on device; nothing is recorded or uploaded.
 * The visual-only demo cannot complete a capture.
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

const LIMITS = Object.freeze({ radius: 1.15, speed: .62, turnSeconds: 1.8, placementMinimum: 2, placementMaximum: 3.5, captureDistance: 1.3, dwellSeconds: .8, minimumMovement: .8, demoTurnSeconds: 1.45 });
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
.morning-stage__feed,.morning-stage__gl,.morning-stage__landscape{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.morning-stage__landscape{background:radial-gradient(ellipse at 68% 27%,#fff2c9 0 11%,transparent 11.4%),linear-gradient(#d6e4df 0 32%,#aec5ab 32% 36%,#789c83 36% 52%,#496f63 52%)}
.morning-stage__landscape:before,.morning-stage__landscape:after{content:'';position:absolute;width:150%;height:38%;left:-20%;bottom:-9%;border-radius:50%;background:#386258;box-shadow:0 -6px 9px #193e4420;transform:rotate(8deg)}.morning-stage__landscape:after{bottom:13%;left:28%;height:22%;background:#88aa90;transform:rotate(-14deg)}
.morning-stage__grain{position:absolute;inset:0;pointer-events:none;opacity:.15;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.65' d='M0 0h200v200H0z'/%3E%3C/svg%3E")}
.morning-stage__top{position:absolute;z-index:4;left:16px;right:16px;top:max(16px,env(safe-area-inset-top));display:flex;align-items:start;justify-content:space-between;gap:10px}.morning-stage__badge{font-size:18px;line-height:1.35;font-weight:800;letter-spacing:.03em;color:#173c54;background:#fff9ecee;border:1px solid #e3d6bf;padding:10px 12px;border-radius:13px;box-shadow:0 3px 0 #203d421a}.morning-stage__top button{background:#fff9eced;color:#173c54;padding:10px 14px;white-space:nowrap}
.morning-stage__creatures{position:absolute;inset:0;overflow:hidden;pointer-events:none}.morning-stage__animal{position:absolute;left:50%;top:52%;width:180px;height:180px;transform:translate(-50%,-50%);filter:drop-shadow(0 13px 5px #142e3d40);will-change:transform}.morning-stage__animal svg{width:100%;height:100%;display:block}.morning-stage__animal[data-small]{width:125px;height:125px}.morning-stage__animal.is-surrendered{filter:drop-shadow(0 13px 5px #142e3d40) drop-shadow(0 0 16px #fff6cc66)}
.morning-stage.is-capture-ready .morning-stage__animal{pointer-events:auto;cursor:pointer}.morning-stage.is-capturing .morning-stage__creatures{opacity:0}.morning-stage__feedback{position:absolute;inset:0;z-index:3;display:grid;place-content:center;justify-items:center;gap:20px;pointer-events:none;padding-bottom:80px}.morning-stage__feedback strong{font-size:30px;line-height:1.4;color:#173c54;background:#fff9eef2;padding:12px 22px;border-radius:18px;box-shadow:0 4px 0 #203d4220}.morning-stage__check{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fffdf0;background:#3f705d;box-shadow:0 7px 0 #173c5430;animation:morning-stamp .5s both}.morning-stage__check svg{width:64px;height:64px}.morning-stage__caught{width:210px;height:210px;filter:drop-shadow(0 16px 8px #173c5440);animation:morning-catch 1s both}.morning-stage__caught svg{width:100%;height:100%}.morning-stage[data-phase=placing] .morning-stage__animal{opacity:.55}.morning-stage__animal.has-origami{width:230px;height:230px;filter:none}.morning-stage__animal.has-origami[data-small]{width:170px;height:170px}.morning-stage__animal.has-origami.is-surrendered{filter:drop-shadow(0 0 18px #fff6cc99)}.morning-stage .origami-canvas{display:block;width:100%;height:100%}.morning-stage__caught.has-origami{width:260px;height:260px;filter:none}@keyframes morning-stamp{0%{transform:scale(.65);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}@keyframes morning-catch{0%{transform:scale(.7) rotate(0)}9%{transform:scale(.7) rotate(-9deg)}18%{transform:scale(.7) rotate(9deg)}27%{transform:scale(.7) rotate(-7deg)}45%{transform:scale(1.13) rotate(0)}65%,100%{transform:scale(1) rotate(0)}}
.morning-stage__bottom{position:absolute;z-index:4;left:16px;right:16px;bottom:max(16px,env(safe-area-inset-bottom));padding:20px;background:#fff9eeed;border-radius:23px;box-shadow:0 5px 0 #1c3b4129;display:grid;gap:14px;text-align:center}.morning-stage__status{margin:0;font-size:23px;line-height:1.45;font-weight:750;text-wrap:balance}.morning-stage__actions{display:flex;justify-content:center;flex-wrap:wrap;gap:10px}.morning-stage__primary{background:#F24E1E;color:#1a1715;box-shadow:0 4px 0 #bc3b13}.morning-stage__secondary{color:#234e61;background:transparent;border:1px solid #7e918d!important}.morning-stage [hidden]{display:none!important}
.morning-stage.is-capturing .morning-stage__bottom{visibility:hidden;pointer-events:none}.morning-stage.is-capturing .morning-stage__status{visibility:visible;position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.morning-stage.is-capturing .morning-stage__feedback{padding-bottom:0}.morning-stage.is-capturing .morning-stage__feedback:before{content:'';position:absolute;z-index:-1;left:50%;top:46%;width:min(86vw,470px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#fff6c5c9 0%,#fff3bd62 42%,transparent 70%);transform:translate(-50%,-50%);animation:morning-glow .9s both}.morning-stage.is-capturing .morning-stage__feedback:after{content:'';position:absolute;z-index:-1;left:50%;top:43%;width:8px;height:13px;border-radius:1px;background:#d3b36b;box-shadow:-128px -80px 0 #d3b36b,118px -92px 0 #96b29b,-145px 34px 0 #edf0d8,138px 48px 0 #d3b36b,-92px 105px 0 #96b29b,83px 118px 0 #edf0d8,-42px -132px 0 #edf0d8,49px -140px 0 #d3b36b;animation:morning-confetti .95s both}@keyframes morning-glow{0%{opacity:0;transform:translate(-50%,-50%) scale(.65)}45%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes morning-confetti{0%,20%{opacity:0;transform:scale(.55) rotate(-18deg)}55%{opacity:.9;transform:scale(1) rotate(-8deg)}100%{opacity:.55;transform:translateY(14px) scale(1.08) rotate(2deg)}}
.morning-stage:fullscreen{border-radius:0}.morning-stage:xr-overlay{border-radius:0;background:transparent;min-height:0}.morning-stage:xr-overlay .morning-stage__gl{display:none}
@media(max-width:420px){.morning-stage__animal.has-origami{width:190px;height:190px}.morning-stage__animal.has-origami[data-small]{width:140px;height:140px}.morning-stage__caught.has-origami{width:230px;height:230px}.morning-stage{min-height:490px}.morning-stage__bottom{left:12px;right:12px;padding:17px}.morning-stage__status{font-size:22px}.morning-stage__animal{width:155px;height:155px}.morning-stage__top{left:12px;right:12px}.morning-stage__badge{max-width:180px}.morning-stage__top button{font-size:18px}}
@media(prefers-reduced-motion:reduce){.morning-stage__animal{will-change:auto}.morning-stage__check,.morning-stage__caught,.morning-stage.is-capturing .morning-stage__feedback:before,.morning-stage.is-capturing .morning-stage__feedback:after{animation:none}}
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

  async start({ mode = 'demo', multiple = false, count = 3, animal = 'fox', animals, colors, volume = .5, muted = false, audioContext = null } = {}) {
    if (this.active || this.session || this.stream) await this.stop();
    if (!['ar', 'camera', 'demo'].includes(mode)) throw new TypeError('Unknown experience mode.');
    const token = ++this.token;
    Object.assign(this, { active: true, captured: false, trackingValid: false, mode, multiple, animal: ['fox', 'crane', 'rabbit'].includes(animal) ? animal : 'fox', volume: clamp(Number(volume) || 0, 0, 1), paused: false, elapsed: 0, lastFrame: 0, moves: 0, dwell: 0, origin: null, placement: null, initialViewer: null, phase: 'preparing', muted: Boolean(muted) });
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
        if (mode === 'camera') { await this._startWorldTracking(token); return; }
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
    stage.innerHTML = `<div class="morning-stage__landscape" ${this.mode === 'demo' ? '' : 'hidden'}></div><canvas class="morning-stage__feed" ${this.mode === 'camera' ? '' : 'hidden'}></canvas><canvas class="morning-stage__gl" ${this.mode !== 'demo' ? '' : 'hidden'} aria-hidden="true"></canvas><div class="morning-stage__grain" ${this.mode === 'demo' ? '' : 'hidden'}></div><div class="morning-stage__creatures" ${this.mode !== 'demo' ? 'hidden' : ''}></div><div class="morning-stage__feedback" hidden aria-hidden="true"></div><div class="morning-stage__top"><span class="morning-stage__badge">${this.mode === 'ar' ? 'AR' : this.mode === 'camera' ? '鬼ごっこ' : 'DEMO'}</span></div><div class="morning-stage__bottom"><p class="morning-stage__status" role="status" aria-live="polite"></p><div class="morning-stage__actions"><button type="button" class="morning-stage__primary" data-action="primary" disabled>ここで決定</button></div></div>`;
    this.mount.replaceChildren(stage); this.stage = stage;
    this.feed = stage.querySelector('.morning-stage__feed'); this.canvas = stage.querySelector('.morning-stage__gl');
    this.status = stage.querySelector('[role=status]'); this.primary = stage.querySelector('[data-action=primary]'); this.muteButton = stage.querySelector('[data-action=mute]'); this.feedback = stage.querySelector('.morning-stage__feedback');
    this.creatures = []; this.views = [];
    const types = this.kinds;
    types.forEach((kind, index) => {
      const element = document.createElement('div'); element.className = 'morning-stage__animal';
      if (index) element.dataset.small = '';
      element.addEventListener('click', () => this.capture()); element.addEventListener('keydown', event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.capture();}}); stage.querySelector('.morning-stage__creatures').append(element); this.creatures.push(element);
      // Live origami in DEMO/camera; WebXR draws the same models in the session instead.
      const view = this.mode !== 'demo' ? null : mountAnimal(element, { kind, paper: this.papers[index], zoom: 1.3, heading: .25 });
      if (view) element.classList.add('has-origami'); else element.innerHTML = animalSVG(kind);
      this.views.push(view);
    });
    this.primary.onclick = () => {
      if (this.paused) { void this._resume(); return; }
      if (this.phase === 'capture-ready') return;
      if (this.mode === 'camera') this._placeWorld(); else if (this.mode === 'ar') this._place(); else if (this.phase === 'placing') this._placementSuccess(); else this.advanceDemo();
    };
    this.canvas.addEventListener('click', event => this._tapTrackedAnimal(event));

    // DOM controls must not also fire an XR select/placement event.
    stage.addEventListener('beforexrselect', event => { if (event.target.closest('button')) event.preventDefault(); });
  }

  _state(phase, message, extra = {}) {
    this.phase = phase;
    if (this.stage?.dataset) this.stage.dataset.phase = phase;
    if (this.status) this.status.textContent = message;
    this.onState({ phase, message, mode: this.mode, ...extra });
  }

  async _startWorldTracking(token) {
    const XR8 = await loadWorldEngine();
    await XR8.loadChunk('slam');
    if(token!==this.token || !this.active)return;
    this.worldStarted=false;this.worldEngine=XR8; this.worldGate=new WorldApproachGate();
    this.renderer=new OrigamiXR(this.canvas);this.renderer.cast(this.kinds,this.papers);
    const resize=()=>{
      if(!this.feed || !this.active)return;
      const dpr=Math.min(devicePixelRatio||1,2);
      this.feed.width=Math.round(this.stage.clientWidth*dpr);
      this.feed.height=Math.round(this.stage.clientHeight*dpr);
      if(this.worldStarted)XR8.XrController.updateCameraProjectionMatrix({cam:{pixelRectWidth:this.feed.width,pixelRectHeight:this.feed.height,nearClipPlane:.03,farClipPlane:20}});
    };
    this.worldResize=new ResizeObserver(resize);this.worldResize.observe(this.stage);
    XR8.XrController.configure({disableWorldTracking:false,enableWorldPoints:true,scale:'absolute',mirroredDisplay:false});
    await new Promise((resolve,reject)=>{
      let ready=false;
      const finish=(failure)=>{clearTimeout(this.worldStartTimer);this.cancelWorldStart=null;if(failure)reject(failure);else resolve();};
      this.cancelWorldStart=()=>finish();
      this.worldStartTimer=setTimeout(()=>finish(error('world-timeout','ARの準備に時間がかかっています。接続とカメラの許可を確認してね。')),30000);
      const failure=cause=>{
        if(token!==this.token || !this.active)return;
        if(!ready)finish(error('world-start',cause?.message||'カメラと動きの検出を許可して、もう一度ためしてね。'));
        else {this._pause('追跡が止まったよ。もう一度床を写してね');this.onError(cause);}
      };
      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),XR8.XrController.pipelineModule(),
        {name:'origo-world',
          onStart:()=>{
            if(token!==this.token || !this.active){XR8.stop();return;}
            this.worldStarted=true;resize();XR8.XrController.updateCameraProjectionMatrix({origin:{x:0,y:1.4,z:0},facing:{x:0,y:0,z:0,w:1}});
            this._resetWorldPlacement();ready=true;finish();
          },
          onUpdate:({processCpuResult})=>{if(token===this.token&&this.active&&!this.paused)this._worldFrame(processCpuResult?.reality,performance.now());},
          onException:failure,
          onCameraStatusChange:({status})=>{if(status==='failed')failure(new Error('カメラを開けませんでした。Safariのカメラ許可を確認してね。'));},
        }
      ]);
      try{XR8.run({canvas:this.feed,allowedDevices:XR8.XrConfig.device().MOBILE,cameraConfig:{direction:XR8.XrConfig.camera().BACK}});}catch(cause){failure(cause);}
    });
  }

  _resetWorldPlacement() {
    clearTimeout(this.placementTimer);
    this.worldGate?.reset();this.origin=null;this.placement=null;this.viewer=null;this.worldFrameAt=0;this.floorSince=null;
    this.stage.classList.remove('is-capture-ready');if(this.feedback)this.feedback.hidden=true;
    this.primary.hidden=false;this.primary.disabled=true;this.primary.textContent='ここで決定';
    this.renderer?.show({});this._state('placing','床を写してください');
  }

  _placeWorld() {
    if(!this.active||this.paused||this.phase!=='placing'||!this.placement||!this.viewer||performance.now()-this.worldFrameAt>250||!this.floorSince||performance.now()-this.floorSince<600)return false;
    this.origin=[...this.placement];this.position=[...this.origin];this.initialViewer=[...this.viewer];
    this.worldGate.begin(this.viewer);
    const dx=this.origin[0]-this.viewer[0],dz=this.origin[2]-this.viewer[2],len=Math.hypot(dx,dz);
    this.forward=[dx/len,0,dz/len];this.target=this._worldTarget(0);
    return this._placementSuccess();
  }

  _worldTarget(side) {
    // Stay in a bounded patch beyond the placement point, never drift toward the start.
    return [this.origin[0]+this.forward[0]*.75-this.forward[2]*side,this.origin[1],this.origin[2]+this.forward[2]*.75+this.forward[0]*side];
  }

  _worldFrame(reality,time) {
    if(this.phase==='capturing')return;
    const valid=reality?.trackingStatus==='NORMAL' && reality.trackingReason!=='INITIALIZING' && validPoint(reality.position) && validPoint(reality.rotation) && Number.isFinite(reality.rotation.w) && reality.intrinsics?.length===16 && Array.from(reality.intrinsics).every(Number.isFinite);
    if(!valid){
      this.worldGate.update(null,null,time,false);this.floorSince=null;this.placement=null;this.primary.disabled=true;
      this.stage.classList.remove('is-capture-ready');this.renderer?.show({});this.renderer?.render(0);
      if(!this.worldGate.initial && this.origin)this._resetWorldPlacement();
      if(this.phase==='capture-ready')this._state('chasing','床をゆっくり写してね');
      else if(this.phase==='placing')this._state('placing','床を写してください。スマホをゆっくり左右に動かしてね');
      return;
    }
    const dt=this.worldFrameAt?Math.min((time-this.worldFrameAt)/1000,.05):0;
    this.worldFrameAt=time;this.viewer=[reality.position.x,reality.position.y,reality.position.z];
    this.renderer.trackedCamera(reality.position,reality.rotation,reality.intrinsics,this.feed.width,this.feed.height);
    if(!this.origin){
      // Accept tracked points near the estimated ground plane, never a screen-space guess.
      const hits=this.worldEngine.XrController.hitTest(.5,.62,['FEATURE_POINT']);
      const hit=hits.find(h=>validPoint(h.position)&&['FEATURE_POINT','DETECTED_SURFACE','ESTIMATED_SURFACE'].includes(h.type)&&Math.abs(h.position.y)<.2&&this.viewer[1]-h.position.y>.3&&Math.hypot(h.position.x-this.viewer[0],h.position.z-this.viewer[2])>=1.5&&Math.hypot(h.position.x-this.viewer[0],h.position.z-this.viewer[2])<=3.5);
      const next=hit?[hit.position.x,hit.position.y,hit.position.z]:null;
      if(!next||!this.placement||planarDistance(next,this.placement)>.25)this.floorSince=next?time:null;
      this.placement=next;this.primary.disabled=!next||time-this.floorSince<600;
      this._state('placing',!next?'床を写してください。少し先の床をゆっくり見渡してね':this.primary.disabled?'床の位置を確認しているよ':'ここから鶴を追いかけよう');
    }else{
      this.worldGate.update(this.viewer,this.position,time,true);
      if(!this.worldGate.initial){this._resetWorldPlacement();return;}
      if(this.phase==='chasing'||this.phase==='capture-ready'){
        const near=this.worldGate.near;
        if(this.worldGate.canCapture(time))this._readyToCapture();
        else if(this.phase==='capture-ready'){this.stage.classList.remove('is-capture-ready');this._state('chasing','鶴のところまで歩いて近づこう');}
        if(!near){
          this.elapsed+=dt;
          if(this.elapsed>=this.nextTurn){this.moves++;this.target=this._worldTarget((this.moves%2?1:-1)*.45);this.nextTurn=this.elapsed+2;}
          const gap=planarDistance(this.position,this.target),step=Math.min(gap,.4*dt);
          if(gap>.001){this.position[0]+=(this.target[0]-this.position[0])/gap*step;this.position[2]+=(this.target[2]-this.position[2])/gap*step;}
        }
      }
    }
    this.renderer.show({reticle:!this.origin?this.placement:null,animals:!!this.origin});
    if(this.origin)this.kinds.forEach((kind,index)=>{
      const at=[this.position[0]+index*.15,this.position[1],this.position[2]];
      const running=this.phase==='chasing'&&!this.worldGate.near;
      const angle=running?Math.atan2(this.target[0]-at[0],this.target[2]-at[2]):Math.atan2(this.viewer[0]-at[0],this.viewer[2]-at[2]);
      this.renderer.place(index,at,angle,running);
    });
    this.renderer.render(dt);
  }

  _prepareDemoPlacement() {
    this.demoFrom = [0, -.03]; this.demoTarget = [0, -.03]; this.elapsed = 0; this.lastFrame = 0;
    this.primary.hidden = false; this.primary.disabled = false; this.primary.textContent = 'ここで決定';

    this._state('placing', '床を写してください');
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
    this.primary.hidden = true;
    this._state('chasing', '鶴のところまで歩いて近づこう');
    this._startAlarm();
  }

  _demoFrame(time) {
    if (!this.active || this.mode === 'ar') return;
    this.animationFrame = requestAnimationFrame(t => this._demoFrame(t));
    // Cap visual animation steps after a slow frame; no elapsed-time capture gate.
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
        // Alternate lateral feints while depth only increases: the animal flees away.
        const side = segment % 2 === 0 ? 1 : -1;
        this.demoTarget = [side * (.65 + Math.random() * .5), 0];
        if (segment % 3 === 2) this._emote('escape');
      }
      // Waiting never unlocks capture.
    }
    const running = this.phase === 'chasing';
    const progress = Math.min(1, (this.elapsed % LIMITS.demoTurnSeconds) / LIMITS.demoTurnSeconds);
    const ease = progress * progress * (3 - 2 * progress);
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    // A virtual ground plane: perspective shrinks both the animal and lateral motion.
    // This is animation only; camera mode does not measure the user's real position.
    const depth = 2.2 + 3.8 * (1 - Math.exp(-this.elapsed / 10));
    const perspective = 2.2 / depth;
    const from = this.demoFrom || [0, 0], target = this.demoTarget || [0, 0];
    const worldX = from[0] + (target[0] - from[0]) * ease;
    const x = worldX / depth * width * .72;
    const y = -.25 * (1 - perspective) * height;
    const heading = running ? Math.PI - Math.sign(target[0] - from[0]) * .55 : Math.PI;
    this.creatures.forEach((element, index) => {
      const view = this.views[index];
      if (view) { view.play(running ? 'run' : 'idle'); view.setHeading(heading); }
      const offset = index ? (index === 1 ? -1 : 1) * Math.min(width * .2, 90) * perspective : 0;
      const edge = Math.max(0, width / 2 - (element.clientWidth || 155) * perspective / 2 - 16);
      const jump = view || this._reduced || !running ? 0 : Math.abs(Math.sin(this.elapsed * 9 + index)) * 14 * perspective;
      const tilt = view || this._reduced || !running ? 0 : Math.sin(this.elapsed * 7 + index) * 5;
      element.style.transform = `translate(calc(-50% + ${clamp(x + offset, -edge, edge)}px),calc(-50% + ${y + (index ? 16 * perspective : 0) - jump}px)) rotate(${tilt}deg) scale(${perspective.toFixed(3)})`;
    });

  }

  _tapTrackedAnimal(event) {
    // Camera capture is bound to each projected animal. No whole-screen capture target.
    if (this.mode === 'demo' || (this.mode === 'ar' && !this._isNear())) return;
    const r=this.canvas.getBoundingClientRect();
    if (this.renderer?.hitAnimal?.((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2)) this.capture();
  }

  _surrender() {
    this.dwell = 0; this.primary.hidden = false; this.primary.disabled = this.mode === 'ar'; this.primary.textContent = this.mode === 'ar' ? '近づいて、つかまえる' : '近づく（デモ）';
    this.stage?.classList?.remove('is-capture-ready');
    this.creatures.forEach(element => element.classList.add('is-surrendered'));
    this._emote('surrender');
    this._state('surrendered', this.mode === 'ar' ? '近づいて、タップでつかまえよう' : 'つかまえて、の合図！');
    // Only a tracked approach can enable capture.
  }

  _emote(role) {
    this.views?.forEach(view => view?.emote(role));
    if (this.mode !== 'demo') this.renderer?.emote(role);
  }

  advanceDemo() {
    // Camera/demo never infer physical proximity from image size or a timer.
    if (!this.active || this.paused || this.mode === 'ar' || this.phase !== 'surrendered' || this.captured) return false;
    return false;
  }

  _readyToCapture() {
    this.primary.hidden = true; this.primary.disabled = true;
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
    if (this.mode === 'demo') return false;
    if (this.mode === 'camera' && !this.worldGate?.canCapture(performance.now())) return false;
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
    if (this.mode === 'camera') {this._resetWorldPlacement();return;}
    if (this.mode === 'ar') {
      this.origin = null; this.placement = null; this.initialViewer = null; this.target = null; this.savedPhase = null; this.trackingPhase = null;
      // Reset is a user gesture and must leave a paused XR session usable.
      // Otherwise the placement button remains disabled behind paused=true.
      this.paused = false; this.audio?.resume().catch(() => {});
      this.primary.hidden = false; this.primary.disabled = true; this.primary.textContent = 'ここで決定';
      this._state('placing', '3m四方を空けて、2m先の床を映そう');
    } else if (this.paused) { this.savedPhase = 'placing'; void this._resume(); }
    else { this.audio?.resume().catch(() => {}); this._prepareDemoPlacement(); }
    this._startAlarm();
  }

  _pause(message) {
    if (this.paused || !this.active) return;
    this.paused = true; this.savedPhase = this.mode === 'camera' ? 'placing' : this.phase === 'tracking-lost' ? this.trackingPhase || (this.origin ? 'chasing' : 'placing') : this.phase; this.lastFrame = 0; this.dwell = 0;
    if (['capture-ready', 'capturing'].includes(this.savedPhase)) this.savedPhase = 'surrendered';
    clearTimeout(this.placementTimer); clearTimeout(this.captureTimer); this.captured = false;
    if (this.feedback) this.feedback.hidden = true;
    this.stage?.classList?.remove('is-capture-ready', 'is-capturing');
    if (this.muteButton) this.muteButton.disabled = false;
    if (this.mode === 'camera') {this.worldEngine?.pause();this._resetWorldPlacement();this.savedPhase='placing';}
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
      if (this.mode === 'camera') {this.worldEngine?.XrController.recenter();this.worldEngine?.resume();}
      if (token !== this.token || !this.active) return;
      this.paused = false; this.lastFrame = 0; const phase = this.savedPhase || 'chasing';
      if (phase === 'surrendered') { this._surrender(); this._startAlarm(); }
      else if (phase === 'placed') { this._state('placed', '準備できた！'); this._placementSuccess(); }
      else if (phase === 'placing') { if (this.mode === 'ar') this.reset(); else if(this.mode==='camera')this._resetWorldPlacement();else this._prepareDemoPlacement(); }
      else { this.primary.hidden = this.mode === 'ar'; this.primary.disabled = true; this.primary.textContent = '追いかけっこ中'; this._state('chasing', '逃げた！追いかけよう'); }
    } catch (cause) {
      if (token !== this.token) return;
      this.worldEngine?.pause(); this.audio?.suspend().catch(() => {});
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

  async stop() {
    this.active = false; this.token++; this.resuming = false;
    clearTimeout(this.placementTimer); clearTimeout(this.captureTimer);
    this._cancelCameraStart?.();
    clearInterval(this.alarmTimer); cancelAnimationFrame(this.animationFrame);
    document.removeEventListener('visibilitychange', this._visibility); window.removeEventListener('pagehide', this._pagehide);
    this.cancelWorldStart?.();clearTimeout(this.worldStartTimer);this.worldResize?.disconnect();
    if(this.worldEngine){this.worldEngine.stop();this.worldEngine.clearCameraPipelineModules();this.worldEngine=null;}
    this.worldGate?.reset();
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
    if (cause?.name === 'NotFoundError') return error('no-camera', 'カメラが見つかりません。カメラのあるスマホで開いてね。');
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
    this._xrSelected = event => {
      if(!this.reference || !this._isNear())return;
      const pose=event.frame.getPose(event.inputSource.targetRaySpace,this.reference);
      if(pose && this.renderer?.hitRay(pose.transform.position,pose.transform.orientation))this.capture();
    };
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

  _randomTarget(awayFromViewer = true) {
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
      const near = this._isNear();
      this.dwell = near ? this.dwell + dt : 0;
      if (this.dwell >= LIMITS.dwellSeconds) this._readyToCapture();
      if (!near && this.elapsed >= this.nextTurn) {
        this.target = this._randomTarget(); this.nextTurn = this.elapsed + LIMITS.turnSeconds;
      }
      const remaining = planarDistance(this.position, this.target), step = Math.min(remaining, LIMITS.speed * dt);
      if (remaining > .001) { this.position[0] += (this.target[0] - this.position[0]) / remaining * step; this.position[2] += (this.target[2] - this.position[2]) / remaining * step; }

    } else if (this.phase === 'surrendered' || this.phase === 'capture-ready') {
      // Distance is from the real XR device to the rendered animal's centre.
      // The horizontal bound additionally requires approach to its floor point.
      const capturePoint = [this.position[0], this.position[1] + .14, this.position[2]];
      const gap = distance(this.viewer, capturePoint);
      const near = this._isNear();
      this.dwell = near ? Math.min(LIMITS.dwellSeconds, this.dwell + dt) : 0;

      if (!near && this.phase === 'capture-ready') { this.stage.classList.remove('is-capture-ready'); this._state('chasing','鶴のところまで歩いて近づこう'); }
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

const validPoint=p=>Boolean(p&&[p.x,p.y,p.z].every(Number.isFinite));

// Shared production gate: elapsed chase time, turns and taps never substitute for translation.
export class WorldApproachGate {
  constructor(){this.reset();}
  reset(){this.initial=null;this.previous=null;this.last=0;this.near=false;this.nearSince=null;this.lostSince=null;}
  begin(viewer){this.reset();this.initial=[...viewer];}
  update(viewer,animal,now,tracking){
    if(!tracking||!viewer||!animal||![...viewer,...animal].every(Number.isFinite)){
      this.near=false;this.nearSince=null;
      if(this.lostSince===null)this.lostSince=now;
      if(now-this.lostSince>1500)this.reset();return;
    }
    if(this.previous && (now-this.last>1500 || distance(viewer,this.previous)>.25+Math.max(0,now-this.last)/1000*2.5)){this.reset();return;}
    this.lostSince=null;this.last=now;this.previous=[...viewer];
    this.near=!!this.initial&&planarDistance(viewer,this.initial)>=1.2&&planarDistance(viewer,animal)<=.65&&Math.abs(viewer[1]-animal[1])<=2.2;
    if(this.near){if(this.nearSince===null)this.nearSince=now;}else this.nearSince=null;
  }
  canCapture(now){return !!this.initial&&this.near&&now-this.last<250&&this.nearSince!==null&&now-this.nearSince>=650;}
}

let worldEnginePromise;
export function loadWorldEngine() {
  if(window.XR8)return Promise.resolve(window.XR8);
  if(worldEnginePromise)return worldEnginePromise;
  worldEnginePromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    // Unmodified 8th Wall engine, including its embedded copyright/license notice.
    // License: https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1.0.0/LICENSE
    script.src='https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1.0.0/dist/xr.js';
    script.async=true;script.crossOrigin='anonymous';script.dataset.preloadChunks='slam';
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('xrloaded',loaded);};
    const fail=()=>{cleanup();script.remove();worldEnginePromise=null;reject(error('world-load','ARを読み込めなかったよ。通信を確認して、もう一度ためしてね。'));};
    const loaded=()=>{if(window.XR8){cleanup();resolve(window.XR8);}};
    const timer=setTimeout(fail,30000);script.onerror=fail;script.onload=loaded;
    window.addEventListener('xrloaded',loaded);document.head.append(script);
  });
  return worldEnginePromise;
}
