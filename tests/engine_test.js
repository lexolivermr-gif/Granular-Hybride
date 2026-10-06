/* Test Node du moteur DSP (code pur, sans Web Audio).
   Usage: node tests/engine_test.js
   Vérifie : pas d'exception, pas de NaN/Inf, RMS audible, grains actifs. */
const fs = require('fs');
const path = require('path');
const here = path.join(__dirname, '..', 'webdemo', 'src');
const src = fs.readFileSync(path.join(here, '10_engine.js'), 'utf8');
const ENGINE_CODE = eval('(' + src.slice(src.indexOf('function ENGINE_CODE'), src.lastIndexOf('}') + 1) + ')');
const E = ENGINE_CODE();

const SR = 48000;
function makeSample(sec = 1.0, kind = 'chord'){
  const n = Math.floor(SR * sec);
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    if (kind === 'chord') {
      s = 0.35*Math.sin(2*Math.PI*220*t) + 0.25*Math.sin(2*Math.PI*277.18*t) + 0.2*Math.sin(2*Math.PI*329.63*t);
      s *= 1 - 0.8*(t/sec);            // decroissance
    } else { s = (Math.random()*2-1)*0.5; }
    l[i] = s; r[i] = s*0.95;
  }
  return {l, r, n};
}

function rms(a){ let s=0; for (let i=0;i<a.length;i++) s+=a[i]*a[i]; return Math.sqrt(s/a.length); }
function finite(a){ for (let i=0;i<a.length;i++) if (!Number.isFinite(a[i])) return false; return true; }

let failures = 0;
function check(name, cond, info=''){ console.log(`${cond?'  OK  ':'ÉCHEC '} ${name}${info?'  ('+info+')':''}`); if(!cond) failures++; }

function runCase(name, params, sample, seconds=1.5, chords=[[60,64,67],[62,65,69],[64,67,71]], minVoices=1){
  const synth = new E.Synth(SR, 16);
  const p = new Float32Array(E.NP);
  E.PARAM_DEFS.forEach(d => p[d.idx] = d.def);
  for (const k in params) { if (!(k in E.P)) { console.log('  !! param inconnu: '+k); failures++; continue; } p[E.P[k]] = params[k]; }
  synth.setParams(p);
  if (sample) synth.setSample(sample.l, sample.r, sample.n);
  const BL = 128;
  const L = new Float32Array(BL), R = new Float32Array(BL);
  let peak = 0, maxGrains = 0, maxVoices = 0, nan = false;
  const blocks = Math.floor(seconds*SR/BL);
  const chordLen = Math.floor(blocks/3);
  for (let b = 0; b < blocks; b++) {
    const ci2 = Math.min(chords.length-1, (b/chordLen)|0);
    if (b % chordLen === 0) { for (const nt of chords[ci2]) synth.noteOn(nt, (nt % 7 === 0 ? 70 : 105)/127); }
    if (b % chordLen === chordLen-1) { for (const nt of chords[ci2]) synth.noteOff(nt); }
    synth.render(L, R, BL);
    if (!finite(L) || !finite(R)) nan = true;
    for (let i=0;i<BL;i++){ const a=Math.abs(L[i]); if(a>peak) peak=a; }
    const v = synth.getViz(); if (v.voices>maxVoices) maxVoices=v.voices; if (v.grains>maxGrains) maxGrains=v.grains;
  }
  // release final
  synth.allOff(); for (let b=0;b<200;b++) synth.render(L,R,BL);
  check(name + ' : sortie finie (pas de NaN/Inf)', !nan);
  check(name + ' : signal audible (crête ' + peak.toFixed(3) + ')', peak > 0.02 && peak < 12, 'crête='+peak.toFixed(3));
  check(name + ' : voix actives max=' + maxVoices, maxVoices >= minVoices, 'min attendu='+minVoices);
  if (name.includes('GRAIN')) check(name + ' : grains actifs max=' + maxGrains, maxGrains >= 1);
  return synth;
}

console.log('=== TEST MOTEUR DSP — Granular Hybrid ===\n');
const smp = makeSample();

