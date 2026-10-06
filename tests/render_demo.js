/* =========================================================================
   tests/render_demo.js — Rend une démo audio (WAV) avec le MÊME moteur que
   la démo web et que le VST3 : 4 séquences qui montrent les moteurs.
   Usage : node tests/render_demo.js [sortie.wav]
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const SR = 44100;

/* --- charge le moteur + la banque de samples (avec un DOM factice) --- */
const engineSrc = fs.readFileSync(path.join(root,'webdemo','src','10_engine.js'), 'utf8');
const E = eval('(' + engineSrc.slice(engineSrc.indexOf('function ENGINE_CODE'), engineSrc.lastIndexOf('}')+1) + ')')();
const uiSrc = fs.readFileSync(path.join(root,'webdemo','src','30_ui.js'), 'utf8');
const domStub = { createElement: ()=>({style:{},classList:{toggle(){},add(){},remove(){}},append(){},addEventListener(){},getContext:()=>({}),setAttribute(){},querySelector:()=>null}), addEventListener(){}, getElementById: ()=>null, querySelectorAll: ()=>[] };
const UI = new Function('SECTIONS','document','window', uiSrc + '\nreturn {BANKS, PRESETS, fadeEdges, normalize};')(E.SECTIONS, domStub, {});

function makeParams(over){
  const p = new Float32Array(E.NP);
  E.PARAM_DEFS.forEach(d=> p[d.idx] = d.def);
  const set = (obj)=>{ for (const k in obj) p[E.P[k]] = obj[k]; };
  set(over||{});
  return p;
}
function midiNote(n){ return 440*Math.pow(2,(n-69)/12); }

/* --- rendu --- */
const synth = new E.Synth(SR, 16);
const sL=[], sR=[];
const BL = 256;
let curL = new Float32Array(BL), curR = new Float32Array(BL);
function render(seconds){
  const blocks = Math.floor(seconds*SR/BL);
  for (let b=0;b<blocks;b++){
    const L = new Float32Array(BL), R = new Float32Array(BL);
    synth.render(L, R, BL);
    for (let i=0;i<BL;i++){ sL.push(L[i]); sR.push(R[i]); }
  }
}
function notesOn(ns, vel){ ns.forEach(n=> synth.noteOn(n, vel||0.85)); }
function notesOff(ns){ ns.forEach(n=> synth.noteOff(n)); }

console.log('=== Rendu de la démo audio (le même moteur que le VST3) ===\n');
const bank = UI.BANKS['Accord Pad (synthé)'](SR);
UI.normalize(bank.l, bank.r, 0.75); UI.fadeEdges(bank.l, bank.r, SR);
synth.setSample(bank.l, bank.r, bank.l.length);

/* 1 — ANALOGIQUE : basse ladder + accord */
console.log('  1/4  synthé analogique (basse + accord)…');
synth.setParams(makeParams(UI.PRESETS['Basse Ladder']));
let n = midiNote(36);
notesOn([36,48], 0.95); render(1.1); notesOff([36,48]); render(0.15);
synth.setParams(makeParams(Object.assign({}, UI.PRESETS['Basse Ladder'], {cutoff:900, reso:0.3})));
const riff = [43,43,46,48, 43,43,50,48];
for (const r of riff){ notesOn([r, r+12], 0.9); render(0.22); notesOff([r, r+12]); render(0.04); }
render(0.2);

/* 2 — PAD + nuage granulaire sur le SYNTHÉ LIVE */
console.log('  2/4  pad analogique granulé en direct (grain live)…');
synth.setParams(makeParams(UI.PRESETS['Pad Large']));
notesOn([48,55,60,64,67], 0.7); render(3.2); notesOff([48,55,60,64,67]); render(1.6);

/* 3 — NUAGE GRANULAIRE sur le sample */
console.log('  3/4  nuage granulaire sur le sample…');
synth.panic();
synth.setParams(makeParams(UI.PRESETS['Nuage Sampler']));
notesOn([48,52,55], 0.8); render(0.4);
synth.setBend(0.0); render(3.0);
notesOff([48,52,55]); render(1.8);

/* 4 — TOUT COMBINÉ : analo + sampler + grain + FX */
console.log('  4/4  tout combiné (analo + sampler + granulaire + effets)…');
synth.panic();
synth.setParams(makeParams(Object.assign({}, UI.PRESETS['Sampler + Grain'],
  { cutoff:6000, reso:0.25, dMix:0.3, dFb:0.42, rMix:0.4, chMix:0.35, outDrive:0.35 })));
notesOn([36,48,55,60,63], 0.9); render(1.2); notesOff([36,48,55,60,63]); render(0.5);
synth.setParams(makeParams(Object.assign({}, UI.PRESETS['Sampler + Grain'],
  { cutoff:4200, gDensity:34, gSize:70, gPitchRand:5, gSpray:0.4, dMix:0.35, rMix:0.5, gSource:2 })));
notesOn([45,52,57,60], 0.85); render(2.2); notesOff([45,52,57,60]);
synth.allOff(); render(2.2);

/* --- écriture WAV 16 bits --- */
const N = sL.length;
let pk = 0; for (let i=0;i<N;i++){ const a=Math.abs(sL[i]); if(a>pk)pk=a; }
const g = 0.89/Math.max(1e-6,pk);
const fade = Math.floor(SR*0.05);
const buf = Buffer.alloc(44 + N*4);
buf.write('RIFF',0); buf.writeUInt32LE(36+N*4,4); buf.write('WAVE',8);
buf.write('fmt ',12); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(2,22);
buf.writeUInt32LE(SR,24); buf.writeUInt32LE(SR*4,28); buf.writeUInt16LE(4,32); buf.writeUInt16LE(16,34);
buf.write('data',36); buf.writeUInt32LE(N*4,40);
for (let i=0;i<N;i++){
  let f = 1;
  if (i<fade) f = i/fade;
  else if (i>N-fade) f = (N-i)/fade;
  const l = Math.max(-1,Math.min(1, sL[i]*g*f)), r = Math.max(-1,Math.min(1, sR[i]*g*f));
  buf.writeInt16LE(Math.round(l*32767), 44+i*4);
  buf.writeInt16LE(Math.round(r*32767), 44+i*4+2);
}
const out = process.argv[2] || path.join(root,'demo','granular-hybrid-demo.wav');
fs.mkdirSync(path.dirname(out), {recursive:true});
fs.writeFileSync(out, buf);
console.log('\n  WAV écrit : ' + out);
console.log('  Durée ' + (N/SR).toFixed(1) + ' s · crête avant normalisation ' + pk.toFixed(3) + ' · gain ' + g.toFixed(2));
console.log('  RMS ' + Math.sqrt(sL.reduce((a,v)=>a+v*v,0)/N).toFixed(4));
