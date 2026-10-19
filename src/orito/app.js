import { initialState, loadState, saveState, createTask, addCapture, nextAlarm, ANIMAL_NAMES } from './store.js';
import { MorningExperience } from './ar-engine.js';
import { showOnboarding, closeStory, showPaperOpening, showPcNotice } from './onboarding.js';
import { portrait, playNightFold } from './origami3d.ts';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const paths = {
 home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
 paper:'M5 3h10l4 4v14H5V3Zm10 0v5h4M9 12h6M9 16h6',
 sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 book:'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0m0-15c4-3 8-2 10-1v16c-3-2-7-2-10 0V5Z',
 pencil:'m15 4 5 5M4 15 15 4a3.5 3.5 0 0 1 5 5L9 20l-6 1 1-6Z',
 check:'m5 12 4 4L19 6', fold:'m3 8 9-5 9 5-9 13L3 8Zm0 0 9 5 9-5M12 3v18',
 arrow:'M4 12h15m-6-6 6 6-6 6', chevron:'m6 9 6 6 6-6',
 sound:'m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
 close:'m6 6 12 12M18 6 6 18', trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 more:'M5 12h.01M12 12h.01M19 12h.01', camera:'M8 5 6 8H2v12h20V8h-4l-2-3H8Zm8 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 play:'m8 4 13 8-13 8V4Z', moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.paper}"/></svg>`; }
function hydrateIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon)); }
function escape(text) { const d=document.createElement('div');d.textContent=text;return d.innerHTML; }
const colors={peach:'#FF7262',blue:'#1ABCFE',sage:'#0ACF83',orange:'#F24E1E',purple:'#A259FF'};
let state, storageProblem=false;
try { state=loadState(); } catch(e) { state=initialState();storageProblem=true; }
let editing=null, page='write', experience=null, session=null, toastTimer, savedTimer, busy=false, nativeActive=false, alarmAudio=null;
let introActive=false,introGeneration=0;
const native = !!window.webkit?.messageHandlers?.origamiAR;
hydrateIcons();
function toast(text,error=false) { clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.toggle('error',error);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500); }
function commit(next) { if(storageProblem) {toast('データを読み込めなかったよ。再読み込みしてね',true);return false;} try { saveState(next);state=next;return true;} catch(e) {toast('保存できなかったよ。もう一度ためしてね',true);return false;} }
function go(next,{focus=true}={}) { page=next; for(const el of $$('.page')) {el.hidden=el.id!==`page-${next}`;el.classList.toggle('active',!el.hidden);}for(const el of $$('.nav-item')){el.classList.toggle('active',el.dataset.page===next);if(el.dataset.page===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}$('#page-eyebrow').textContent={write:'夜のしたく',alarm:'朝の待ち合わせ',collection:'どうぶつの記録'}[next];history.replaceState(null,'',`#${next}`);window.scrollTo({top:0,behavior:'instant'});if(focus)$('#main').focus({preventScroll:true}); }
$$('.nav-item').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));
$('.brand').addEventListener('click',e=>{e.preventDefault();go('write');});
function renderTasks() {
 const past=[...state.captures].reverse();
 $('#task-count').textContent=`${past.length} まい`;
 if(!past.length){$('#task-list').innerHTML=`<div class="task-empty">${icon('paper')}<span>朝に捕まえた折り紙が、ここに並ぶよ。</span></div>`;return;}
 $('#task-list').innerHTML=`<div class="task-grid">${past.map(c=>`<button class="task-card past-card" data-past="${c.id}" style="--task-color:${colors[c.color]||colors.peach}" aria-label="${escape(c.text)}の折り紙を開く"><img class="task-animal" src="${portrait(c.animal,c.color)}" alt="${ANIMAL_NAMES[c.animal]}"><span class="task-copy">${escape(c.text)}<small>${new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric'}).format(new Date(c.capturedAt))}</small></span></button>`).join('')}</div>`;
 $('#task-list').querySelectorAll('[data-past]').forEach(b=>b.onclick=()=>showCapture(state.captures.find(c=>c.id===b.dataset.past)));
}
function renderAlarm() { $('#enable-alarm-sound').hidden=!state.alarm.enabled||alarmAudio?.state==='running'; $('#alarm-time').value=state.alarm.time;$('#volume').value=Math.max(.35,state.alarm.volume);$('#alarm-toggle').setAttribute('aria-checked',String(state.alarm.enabled));$('#alarm-toggle').setAttribute('aria-label',state.alarm.enabled?'アラームをオフにする':'アラームを有効にする');$('#alarm-status').textContent=state.alarm.enabled?`次は ${new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric'}).format(nextAlarm(state.alarm.time))} ${state.alarm.time}`:'アラームはおやすみ中'; }
const SAMPLE_CAPTURES=[{id:'sample-fox',animal:'fox',color:'sage',text:'キツネ(見本)',capturedAt:'2026-01-01T07:00:00.000Z',sample:true},{id:'sample-rabbit',animal:'rabbit',color:'purple',text:'ウサギ(見本)',capturedAt:'2026-01-01T07:00:00.000Z',sample:true}];
function renderCollection(){ const have=new Set(state.captures.map(c=>c.animal));const samples=SAMPLE_CAPTURES.filter(c=>!have.has(c.animal));const all=[...[...state.captures].reverse(),...samples];$('#collection-count').textContent=`${state.captures.length} 匹`;
 $('#collection-list').innerHTML=all.map(c=>`<button class="animal-card${c.sample?' is-sample':''}" data-capture="${c.id}" aria-label="${ANIMAL_NAMES[c.animal]}の折り紙を開く"><img src="${portrait(c.animal,c.color)}" alt=""><h2>${ANIMAL_NAMES[c.animal]}</h2><p>${c.sample?'見本・まだ出会っていないよ':new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric'}).format(new Date(c.capturedAt))+' の朝'}</p></button>`).join('');$('#collection-list').querySelectorAll('[data-capture]').forEach(b=>b.onclick=()=>showCapture(all.find(c=>c.id===b.dataset.capture))); }
function renderAll(){renderTasks();renderAlarm();renderCollection();}
function openDialog(title,body,actions=[]){const d=$('#dialog');$('#dialog-content').innerHTML=`<div class="dialog-top"><h2>${title}</h2><button class="icon-button" id="dialog-close" aria-label="閉じる">${icon('close')}</button></div><div class="dialog-body">${body}</div><div class="dialog-actions">${actions.map((a,i)=>`<button class="button ${a.kind||'secondary'} full" id="dialog-action-${i}">${a.icon?icon(a.icon):''}${a.label}</button>`).join('')}</div>`;$('#dialog-close').onclick=()=>d.close();actions.forEach((a,i)=>{$(`#dialog-action-${i}`).onclick=async()=>{const b=$(`#dialog-action-${i}`);b.disabled=true;try{await a.run();}catch(e){toast(e.message||'もう一度ためしてね',true);}finally{if(b.isConnected)b.disabled=false;}}});if(!d.open)d.showModal();}
function closeDialog(){ $('#dialog').close(); }
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function cancelEdit(){editing=null;$('#task-form').reset();$('#form-title').textContent='やること';$('#save-task').innerHTML=`${icon('fold')}<span>折り紙にする</span><span data-icon="arrow">${icon('arrow')}</span>`;$('#cancel-edit').hidden=true;$('#form-error').textContent='';$('.paper-sheet').style.background=colors.peach;}
$('#cancel-edit').onclick=cancelEdit;
$$('input[name="color"]').forEach(el=>el.onchange=()=>{$('.paper-sheet').style.background=colors[el.value];});
$('#task-text').addEventListener('input',()=>$('#form-error').textContent='');
$('#task-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;let task;try{task=createTask($('#task-text').value,$('input[name="color"]:checked').value,state.tasks.length);}catch(e){$('#form-error').textContent=e.message;$('#task-text').focus();return;}busy=true;$('#save-task').disabled=true;const isEdit=!!editing;const next={...state,tasks:editing?state.tasks.map(t=>t.id===editing?{...t,text:task.text,color:task.color,updatedAt:task.updatedAt}:t):[...state.tasks,task]};if(commit(next)){const actual=editing?next.tasks.find(t=>t.id===editing):task;if(!playNightFold($('.paper-sheet'),{kind:actual.animal,paper:actual.color,text:actual.text}))$('#task-form').classList.add('form-folding');renderAll();$('#saved-feedback').innerHTML=`<img src="${portrait(actual.animal,actual.color)}" alt="">${isEdit?'書きなおして、保存したよ':'保存したよ。朝に会おうね。'}`;await new Promise(r=>setTimeout(r,550));$('#task-form').classList.remove('form-folding');cancelEdit();clearTimeout(savedTimer);savedTimer=setTimeout(()=>$('#saved-feedback').textContent='',9000);}else{$('#form-error').textContent='保存できなかったよ。文章はそのまま、もう一度。';}busy=false;$('#save-task').disabled=false;});
function unlockAudio(){try{if(!alarmAudio){alarmAudio=new(window.AudioContext||window.webkitAudioContext)();}alarmAudio.resume().then(()=>{ $('#enable-alarm-sound').hidden=true; }).catch(()=>{ $('#enable-alarm-sound').hidden=!state.alarm.enabled; });}catch{toast('音を準備できなかったよ。もう一度ためしてね',true);}}
$('#enable-alarm-sound').onclick=()=>{unlockAudio();};
$('#alarm-toggle').onclick=()=>{unlockAudio();const enabled=!state.alarm.enabled;if(commit({...state,alarm:{...state.alarm,enabled,nextAt:enabled?nextAlarm(state.alarm.time).toISOString():null}})){renderAlarm();toast(enabled?'アラームをセットしたよ':'アラームをオフにしたよ');}};
$('#alarm-time').onchange=()=>{const time=$('#alarm-time').value;if(!/^\d{2}:\d{2}$/.test(time)){renderAlarm();return;}if(commit({...state,alarm:{...state.alarm,time,nextAt:nextAlarm(time).toISOString()}})){renderAlarm();toast('起きるじかんを保存したよ');}else renderAlarm();};
$('#volume').onchange=()=>{if(commit({...state,alarm:{...state.alarm,volume:Math.max(.35,Number($('#volume').value))}}))toast('音量を保存したよ');else renderAlarm();};
$('#reset-experience').onclick=async()=>{await endExperience();startOnboarding();};
function sessionTasks(){const captured=new Set(state.captures.map(c=>c.taskId));return state.tasks.filter(t=>!t.done&&!captured.has(t.id));}
async function morningGate(){unlockAudio();const tasks=sessionTasks();if(!tasks.length){openDialog('あしたの1枚を用意しよう',`<p>やることを書いた折り紙が、朝のどうぶつになるよ。</p>`,[{label:'やることを書く',icon:'pencil',kind:'primary',run:()=>{closeDialog();go('write');$('#task-text').focus();}},{label:'おためしの折り紙を用意',kind:'primary',run:()=>{let list=['窓を開けて、朝の空気を吸う','コップ1杯の水を飲む','ゴミだし'].map((t,i)=>createTask(t,['peach','blue','sage'][i],state.tasks.length+i));if(commit({...state,tasks:[...state.tasks,...list]})){renderAll();morningGate();}}}]);return;}
 if(native){openDialog('朝のどうぶつを迎えに',`<img class="dialog-animal" src="${portrait(tasks[0].animal,tasks[0].color)}" alt=""><p>足元を片づけて、ゆっくり歩いてね。</p>`,[{label:'迎えにいく',icon:'camera',kind:'primary',run:()=>launch('native')},{label:'画面でためす',kind:'primary',run:()=>launch('demo')}]);return;}
 let ar=false;try{ar=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar');}catch{}
 openDialog(ar?'朝のどうぶつを迎えに':'朝を、ひと足先に。',`<img class="dialog-animal" src="${portrait(tasks[0].animal,tasks[0].color)}" alt=""><p>${ar?'足元を片づけて、ゆっくり歩いてね。':'画面の中で、捕まえるまでをおためし。歩いて追う体験はiPhoneアプリで。'}</p>`,[...(ar?[{label:'ARで迎えにいく',icon:'camera',kind:'primary',run:()=>launch('ar')}]:[]),{label:'カメラでためす',icon:'camera',kind:ar?'secondary':'primary',run:()=>launch('camera')},{label:'カメラなしでためす',kind:'primary',icon:'play',run:()=>launch('demo')}]);
}
$('#start-morning').onclick=morningGate;
async function launch(mode,{onboarding=false}={}) {
 unlockAudio();closeDialog();closeStory();introActive=false;stopRinging({suspend:false});
 const tasks=sessionTasks();if(!tasks.length){morningGate();return;}
 const selected=$('input[name="event"]:checked').value;
 const multiple=!onboarding&&tasks.length>1&&(selected==='multiple'||(selected==='random'&&!state.lastMultiple&&Math.random()<.23));
 const participants=multiple?tasks.slice(0,3):tasks.slice(0,1);
 session={ids:participants.map(t=>t.id),multiple,animal:onboarding?'crane':tasks[0].animal,animals:onboarding?['crane']:participants.map(t=>t.animal),colors:participants.map(t=>t.color),onboarding,sample:!!participants[0].sample};
 const dlg=$('#experience-dialog');if(!dlg.open)dlg.showModal();
 if(mode==='native'){
  nativeActive=true;$('#experience-mount').innerHTML=`<div class="native-wait"><h2>鶴を迎えにいこう</h2><p>カメラを準備しているよ</p></div>`;
  window.webkit.messageHandlers.origamiAR.postMessage({action:'start',multiple,count:session.ids.length,animals:session.animals,animal:session.animal,volume:Math.max(.35,state.alarm.volume),muted:false});return;
 }
 experience=new MorningExperience({mount:$('#experience-mount'),onState:s=>{if(s.ended)interruptExperience();},onCapture:()=>finishCapture(),onError:e=>{console.warn('Experience:',e);}});
 try{await experience.start({chaseSeconds:mode==='demo'?6:onboarding?8:30,mode,multiple,count:session.ids.length,animals:session.animals,colors:session.colors,animal:session.animal,volume:Math.max(.35,state.alarm.volume),muted:mode==='demo',audioContext:alarmAudio});}
 catch(e){await endExperience();if(mode==='camera'&&isDesktop()){showPcNotice({reason:'PCではカメラを開けませんでした。',onContinue:()=>launch('demo',{onboarding})});return;}openDialog('カメラを開けなかったよ',`<p>${escape(e.message||'カメラの接続を確認して、もう一度ためしてね。')}</p>`,[{label:'もう一度ためす',kind:'primary',run:()=>launch(mode,{onboarding})},{label:'カメラなしでためす',kind:'primary',run:()=>launch('demo',{onboarding})}]);}
}
async function endExperience(){session=null;if(nativeActive){nativeActive=false;window.webkit.messageHandlers.origamiAR.postMessage({action:'stop'});}if(experience){const old=experience;experience=null;await old.stop();}$('#experience-dialog').close();$('#experience-mount').innerHTML='';stopRinging();}
function interruptExperience(){return experience?.phase==='capturing'?finishCapture():endExperience();}
$('#experience-dialog').addEventListener('cancel',event=>event.preventDefault());
window.addEventListener('origami-ar',async e=>{const d=e.detail||{};if(!nativeActive)return;if(d.type==='capture')finishCapture();else if(d.type==='closed'){nativeActive=false;endExperience();}else if(d.type==='error'){const onboarding=!!session?.onboarding;nativeActive=false;await endExperience();openDialog('カメラをもう一度',`<p>${escape(d.message||'設定からカメラを許可してね')}</p>`,[{label:'もう一度ためす',kind:'primary',run:()=>launch('native',{onboarding})},{label:'もどる',run:closeDialog}]);}});
async function finishCapture(){
 if(!session)return;
 const capturedSession=session;session=null;
 let candidate=addCapture(state,capturedSession.ids,capturedSession.multiple);
 if(capturedSession.onboarding){try{localStorage.setItem(ONBOARDED_KEY,'1');}catch{}candidate={...candidate,captures:candidate.captures.map((c,index)=>index>=state.captures.length?{...c,animal:'crane',sample:capturedSession.sample}:c)};}
 // Persist before asynchronous audio/AR teardown, including pagehide after a capture tap.
 const saved=commit(candidate);
 await endExperience();
 function saveResult(wasSaved){
  if(wasSaved){
   renderAll();closeDialog();const last=candidate.captures.at(-1);
   openDialog(capturedSession.multiple?'みんな、捕まえた！':'捕まえた！',`<img class="dialog-animal" src="${portrait(last.animal,last.color)}" alt="${ANIMAL_NAMES[last.animal]}"><p class="captured-title">アラームが止まったよ</p>`,[{label:last.animal==='crane'?'ツルを開く':'折り紙をひらく',icon:'paper',kind:'primary',run:()=>showCapture(last,true)},{label:'どうぶつの森へ',kind:'primary',icon:'book',run:()=>{closeDialog();go('collection');}}]);
  }else{openDialog('捕まえた記録を保存しよう',`<p>保存できなかったよ。もう一度ためしてね。</p>`,[{label:'もう一度保存',kind:'primary',run:()=>saveResult(commit(candidate))}]);}
 }
 saveResult(saved);
}
function showCapture(c,fresh=false){
 if(fresh){closeDialog();showPaperOpening(c,{onDone:()=>go('write'),onCollection:()=>go('collection')});return;}
 openDialog(`${ANIMAL_NAMES[c.animal]}からの、1枚`, `<img class="dialog-animal" src="${portrait(c.animal,c.color)}" alt=""><div class="unfolded-task">${escape(c.text)}</div>`,[{label:'やることを見る',icon:'check',kind:'primary',run:()=>{closeDialog();go('write');$('#tasks-title').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}},{label:'どうぶつの森へ',kind:'primary',icon:'book',run:()=>{closeDialog();go('collection');}}]);
}
function startOnboarding({fromTitle=false}={}){
 if(storageProblem)return;
 introActive=true;introGeneration++;
 showOnboarding({fromTitle,animal:'crane',isNative:native,color:sessionTasks()[0]?.color??'blue',onInteract:ensureIntroSound,onStart:async()=>{
  ensureIntroSound();
  const request=++introGeneration;
  if(!sessionTasks().length){const sample={...createTask('窓を開けて、朝の空気を吸う','blue',1),sample:true};if(!commit({...state,tasks:[...state.tasks,sample]}))return;renderAll();}
  let mode=native?'native':'demo';
  if(!native&&!isDesktop()&&window.isSecureContext&&navigator.mediaDevices?.getUserMedia)mode='camera';
  if(!native&&navigator.xr){try{if(await navigator.xr.isSessionSupported('immersive-ar'))mode='ar';}catch{}}
  if(introActive&&request===introGeneration&&!document.hidden)await launch(mode,{onboarding:true});
 }});
 ensureIntroSound();
}
const ONBOARDED_KEY='orito.onboarded.v1';
let ringTimer=null;
function ensureIntroSound(){
 if(!introActive || document.hidden)return;
 if(native){window.webkit.messageHandlers.origamiAR.postMessage({action:'ring',volume:Math.max(.35,state.alarm.volume)});return;}
 unlockAudio();
 alarmAudio?.resume().then(()=>{
  if(!introActive || document.hidden)return;
  if(!ringTimer){bell();ringTimer=setInterval(bell,1000);}
 }).catch(()=>{});
}
function bell(){
 if(!alarmAudio||alarmAudio.state!=='running')return;
 if(!alarmAudio.loudBus){const comp=alarmAudio.createDynamicsCompressor(),out=alarmAudio.createGain();comp.threshold.value=-14;comp.ratio.value=12;out.gain.value=1.8;out.connect(comp);comp.connect(alarmAudio.destination);alarmAudio.loudBus=out;}
 const t=alarmAudio.currentTime;
 [659.25,783.99,987.77,783.99,987.77].forEach((freq,i)=>{
  const osc=alarmAudio.createOscillator(),gain=alarmAudio.createGain();
  osc.type='square';osc.frequency.value=freq;
  gain.gain.setValueAtTime(0,t+i*.15);
  gain.gain.linearRampToValueAtTime(1,t+i*.15+.01);
  gain.gain.setValueAtTime(1,t+i*.15+.1);
  gain.gain.exponentialRampToValueAtTime(.0001,t+i*.15+.17);
  osc.connect(gain);gain.connect(alarmAudio.loudBus);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
  osc.start(t+i*.15);osc.stop(t+i*.15+.2);
 });
}
function stopRinging({suspend=true}={}){
 clearInterval(ringTimer);ringTimer=null;
 if(native&&!nativeActive)window.webkit.messageHandlers.origamiAR.postMessage({action:'silence'});
 if(suspend&&alarmAudio?.state==='running')alarmAudio.suspend().then(()=>renderAlarm()).catch(()=>{});
}
setInterval(()=>{
 if(document.hidden||introActive||!state.alarm.enabled||experience||nativeActive)return;
 const due=state.alarm.nextAt?new Date(state.alarm.nextAt):nextAlarm(state.alarm.time);
 if(due>new Date())return;
 if(!commit({...state,alarm:{...state.alarm,nextAt:nextAlarm(state.alarm.time).toISOString()}}))return;
 renderAlarm();closeDialog();startOnboarding();
},1000);
// A full-screen native AR controller hides the WKWebView. Its own iOS lifecycle
// owns interruption cleanup; treating this as a web exit would dismiss AR instantly.
document.addEventListener('visibilitychange',()=>{if(document.hidden){introGeneration++;if(!nativeActive)stopRinging();if(experience)interruptExperience();}else if(introActive){ensureIntroSound();}});
window.addEventListener('pagehide',()=>{introActive=false;introGeneration++;closeStory();interruptExperience();stopRinging();});
renderAll();go(['write','alarm','collection'].includes(location.hash.slice(1))?location.hash.slice(1):'write',{focus:false});
if(storageProblem)openDialog('保存したデータを読み込めなかったよ',`<p>データを残したままにしてあるよ。再読み込みして、もう一度ためしてね。</p>`,[{label:'再読み込み',kind:'primary',run:()=>location.reload()}]);

// The still title screen (index.html) holds for a moment, then reveals the app.
const titleScreen=document.getElementById('title-screen');
function leaveTitle(){
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#f0f6ed');
 titleScreen?.classList.add('leaving');
 beginFirstRun();
 setTimeout(()=>titleScreen?.remove(),900);
}
if(titleScreen)setTimeout(leaveTitle,Math.max(0,1800-performance.now()));

function isDesktop(){return matchMedia('(min-width:851px) and (hover:hover) and (pointer:fine)').matches&&!navigator.maxTouchPoints;}
function beginFirstRun(){
 if(storageProblem||native)return;
 let done=false;try{done=localStorage.getItem(ONBOARDED_KEY)==='1';}catch{}
 const intro=()=>{if(!done)startOnboarding({fromTitle:true});};
 // Local demo opens on the writing screen; the story remains available in demo settings.
 if(new URLSearchParams(location.search).get('intro')==='1')intro();
}
