import { openMarkerPrint } from './ar-engine.js';
import { upgradeImage, mountAnimal } from './origami3d.ts';
import { SHEET_PHASE } from '../origami/engine.ts';

const dialog = document.createElement('dialog');
dialog.className = 'story-dialog';
dialog.setAttribute('aria-label', 'はじめの朝');
document.body.append(dialog);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const safe = text => { const element = document.createElement('span'); element.textContent = text; return element.innerHTML; };
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></svg>';
let cleanUp = () => {};
const surfaceHistory=new WeakMap();
export function openFullPage(surface) {
  const modals=[...document.querySelectorAll('dialog:modal')].filter(other=>other!==surface);
  surfaceHistory.set(surface,{focus:document.activeElement,modals});
  document.querySelectorAll('dialog[open]').forEach(other => { if(other !== surface) other.close(); });
  surface.show();
  surface.setAttribute('aria-modal','true');
  document.querySelector('.app-shell')?.setAttribute('inert','');
  surface.querySelector('button:not([disabled])')?.focus({preventScroll:true});
}
export function closeFullPage(surface) {
  if(!surface.open)return;
  surface.close();
  document.querySelector('.app-shell')?.removeAttribute('inert');
  const previous=surfaceHistory.get(surface);surfaceHistory.delete(surface);
  previous?.modals.forEach(modal=>{if(modal.isConnected&&!modal.open)modal.showModal();});
  if(previous?.focus?.isConnected)previous.focus.focus({preventScroll:true});
}
// Non-modal dialogs need an explicit Escape and keyboard focus boundary.
document.addEventListener('keydown', event => {
  const surface=document.querySelector('.story-dialog[open],.experience-dialog[open]');
  if(!surface)return;
  if(event.key==='Escape'){event.preventDefault();surface.dispatchEvent(new Event('cancel',{cancelable:true}));}
  if(event.key==='Tab'){
    const items=[...surface.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey && (document.activeElement===first || !surface.contains(document.activeElement))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && (document.activeElement===last || !surface.contains(document.activeElement))){event.preventDefault();first?.focus();}
  }
});
function mount(content, label) {
  cleanUp();
  dialog.innerHTML = content;
  dialog.setAttribute('aria-label', label);
  if (!dialog.open) openFullPage(dialog);
}
export function closeStory() { cleanUp(); cleanUp = () => {}; dialog.classList.remove('from-title'); if(dialog.open) closeFullPage(dialog); }
const KATAKANA = { crane: 'ツル', rabbit: 'ウサギ', fox: 'キツネ' };

export function showPcNotice() {
  const url = 'https://manual-trend-29876845.figma.site/?experience=1#alarm';
  mount(`<section class="pc-notice"><div class="pc-card">
    <button type="button" class="pc-close" aria-label="QRコードを閉じる">×</button>
    <h1>スマホでアラームを体験</h1>
    <p>スマホのカメラで読み取ってね。</p>
    <img class="pc-qr" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZoAAAGaAQAAAAAefbjOAAADJUlEQVR4nO1cbY6jMAx1AKk/QeoBepTsDfZIe6begBxlDlAJflZK5ZU/Ap2VVlq21XRo3vuRoQWrYKzn58SZwLQZqdluQwQjBxzhgCMccIQDjnDAEQ44Yk+OCI6OiOaOQhhELgy3YAPN5YIfL7m9jYDRI47o7E8cZZyPRNRfNQSI4kQcqG9Fe7ZZLwsP/FIDo105YnYCMHqg3iLA4CeUQV50e5sAoydwxIo4Emvq4CSMEM9dZprvLoDLK4uIFNpM6WfuKPKtY6Jr4J09UwOjJ0REL69dqCCOIiWpE83Qsg3xTEIcC+Dy93dE0kpCJcR8YIpTK4MEiAxENys1XnV72wCjxzmC778SjtCCQ5BOuTDICrj8jR1BLCCngpZ5JCs3bWDmvBCFfmTm8Zs/UwOjxyOC+ixHXnP6m+dMPOqJichCJSIiauEIlrevzCBTEfqRJ6cMHnunEXBELRHBlhyMFOSTikolj5Ir7GpwRC0RMeqLV7mwcIR/VzjCEwt0RD0cwYuOsOrTj+QSCwsNFUREJWufg65cHIwUtAS1ozToIBfJzPa4n2faCBj9mTUEkheUCkjFxJI67Cyqz+pqDTZ60CJT88eqIzxhIGtUFBHscXAXDOv0BOYj6puholVKOkd4rVHmrzAfUVutwYUjpvVE/qQtVtHxzZ+pgdFzdASt2vFuZtvmqlxtQkdUFHutCMirtNrq4vjSg3sSjpilLP1AV91eX+5/rn2yCsiVFERRlOrTVQayRkU9VLnTNoigR2m4ENOsnRKXwDbMx7yPZ2pg9CQdEYuoXHuxfa1D4LUplGUtPVSt5AXhCG+p0qnsLsRzm4Ps5gg0H6Xt8mtvr4HRq/d0sVeaupPrwJROuqFHA+cWsK5R1Zwl6yy2zV4uR4qlUwJZo64+y1jWwEtDXYkSA/oj6jSKygfzgcOvD0kkmjW0Y6bs99vfM/0LYPS3PV2kRWZ/DZxOTCIqZQdPWNSmAN6raE8Xy6AlRdBMkoZLx2los+zuwnxETWufitIa4YrC+yP0lPfpYz7i3Y0C/jPZLt5TAyMDHOGAIxxwhAOOcMARjq9zxG/uMIZmaKj0ewAAAABJRU5ErkJggg==" width="232" height="232" alt="スマホでアラーム体験を開くQRコード">
    <a class="pc-url" href="${url}" target="_blank" rel="noopener">スマホ用のリンクを開く</a>
    <button type="button" class="pc-continue">アラーム設定に戻る</button>
  </div></section>`, 'スマホでアラームを体験');
  const cancel = event => { event.preventDefault(); closeStory(); };
  dialog.addEventListener('cancel', cancel);
  cleanUp = () => dialog.removeEventListener('cancel', cancel);
  dialog.querySelector('.pc-close').onclick = closeStory;
  dialog.querySelector('.pc-continue').onclick = closeStory;
}

