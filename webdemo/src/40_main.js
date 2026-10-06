/* =========================================================================
   40_main.js — Démarrage, façade moteur (worklet OU repli), câblage UI,
   banque de samples, visualisation, clavier, presets.
   ========================================================================= */
const ENG_Synth = ENG.Synth;   // (ENG est défini juste avant, par build.py)
let knobsById = {};            // id de paramètre -> contrôle UI (setValue)
let kbd = null;
let octave = 3;                // octave de base du clavier
let peaksCache = null;         // enveloppe du sample pour l'affichage

/* ------------------------------------------------------------------ */
/* Façade moteur : AudioWorklet si possible, sinon ScriptProcessor     */
/* ------------------------------------------------------------------ */
const Eng = {
  mode:'—', detail:'', ctx:null, node:null, synth:null, sp:null,
  master:null, analyser:null, params:new Float32Array(ENG.NP),
  viz:{pos:null, count:0, voices:0, grains:0, peakL:0, peakR:0, load:0},
  sample:{l:null, r:null, n:0, name:'—'},
  sampleDirty:false,

  async boot(){
    ENG.PARAM_DEFS.forEach(d=> this.params[d.idx] = d.def);
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Ce navigateur ne supporte pas Web Audio (AudioContext absent).");
    const ctx = this.ctx = new AC({ latencyHint:'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = 1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.8;
    this.master.connect(this.analyser); this.analyser.connect(ctx.destination);

    const worked = await this.tryWorklet(ctx);
    if (!worked) this.startFallback(ctx);
    await ctx.resume();
    // charge le sample par défaut de la banque
    await this.loadBank(Object.keys(BANKS)[0]);
  },

  async tryWorklet(ctx){
    if (!ctx.audioWorklet) { this.workletErr = 'AudioWorklet non supporté par ce navigateur'; return false; }
    if (typeof WORKLET_SRC !== 'string' || WORKLET_SRC.length < 100){
      this.workletErr = 'source du worklet indisponible dans la page'; return false;
    }
    const tries = [];
    try { tries.push(['blob:', URL.createObjectURL(new Blob([WORKLET_SRC], {type:'application/javascript'}))]); }
    catch(e){ /* createObjectURL bloqué */ }
    try {
      const b64 = document.getElementById('wkSrc').textContent.trim();
      tries.push(['data:', 'data:application/javascript;base64,' + b64]);
    } catch(e){}
    const errs = [];
    for (const [kind, url] of tries){
      try {
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, 'granular-hybrid', {
          numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[2],
          processorOptions:{ params:this.params }
        });
        node.port.onmessage = (e)=>{ const d = e.data;
          if (d.type==='viz') this.viz = d; else if (d.type==='ready') console.log('Worklet prêt @', d.sr, 'Hz'); };
        node.connect(this.master);
        this.node = node;
        this.mode = 'AudioWorklet'; this.detail = 'thread audio dédié (' + kind + ')';
        return true;
      } catch(err){ errs.push(kind + ' ' + (err && err.message ? err.message : err)); }
    }
    this.workletErr = errs.join(' | ');
    console.warn('Worklet indisponible → repli ScriptProcessor :', this.workletErr);
    return false;
  },

  startFallback(ctx){
    const synth = this.synth = new ENG_Synth(ctx.sampleRate, 16);
    synth.setParams(this.params);
    const sp = this.sp = ctx.createScriptProcessor(512, 0, 2);
    const silent = ctx.createConstantSource ? ctx.createConstantSource() : ctx.createOscillator();
    if (silent.offset) silent.offset.value = 0; else silent.frequency.value = 0;
    silent.connect(sp); sp.connect(this.master);
    try { silent.start(); } catch(e){}
    const L = new Float32Array(512), R = new Float32Array(512);
    let cnt = 0;
    sp.onaudioprocess = (e)=>{
      const t0 = performance.now();
      synth.render(L, R, 512);
      const out = e.outputBuffer;
      out.getChannelData(0).set(L);
      if (out.numberOfChannels>1) out.getChannelData(1).set(R);
      let pl=0, pr=0;
      for (let i=0;i<512;i++){ const a=Math.abs(L[i]); if(a>pl)pl=a; const b=Math.abs(R[i]); if(b>pr)pr=b; }
      this.viz.peakL = pl; this.viz.peakR = pr;
      this.viz.load = this.viz.load*0.9 + ((performance.now()-t0)/1000/(512/ctx.sampleRate))*0.1;
      if (++cnt >= 4){
        cnt = 0;
        const v = synth.getViz();
        this.viz = { pos: v.buf.slice(0,v.count), count:v.count, voices:v.voices, grains:v.grains,
                     peakL:this.viz.peakL, peakR:this.viz.peakR, load:this.viz.load };
      }
    };
    this.mode = 'ScriptProcessor'; this.detail = 'repli main thread · ' + (this.workletErr||'');
  },

  setParam(idx, val){
    this.params[idx] = val;
    if (this.node) this.node.port.postMessage({type:'param', idx, val});
    else if (this.synth) this.synth.setParam(idx, val);
  },
  noteOn(note, vel){
    if (this.node) this.node.port.postMessage({type:'note', note, vel});
    else if (this.synth) this.synth.noteOn(note, vel);
  },
  noteOff(note){
    if (this.node) this.node.port.postMessage({type:'noteoff', note});
    else if (this.synth) this.synth.noteOff(note);
  },
  allOff(){ if (this.node) this.node.port.postMessage({type:'alloff'}); else if (this.synth) this.synth.allOff(); },
  panic(){ if (this.node) this.node.port.postMessage({type:'panic'}); else if (this.synth) this.synth.panic(); },
  setBend(v){ if (this.node) this.node.port.postMessage({type:'bend', v}); else if (this.synth) this.synth.setBend(v); },
  setSample(l, r, n, name){
    this.sample = {l, r, n, name};
    const cl = l.slice(0), cr = r.slice(0);
    if (this.node) this.node.port.postMessage({type:'sample', l:cl, r:cr, len:n}, [cl.buffer, cr.buffer]);
    else if (this.synth) this.synth.setSample(cl, cr, n);
    peaksCache = makePeaks(l, r, 640);
  },
  async loadBank(name){
    const gen = BANKS[name]; if (!gen) return;
    const t0 = performance.now();
    const raw = gen(this.ctx.sampleRate);
    normalize(raw.l, raw.r, 0.75);
    const f = fadeEdges(raw.l, raw.r, this.ctx.sampleRate);
    this.setSample(f.l, f.r, f.l.length, name);
    const sel = document.getElementById('bankSel'); if (sel) sel.value = name;
    updateSmpInfo(name + ' · ' + (f.l.length/this.ctx.sampleRate).toFixed(2) + ' s · banque synthétisée');
    console.log('Sample « ' + name + ' » généré en ' + (performance.now()-t0).toFixed(0) + ' ms');
  }
};

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */
function applyPreset(name, silent){
  const pre = PRESETS[name];
  if (pre){
    ENG.PARAM_DEFS.forEach(d=> setParamUI(d.id, d.def, true, true));
    for (const k in pre) setParamUI(k, pre[k], true, true);
  }
  if (!silent) document.getElementById('presetSel').value = name;
  refreshAllUI();
}
function setParamUI(id, val, updateUI, noSend){
  const idx = ENG.P[id]; if (idx === undefined) return;
  Eng.setParam(idx, val);
  if (updateUI && knobsById[id]) knobsById[id].setValue(val);
}
function refreshAllUI(){
  ENG.PARAM_DEFS.forEach(d=>{ if (knobsById[d.id]) knobsById[d.id].setValue(Eng.params[d.idx]); });
}
function randomizeGrain(){
  const R = (a,b)=> a + Math.random()*(b-a);
  const src = Math.random()<0.15 ? 2 : (Math.random()<0.5 ? 0 : 1);
  const set = (id,v)=> setParamUI(id, v, true, false);
  set('mixGrain', 1);
  if (src===0 && Eng.sample.n>0) set('mixSampler', R(0.2,0.6)); 
  set('gSource', src);
  set('gDensity', Math.round(R(4,60)));
  set('gSize', Math.round(R(25,320)));
  set('gSpray', R(0,0.55));
  set('gPitchRand', Math.round(R(0,12)));
  set('gReverse', R(0,0.5));
  set('gPan', R(0.3,1));
  set('gShape', Math.floor(R(0,4)));
  set('gJitter', R(0.1,0.7));
  set('gFreeze', 0);
  set('rMix', R(0.15,0.55));
  refreshAllUI();
}
function randomAll(){ randomizeGrain(); }

/* ------------------------------------------------------------------ */
/* Affichage                                                           */
/* ------------------------------------------------------------------ */
function makePeaks(l, r, w){
  const out = new Float32Array(w*2);
  const step = Math.max(1, Math.floor(l.length/w));
  for (let i=0;i<w;i++){
    let mn=1e9, mx=-1e9;
    for (let j=i*step;j<Math.min(l.length,(i+1)*step);j++){
      const v = (l[j]+r[j])*0.5;
      if (v<mn) mn=v; if (v>mx) mx=v;
    }
    out[i*2]=mn; out[i*2+1]=mx;
  }
  return out;
}
function fitCanvas(cv){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const w = cv.clientWidth||300, h = cv.clientHeight||60;
  if (cv.width !== Math.floor(w*dpr) || cv.height !== Math.floor(h*dpr)){
    cv.width = Math.floor(w*dpr); cv.height = Math.floor(h*dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  return {g, w, h};
}
function drawSample(){
  const cv = document.getElementById('smpCanvas');
  const {g, w, h} = fitCanvas(cv);
  g.clearRect(0,0,w,h);
  g.fillStyle = '#0d111a'; g.fillRect(0,0,w,h);
  if (!peaksCache){ g.fillStyle='#4a5468'; g.font='11px sans-serif'; g.fillText('aucun sample chargé', 8, h/2+4); return; }
  const ww = peaksCache.length/2;
  g.strokeStyle = '#2f6f66'; g.lineWidth = 1;
  g.beginPath();
  for (let i=0;i<ww;i++){
    const x = i/(ww-1)*w;
    const mn = peaksCache[i*2], mx = peaksCache[i*2+1];
    g.moveTo(x, h/2 - mx*h/2*0.92);
    g.lineTo(x, h/2 - mn*h/2*0.92);
  }
  g.stroke();
  // marqueur de position du grain (knob Position + LFO)
  const gp = Eng.params[ENG.P.gPosition];
  g.strokeStyle = '#a97bff88'; g.beginPath(); g.moveTo(gp*w, 0); g.lineTo(gp*w, h); g.stroke();
  // grains actifs
  const v = Eng.viz;
  if (v.pos && v.count>0){
    for (let i=0;i+2<v.count;i+=3){
      const pos = v.pos[i], pan = v.pos[i+1], amp = v.pos[i+2];
      const x = Math.max(0,Math.min(1,pos))*w;
      const y = h/2 + pan*h*0.3;
      g.fillStyle = 'rgba(255,178,72,' + Math.max(0.15, Math.min(1, amp)) + ')';
      g.beginPath(); g.arc(x, y, 2.4, 0, 6.2832); g.fill();
    }
  }
}
function drawViz(){
  const cv = document.getElementById('viz');
  const {g, w, h} = fitCanvas(cv);
  g.clearRect(0,0,w,h);
  const an = Eng.analyser;
  if (!an) return;
  // spectre (fond)
  const fd = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(fd);
  g.fillStyle = 'rgba(169,123,255,0.20)';
  const N = fd.length, bins = Math.floor(w);
  for (let i=0;i<bins;i++){
    const f0 = Math.floor(Math.pow(i/bins, 2.2)*N*0.55);
    const f1 = Math.max(f0+1, Math.floor(Math.pow((i+1)/bins, 2.2)*N*0.55));
    let m=0; for (let j=f0;j<f1 && j<N;j++) if (fd[j]>m) m=fd[j];
    const v = Math.pow(m/255, 1.3)*h*0.85;
    if (v>0.5) g.fillRect(i, h-v, 1, v);
  }
  // forme d'onde (avant)
  const td = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(td);
  g.strokeStyle = '#3fd8c2'; g.lineWidth = 1.4; g.beginPath();
  const step = Math.floor(td.length/w);
  for (let i=0;i<w;i++){
    const v = td[Math.min(td.length-1, i*step)] * (h/2-3);
    if (i===0) g.moveTo(0, h/2 - v); else g.lineTo(i, h/2 - v);
  }
  g.stroke();
  g.strokeStyle = '#ffffff18'; g.beginPath(); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke();
}

/* ------------------------------------------------------------------ */
/* Construction de l'interface                                         */
/* ------------------------------------------------------------------ */
function buildUI(){
  const host = document.getElementById('panels');
  host.innerHTML = '';
  ENG.SECTIONS.forEach(sec=>{
    const panel = el('section','panel');
    panel.style.setProperty('--acc', sec.acc);
    panel.append(el('h3',null,sec.name));
    const knobs = el('div','knobs'), ctl = el('div','ctl');
    ENG.PARAM_DEFS.filter(d=> d.sec===sec.id).forEach(d=>{
      if (d.id==='master') return;                       // → header
      const get = ()=> Eng.params[d.idx];
      const set = v=> setParamUI(d.id, v, false, false);
      let ctlEl;
      if (d.kind==='choice') ctlEl = makeSelect(d, get, set);
      else if (d.kind==='bool') ctlEl = makeToggle(d, get, set);
      else { ctlEl = makeKnob(d, get, set); }
      knobsById[d.id] = ctlEl;
      if (d.kind==='choice' || d.kind==='bool') ctl.append(ctlEl); else knobs.append(ctlEl);
    });
    panel.append(knobs, ctl);
    host.append(panel);
  });
  // knob master dans l'entête
  const md = ENG.PARAM_DEFS.find(d=>d.id==='master');
  const mk = makeKnob(md, ()=> Eng.params[ENG.P.master], v=> setParamUI('master', v, false, false), 46);
  knobsById['master'] = mk;
  document.getElementById('masterKw').appendChild(mk);
}

function buildBankSelect(){
  const sel = document.getElementById('bankSel');
  sel.innerHTML = '';
  Object.keys(BANKS).forEach(n=>{ const o=el('option',null,n); o.value=n; sel.append(o); });
  sel.onchange = ()=> Eng.loadBank(sel.value);
}
function updateSmpInfo(txt){ document.getElementById('smpInfo').textContent = txt; }

function buildKeyboard(){
  kbd = new Keyboard(document.getElementById('keys'),
    (n,v)=> Eng.noteOn(n,v), (n)=> Eng.noteOff(n), ()=> octave);
  document.getElementById('octLbl').textContent = 'C' + octave;
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */
let started = false, wasmErr = null;
async function start(){
  if (started) return; started = true;
  const boot = document.getElementById('boot');
  const box = boot.querySelector('.box');
  try{
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startBtn').textContent = 'Initialisation…';
    buildUI(); buildBankSelect(); buildKeyboard();
    await Eng.boot();
    boot.style.display = 'none';
    document.getElementById('vizInfo').innerHTML =
      '<b style="color:#3fd8c2">' + Eng.mode + '</b><br><span style="font-size:9.5px">' + Eng.detail + '</span>';
    requestAnimationFrame(loop);
  } catch(err){
    box.innerHTML = '<h1 style="color:#ff6b6b">Erreur au démarrage</h1>' +
      '<p style="text-align:left;font-family:monospace;font-size:11.5px;color:#ffb3b3;white-space:pre-wrap;max-height:220px;overflow:auto">' +
      String(err && err.stack ? err.stack : err) + '</p>' +
      '<p style="font-size:12px">Si vous êtes dans l\'aperçu intégré (iframe), téléchargez le fichier HTML et ouvrez-le directement dans Chrome/Firefox.</p>';
    console.error(err);
  }
}

let fps, lastT = 0, fpsCtr = 0;
function loop(t){
  requestAnimationFrame(loop);
  drawViz(); drawSample();
  if (t - lastT > 400){
    lastT = t;
    const v = Eng.viz;
    const cpu = (v.load||0)*100;
    document.getElementById('cpu').textContent =
      'voix ' + (v.voices||0) + ' · grains ' + (v.grains||0) + ' · ' + cpu.toFixed(0) + '% CPU';
  }
}

/* --- événements globaux --- */
document.addEventListener('keydown', e=>{
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.code === 'Space'){ e.preventDefault(); Eng.panic(); if (kbd) kbd.releaseAll(); flashPanic(); return; }
  if (e.code === 'KeyZ'){ if (!e.repeat){ octave = Math.max(0, octave-1); document.getElementById('octLbl').textContent='C'+octave; } return; }
  if (e.code === 'KeyX'){ if (!e.repeat){ octave = Math.min(7, octave+1); document.getElementById('octLbl').textContent='C'+octave; } return; }
  if (kbd && kbd.key(e.code, true)) e.preventDefault();
});
document.addEventListener('keyup', e=>{ if (kbd) kbd.key(e.code, false); });
window.addEventListener('blur', ()=>{ if (kbd) kbd.releaseAll(); Eng.allOff(); });
document.addEventListener('visibilitychange', ()=>{ if (document.hidden){ if (kbd) kbd.releaseAll(); Eng.allOff(); } });
function flashPanic(){
  const b = document.getElementById('panicBtn');
  b.textContent = '■ coupé'; setTimeout(()=> b.textContent = '■ Panic', 500);
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('startBtn').onclick = start;
  document.getElementById('panicBtn').onclick = ()=>{ Eng.panic(); if (kbd) kbd.releaseAll(); flashPanic(); };
  document.getElementById('randBtn').onclick = randomizeGrain;
  document.getElementById('octUp').onclick = ()=>{ octave=Math.min(7,octave+1); document.getElementById('octLbl').textContent='C'+octave; };
  document.getElementById('octDown').onclick = ()=>{ octave=Math.max(0,octave-1); document.getElementById('octLbl').textContent='C'+octave; };
  const psel = document.getElementById('presetSel');
  Object.keys(PRESETS).forEach(n=>{ const o=el('option',null,n); o.value=n; psel.append(o); });
  psel.onchange = ()=> applyPreset(psel.value, true);

  // chargement de fichier audio
  const fin = document.getElementById('fileIn');
  document.getElementById('loadBtn').onclick = ()=> fin.click();
  fin.onchange = ()=>{ if (fin.files && fin.files[0]) loadAudioFile(fin.files[0]); };
  const drop = document.getElementById('drop');
  ['dragenter','dragover'].forEach(ev=> document.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('hot'); }));
  ['dragleave','drop'].forEach(ev=> document.addEventListener(ev, e=>{ e.preventDefault(); if (ev==='drop'||e.target===drop) drop.classList.remove('hot'); }));
  document.addEventListener('drop', e=>{
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadAudioFile(f);
  });
});

async function loadAudioFile(file){
  try{
    updateSmpInfo('décodage de ' + file.name + '…');
    const buf = await file.arrayBuffer();
    const ab = await Eng.ctx.decodeAudioData(buf);
    const n = ab.length;
    const l = new Float32Array(n), r = new Float32Array(n);
    const ch0 = ab.getChannelData(0), ch1 = ab.numberOfChannels>1 ? ab.getChannelData(1) : ch0;
    l.set(ch0); r.set(ch1);
    const f = fadeEdges(l, r, Eng.ctx.sampleRate);
    Eng.setSample(f.l, f.r, n, file.name);
    updateSmpInfo(file.name + ' · ' + (n/ab.sampleRate).toFixed(2) + ' s · ' + ab.sampleRate + ' Hz');
  } catch(err){
    updateSmpInfo('impossible de décoder : ' + (err.message||err));
    console.error(err);
  }
}
