/* =========================================================================
   30_ui.js — Construction de l'interface (panneaux, knobs, clavier, presets)
   ========================================================================= */
function el(tag, cls, txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
const ACC = {}; SECTIONS.forEach(s=>ACC[s.id]=s.acc);
const clamp01 = v => v<0?0:(v>1?1:v);

/* ---------- formatage des valeurs ---------- */
function fmtVal(d, v){
  if (d.kind==='choice') return d.options[Math.round(v)]||'';
  if (d.kind==='bool') return v>0.5?'ON':'OFF';
  const u = d.unit||'';
  if (u==='Hz') return v>=1000 ? (v/1000).toFixed(2)+' k' : v.toFixed(v<100?1:0)+' Hz';
  if (u==='ms') return v>=1000 ? (v/1000).toFixed(2)+' s' : v.toFixed(0)+' ms';
  if (u==='s')  return v<0.01 ? (v*1000).toFixed(1)+' ms' : v.toFixed(2)+' s';
  if (d.kind==='int') return Math.round(v)+(u?' '+u:'');
  if (Math.abs(v)>=100) return v.toFixed(0)+(u?' '+u:'');
  return v.toFixed(2)+(u?' '+u:'');
}

/* ---------- un knob dessiné sur canvas ---------- */
function makeKnob(def, get, set, size){
  size = size||42;
  const wrap = el('div','kw');
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio||1);
  cv.width = size*dpr; cv.height = size*dpr;
  cv.style.width = size+'px'; cv.style.height = size+'px';
  cv.className = 'knob';
  cv.title = def.label + (def.unit?' ('+def.unit+')':'');
  const lbl = el('div','lbl', def.label), valEl = el('div','val');
  wrap.append(cv, lbl, valEl);
  const g = cv.getContext('2d');
  const acc = ACC[def.sec]||'#ffb248';
  const A0 = Math.PI*0.75, A1 = Math.PI*2.25;
  const sk = def.sk||1;
  let value = get();

  function toPos(v){ return clamp01(Math.pow((v-def.min)/(def.max-def.min), 1/sk)); }
  function fromPos(p){ p = clamp01(p); let v = def.min + Math.pow(p, sk)*(def.max-def.min);
    if (def.kind==='int') v = Math.round(v);
    if (def.kind==='bool') v = v>0.5?1:0;
    return Math.min(def.max, Math.max(def.min, v)); }
  function draw(){
    g.setTransform(dpr,0,0,dpr,0,0);
    g.clearRect(0,0,size,size);
    const c = size/2, r = size/2-5;
    g.lineWidth = 4; g.lineCap = 'round';
    g.strokeStyle = '#2c3342';
    g.beginPath(); g.arc(c,c,r,A0,A1); g.stroke();
    const p = toPos(value);
    if (p > 0.001){
      g.strokeStyle = acc;
      g.shadowColor = acc; g.shadowBlur = 6;
      g.beginPath(); g.arc(c,c,r,A0,A0+p*(A1-A0)); g.stroke();
      g.shadowBlur = 0;
    }
    const a = A0 + p*(A1-A0);
    g.strokeStyle = '#f2f6ff'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c+Math.cos(a)*(r-8), c+Math.sin(a)*(r-8));
    g.lineTo(c+Math.cos(a)*(r-1), c+Math.sin(a)*(r-1));
    g.stroke();
    g.fillStyle = '#0c1017';
    g.beginPath(); g.arc(c,c,3.2,0,6.2832); g.fill();
    valEl.textContent = fmtVal(def, value);
    wrap.classList.toggle('on', def.kind==='bool' ? value>0.5 : false);
  }
  function commit(v){ value = v; set(value); draw(); }
  /* --- souris / tactile --- */
  let drag = null;
  cv.addEventListener('pointerdown', ev=>{
    ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
    drag = {y:ev.clientY, p:toPos(value)};
  });
  cv.addEventListener('pointermove', ev=>{
    if (!drag) return;
    const fine = ev.shiftKey ? 0.16 : 1;
    const dp = (drag.y - ev.clientY)/220*fine;
    commit(fromPos(drag.p + dp));
  });
  const stop = ev=>{ drag = null; };
  cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  cv.addEventListener('wheel', ev=>{
    ev.preventDefault();
    const step = (ev.shiftKey?0.004:0.02) * (ev.deltaY>0?-1:1);
    commit(fromPos(toPos(value)+step));
  }, {passive:false});
  cv.addEventListener('dblclick', ()=> commit(def.def));
  wrap.setValue = v=>{ value=v; draw(); };
  wrap.redraw = draw;
  wrap.commit = commit;
  draw();
  return wrap;
}

