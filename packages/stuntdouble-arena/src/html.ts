import type { GateResult } from './gates.ts';
import type { RunResult } from './sim.ts';

interface View {
  id: string;
  title: string;
  obstacles: { x: number; z: number; r: number }[];
  waypoints: { x: number; z: number; loot?: boolean }[];
  result: RunResult;
  gates: GateResult[];
}

/** Single-file, dependency-free canvas replay. Step log is embedded as JSON. Phone-width friendly. */
export function renderHtml(views: View[]): string {
  const data = JSON.stringify(views).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stuntdouble arena replay</title>
<style>
body{margin:0;font:14px system-ui,sans-serif;background:#14161a;color:#e6e6e6}
main{max-width:720px;margin:0 auto;padding:10px}
select,button,input{font:inherit}
canvas{width:100%;height:auto;aspect-ratio:1/1;background:#1d2127;border-radius:8px;display:block}
.row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}
input[type=range]{flex:1;min-width:120px}
.g{font-family:ui-monospace,monospace;font-size:12px;line-height:1.5}.ok{color:#6fcf97}.bad{color:#eb5757}
</style></head><body><main>
<div class="row"><select id="sc"></select><button id="pl">Pause</button><span id="tm"></span></div>
<canvas id="cv" width="640" height="640"></canvas>
<div class="row"><input id="sl" type="range" min="0" value="0"></div>
<div class="g" id="gt"></div>
</main><script>
const V=${data};
const $=id=>document.getElementById(id);
const cv=$('cv'),cx=cv.getContext('2d');
let cur=0,i=0,play=true,last=0;
V.forEach((v,k)=>{const o=document.createElement('option');o.value=k;o.textContent=v.id+' - '+v.title;$('sc').appendChild(o)});
function load(k){cur=k;i=0;const s=V[k].result.steps||[];$('sl').max=Math.max(0,s.length-1);
 $('gt').innerHTML=V[k].gates.map(g=>'<div class="'+(g.pass?'ok':'bad')+'">'+(g.pass?'ok  ':'FAIL')+' '+g.name+' '+g.detail+'</div>').join('')}
const X=640/90,C=320;
const px=x=>C+x*X,pz=z=>C+z*X;
function draw(){const v=V[cur],s=v.result.steps||[];if(!s.length)return;const st=s[Math.min(i,s.length-1)];
 cx.clearRect(0,0,640,640);cx.strokeStyle='#2c323b';cx.strokeRect(px(-40),pz(-40),80*X,80*X);
 v.obstacles.forEach(o=>{cx.fillStyle='#3a414c';cx.beginPath();cx.arc(px(o.x),pz(o.z),o.r*X,0,7);cx.fill()});
 v.waypoints.forEach(w=>{cx.strokeStyle=w.loot?'#f2c94c':'#56ccf2';cx.beginPath();cx.arc(px(w.x),pz(w.z),1*X,0,7);cx.stroke()});
 st.e.forEach(e=>{if(e[4]==='dead')return;cx.fillStyle=e[4]==='windup'?'#eb5757':'#bb6bd9';cx.beginPath();cx.arc(px(e[1]),pz(e[2]),0.6*X,0,7);cx.fill();
  cx.fillStyle='#fff';cx.fillRect(px(e[1])-10,pz(e[2])-0.9*X,20*e[3],3)});
 (st.pr||[]).forEach(q=>{cx.fillStyle='#f2c94c';cx.beginPath();cx.arc(px(q[0]),pz(q[1]),0.3*X,0,7);cx.fill()});
 cx.fillStyle=st.p[3]==='ACTIVE'?'#6fcf97':'#f2994a';cx.beginPath();cx.arc(px(st.p[0]),pz(st.p[1]),0.5*X,0,7);cx.fill();
 cx.fillStyle='#fff';cx.fillRect(px(st.p[0])-10,pz(st.p[1])-0.9*X,20*st.p[2],3);
 cx.font='14px sans-serif';cx.fillText(st.p[3]+(st.ev?' '+st.ev.join(','):''),8,18);
 $('tm').textContent='t='+st.t+'s';$('sl').value=i}
$('sc').onchange=e=>load(+e.target.value);
$('pl').onclick=()=>{play=!play;$('pl').textContent=play?'Pause':'Play'};
$('sl').oninput=e=>{i=+e.target.value;play=false;$('pl').textContent='Play';draw()};
function loop(t){if(play&&t-last>50){last=t;const n=(V[cur].result.steps||[]).length;if(i<n-1)i++;}draw();requestAnimationFrame(loop)}
load(0);requestAnimationFrame(loop);
</script></body></html>`;
}
