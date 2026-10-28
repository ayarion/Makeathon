// Contextual help only: the app's real controls own every action and transition.
export function startGuidedTutorial() {
  const $ = selector => document.querySelector(selector);
  const editor = $('#note-dialog');
  const alarm = $('#alarm-dialog');
  const text = $('#task-text');
  const tip = document.createElement('div');
  tip.className = 'tutorial-tip';
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-live', 'polite');
  tip.setAttribute('aria-atomic', 'true');
  const spotlight = document.createElement('div');
  spotlight.className = 'tutorial-spotlight';
  spotlight.setAttribute('popover', 'manual');
  const shade = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  shade.setAttribute('aria-hidden', 'true');
  shade.innerHTML = '<path fill="rgba(26,20,17,.72)" fill-rule="evenodd"/><rect fill="none" stroke="#fff2c7" stroke-width="3" rx="12"/>';
  spotlight.append(shade, tip);
  document.body.append(spotlight);
  const abort = new AbortController();
  const { signal } = abort;
  let stage = 'note', target = null, previousDescription = null, frame = 0, revealTimer;
  const steps = {
    note: ['#open-note', '01 / 04', 'ここを押して、明日の手紙を書こう。'],
    write: ['#task-text', '01 / 04', '明日やることを、ひとつ入力してね。'],
    fold: ['#save-task', '02 / 04', '書けたら、このボタンで折り紙にしよう。'],
    alarmLink: ['.nav-item[data-page="alarm"]', '03 / 04', '次は、ここからアラームを設定しよう。'],
    alarm: ['.alarm-time-row', '03 / 04', '起きる時刻を選んで、スイッチをオンにしよう。'],
    demo: ['#start-morning', '04 / 04', '最後に、実際のアラームを体験してみよう。途中でやめても大丈夫。'],
  };

  function position() {
    if (!target || !target.isConnected || tip.hidden) return;
    const rect = target.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const x1 = Math.max(left + 4, rect.left - 8), y1 = Math.max(top + 4, rect.top - 8);
    const x2 = Math.min(left + width - 4, rect.right + 8), y2 = Math.min(top + height - 4, rect.bottom + 8);
    shade.setAttribute('viewBox', '0 0 ' + innerWidth + ' ' + innerHeight);
    shade.querySelector('path').setAttribute('d', 'M0 0H' + innerWidth + 'V' + innerHeight + 'H0Z M' + x1 + ' ' + y1 + 'H' + x2 + 'V' + y2 + 'H' + x1 + 'Z');
    const ring = shade.querySelector('rect');
    for (const [key, value] of Object.entries({x:x1, y:y1, width:Math.max(0,x2-x1), height:Math.max(0,y2-y1)})) ring.setAttribute(key, value);
    tip.style.width = `${Math.min(292, width - 32)}px`;
    const bounds = tip.getBoundingClientRect();
    const x = Math.max(left + 16, Math.min(rect.left + rect.width / 2 - bounds.width / 2, left + width - bounds.width - 16));
    const above = rect.top - bounds.height - 14;
    const y = above >= top + 12 ? above : rect.bottom + 14;
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(top + 12, Math.min(y, top + height - bounds.height - 12))}px`;
  }
  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }
  function clearHighlight() {
    target?.classList.remove('tutorial-highlight');
    if (previousDescription) target?.setAttribute('aria-describedby', previousDescription);
    else target?.removeAttribute('aria-describedby');
    target = null;
    previousDescription = null;
  }
  function show(next = stage) {
    stage = next;
    clearHighlight();
    const [selector, count, copy] = steps[stage];
    target = $(selector);
    const surface = editor.open ? editor : alarm.open ? alarm : document.body;
    if (spotlight.matches(':popover-open')) spotlight.hidePopover();
    surface.append(spotlight);
    tip.hidden = !target || target.getClientRects().length === 0 ||
      (surface === editor && !editor.contains(target)) ||
      (surface === alarm && !alarm.contains(target));
    if (tip.hidden) { target = null; return; }
    spotlight.showPopover();
    tip.innerHTML = `<span class="tutorial-tip-count">${count}</span><p>${copy}</p>`;
    tip.id = 'tutorial-tip';
    target.classList.add('tutorial-highlight');
    previousDescription = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [previousDescription, tip.id].filter(Boolean).join(' '));
    position();
    // Reposition after the ordinary modal entrance animation, without moving focus.
    clearTimeout(revealTimer);
    revealTimer = setTimeout(schedulePosition, 600);
  }
  function finish() {
    clearHighlight();
    spotlight.remove();
    abort.abort();
    clearTimeout(revealTimer);
    cancelAnimationFrame(frame);
    try { localStorage.setItem('origo.tutorial.v2', '1'); } catch { /* Help remains available on a later visit. */ }
  }
  window.addEventListener('origo:note-open', () => show(text.value.trim() ? 'fold' : 'write'), { signal });
  window.addEventListener('origo:note-close', () => show('note'), { signal });
  text.addEventListener('input', () => {
    const next = text.value.trim() ? 'fold' : 'write';
    if (next !== stage) show(next);
  }, { signal });
  window.addEventListener('origo:task-folded', () => show('alarmLink'), { signal });
  window.addEventListener('origo:route', event => {
    if (event.detail === 'alarm') show('alarm');
    else if (event.detail === 'write') show(['alarm', 'demo', 'alarmLink'].includes(stage) ? 'alarmLink' : 'note');
    else { clearHighlight(); tip.hidden = true; if (spotlight.matches(':popover-open')) spotlight.hidePopover(); }
  }, { signal });
  window.addEventListener('origo:alarm-change', () => {
    if (alarm.open) show($('#alarm-toggle').getAttribute('aria-checked') === 'true' ? 'demo' : 'alarm');
  }, { signal });
  $('#start-morning').addEventListener('click', finish, { signal });
  window.addEventListener('resize', schedulePosition, { signal });
  document.addEventListener('scroll', schedulePosition, { capture: true, signal });
  window.visualViewport?.addEventListener('resize', schedulePosition, { signal });
  window.visualViewport?.addEventListener('scroll', schedulePosition, { signal });
  // Track modal animations, wrapping and keyboard movement while the guide is visible.
  let tracking = 0;
  function track() { position(); tracking = requestAnimationFrame(track); }
  signal.addEventListener('abort', () => cancelAnimationFrame(tracking), { once: true });
  tracking = requestAnimationFrame(track);
  revealTimer = setTimeout(() => show(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
}