/* ---------- sélecteur (paramètre 'choice') ---------- */
function makeSelect(def, get, set){
  const row = el('div','row');
  const lb = el('div','lbl', def.label);
  lb.style.cssText = 'font-size:9.5px;color:#8b94a8;min-width:52px';
  const sel = document.createElement('select');
  def.options.forEach((o,i)=>{ const op=el('option',null,o); op.value=i; sel.append(op); });
  sel.value = Math.round(get());
  sel.onchange = ()=>{ const v=+sel.value; set(v); };
  row.append(lb, sel);
  row.setValue = v=>{ sel.value = Math.round(v); };
  row.redraw = ()=>{};
  return row;
}
/* ---------- interrupteur (paramètre 'bool') ---------- */
function makeToggle(def, get, set){
  const row = el('div','row');
  const b = el('button', null, def.label+' : '+(get()>0.5?'ON':'OFF'));
  const acc = ACC[def.sec]||'#ffb248';
  const paint = v=>{ b.textContent = def.label+' : '+(v>0.5?'ON':'OFF'); b.classList.toggle('on', v>0.5);
                     b.style.borderColor = v>0.5?acc+'88':''; };
  b.onclick = ()=>{ const v = get()>0.5?0:1; set(v); paint(v); };
  row.append(b);
  row.setValue = v=>paint(v);
  row.redraw = ()=>{};
  row.style.marginTop='4px';
  return row;
}

/* ---------- clavier virtuel ---------- */
const KEYMAP = { KeyA:0, KeyW:1, KeyS:2, KeyE:3, KeyD:4, KeyF:5, KeyT:6, KeyG:7, KeyY:8, KeyH:9, KeyU:10, KeyJ:11, KeyK:12, KeyO:13, KeyL:14, KeyP:15, Semicolon:16 };
const BLACKSET = [1,3,6,8,10];
class Keyboard {
  constructor(host, noteOn, noteOff, getOct){
    this.host = host; this.noteOn = noteOn; this.noteOff = noteOff; this.getOct = getOct;
    this.held = new Map();            // code -> note
    this.notes = new Map();           // note -> element
    this.build();
  }
  build(){
    this.host.innerHTML = '';
    const WHITE = 15;                        // 2 octaves + 1 (C3 -> C5)
    const wW = 100/WHITE;
    const wsemi = [0,2,4,5,7,9,11];
    for (let i=0;i<WHITE;i++){
      const semi = wsemi[i%7] + 12*Math.floor(i/7);
      const k = el('div','wk'); k.dataset.idx = i;
      this.host.append(k); this.notes.set(i, k);
      this.hook(k, i);
      const nxt = i+1<WHITE ? wsemi[(i+1)%7] + 12*Math.floor((i+1)/7) : 12;
      if (nxt-semis2(semi) === 2){                       // dièse entre deux touches blanches
        const b = el('div','bk'); b.dataset.idx = i+1;
        b.style.left = ((i+1)*wW)+'%'; b.style.transform = 'translateX(-50%)';
        this.host.append(b); this.notes.set(i+1, b);
        this.hook(b, i+1);
      }
    }
  }
  hook(node, gridIdx){
    node.addEventListener('pointerdown', ev=>{ ev.preventDefault(); node.classList.add('down'); this.press(gridIdx, true); });
    const off = ()=> this.press(gridIdx, false);
    node.addEventListener('pointerup', off);
    node.addEventListener('pointerleave', off);
    node.addEventListener('pointercancel', off);
  }
  press(idx, on){
    const note = (this.getOct()+1)*12 + idx;
    const map = this.notes.get(idx);
    if (map) map.classList.toggle('down', on);
    if (on) this.noteOn(note, 100/127); else this.noteOff(note);
  }
  key(code, on){
    const off = KEYMAP[code];
    if (off === undefined) return false;
    const idx = noteIdx(0)+off;
    if (on){
      if (this.held.has(code)) return true;
      const note = (this.getOct()+1)*12+idx;
      this.held.set(code, note);
      const e = this.notes.get(off);        // index dans la grille
      if (e) e.classList.add('down');
      this.noteOn(note, 100/127);
    } else {
      const note = this.held.get(code); this.held.delete(code);
      if (note != null){ this.noteOff(note); }
      const e = this.notes.get(off); if (e) e.classList.remove('down');
    }
    return true;
  }
  releaseAll(){ for (const [code,note] of this.held) this.noteOff(note); this.held.clear();
    this.notes.forEach(e=>e.classList.remove('down')); }
}
function noteIdx(i){ return i; }       // index 0 = Do (C) de l'octave courante
function semis2(semi){ return semi; }