export function showOnboarding({ onStart, onInteract, onExit, isNative, color, animal = 'crane', fromTitle = false }) {
  const name = KATAKANA[animal] || 'ツル';
  mount(`<section class="alarm-story">
    <div class="story-scene" aria-hidden="true"><img class="intro-landscape" src="assets/landscape-morning.svg" alt=""><div class="alarm-orbit orbit-one"></div><div class="alarm-orbit orbit-two"></div><div class="intro-crane"><img src="assets/animal-crane.svg" alt=""></div><span class="paper-spark spark-one">✧</span><span class="paper-spark spark-two">✧</span></div>
    <header class="intro-top"><span class="intro-brand">折りGO</span><button type="button" class="story-close" aria-label="体験をやめる">×</button></header>
    <div class="intro-copy"><div class="alarm-stamp"><span class="alarm-dot"></span>緊急！</div><h1>${name}が現れました</h1><p>つかまえてアラームを止めよう</p></div>
    <footer class="intro-actions">${!isNative?'<p class="marker-instruction">印刷したマーカーを、2mほど先の床に置いてね。</p><button type="button" class="marker-print">印刷用マーカーを開く</button>':''}<button type="button" class="intro-primary">つかまえる <span aria-hidden="true">→</span></button>${isNative ? '' : '<span class="intro-mode">ブラウザで体験</span>'}</footer>
  </section>`, `緊急！${name}が現れました。つかまえてアラームを止めよう`);
  dialog.classList.toggle('from-title', fromTitle);
  // The crane that is about to run away, flapping in place.
  upgradeImage(dialog.querySelector('.intro-crane'), { kind: animal, paper: color, loop: 'run', heading: -.35, zoom: 1.12 });
  dialog.querySelector('.marker-print')?.addEventListener('click',()=>{if(!openMarkerPrint())dialog.querySelector('.marker-instruction').textContent='ポップアップを許可して、もう一度押してね。';});
  const start = dialog.querySelector('.intro-primary');
  const interact = () => onInteract?.();
  dialog.addEventListener('pointerdown', interact);
  dialog.addEventListener('keydown', interact);
  start.onclick = async () => {
    start.disabled = true;
    try { await onStart(); } finally { if (start.isConnected) start.disabled = false; }
  };
  const exit = () => { closeStory(); onExit?.(); };
  dialog.querySelector('.story-close').onclick = exit;
  const cancel = event => { event.preventDefault(); exit(); };
  dialog.addEventListener('cancel', cancel);
  cleanUp = () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('pointerdown', interact); dialog.removeEventListener('keydown', interact); };
}

