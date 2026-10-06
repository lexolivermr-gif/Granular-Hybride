/* =========================================================================
   GRANULAR HYBRID — Moteur DSP
   Moteur unique utilisé par l'AudioWorklet ET par le repli ScriptProcessor.
   Il contient : 2 oscillateurs analogiques (PolyBLEP + unison),
   sub/noise/ring, filtre ladder 24 dB ZDF + SVF, 2 enveloppes ADSR,
   LFO multi-destinations, lecteur sampler, moteur granulaire (sample OU
   synthé live), effets (chorus, delay, reverb Freeverb, saturation master).
   Aucune dépendance DOM : ce code tourne tel quel dans un AudioWorklet.
   ========================================================================= */
function ENGINE_CODE(){
  'use strict';

  const clamp = (x,a,b)=> x<a?a:(x>b?b:x);
  const TAU = 6.283185307179586;
  // tanh rapide borné (Padé) — indispensable dans les boucles de filtre
  function tclip(x){
    if (x < -3) return -1;
    if (x >  3) return  1;
    const x2 = x*x;
    return x*(27+x2)/(27+9*x2);
  }
  function polyBlep(t, dt){
    if (t < dt){ t/=dt; return t+t-t*t-1; }
    if (t > 1-dt){ t=(t-1)/dt; return t*t+t+t+1; }
    return 0;
  }
  function hermite(buf, len, pos){
    if (pos < 0 || pos >= len-1) return 0;
    const i = pos|0, t = pos-i;
    const x0 = buf[i>0?i-1:0], x1 = buf[i], x2 = buf[i+1], x3 = buf[i+2<len?i+2:len-1];
    const c1 = 0.5*(x2-x0), c2 = x0-2.5*x1+2*x2-0.5*x3, c3 = 0.5*(x3-x0)+1.5*(x1-x2);
    return ((c3*t+c2)*t+c1)*t+x1;
  }
  function hermiteRing(buf, len, pos){
    pos = ((pos % len)+len)%len;
    const i = pos|0, t = pos-i, i1=(i+1)%len, i2=(i+2)%len, i0=(i-1+len)%len;
    const x0=buf[i0], x1=buf[i], x2=buf[i1], x3=buf[i2];
    const c1 = 0.5*(x2-x0), c2 = x0-2.5*x1+2*x2-0.5*x3, c3 = 0.5*(x3-x0)+1.5*(x1-x2);
    return ((c3*t+c2)*t+c1)*t+x1;
  }

  /* ------------------------------------------------------------------ */
  /* PARAMÈTRES — un seul tableau indexé, partagé UI/DSP                */
  /* kind : lin | log | int | bool | choice                             */
  /* sk   : courbe du knob (1 = linéaire, 3 = très logarithmique)       */
  /* ------------------------------------------------------------------ */
  const WAVES = ['Saw','Square','Tri','Sine'];
  const PARAM_DEFS = [
    // ---- GLOBAL
    {id:'master',    label:'Master',   sec:'global', min:0,   max:1.5, def:0.8,  kind:'lin'},
    {id:'poly',      label:'Voix',     sec:'global', min:1,   max:16,  def:8,    kind:'int'},
    {id:'mono',      label:'Mono',     sec:'global', min:0,   max:1,   def:0,    kind:'bool'},
    {id:'glide',     label:'Glide ms', sec:'global', min:0,   max:500, def:0,    kind:'lin', sk:2, unit:'ms'},
    {id:'bendRange', label:'Bend st',  sec:'global', min:0,   max:24,  def:2,    kind:'int'},

    // ---- MIX MOTEURS
    {id:'mixAnalog',  label:'Analo',  sec:'mix', min:0, max:1, def:1,   kind:'lin'},
    {id:'mixSampler', label:'Sampler',sec:'mix', min:0, max:1, def:0,   kind:'lin'},
    {id:'mixGrain',   label:'Grain',  sec:'mix', min:0, max:1, def:0,   kind:'lin'},

    // ---- OSC 1
    {id:'o1Wave',   label:'Forme',    sec:'osc1', min:0, max:3,  def:0,   kind:'choice', options:WAVES},
    {id:'o1Oct',    label:'Oct',      sec:'osc1', min:-2,max:2,  def:0,   kind:'int'},
    {id:'o1Semi',   label:'Semi',     sec:'osc1', min:-12,max:12,def:0,   kind:'int'},
    {id:'o1Fine',   label:'Fine ct',  sec:'osc1', min:-50,max:50,def:0,   kind:'lin', unit:'ct'},
    {id:'o1PW',     label:'PW',       sec:'osc1', min:0.05,max:0.95,def:0.5, kind:'lin'},
    {id:'o1Level',  label:'Niveau',   sec:'osc1', min:0, max:1,  def:0.8, kind:'lin'},
    {id:'o1Uni',    label:'Unison',   sec:'osc1', min:1, max:3,  def:1,   kind:'int'},
    {id:'o1Detune', label:'Détune ct',sec:'osc1', min:0, max:50, def:9,   kind:'lin', unit:'ct'},
    {id:'o1Spread', label:'Largeur',  sec:'osc1', min:0, max:1,  def:0.5, kind:'lin'},

    // ---- OSC 2
    {id:'o2Wave',   label:'Forme',    sec:'osc2', min:0, max:3,  def:0,   kind:'choice', options:WAVES},
    {id:'o2Oct',    label:'Oct',      sec:'osc2', min:-2,max:2,  def:0,   kind:'int'},
    {id:'o2Semi',   label:'Semi',     sec:'osc2', min:-12,max:12,def:-12, kind:'int'},
    {id:'o2Fine',   label:'Fine ct',  sec:'osc2', min:-50,max:50,def:6,   kind:'lin', unit:'ct'},
    {id:'o2PW',     label:'PW',       sec:'osc2', min:0.05,max:0.95,def:0.5, kind:'lin'},
    {id:'o2Level',  label:'Niveau',   sec:'osc2', min:0, max:1,  def:0.5, kind:'lin'},
    {id:'o2Uni',    label:'Unison',   sec:'osc2', min:1, max:3,  def:1,   kind:'int'},
    {id:'o2Detune', label:'Détune ct',sec:'osc2', min:0, max:50, def:7,   kind:'lin', unit:'ct'},
    {id:'o2Spread', label:'Largeur',  sec:'osc2', min:0, max:1,  def:0.4, kind:'lin'},

    // ---- SUB / NOISE / RING
    {id:'subLevel',  label:'Sub',      sec:'extra', min:0, max:1, def:0,   kind:'lin'},
    {id:'subOct',    label:'Sub oct',  sec:'extra', min:1, max:2, def:1,   kind:'int'},
    {id:'subWave',   label:'Sub forme',sec:'extra', min:0, max:1, def:0,   kind:'choice', options:['Square','Tri']},
    {id:'noiseLevel',label:'Noise',    sec:'extra', min:0, max:1, def:0,   kind:'lin'},
    {id:'noiseType', label:'Noise col',sec:'extra', min:0, max:2, def:0,   kind:'choice', options:['Blanc','Rose','Brun']},
    {id:'ringLevel', label:'Ring mod', sec:'extra', min:0, max:1, def:0,   kind:'lin'},

    // ---- FILTRE
    {id:'fType',    label:'Type',    sec:'filter', min:0, max:3, def:0, kind:'choice', options:['LP 24dB','LP 12dB','HP 12dB','BP 12dB']},
    {id:'cutoff',   label:'Cutoff',  sec:'filter', min:20, max:18000, def:900, kind:'log', sk:3, unit:'Hz'},
    {id:'reso',     label:'Réso',    sec:'filter', min:0, max:1, def:0.15, kind:'lin'},
    {id:'drive',    label:'Drive',   sec:'filter', min:0, max:1, def:0.15, kind:'lin'},
    {id:'fEnvAmt',  label:'Env →',   sec:'filter', min:-1, max:1, def:0.45, kind:'lin'},
    {id:'keyTrack', label:'Keytrack',sec:'filter', min:0, max:1, def:0.3, kind:'lin'},
    {id:'fVel',     label:'Vél →',   sec:'filter', min:0, max:1, def:0.2, kind:'lin'},

    // ---- ENV FILTRE
    {id:'fA', label:'Att', sec:'fenv', min:0, max:5, def:0.004, kind:'log', sk:3, unit:'s'},
    {id:'fD', label:'Dec', sec:'fenv', min:0, max:5, def:0.45,  kind:'log', sk:3, unit:'s'},
    {id:'fS', label:'Sus', sec:'fenv', min:0, max:1, def:0.25,  kind:'lin'},
    {id:'fR', label:'Rel', sec:'fenv', min:0, max:5, def:0.35,  kind:'log', sk:3, unit:'s'},

    // ---- ENV AMP
    {id:'aA',     label:'Att', sec:'aenv', min:0, max:5, def:0.006, kind:'log', sk:3, unit:'s'},
    {id:'aD',     label:'Dec', sec:'aenv', min:0, max:5, def:0.25,  kind:'log', sk:3, unit:'s'},
    {id:'aS',     label:'Sus', sec:'aenv', min:0, max:1, def:0.85,  kind:'lin'},
    {id:'aR',     label:'Rel', sec:'aenv', min:0.002, max:5, def:0.4, kind:'log', sk:3, unit:'s'},
    {id:'velAmt', label:'Vél → amp', sec:'aenv', min:0, max:1, def:0.7, kind:'lin'},

    // ---- LFO
    {id:'lfoRate',  label:'Vitesse', sec:'lfo', min:0.02, max:30, def:4, kind:'log', sk:3, unit:'Hz'},
    {id:'lfoWave',  label:'Forme',   sec:'lfo', min:0, max:3, def:1, kind:'choice', options:['Sine','Tri','Square','S&H']},
    {id:'lfoPitch', label:'→ Pitch', sec:'lfo', min:0, max:12, def:0, kind:'lin', unit:'st'},
    {id:'lfoCut',   label:'→ Cutoff',sec:'lfo', min:0, max:4, def:0, kind:'lin', unit:'oct'},
    {id:'lfoPW',    label:'→ PW',    sec:'lfo', min:0, max:0.45, def:0, kind:'lin'},
    {id:'lfoPos',   label:'→ Grain pos', sec:'lfo', min:0, max:1, def:0, kind:'lin'},
    {id:'lfoTrem',  label:'→ Tremolo',sec:'lfo', min:0, max:1, def:0, kind:'lin'},

    // ---- SAMPLER
    {id:'sPitch',   label:'Pitch st',sec:'sampler', min:-24, max:24, def:0, kind:'int'},
    {id:'sFine',    label:'Fine ct', sec:'sampler', min:-50, max:50, def:0, kind:'lin', unit:'ct'},
    {id:'sRoot',    label:'Fond.',   sec:'sampler', min:24, max:84, def:48, kind:'int'},
    {id:'sStart',   label:'Début',   sec:'sampler', min:0, max:1, def:0, kind:'lin'},
    {id:'sEnd',     label:'Fin',     sec:'sampler', min:0, max:1, def:1, kind:'lin'},
    {id:'sLoop',    label:'Loop',    sec:'sampler', min:0, max:1, def:1, kind:'bool'},
    {id:'sLoopXF',  label:'XFade',   sec:'sampler', min:0, max:1, def:0.15, kind:'lin'},
    {id:'sReverse', label:'Reverse', sec:'sampler', min:0, max:1, def:0, kind:'bool'},
    {id:'sKeyTrack',label:'Pitch→note',sec:'sampler', min:0, max:1, def:1, kind:'lin'},
    {id:'sPan',     label:'Pan',     sec:'sampler', min:-1, max:1, def:0, kind:'lin'},
    {id:'sVel',     label:'Vél →',   sec:'sampler', min:0, max:1, def:0.8, kind:'lin'},
    {id:'sLevel',   label:'Niveau',  sec:'sampler', min:0, max:2, def:1.15, kind:'lin'},

    // ---- GRANULAIRE
    {id:'gSource',   label:'Source',  sec:'grain', min:0, max:2, def:0, kind:'choice', options:['Sample','Synth live','Sample+Live']},
    {id:'gPosition', label:'Position',sec:'grain', min:0, max:1, def:0.3, kind:'lin'},
    {id:'gSize',     label:'Taille ms',sec:'grain',min:5, max:500, def:90, kind:'log', sk:3, unit:'ms'},
    {id:'gDensity',  label:'Densité', sec:'grain', min:0.5, max:90, def:16, kind:'log', sk:3, unit:'/s'},
    {id:'gSpray',    label:'Spray',   sec:'grain', min:0, max:1, def:0.15, kind:'lin'},
    {id:'gPitch',    label:'Pitch st',sec:'grain', min:-24, max:24, def:0, kind:'int'},
    {id:'gPitchRand',label:'±Pitch st',sec:'grain',min:0, max:24, def:0, kind:'lin', unit:'st'},
    {id:'gReverse',  label:'Reverse %',sec:'grain',min:0, max:1, def:0.15, kind:'lin'},
    {id:'gPan',      label:'Stéréo',  sec:'grain', min:0, max:1, def:0.6, kind:'lin'},
    {id:'gShape',    label:'Fenêtre', sec:'grain', min:0, max:3, def:0, kind:'choice', options:['Hann','Triangle','Exp','Tukey']},
    {id:'gLivePos',  label:'Live recul',sec:'grain',min:20, max:800, def:120, kind:'log', sk:2, unit:'ms'},
    {id:'gKeyTrack', label:'Keytrack',sec:'grain', min:0, max:1, def:0, kind:'lin'},
    {id:'gJitter',   label:'Jitter',  sec:'grain', min:0, max:1, def:0.35, kind:'lin'},
    {id:'gFreeze',   label:'Freeze',  sec:'grain', min:0, max:1, def:0, kind:'bool'},
    {id:'gLevel',    label:'Niveau',  sec:'grain', min:0, max:2, def:1, kind:'lin'},

    // ---- FX
    {id:'chMix',    label:'Chorus mix', sec:'fx', min:0, max:1, def:0, kind:'lin'},
    {id:'chRate',   label:'Chorus vit', sec:'fx', min:0.05, max:8, def:0.7, kind:'log', sk:2, unit:'Hz'},
    {id:'chDepth',  label:'Chorus prof',sec:'fx', min:0, max:1, def:0.35, kind:'lin'},
    {id:'dTime',    label:'Delay ms',   sec:'fx', min:20, max:1500, def:360, kind:'log', sk:2, unit:'ms'},
    {id:'dFb',      label:'Delay fb',   sec:'fx', min:0, max:0.95, def:0.34, kind:'lin'},
    {id:'dMix',     label:'Delay mix',  sec:'fx', min:0, max:1, def:0.12, kind:'lin'},
    {id:'dTone',    label:'Delay tone', sec:'fx', min:0, max:1, def:0.5, kind:'lin'},
    {id:'rSize',    label:'Verb size',  sec:'fx', min:0, max:1, def:0.5, kind:'lin'},
    {id:'rDamp',    label:'Verb damp',  sec:'fx', min:0, max:1, def:0.4, kind:'lin'},
    {id:'rMix',     label:'Verb mix',   sec:'fx', min:0, max:1, def:0.18, kind:'lin'},
    {id:'rWidth',   label:'Verb larg',  sec:'fx', min:0, max:1, def:1, kind:'lin'},
    {id:'outDrive', label:'Sat. master',sec:'fx', min:0, max:1, def:0.2, kind:'lin'}
  ];
  const P = {};
  PARAM_DEFS.forEach((d,i)=>{ P[d.id]=i; d.idx=i; });
  const NP = PARAM_DEFS.length;
  const SECTIONS = [
    {id:'global', name:'Global',        acc:'#ffb248'},
    {id:'mix',    name:'Mix moteurs',   acc:'#ff7ac0'},
    {id:'osc1',   name:'Oscillateur 1', acc:'#ffb248'},
    {id:'osc2',   name:'Oscillateur 2', acc:'#ff9a3d'},
    {id:'extra',  name:'Sub · Noise · Ring', acc:'#ffd479'},
    {id:'filter', name:'Filtre',        acc:'#5aa9ff'},
    {id:'fenv',   name:'Enveloppe filtre', acc:'#7fc0ff'},
    {id:'aenv',   name:'Enveloppe ampli',  acc:'#9fd4ff'},
    {id:'lfo',    name:'LFO',           acc:'#62e0ff'},
    {id:'sampler',name:'Sampler',       acc:'#3fd8c2'},
    {id:'grain',  name:'Granulaire',    acc:'#a97bff'},
    {id:'fx',     name:'Effets',        acc:'#7ee081'}
  ];

  /* ------------------------------------------------------------------ */
  /* OSCILLATEUR PolyBLEP (+ unison / stéréo)                           */
  /* ------------------------------------------------------------------ */
  class Osc {
    constructor(){ this.ph=0; }
    reset(){ this.ph=0; }
    step(freq, sr, wave, pw){
      const dt = freq/sr;
      this.ph += dt;
      if (this.ph >= 1) this.ph -= Math.floor(this.ph);
      const t = this.ph;
      let s;
      switch(wave){
        case 1: { s = t<pw ? 1 : -1; s += polyBlep(t,dt); s -= polyBlep((t-pw+1)%1,dt); break; }
        case 2: s = 1 - 4*Math.abs(t-0.5); break;
        case 3: s = Math.sin(TAU*t); break;
        default: s = 2*t-1 - polyBlep(t,dt);
      }
      return s;
    }
  }

  /* ------------------------------------------------------------------ */
  /* FILTRES                                                            */
  /* Ladder 4 pôles ZDF (Moog-like, saturé) + SVF TPT (LP12/HP/BP)      */
  /* ------------------------------------------------------------------ */
  class Ladder {
    constructor(){ this.a=this.b=this.c=this.d=0; this.G=0; }
    reset(){ this.a=this.b=this.c=this.d=0; }
    setCut(fc, sr){
      fc = clamp(fc, 15, sr*0.45);
      const g = Math.tan(Math.PI*fc/sr);
      this.G = g/(1+g);
    }
    process(x, k){                       // k : 0 → 4.2 (auto-oscillation)
      const G=this.G, G2=G*G, G3=G2*G, G4=G3*G;
      const S = ((this.a*G+this.b)*G+this.c)*G+this.d;
      const y4 = (G4*x + (1-G)*S)/(1 + k*G4);
      const u = tclip(x - k*y4);         // saturation dans la boucle
      let v = (u-this.a)*G, y = v+this.a; this.a = y+v;
      v = (y-this.b)*G; y = v+this.b; this.b = y+v;
      v = (y-this.c)*G; y = v+this.c; this.c = y+v;
      v = (y-this.d)*G; y = v+this.d; this.d = y+v;
      return y*(1+0.3*k);
    }
  }
  class SVF {
    constructor(){ this.i1=this.i2=0; this.a1=this.a2=this.a3=0; this.k=1; }
    reset(){ this.i1=this.i2=0; }
    setCut(fc, sr, res){
      fc = clamp(fc, 15, sr*0.45);
      this.k = 1/(0.5+res*12);
      const g = Math.tan(Math.PI*fc/sr);
      this.a1 = 1/(1+g*(g+this.k)); this.a2 = g*this.a1; this.a3 = g*this.a2;
    }
    process(x, mode){                    // 0 LP · 1 HP · 2 BP
      const v3 = x-this.i2;
      const v1 = this.a1*this.i1 + this.a2*v3;
      const v2 = this.i2 + this.a2*this.i1 + this.a3*v3;
      this.i1 = 2*v1-this.i1; this.i2 = 2*v2-this.i2;
      if (mode===0) return v2;
      if (mode===1) return x - this.k*v1 - v2;
      return v1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* ENVELOPPE / LFO                                                    */
  /* ------------------------------------------------------------------ */
  class ADSR {
    constructor(){ this.v=0; this.st=0; }        // 0 off ·1 att ·2 dec ·3 sus ·4 rel
    reset(){ this.v=0; this.st=0; }
    gateOn(){ this.st=1; }
    gateOff(){ if (this.st!==0) this.st=4; }
    process(sr,A,D,S,R){
      switch(this.st){
        case 1: { const c=1-Math.exp(-1/(sr*Math.max(5e-4,A)*0.35)); this.v+=(1.08-this.v)*c; if(this.v>=1){this.v=1;this.st=2;} break; }
        case 2: { const c=Math.exp(-1/(sr*Math.max(1e-3,D)*0.35)); this.v=S+(this.v-S)*c; if(Math.abs(this.v-S)<1e-4) this.st=3; break; }
        case 3: this.v=S; break;
        case 4: { const c=Math.exp(-1/(sr*Math.max(2e-3,R)*0.35)); this.v*=c; if(this.v<2e-4){this.v=0;this.st=0;} break; }
      }
      return this.v;
    }
  }
  class LFO {
    constructor(){ this.ph=0; this.sh=0; this.prev=0; }
    reset(){ this.ph=0; }
    process(sr, rate, wave){
      this.ph += rate/sr;
      if (this.ph >= 1){ this.ph -= Math.floor(this.ph); this.sh = Math.random()*2-1; }
      switch(wave){
        case 0: return Math.sin(TAU*this.ph);
        case 1: return 4*Math.abs(this.ph-0.5)-1;
        case 2: return this.ph<0.5?1:-1;
        default: return this.sh;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* GRAIN + NUAGE DE GRAINS                                            */
  /* ------------------------------------------------------------------ */
  class Grain {
    constructor(){ this.on=false; this.rp=0; this.inc=1; this.life=0; this.len=1; this.sp=1; this.gl=0.5; this.gr=0.5; }
  }
  const MAX_GRAINS_PER_VOICE = 14;
  class GrainCloud {
    constructor(sr){
      this.gs = []; for (let i=0;i<MAX_GRAINS_PER_VOICE;i++) this.gs.push(new Grain());
      this.idx = 0; this.timer = 0; this.frozenBase = -1; this.lfoPos = 0; this.posViz = 0;
    }
    spawn(p, sr, smpLen, liveLen, keyRatio, writeHead, ringLen, freeze){
      const g = this.gs[this.idx]; this.idx = (this.idx+1)%this.gs.length;
      const src = p[P.gSource];
      const segLen = p[P.gSize]*0.001*sr;
      const live = (src===1) || (src===2 && Math.random()<0.5);
      const len = live ? liveLen : smpLen;
      if (len < 8) return;
      const motion = this.lfoPos;
      const spray = freeze ? 0 : p[P.gSpray];
      const posN = clamp(p[P.gPosition] + motion + (Math.random()*2-1)*spray*0.5, 0, 1);
      const pitch = p[P.gPitch] + (freeze ? 0 : (Math.random()*2-1)*p[P.gPitchRand]);
      const rev = !freeze && Math.random() < p[P.gReverse];
      let base;
      if (live){
        const back = p[P.gLivePos]*0.001*sr;
        if (this.frozenBase >= 0 && p[P.gFreeze] > 0.5) base = this.frozenBase;
        else {
          base = writeHead - back - segLen - Math.random()*segLen*0.5;
          this.frozenBase = base;
        }
        base = ((base%ringLen)+ringLen)%ringLen;
      } else {
        const usable = Math.max(8, len-segLen-2);
        base = clamp(posN,0,1)*usable;
      }
      const pan = (Math.random()*2-1)*p[P.gPan];
      const a = (pan+1)*0.25*Math.PI;
      g.gl = Math.cos(a); g.gr = Math.sin(a);
      g.sp = 1; g.life = 0; g.len = Math.max(8, segLen);
      const ratio = keyRatio*Math.pow(2, pitch/12);
      g.inc = (rev ? -ratio : ratio) * (live ? 1 : 1);
      g.rp = base + (rev ? segLen : 0);
      g.live = live ? 1 : 0;
      g.on = true;
    }
    /* Renvoie le L/R mono-du-grain accumulé dans out[] (2 cases) */
    process(smpL, smpR, smpLen, rL, rR, ringLen, out){
      let l = 0, r = 0;
      for (let i=0;i<this.gs.length;i++){
        const g = this.gs[i];
        if (!g.on) continue;
        const t = g.life/g.len;
        if (t >= 1 || g.life >= g.len){ g.on=false; continue; }
        let w;
        switch(g.sp){
          case 0: w = 0.5-0.5*Math.cos(TAU*t); break;
          case 1: w = 1-Math.abs(2*t-1); break;
          case 2: w = (1-Math.exp(-25*t))*Math.exp(-3.4*t); break;
          default: w = t<0.15 ? 0.5-0.5*Math.cos(TAU*t/0.3) : (t>0.85 ? 0.5-0.5*Math.cos(TAU*(1-t)/0.3) : 1);
        }
        const rp = ((g.rp%ringLen)+ringLen)%ringLen;
        let sl, sr2;
        if (g.live){ sl = hermiteRing(rL, ringLen, rp); sr2 = hermiteRing(rR, ringLen, rp); }
        else { sl = hermite(smpL, smpLen, g.rp); sr2 = hermite(smpR, smpLen, g.rp); }
        l += sl*w*g.gl; r += sr2*w*g.gr;
        g.rp += g.inc; g.life++;
      }
      out[0]=l; out[1]=r;
    }
    freeCount(){ let n=0; for (let i=0;i<this.gs.length;i++) if (this.gs[i].on) n++; return n; }
    kill(){ for (let i=0;i<this.gs.length;i++) this.gs[i].on=false; }
  }

  /* ------------------------------------------------------------------ */
  /* VOIX                                                               */
  /* ------------------------------------------------------------------ */
  const RING_SECONDS = 2.0;
  class Voice {
    constructor(sr, idx){
      this.idx = idx;
      this.o1 = new Osc(); this.o2 = new Osc(); this.oSub = new Osc();
      this.ladL = new Ladder(); this.ladR = new Ladder();
      this.svfL = new SVF();    this.svfR = new SVF();
      this.ampEnv = new ADSR(); this.fEnv = new ADSR(); this.lfo = new LFO();
      this.cloud = new GrainCloud(sr);
      this.grainOut = [0,0];
      this.note = 60; this.vel = 0.8; this.gate = false; this.active = false;
      this.freq = 261.63; this.target = 261.63; this.age = 0;
      this.holdStart = 0;
      this.ringLen = Math.floor(RING_SECONDS*sr);
      this.rL = new Float32Array(this.ringLen); this.rR = new Float32Array(this.ringLen);
      this.wHead = 0;
      this.smpOn = false; this.smpPos = 0; this.smpInc = 1; this.smpDir = 1;
      this.noisePrev = 0; this.noiseSlow = 0; this.brown = 0;
      this.viz = 0;
    }
    reset(sr){
      this.o1.reset(); this.o2.reset(); this.oSub.reset();
      this.ladL.reset(); this.ladR.reset(); this.svfL.reset(); this.svfR.reset();
      this.ampEnv.reset(); this.fEnv.reset(); this.lfo.reset();
      this.cloud.kill(); this.smpOn = false; this.active = false; this.gate = false;
    }
    noteOn(note, vel, glide, sr, p, shared){
      this.note = note; this.vel = vel; this.gate = true;
      this.target = 440*Math.pow(2,(note-69)/12);
      if (!this.active || glide <= 0.001){ this.freq = this.target; }
      this.active = true; this.age = 0;
      this.ampEnv.gateOn(); this.fEnv.gateOn();
      this.cloud.frozenBase = -1;
      // ---- lecteur sampler
      const st = clamp(p[P.sStart],0,0.999), en = clamp(p[P.sEnd], st+0.0005, 1);
      this.smpS = st*Math.max(1,shared.smpLen-2);
      this.smpE = en*Math.max(1,shared.smpLen-2);
      this.smpRatio = Math.pow(2,(p[P.sPitch]+p[P.sFine]*0.01+(note-p[P.sRoot])*p[P.sKeyTrack])/12);
      this.smpDir = p[P.sReverse]>0.5 ? -1 : 1;
      this.smpPos = this.smpDir<0 ? this.smpE : this.smpS;
      this.smpOn = shared.smpLen > 8;
    }
    noteOff(){ this.gate = false; this.ampEnv.gateOff(); this.fEnv.gateOff(); }
    quickRelease(){ this.gate=false; this.ampEnv.st=4; }
    steal(){ this.gate=false; this.ampEnv.st=4; }

    render(sr, p, shared, outL, outR, n){
      const o1=this.o1, o2=this.o2, oSub=this.oSub, ladL=this.ladL, ladR=this.ladR;
      const svfL=this.svfL, svfR=this.svfR, amp=this.ampEnv, fe=this.fEnv, lfo=this.lfo, cloud=this.cloud;
      const smpL=shared.smpL, smpR=shared.smpR, smpLen=shared.smpLen;
      const ringLen=this.ringLen, rL=this.rL, rR=this.rR;
      const glideCoef = p[P.glide]>0.1 ? 1-Math.exp(-1/(sr*Math.max(0.001,p[P.glide]*0.001)*0.35)) : 1;
      const w1=p[P.o1Wave]|0, w2=p[P.o2Wave]|0, pw1=p[P.o1PW], pw2=p[P.o2PW];
      const lvl1=p[P.o1Level], lvl2=p[P.o2Level], uni1=p[P.o1Uni]|0, uni2=p[P.o2Uni]|0;
      const det1=p[P.o1Detune], det2=p[P.o2Detune], spr1=p[P.o1Spread], spr2=p[P.o2Spread];
      const subLvl=p[P.subLevel], subOct=p[P.subOct]|0, subW=p[P.subWave]|0;
      const nzLvl=p[P.noiseLevel], nzType=p[P.noiseType]|0, ringLvl=p[P.ringLevel];
      const mAna=p[P.mixAnalog], mSmp=p[P.mixSampler], mGrn=p[P.mixGrain];
      const drive=p[P.drive], fType=p[P.fType]|0, reso=p[P.reso];
      const baseCut=p[P.cutoff], kt=p[P.keyTrack], fVel=p[P.fVel], fEnvAmt=p[P.fEnvAmt];
      const lfoRate=p[P.lfoRate], lfoWave=p[P.lfoWave]|0, lfoPitch=p[P.lfoPitch], lfoCut=p[P.lfoCut];
      const lfoPW=p[P.lfoPW], lfoPos=p[P.lfoPos], lfoTrem=p[P.lfoTrem];
      const gDens=p[P.gDensity], gJit=p[P.gJitter], gShape=p[P.gShape]|0, freeze=p[P.gFreeze]>0.5;
      const gSrc=p[P.gSource]|0, gKT=p[P.gKeyTrack];
      const velAmp = 1-p[P.velAmt]*(1-this.vel);
      const bendMul = Math.pow(2, (shared.bend||0)*p[P.bendRange]/12);
      const drv = 1+drive*7, drvOut = 1/(1+drive*2.4);
      const keyRatio = Math.pow(2,(this.note-p[P.sRoot])/12)*gKT + (1-gKT);
      const gInterval = sr/Math.max(0.1,gDens);
      const sLevel = p[P.sLevel]; const gLevel = p[P.gLevel];
      const smpPan = p[P.sPan]; const pa = (smpPan+1)*0.25*Math.PI, smpGL=Math.cos(pa), smpGR=Math.sin(pa);
      const smpLoop = p[P.sLoop]>0.5, smpRev = p[P.sReverse]>0.5;
      const loopXF = p[P.sLoopXF];
      let out = 0;
      for (let i=0;i<n;i++){
        // ---------- enveloppes / LFO ----------
        const e1 = amp.process(sr,p[P.aA],p[P.aD],p[P.aS],p[P.aR]);
        const e2 = fe.process(sr,p[P.fA],p[P.fD],p[P.fS],p[P.fR]);
        const lv = lfo.process(sr,lfoRate,lfoWave);
        if (amp.st===0 && !this.gate){ this.active=false; break; }
        // ---------- pitch ----------
        this.freq += (this.target-this.freq)*glideCoef;
        let f = this.freq*bendMul*Math.pow(2, lv*lfoPitch/12);
        // ---------- oscillateurs ----------
        const pw1m = clamp(pw1 + lv*lfoPW, 0.02, 0.98), pw2m = clamp(pw2 + lv*lfoPW, 0.02, 0.98);
        let aL=0, aR=0;
        if (lvl1>1e-4){
          for (let u=0;u<uni1;u++){
            const off = uni1===1 ? 0 : (u-(uni1-1)/2), dt2 = Math.pow(2, off*det1/1200);
            const s = o1.step(f*dt2, sr, w1, pw1m);
            const pan = off*spr1*0.9; const a2=(pan+1)*0.25*Math.PI;
            aL += s*Math.cos(a2); aR += s*Math.sin(a2);
          }
          aL *= lvl1/Math.sqrt(uni1); aR *= lvl1/Math.sqrt(uni1);
        }
        if (lvl2>1e-4){
          for (let u=0;u<uni2;u++){
            const off = uni2===1 ? 0 : (u-(uni2-1)/2), dt2 = Math.pow(2, off*det2/1200);
            const s = o2.step(f*dt2, sr, w2, pw2m);
            const pan = off*spr2*0.9; const a2=(pan+1)*0.25*Math.PI;
            aL += s*Math.cos(a2); aR += s*Math.sin(a2);
          }
          aL *= lvl1>1e-4?0.75:1; aR *= lvl1>1e-4?0.75:1;
          aL *= lvl2/Math.sqrt(uni2)*1.33; aR *= lvl2/Math.sqrt(uni2)*1.33;
        }
        let mono = 0;
        if (subLvl>1e-4){
          const s = oSub.step(f/Math.pow(2,subOct), sr, subW===1?2:1, 0.5);
          mono += s*subLvl*0.9;
        }
        if (nzLvl>1e-4){
          let n = Math.random()*2-1;
          if (nzType===1){ this.noiseSlow = this.noiseSlow*0.96 + n*0.04; n = this.noiseSlow*3.2; }
          else if (nzType===2){ this.brown = clamp(this.brown + n*0.02, -1, 1); n = this.brown*1.6; }
          mono += n*nzLvl*0.5;
        }
        if (ringLvl>1e-4) mono += (aL*0.5)*(aR*0.5)*ringLvl*2.4;
        const anaL = (aL+mono)*mAna, anaR = (aR+mono)*mAna;
        // ---------- écriture du ring buffer "live" pour le granulaire ----------
        this.wHead = (this.wHead+1)%ringLen;
        // NB : on enregistre le signal ANALO BRUT (pré-mix) pour que le
        // granulaire puisse être la seule sortie audible si Analo = 0
        rL[this.wHead] = aL+mono; rR[this.wHead] = aR+mono;
        // ---------- sampler ----------
        let smpLv=0, smpRv=0;
        if (mSmp>1e-4 && this.smpOn && smpLen>8){
          const pos = this.smpPos;
          let l1 = hermite(smpL,smpLen,pos), r1 = hermite(smpR,smpLen,pos);
          // boucle avec crossfade égale-puissance (fond la fin vers le début)
          if (smpLoop){
            const loopLen = Math.max(16, this.smpE-this.smpS);
            const xf = Math.min(loopLen*0.5, loopXF*loopLen);
            const cur = smpRev ? (this.smpE-pos) : (pos-this.smpS);
            if (xf>8 && cur < xf){
              const th = (cur/xf)*Math.PI*0.5;
              const a2 = Math.sin(th), b2 = Math.cos(th);
              const alt = smpRev ? this.smpS + (xf-cur) : this.smpE - xf + cur;
              l1 = l1*a2 + hermite(smpL,smpLen,alt)*b2;
              r1 = r1*a2 + hermite(smpR,smpLen,alt)*b2;
            }
          }
          this.smpPos += smpRev ? -this.smpRatio : this.smpRatio;
          if (smpRev ? this.smpPos <= this.smpS : this.smpPos >= this.smpE){
            if (smpLoop) this.smpPos = smpRev ? this.smpE : this.smpS;
            else this.smpOn = false;
          }
          if (this.smpOn){ smpLv = l1*smpGL*mSmp*sLevel; smpRv = r1*smpGR*mSmp*sLevel; }
        }
        // ---------- granulaire ----------
        let grnL=0, grnR=0;
        if (mGrn>1e-4){
          cloud.posViz = clamp(p[P.gPosition]+lv*lfoPos,0,1);
          cloud.lfoPos = lv*lfoPos*0.5;
          cloud.timer -= 1;
          if (cloud.timer<=0){
            cloud.timer = freeze ? gInterval*3 : gInterval*Math.max(0.15, 1+(Math.random()*2-1)*gJit);
            for (let s2=0;s2<cloud.gs.length;s2++) cloud.gs[s2].sp = gShape;
            cloud.spawn(p, sr, smpLen, ringLen, keyRatio, this.wHead, ringLen, freeze);
          }
          const avg = 1/Math.sqrt(Math.max(1,gDens*p[P.gSize]*0.001));
          cloud.process(smpL, smpR, smpLen, rL, rR, ringLen, this.grainOut);
          grnL = this.grainOut[0]*mGrn*avg*1.6*gLevel; grnR = this.grainOut[1]*mGrn*avg*1.6*gLevel;
        }
        // ---------- somme voix (mono-du-mixage → filtre stéréo) ----------
        const vL = anaL + smpLv + grnL;
        const vR = anaR + smpRv + grnR;
        // ---------- filtre ----------
        let cut = baseCut * Math.pow(2, e2*fEnvAmt*5 + lv*lfoCut + kt*(this.note-60)/12 + fVel*(this.vel-0.5)*2);
        cut = clamp(cut, 18, sr*0.45);
        ladL.setCut(cut,sr); ladR.setCut(cut,sr);
        const k = reso*4.2;
        let fL, fR;
        if (fType===0){ fL = ladL.process(vL*drv,k)*drvOut; fR = ladR.process(vR*drv,k)*drvOut; }
        else { svfL.setCut(cut,sr,reso); svfR.setCut(cut,sr,reso);
               fL = svfL.process(vL*drv, fType-1)*drvOut; fR = svfR.process(vR*drv, fType-1)*drvOut; }
        // ---------- VCA ----------
        const g = e1*velAmp*(1-lfoTrem*0.5*(1-lv));
        outL[i] += fL*g; outR[i] += fR*g;
      }
      out = this.cloud.freeCount();
      this.viz = out;
      return out;
    }
  }

  /* ------------------------------------------------------------------ */
  /* EFFETS                                                             */
  /* ------------------------------------------------------------------ */
  class FX {
    constructor(sr){
      this.sr = sr;
      const cl = Math.ceil(sr*0.06);
      this.cl = cl; this.clBuf = [new Float32Array(cl), new Float32Array(cl)]; this.clW = 0; this.clPh = 0;
      const dl = Math.ceil(sr*1.6);
      this.dl = dl; this.dlBuf = [new Float32Array(dl), new Float32Array(dl)]; this.dlW = 0;
      this.dlF = [0,0];
      // reverb Freeverb : 8 combs + 4 allpass par canal (spread 23 éch. à droite)
      const rv = sr/44100;
      this.combLen = [1116,1188,1277,1356,1422,1491,1557,1617].map(v=>Math.max(8,Math.floor(v*rv)));
      this.apLen   = [556,441,341,225].map(v=>Math.max(8,Math.floor(v*rv)));
      this.comb=[]; this.ap=[]; this.combIdx=[]; this.apIdx=[]; this.combFb=[];
      for (let ch=0; ch<2; ch++){
        const cbuf=[], abuf=[], spread = ch?23:0;
        for (let i=0;i<8;i++) cbuf.push(new Float32Array(this.combLen[i]+spread));
        for (let i=0;i<4;i++) abuf.push(new Float32Array(this.apLen[i]+spread));
        this.comb.push(cbuf); this.ap.push(abuf);
        this.combIdx.push(new Int32Array(8)); this.apIdx.push(new Int32Array(4));
        this.combFb.push(new Float32Array(8));
      }
      this.lim = 1;
    }
    process(l, r, p, n){
      const chMix=p[P.chMix], chRate=p[P.chRate], chDepth=p[P.chDepth];
      const dTime=p[P.dTime]*0.001, dFb=p[P.dFb], dMix=p[P.dMix], dTone=p[P.dTone];
      const rSize=p[P.rSize], rDamp=p[P.rDamp], rMix=p[P.rMix], rWidth=p[P.rWidth];
      const drv=1+p[P.outDrive]*5, drvOut=1/(1+p[P.outDrive]*2.2);
      const dlTime = clamp(dTime*this.sr, 8, this.dl-4);
      const toneC = 0.05+ (1-dTone)*0.9;
      for (let i=0;i<n;i++){
        let L=l[i], R=r[i];
        // ---- chorus (2 lignes modulées en opposition de phase) ----
        if (chMix>1e-4){
          this.clPh += chRate/this.sr; if (this.clPh>=1) this.clPh-=1;
          const m1 = (12 + chDepth*7*(0.5+0.5*Math.sin(TAU*this.clPh)))*0.001*this.sr;
          const m2 = (12 + chDepth*7*(0.5+0.5*Math.sin(TAU*this.clPh+2.1)))*0.001*this.sr;
          const b = this.clBuf, w = this.clW, c = this.cl;
          let cl = hermiteRing(b[0],c,w-m1);
          let cr = hermiteRing(b[1],c,w-m2);
          b[0][w]=L; b[1][w]=R;
          this.clW = (w+1)%c;
          L = L*(1-chMix*0.5)+cl*chMix*0.7; R = R*(1-chMix*0.5)+cr*chMix*0.7;
        }
        // ---- delay ----
        let dOutL=0, dOutR=0;
        if (dMix>1e-4){
          const w = this.dlW, d = this.dl, b=this.dlBuf;
          let rp = w-dlTime; while (rp<0) rp+=d;
          const i0=rp|0, i1=(i0+1)%d, t=rp-i0;
          dOutL = b[0][i0]*(1-t)+b[0][i1]*t;
          dOutR = b[1][i0]*(1-t)+b[1][i1]*t;
          this.dlF[0] += (dOutR-this.dlF[0])*toneC;
          this.dlF[1] += (dOutL-this.dlF[1])*toneC;
          b[0][w] = L + this.dlF[0]*dFb;
          b[1][w] = R + this.dlF[1]*dFb;
          this.dlW = (w+1)%d;
          L += dOutL*dMix; R += dOutR*dMix;
        } else { const w=this.dlW; this.dlBuf[0][w]=L; this.dlBuf[1][w]=R; this.dlW=(w+1)%this.dl; }
        // ---- reverb Freeverb ----
        if (rMix>1e-4){
          const fb = 0.72+rSize*0.26, damp = rDamp*0.4;
          const inS = (L+R)*0.012;
          let wetL=0, wetR=0;
          for (let ch=0; ch<2; ch++){
            const cb=this.comb[ch], ci=this.combIdx[ch], cf=this.combFb[ch];
            let acc=0;
            for (let k2=0;k2<8;k2++){
              const buf=cb[k2], len=buf.length, i0=ci[k2];
              const y=buf[i0];
              cf[k2]=y*(1-damp)+cf[k2]*damp;
              buf[i0]=inS+cf[k2]*fb;
              ci[k2]=(i0+1)%len;
              acc+=y;
            }
            const ab=this.ap[ch], ai=this.apIdx[ch];
            for (let k2=0;k2<4;k2++){
              const buf=ab[k2], len=buf.length, i0=ai[k2];
              const y=buf[i0];
              buf[i0]=acc+y*0.5;
              acc=y-acc;
              ai[k2]=(i0+1)%len;
            }
            if (ch===0) wetL=acc; else wetR=acc;
          }
          const mid=(wetL+wetR)*0.5, side=(wetL-wetR)*0.5*rWidth;
          L += (mid+side)*rMix*3.0; R += (mid-side)*rMix*3.0;
        }
        // ---- saturation + limiteur ----
        L = tclip(L*drv)*drvOut; R = tclip(R*drv)*drvOut;
        const pk = Math.max(Math.abs(L),Math.abs(R));
        if (pk > this.lim) this.lim = pk; else this.lim *= 0.9995;
        const g = this.lim>1 ? 1/this.lim : 1;
        l[i]=L*g; r[i]=R*g;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* SYNTH (gestionnaire de voix + effets)                              */
  /* ------------------------------------------------------------------ */
  class Synth {
    constructor(sr, maxVoices=16){
      this.sr = sr; this.params = new Float32Array(NP);
      PARAM_DEFS.forEach(d=> this.params[d.idx]=d.def);
      this.voices = []; for (let i=0;i<maxVoices;i++) this.voices.push(new Voice(sr,i));
      this.activeList = [];
      this.shared = { smpL:new Float32Array(16), smpR:new Float32Array(16), smpLen:0, smpName:'—', bend:0 };
      this.fx = new FX(sr);
      this.noteStack = [];
      this.bend = 0;
      this.vizBuf = new Float32Array(256);
      this.vizCount = 0;
      this.grainCount = 0;
      this.voiceCount = 0;
    }
    setParams(arr){ for (let i=0;i<Math.min(NP,arr.length);i++) this.params[i]=arr[i]; }
    setParam(i,v){ if (i>=0&&i<NP) this.params[i]=v; }
    setBend(v){ this.shared.bend = clamp(v,-1,1); }
    setSample(l, r, len){
      this.shared.smpL = l; this.shared.smpR = r; this.shared.smpLen = len;
    }
    noteOn(note, vel){
      const p = this.params;
      const poly = p[P.poly]|0;
      if (p[P.mono]>0.5){
        const v = this.voices[0];
        const legato = v.active && v.gate;
        v.noteOn(note, vel, legato?p[P.glide]:p[P.glide]*0.01, this.sr, p, this.shared);
        if (legato){ v.gate = true; }
        this.noteStack = this.noteStack.filter(x=>x!==note); this.noteStack.push(note);
        this.monoVoice = v;
        return;
      }
      // voix libre ? sinon la plus ancienne
      let target = null, oldest = null, oldestAge = -1;
      for (let i=0;i<poly && i<this.voices.length;i++){
        const v = this.voices[i];
        if (!v.active){ target = v; break; }
        if (!v.gate && v.ampEnv.st===4){ target = v; break; }
        if (v.age > oldestAge){ oldestAge = v.age; oldest = v; }
      }
      if (!target) target = oldest || this.voices[0];
      target.noteOn(note, vel, p[P.glide], this.sr, p, this.shared);
    }
    noteOff(note){
      const p = this.params;
      this.noteStack = this.noteStack.filter(x=>x!==note);
      if (p[P.mono]>0.5){
        const v = this.voices[0];
        if (this.noteStack.length>0 && v.active){
          v.noteOn(this.noteStack[this.noteStack.length-1], v.vel, p[P.glide], this.sr, p, this.shared);
          v.gate = true;
        } else v.noteOff();
        return;
      }
      for (let i=0;i<this.voices.length;i++){
        const v=this.voices[i];
        if (v.active && v.gate && v.note===note){ v.noteOff(); }
      }
    }
    allOff(){
      for (const v of this.voices){ v.noteOff(); }
    }
    panic(){
      for (const v of this.voices) v.reset(this.sr);
      this.fx = new FX(this.sr);
    }
    render(outL, outR, n){
      const p = this.params;
      for (let i=0;i<n;i++){ outL[i]=0; outR[i]=0; }
      let vc=0, gc=0;
      const poly = p[P.poly]|0;
      for (let i=0;i<this.voices.length;i++){
        const v = this.voices[i];
        if (!v.active) continue;
        const g = v.render(this.sr, p, this.shared, outL, outR, n);
        if (v.active){ vc++; gc += g; }
      }
      this.voiceCount = vc; this.grainCount = gc;
      this.fx.process(outL, outR, p, n);
      const m = p[P.master];
      for (let i=0;i<n;i++){ outL[i]*=m; outR[i]*=m; }
    }
    /* positions normalisées des grains actifs pour la visualisation */
    getViz(){
      const arr = this.vizBuf; let k=0;
      for (let i=0;i<this.voices.length && k<252;i++){
        const v=this.voices[i]; if (!v.active) continue;
        for (let j=0;j<v.cloud.gs.length;j++){
          const g=v.cloud.gs[j]; if (!g.on) continue;
          arr[k++]=v.cloud.posViz;                       // position
          arr[k++]=(g.gl-g.gr);                          // pan -1..1
          arr[k++]=1-g.life/g.len;                       // amplitude
          if (k>250) break;
        }
      }
      this.vizCount = k;
      return {buf:arr, count:k, voices:this.voiceCount, grains:this.grainCount};
    }
  }

  return { Synth, PARAM_DEFS, P, NP, SECTIONS, clamp, WAVES };
}
