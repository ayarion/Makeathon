const KEY = 'orito.morning.v1';
export const ANIMALS = ['fox', 'crane', 'rabbit'];
export const ANIMAL_NAMES = { fox: 'きつね', crane: 'つる', rabbit: 'うさぎ' };
const COLORS = ['peach', 'blue', 'sage', 'orange', 'purple'];
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const uniqueIds = values => new Set(values.map(value => value.id)).size === values.length;
const invalidData = () => new Error('保存したデータを読み込めなかったよ');

function identifier() {
  // getRandomValues remains available in WKWebView custom-scheme origins,
  // where randomUUID may be absent because the context is not considered HTTPS.
  const secure = globalThis.crypto;
  if (typeof secure?.randomUUID === 'function') return secure.randomUUID();
  if (typeof secure?.getRandomValues !== 'function') throw new Error('折り紙を保存する準備ができなかったよ');
  const bytes = secure.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function initialState() {
  return { version: 1, tasks: [], captures: [], alarm: { time: '07:00', enabled: false, volume: .35 }, sessions: 0, lastMultiple: false };
}

export function loadState(storage = localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return initialState();
  let state;
  try { state = JSON.parse(raw); } catch { throw invalidData(); }
  if (!state || state.version !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.captures)) throw invalidData();
  const alarm = state.alarm;
  if (!alarm || !validTime(alarm.time) || typeof alarm.enabled !== 'boolean' || !Number.isFinite(alarm.volume) || alarm.volume < 0 || alarm.volume > 1) throw invalidData();
  if (alarm.nextAt != null && !validDate(alarm.nextAt)) throw invalidData();
  if (state.tasks.some(task => !task || !validId(task.id) || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 120 || typeof task.done !== 'boolean' || !ANIMALS.includes(task.animal) || !COLORS.includes(task.color) || !validDate(task.createdAt) || !validDate(task.updatedAt)) || !uniqueIds(state.tasks)) throw invalidData();
  if (state.captures.some(capture => !capture || !validId(capture.id) || !validId(capture.taskId) || typeof capture.text !== 'string' || !capture.text.trim() || !ANIMALS.includes(capture.animal) || !COLORS.includes(capture.color) || !validDate(capture.capturedAt)) || !uniqueIds(state.captures)) throw invalidData();
  if (state.sessions != null && (!Number.isSafeInteger(state.sessions) || state.sessions < 0)) throw invalidData();
  if (state.lastMultiple != null && typeof state.lastMultiple !== 'boolean') throw invalidData();
  // Pin a missing legacy schedule once. Recomputing it every timer tick would
  // continually move its due time into the future, so that it could never ring.
  return { ...state, sessions: state.sessions ?? 0, lastMultiple: state.lastMultiple ?? false, alarm: { ...alarm, nextAt: alarm.nextAt ?? (alarm.enabled ? nextAlarm(alarm.time).toISOString() : null) } };
}

export function saveState(next, storage = localStorage) {
  const value = JSON.stringify(next);
  storage.setItem(KEY, value);
  if (storage.getItem(KEY) !== value) throw new Error('保存を確認できなかったよ');
  return next;
}

export function createTask(text, color, index) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new Error('折り紙に、ひとつ書いてみて');
  if (clean.length > 120) throw new Error('120文字までで書いてね');
  const slot = Number.isFinite(index) ? Math.trunc(index) : 0;
  const animal = ANIMALS[((slot % ANIMALS.length) + ANIMALS.length) % ANIMALS.length];
  const now = new Date().toISOString();
  return { id: identifier(), text: clean, color: COLORS.includes(color) ? color : COLORS[0], animal, done: false, createdAt: now, updatedAt: now };
}

export function addCapture(state, ids, multiple) {
  const now = new Date().toISOString();
  const captures = [...new Set(ids)].map(id => state.tasks.find(task => task.id === id)).filter(Boolean).map(task => ({ id: identifier(), taskId: task.id, text: task.text, animal: task.animal, color: task.color, capturedAt: now }));
  if (!captures.length) throw new Error('捕まえる折り紙が見つからなかったよ');
  // Capture history is deliberately separate from each task's done field.
  return { ...state, captures: [...state.captures, ...captures], sessions: state.sessions + 1, lastMultiple: Boolean(multiple && captures.length > 1) };
}

export function nextAlarm(time, now = new Date()) {
  if (!validTime(time) || !Number.isFinite(now.getTime())) throw new Error('起きるじかんを選びなおしてね');
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}