export function showPaperOpening(capture, { onDone }) {
  let step = 0, queued = 0, locked = false, pointer = null, timer = null, live = true;
  mount(`<section class="opening-story" data-step="0">
    <header class="opening-top"><span class="intro-brand">折りGO</span><button type="button" class="story-close" aria-label="開封を閉じる">×</button></header>
    <div class="opening-heading"><span class="chapter">朝の、お届けもの</span><h1>ひと折りずつ、ひらこう。</h1></div>
    <div class="opening-stage"><button type="button" class="unfold-surface" aria-label="好きな方向にスワイプして開く。1回目"><span class="unfold-shadow"></span><img class="folded-crane" draggable="false" style="pointer-events:none;-webkit-user-drag:none" src="assets/animal-${capture.animal}.svg" alt="折り紙"><span class="unfold-paper" aria-hidden="true"><span class="paper-center"></span><span class="paper-wing wing-left"></span><span class="paper-wing wing-right"></span><span class="paper-wing wing-top"></span><span class="paper-wing wing-bottom"></span><span class="paper-crease crease-one"></span><span class="paper-crease crease-two"></span></span></button><article class="revealed-note" hidden><span class="note-label">${capture.sample ? 'おためしのタスク' : '昨晩のタスク'}</span><p>${safe(capture.text)}</p><span class="note-crane" aria-hidden="true">✧</span></article></div>
    <footer class="opening-bottom"><div class="swipe-instruction">${arrow}<p>好きな方向にスワイプ</p></div><div class="fold-progress" role="status" aria-live="polite" aria-label="3回のうち0回ひらいた"><i></i><i></i><i></i></div><button type="button" class="unfold-fallback">ボタンでひと折りひらく</button><div class="opening-complete" hidden><button type="button" class="intro-primary opening-done">今日をはじめる <span aria-hidden="true">→</span></button></div></footer>
  </section>`, '折り紙を3回のスワイプでひらく');
  const root = dialog.querySelector('.opening-story');
  const surface = dialog.querySelector('.unfold-surface');
  // Three.js origami: each swipe undoes one stage of the fold until the written sheet lies flat.
  // Without WebGL the CSS paper wings below stay in place.
  const holder = document.createElement('span');
  holder.className = 'opening-origami';
  surface.prepend(holder);
  const origami = mountAnimal(holder, { kind: capture.animal, paper: capture.color, text: capture.text, mode: 'auto', zoom: 1.05 });
  if (origami) root.classList.add('has-origami'); else holder.remove();
  const unfoldSteps = [1, SHEET_PHASE, SHEET_PHASE * .44, 0];
  const progress = dialog.querySelector('.fold-progress');
  const gestureArea = dialog.querySelector('.opening-stage');
  gestureArea.style.touchAction = 'none';
  gestureArea.style.userSelect = 'none';
  surface.style.setProperty('-webkit-user-drag', 'none');
  surface.querySelectorAll('*').forEach(el => el.style.pointerEvents = 'none');
  const advance = () => {
    if (!live || step >= 3) return;
    if (locked) { queued = Math.min(queued + 1, 3 - step); return; }
    locked = true; step++;
    root.dataset.step = String(step);
    origami?.unfoldTo(unfoldSteps[step], step === 1 ? .74 : .62);
    navigator.vibrate?.(18);
    progress.setAttribute('aria-label', `3回のうち${step}回ひらいた`);
    [...progress.children].forEach((dot, index) => dot.classList.toggle('done', index < step));
    surface.setAttribute('aria-label', step === 3 ? '折り紙がひらいた' : `好きな方向にスワイプして開く。${step + 1}回目`);
    dialog.querySelector('.swipe-instruction p').textContent = ['好きな方向にスワイプ', 'もうひと折り', 'あとひと折り', 'ひらいた！'][step];
    timer = setTimeout(() => {
      if (!live) return;
      locked = false;
      if (step === 3) {
        surface.hidden = true;
        dialog.querySelector('.revealed-note').hidden = false;
        dialog.querySelector('.opening-heading h1').textContent = 'おはよう。今日の、1枚。';
        dialog.querySelector('.swipe-instruction').hidden = true;
        dialog.querySelector('.unfold-fallback').hidden = true;
        dialog.querySelector('.opening-complete').hidden = false;
        dialog.querySelector('.opening-done').focus({ preventScroll: true });
      } else if (queued > 0) { queued--; advance(); }
    }, reduced() ? 20 : origami && step === 3 ? 1500 : 760); // let the flat, written sheet read before the note
  };
  const clearPull = () => {
    pointer = null;
    origami?.setHeading(0);
    surface.style.setProperty('--pull', '0');
    surface.style.translate = '0px 0px';
  };
  gestureArea.addEventListener('dragstart', event => event.preventDefault());
  gestureArea.addEventListener('pointerdown', event => {
    if (step + queued >= 3 || pointer || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { gestureArea.setPointerCapture(event.pointerId); } catch { /* The release inside the stage still works. */ }
  });
  gestureArea.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    surface.style.setProperty('--pull', String(Math.min(1, Math.hypot(dx, dy) / 100)));
    origami?.setHeading(Math.max(-.6, Math.min(.6, dx / 160)));
    surface.style.translate = `${Math.max(-35, Math.min(35, dx * .25))}px ${Math.max(-35, Math.min(35, dy * .25))}px`;
  });
  gestureArea.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    clearPull();
    if (gestureArea.hasPointerCapture?.(event.pointerId)) gestureArea.releasePointerCapture(event.pointerId);
    if (distance >= 36) advance();
  });
  gestureArea.addEventListener('pointercancel', clearPull);
  gestureArea.addEventListener('lostpointercapture', clearPull);
  surface.addEventListener('keydown', event => { if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); advance(); } });
  dialog.querySelector('.unfold-fallback').onclick = advance;
  const done = () => { closeStory(); onDone(); };
  dialog.querySelector('.opening-done').onclick = done;
  dialog.querySelector('.story-close').onclick = done;
  const cancel = event => { event.preventDefault(); done(); };
  dialog.addEventListener('cancel', cancel);
  cleanUp = () => { live = false; clearTimeout(timer); dialog.removeEventListener('cancel', cancel); };
}