// 1. Analogique seul
runCase('ANALO (2 osc + ladder)', { mixAnalog:1, mixSampler:0, mixGrain:0 }, smp);

// 2. Sampler seul
runCase('SAMPLER seul', { mixAnalog:0, mixSampler:1, mixGrain:0, sLoop:1 }, smp);

// 3. Granulaire sur sample
runCase('GRAIN sur SAMPLE', { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:0, gDensity:25, gSize:80 }, smp);

// 4. Granulaire sur synthé LIVE (le cas "granuler le synthé")
runCase('GRAIN sur SYNTH LIVE', { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:1, gDensity:20, gSize:120, gLivePos:120 }, smp);

// 5. Granulaire sample+live + freeze
runCase('GRAIN SAMPLE+LIVE + freeze', { mixAnalog:0.4, mixSampler:0.3, mixGrain:1, gSource:2, gDensity:18, gFreeze:1 }, smp);

// 6. Tout combiné + FX + résonance extrême
runCase('TOUT COMBIENÉ + FX + réso max', {
  mixAnalog:1, mixSampler:0.8, mixGrain:0.8, gSource:2, reso:1.0, drive:1.0,
  cutoff:8000, chMix:0.6, dMix:0.4, rMix:0.5, outDrive:0.8, lfoCut:1.5, lfoPitch:0.5
}, smp);

// 7. Unison + mono/légato + glide + noise + ring
runCase('UNISON 3 + MONO/LÉGATO + glide', {
  mono:1, glide:120, o1Uni:3, o1Detune:25, o2Uni:3, o2Detune:20, subLevel:0.5,
  noiseLevel:0.2, noiseType:1, ringLevel:0.3, mixAnalog:1
}, smp, 1.2, [[60],[64],[67]]);

// 8. Types de filtre + 16 voix
runCase('FILTRE LP12', { mixAnalog:1, fType:1, cutoff:600, reso:0.8 }, smp);
runCase('FILTRE HP12', { mixAnalog:1, fType:2, cutoff:400 }, smp);
runCase('FILTRE BP12', { mixAnalog:1, fType:3, cutoff:1200, reso:0.5 }, smp);
runCase('16 VOIX', { mixAnalog:1, poly:16, mixGrain:0.5, gSource:0, gDensity:40 }, smp, 2.0, [[60,63,65,67,70,72,74,77],[59,62,64,66,69,71,73,76]], 8);

// 9. Panic + modes de fenêtre granulaire + spray max
for (let sh=0; sh<4; sh++) runCase('GRAIN fenêtre '+['Hann','Tri','Exp','Tukey'][sh], { mixGrain:1, gSource:0, gShape:sh, gSpray:1, gPitch:12, gPitchRand:7, gReverse:0.5, gDensity:60 }, smp);

// 10. Perf : temps de rendu d'une minute d'audio
const s2 = new E.Synth(SR, 16);
const p2 = new Float32Array(E.NP); E.PARAM_DEFS.forEach(d=>p2[d.idx]=d.def);
p2[E.P.mixGrain]=1; p2[E.P.gSource]=2; p2[E.P.gDensity]=40; p2[E.P.poly]=8;
s2.setParams(p2); s2.setSample(smp.l, smp.r, smp.n);
const L2=new Float32Array(128), R2=new Float32Array(128);
for (let i=0;i<4;i++) s2.noteOn(60+i*3, 0.8);
const t0 = Date.now(); const NB = Math.floor(SR*10/128);
for (let b=0;b<NB;b++) s2.render(L2,R2,128);
const dt = (Date.now()-t0)/1000;
const rt = 10/dt;
console.log(`\n  PERF : 10 s d'audio (8 voix + grains + FX) rendus en ${dt.toFixed(2)} s → temps réel x${rt.toFixed(1)}`);
check('PERF : au moins temps réel x1', rt > 1, 'x'+rt.toFixed(1));

console.log('\n' + (failures===0 ? '>>> TOUS LES TESTS PASSENT' : '>>> '+failures+' ÉCHEC(S)'));
process.exit(failures===0 ? 0 : 1);