/* ---------- presets ---------- */
const PRESETS = {
  'Init Analo': { mixAnalog:1, mixSampler:0, mixGrain:0 },
  'Basse Ladder': { mixAnalog:1, mixSampler:0, mixGrain:0, cutoff:380, reso:0.42, drive:0.45, subLevel:0.65, o2Semi:-12, o2Level:0.35,
                    fEnvAmt:0.55, fD:0.22, fS:0.15, aD:0.18, aS:0.6, aR:0.2, mono:1, glide:12, keyTrack:0.4, velAmt:0.5 },
  'Pad Large': { mixAnalog:1, o1Uni:3, o1Detune:22, o2Uni:3, o2Detune:17, o2Semi:0, o2Fine:9, cutoff:2200, reso:0.12,
                 aA:1.1, aD:1.6, aS:0.8, aR:1.8, fA:0.9, fD:1.5, fS:0.5, fR:1.4, chMix:0.45, chDepth:0.5, chRate:0.35,
                 rMix:0.42, rSize:0.72, mixSampler:0, mixGrain:0 },
  'Cloud (grain live)': { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:1, gDensity:42, gSize:70, gSpray:0.22, gPitchRand:3,
                          gPan:0.8, gReverse:0.25, gShape:0, gLivePos:110, rMix:0.4, rSize:0.66, dMix:0.18, dFb:0.42,
                          cutoff:4200, reso:0.2, aA:0.35, aR:1.4, fEnvAmt:0.3 },
  'Nuage Sampler': { mixAnalog:0, mixSampler:0.35, mixGrain:1, gSource:0, gDensity:16, gSize:210, gSpray:0.33, gPitchRand:0.4,
                     gReverse:0.2, gPan:0.9, gShape:0, chMix:0.3, rMix:0.5, rSize:0.8, dMix:0.15, aR:2.2, fEnvAmt:0 },
  'Sampler + Grain': { mixAnalog:0.35, mixSampler:0.75, mixGrain:0.8, gSource:2, gDensity:24, gSize:120, gSpray:0.2,
                       sLoop:1, sLoopXF:0.25, sPitch:0, dMix:0.2, rMix:0.28, cutoff:5200, fEnvAmt:0.25, chMix:0.25 },
  'Gel (freeze)': { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:1, gFreeze:1, gDensity:30, gSize:140, gSpray:0.1,
                    gPitchRand:0, rMix:0.55, rSize:0.9, aA:0.8, aR:2.5, gPan:0.7 },
  'Reese Unison': { mixAnalog:1, o1Uni:3, o1Detune:34, o2Uni:3, o2Detune:28, o2Semi:-12, o2Fine:14, mono:1, cutoff:760,
                    reso:0.28, drive:0.3, subLevel:0.5, keyTrack:0.2, fEnvAmt:0.3, dMix:0.1 }
};

