import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
// Execute production gate and vendored detector without the browser renderer import.
const source=readFileSync(new URL('../src/orito/ar-engine.js',import.meta.url),'utf8');
const api=vm.runInNewContext(source.replace(/^import .*;$/mg,'').replace(/^export /mg,'')+'\n({MarkerApproachGate,readFloorMarker,markerLibrary,MorningExperience})',{performance});
const {MarkerApproachGate:Gate,readFloorMarker,markerLibrary}=api;
function hold(g,d,from,to){for(let t=from;t<=to;t+=100)g.update({distance:d},t);}
function approach(g,from=1000){for(let i=0;i<=16;i++)g.update({distance:2-i*.1},from+i*100);}
test('stationary far marker never enables capture, even after minutes',()=>{
 const g=new Gate();hold(g,2,0,600);assert(g.begin(600));hold(g,2,700,120000);assert.equal(g.canCapture(120000),false);
});
test('starting near cannot begin; approach enables a tap only while tracking is fresh',()=>{
 const g=new Gate();hold(g,.4,0,2000);assert.equal(g.begin(2000),false);
 hold(g,2,2100,3000);assert(g.begin(3000));approach(g,3100);hold(g,.4,4800,5400);
 assert(g.canCapture(5400));assert.equal(g.canCapture(5700),false);
 g.update(null,5500);assert.equal(g.canCapture(5500),false);
});
test('pose jump, prolonged loss and explicit pause/reset invalidate prior approach',()=>{
 const g=new Gate();hold(g,2,0,600);g.begin(600);g.update({distance:.4},700);assert.equal(g.started,false);
 hold(g,2,1000,1700);g.begin(1700);g.update(null,1800);g.update(null,3400);assert.equal(g.started,false);
 hold(g,2,3500,4200);g.begin(4200);g.reset();assert.equal(g.canCapture(5000),false);
});
test('visual demo and stale camera state cannot finish a capture',()=>{
 const c={active:true,phase:'capture-ready',mode:'demo'};
 assert.equal(api.MorningExperience.prototype.capture.call(c),false);
 c.mode='camera';c.markerGate=new Gate();assert.equal(api.MorningExperience.prototype.capture.call(c),false);
});
// Synthetic pinhole camera looking at an 18cm marker on the floor at 1.2m camera height.
function raster(d,id=0){
 const width=1280,height=720,data=new Uint8ClampedArray(width*height*4),f=width,h=1.2,r=Math.hypot(d,h),c=h/r,s=d/r;
 const code=new markerLibrary.AR.Dictionary('ARUCO').codeList[id];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=(x-width/2)/f,v=(height/2-y)/f,lambda=h/(c-s*v);
   const a=u*lambda,b=c*v*lambda+s*(lambda-r);
   let value=255;
   if(lambda>0 && Math.abs(a)<.09 && Math.abs(b)<.09){
    const xx=Math.floor((a/.18+.5)*7),yy=Math.floor((.5-b/.18)*7);
    value=xx===0||xx===6||yy===0||yy===6?0:code[(yy-1)*5+xx-1]==='1'?255:0;
   }
   const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 return {width,height,data};
}
test('real detector/pose solve synthetic floor frames at far and near distances',()=>{
 for(const d of [2,1.2,.4]){
  const image=raster(d);const result=readFloorMarker(new markerLibrary.AR.Detector({dictionaryName:'ARUCO'}),new markerLibrary.POS.Posit(.18,image.width),image);
   assert(result,`detect at ${d}m`);assert(Math.abs(result.distance-d)<.18,`${result.distance} vs ${d}`);
 }
 const image=raster(2,5);assert.equal(readFloorMarker(new markerLibrary.AR.Detector({dictionaryName:'ARUCO'}),new markerLibrary.POS.Posit(.18,image.width),image),null);
});
