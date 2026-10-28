import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
// Historical filename retained; exercises markerless production code.
const source=readFileSync(new URL('../src/orito/ar-engine.js',import.meta.url),'utf8');
const api=vm.runInNewContext(source.replace(/^import .*;$/mg,'').replace(/^export /mg,'')+'\n({WorldApproachGate,MorningExperience})',{performance});
const Gate=api.WorldApproachGate;
const animal=[0,0,-2.5],start=[0,1.4,0];
function approach(g){g.begin(start);for(let i=0;i<=20;i++)g.update([0,1.4,-i*.1],animal,100+i*100,true);for(let t=2200;t<=3000;t+=100)g.update([0,1.4,-2],animal,t,true);}
test('waiting and turning in place cannot enable capture',()=>{const g=new Gate();g.begin(start);for(let t=0;t<=120000;t+=100)g.update(start,animal,t,true);assert.equal(g.canCapture(120000),false);});
test('moving near then tapping is permitted only with fresh stable tracking',()=>{const g=new Gate();approach(g);assert(g.canCapture(3000));assert.equal(g.canCapture(3300),false);g.update(null,null,3100,false);assert.equal(g.canCapture(3100),false);});
test('an animal approaching a stationary phone does not unlock capture',()=>{const g=new Gate();g.begin(start);for(let t=0;t<=5000;t+=100)g.update(start,[0,0,-.3],t,true);assert.equal(g.canCapture(5000),false);});
test('teleports, prolonged tracking loss, and reset invalidate approach',()=>{const g=new Gate();g.begin(start);g.update(start,animal,0,true);g.update([0,1.4,-2],animal,100,true);assert.equal(g.initial,null);approach(g);g.update(null,null,3100,false);g.update(null,null,4700,false);assert.equal(g.initial,null);approach(g);g.reset();assert.equal(g.canCapture(3000),false);});
test('visual demo and untracked camera never finish capture',()=>{const c={active:true,phase:'capture-ready',mode:'demo'};assert.equal(api.MorningExperience.prototype.capture.call(c),false);c.mode='camera';c.worldGate=new Gate();assert.equal(api.MorningExperience.prototype.capture.call(c),false);});
test('invalid pose hides animal and invalidates capture',()=>{const gate=new Gate();approach(gate);let hidden=false;const c={phase:'chasing',worldGate:gate,primary:{},stage:{classList:{remove(){}}},renderer:{show(){hidden=true},render(){}},origin:[0,0,-2.5],_resetWorldPlacement(){},_state(){}};api.MorningExperience.prototype._worldFrame.call(c,{trackingStatus:'LIMITED'},3100);assert(hidden);assert.equal(gate.canCapture(3100),false);});