/* ---------- synthèse des samples de la banque ---------- */
const BANKS = {
  'Accord Pad (synthé)': (sr)=>{
    const n = Math.floor(sr*2.2), l = new Float32Array(n), r = new Float32Array(n);
    const fr = [220, 261.63, 329.63, 392, 440];
    for (let i=0;i<n;i++){
      const t = i/sr;
      let sL=0, sR=0;
      for (let k=0;k<fr.length;k++){
        const f = fr[k]*(1 + 0.0012*Math.sin(6.2832*0.3*t+k));
        let saw=0;
        for (let h=1;h<=8;h++) saw += Math.sin(6.2832*f*h*t)/h;
        saw *= 0.4;
        const pan = (k-2)/4;
        sL += saw*(1-Math.max(0,pan)); sR += saw*(1+Math.min(0,pan));
      }
      const env = Math.min(1, t/0.4)*Math.exp(-1.6*t);
      l[i] = sL*0.2*env; r[i] = sR*0.2*env;
    }
    return {l,r};
  },
  'Cloche FM': (sr)=>{
    const n = Math.floor(sr*1.6), l = new Float32Array(n), r = new Float32Array(n);
    const f = 523.25, ratio = 3.47;
    for (let i=0;i<n;i++){
      const t=i/sr;
      const I = 6*Math.exp(-4.2*t);
      const e = Math.exp(-2.1*t);
      const s = Math.sin(6.2832*f*t + I*Math.sin(6.2832*f*ratio*t))*e;
      l[i]=s*0.42; r[i]=s*0.42*(1-0.15*Math.sin(6.2832*1.7*t));
    }
    return {l,r};
  },
  'Voix "aah"': (sr)=>{
    const n = Math.floor(sr*1.8), l = new Float32Array(n), r = new Float32Array(n);
    const f0 = 174.6, NH = 18;
    const gain = new Float32Array(NH+1);
    for (let h=1;h<=NH;h++){
      const fh = f0*h;
      gain[h] = (1.0*Math.exp(-Math.pow((fh-800)/420,2)) + 0.7*Math.exp(-Math.pow((fh-1150)/520,2))
               + 0.35*Math.exp(-Math.pow((fh-2900)/900,2)) + 0.05*Math.exp(-Math.pow(fh/2600,2)))/h;
    }
    for (let i=0;i<n;i++){
      const t=i/sr;
      const vib = 1 + 0.006*Math.sin(6.2832*5.2*t);
      let s=0;
      for (let h=1;h<=NH;h++) s += Math.sin(6.2832*f0*h*vib*t + h*0.7)*gain[h];
      const env = Math.min(1,t/0.12)*Math.exp(-0.85*t);
      l[i]=s*0.5*env; r[i]=s*0.48*env;
    }
    return {l,r};
  },
  'Boucle Drums': (sr)=>{
    const beat = 0.5, bars = 2, n = Math.floor(sr*beat*4*bars), l = new Float32Array(n), r = new Float32Array(n);
    const step = Math.floor(sr*beat/2);       // croches
    for (let s=0;s<n;s+=step){
      const k = s/step;
      if (k%4===0) addKick(l,r,s,sr);
      if (k%4===2) addSnare(l,r,s,sr);
      addHat(l,r,s,sr, k%2===0?0.16:0.09);
    }
    for (let i=0;i<n;i++){ l[i]*=0.9; r[i]*=0.9; }
    return {l,r};
  },
  'Texture bruit': (sr)=>{
    const n = Math.floor(sr*2.5), l = new Float32Array(n), r = new Float32Array(n);
    let lp=0, lp2=0;
    for (let i=0;i<n;i++){
      const t=i/sr;
      const white = Math.random()*2-1;
      lp += (white-lp)*0.02; lp2 += (lp-lp2)*0.06;
      const mod = 0.4+0.6*Math.pow(0.5+0.5*Math.sin(6.2832*0.23*t),2);
      l[i]=lp2*3.2*mod; r[i]=(lp2*3.0*mod + lp*0.6*mod);
    }
    return {l,r};
  }
};
function att2(x){ return Math.min(1,x)*Math.exp(-2.2*Math.max(0,x-0.35)); }
function rnd1(h){ return (Math.sin(h*12.9898)*43758.5453)%6.2832; }
/* normalise un sample à une crête cible (banques synthétisées) */
function normalize(l, r, target){
  let pk = 0;
  for (let i=0;i<l.length;i++){ const a=Math.abs(l[i]), b=Math.abs(r[i]); if(a>pk)pk=a; if(b>pk)pk=b; }
  if (pk < 1e-6) return {l,r};
  const g = target/pk;
  for (let i=0;i<l.length;i++){ l[i]*=g; r[i]*=g; }
  return {l,r};
}
/* fondu entrée/sortie de 25 ms sur chaque sample (évite les clics en boucle) */
function fadeEdges(l, r, sr){
  const f = Math.min(Math.floor(sr*0.025), Math.floor(l.length/4));
  for (let i=0;i<f;i++){ const g = i/f; l[i]*=g; r[i]*=g;
    const j = l.length-1-i; l[j]*=g; r[j]*=g; }
  return {l,r};
}
function addKick(l,r,at,sr){
  const n=Math.floor(sr*0.35);
  for (let i=0;i<n && at+i<l.length;i++){
    const t=i/sr, f=120*Math.exp(-22*t)+44;
    const s=Math.sin(6.2832*(44*t+ (120-44)*(1-Math.exp(-22*t))/22))*Math.exp(-7*t);
    l[at+i]+=s*0.85; r[at+i]+=s*0.85;
  }
}
function addSnare(l,r,at,sr){
  const n=Math.floor(sr*0.22);
  for (let i=0;i<n && at+i<l.length;i++){
    const t=i/sr, e=Math.exp(-18*t);
    const s=(Math.random()*2-1)*0.6*e + Math.sin(6.2832*196*t)*0.35*e;
    l[at+i]+=s*0.7; r[at+i]+=s*0.68;
  }
}
function addHat(l,r,at,sr,amp){
  const n=Math.floor(sr*0.06);
  let hp=0, prev=0;
  for (let i=0;i<n && at+i<l.length;i++){
    const t=i/sr, e=Math.exp(-52*t);
    const w=Math.random()*2-1;
    hp = w-prev; prev=w;                       // différentiateur = passe-haut
    l[at+i]+=hp*0.3*e*amp*6; r[at+i]+=hp*0.28*e*amp*6;
  }
}
