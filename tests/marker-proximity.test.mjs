import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=readFileSync(new URL('../src/orito/ar-engine.js',import.meta.url),'utf8');
const {MorningExperience:M}=vm.runInNewContext(source.replace(/^import .*;$/mg,'').replace(/^export /mg,'')+'\n({MorningExperience})',{performance,requestAnimationFrame:()=>0});
function context(){return {active:true,mode:'camera',phase:'chasing',elapsed:0,chaseSeconds:10,lastFrame:0,creatures:[],views:[],stage:{clientWidth:400,clientHeight:800},demoTarget:[0,0],_emote(){},_surrender(){this.phase='capture-ready';}};}
test('10 seconds unlocks capture without automatic capture',()=>{const c=context();for(let t=100;t<=10000;t+=100)M.prototype._demoFrame.call(c,t);assert.equal(c.phase,'chasing');for(let t=10100;t<=10300;t+=100)M.prototype._demoFrame.call(c,t);assert.equal(c.phase,'capture-ready');assert.equal(c.captured,undefined);});
test('paused time does not count',()=>{const c=context();c.paused=true;for(let t=100;t<=40000;t+=100)M.prototype._demoFrame.call(c,t);assert.equal(c.elapsed,0);assert.equal(c.phase,'chasing');});
test('early tap cannot capture even if ready state was stale',()=>{const c={active:true,mode:'camera',phase:'capture-ready',elapsed:3,chaseSeconds:10};assert.equal(M.prototype.capture.call(c),false);});
test('remaining-time bar is absent from generated markup and styles',()=>{assert(!source.includes('morning-stage__progress'));assert(!source.includes('this.progress'));});
