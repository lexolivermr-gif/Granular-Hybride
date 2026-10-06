/* =========================================================================
   tests/e2e_browser.js — Test bout-en-bout dans un vrai Chromium.
   Vérifie : la page démarre sans erreur JS, l'AudioContext démarre,
   le module AudioWorklet se charge, le sample se génère, et surtout que
   du SON RÉEL est produit (crête > 0) pour les 3 moteurs + combinaisons.

   Usage :  node tests/e2e_browser.js  [chemin_vers_index.html]
   Prérequis : npm i puppeteer-core  (dans tests/) + chromium installé
   ========================================================================= */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');
const EXE = process.env.CHROME || '/usr/bin/chromium';
let failures = 0;
const ok = (n, c, i='') => { console.log(`  ${c?'OK  ':'ÉCHEC'} ${n}${i?'  ('+i+')':''}`); if(!c) failures++; };

(async () => {
  if (!fs.existsSync(HTML)) { console.error('index.html introuvable :', HTML); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: true,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--mute-audio',
           '--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push('PAGEERROR: ' + e.message); console.log('  [ERREUR PAGE] ' + e.message); });
  page.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requête échouée: ' + r.url()));

  console.log('=== TEST NAVIGATEUR (Chromium ' + (await browser.version()).split('/')[1] + ') ===\n');
  await page.goto('file://' + HTML, { waitUntil: 'load', timeout: 60000 });
  console.log('  page chargée (file://)');

  // --- démarrage via le bouton, comme un utilisateur ---
  await page.click('#startBtn');
  await page.waitForFunction("window.Eng && Eng.mode !== '—'", { timeout: 45000 }).catch(()=>{});
  const boot = await page.evaluate(()=>({ mode: Eng.mode, detail: Eng.detail, sr: Eng.ctx && Eng.ctx.sampleRate,
      state: Eng.ctx && Eng.ctx.state, smpN: Eng.sample.n, smpName: Eng.sample.name,
      panels: document.querySelectorAll('#panels .panel').length,
      knobs: document.querySelectorAll('#panels .kw').length,
      err: document.querySelector('#boot .box h1') ? document.querySelector('#boot .box h1').textContent : null }));
  ok('la page démarre sans erreur JS bloquante', errs.filter(e=>e.startsWith('PAGEERROR')).length===0, errs[0]||'');
  ok('AudioContext actif', !!boot.sr, 'sr='+boot.sr+' état='+boot.state);
  ok('moteur audio initialisé', boot.mode==='AudioWorklet' || boot.mode==='ScriptProcessor', 'mode='+boot.mode+' ('+boot.detail+')');
  ok('UI construite', boot.panels >= 10 && boot.knobs > 50, boot.panels+' panneaux / '+boot.knobs+' knobs');
  ok('sample de la banque chargé', boot.smpN > 1000, boot.smpN+' échantillons — '+boot.smpName);

  // --- helper : joue un accord, mesure la crête de sortie ---
  async function playAndMeasure(params, notes, ms=1400){
    return await page.evaluate(async (params, notes, ms)=>{
      Object.keys(params).forEach(k => setParamUI(k, params[k], true, false));
      refreshAllUI();
      notes.forEach(n => Eng.noteOn(n, 0.85));
      Eng.viz.peakL = 0; Eng.viz.peakR = 0;
      await new Promise(r=>setTimeout(r, ms));
      const v = { peakL: Eng.viz.peakL, peakR: Eng.viz.peakR, grains: Eng.viz.grains, voices: Eng.viz.voices, load: Eng.viz.load };
      notes.forEach(n => Eng.noteOff(n));
      await new Promise(r=>setTimeout(r, 250));
      return v;
    }, params, notes, ms);
  }

  const cases = [
    ['ANALOGIQUE (2 osc + filtre)', { mixAnalog:1, mixSampler:0, mixGrain:0, cutoff:2600, reso:0.3 }, [48,55,60]],
    ['SAMPLER',                     { mixAnalog:0, mixSampler:1, mixGrain:0, sLoop:1 },              [55,60]],
    ['GRANULAIRE sur SAMPLE',       { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:0, gDensity:22, gSize:110 }, [55,62]],
    ['GRANULAIRE sur SYNTHÉ LIVE',  { mixAnalog:0, mixSampler:0, mixGrain:1, gSource:1, gDensity:26, gSize:130, gLivePos:110 }, [48,55]],
    ['TOUT COMBINÉ (analo+smp+grain)',{ mixAnalog:0.9, mixSampler:0.6, mixGrain:0.9, gSource:2, gDensity:20, rMix:0.4, chMix:0.4, dMix:0.3 }, [48,55,60,64]]
  ];
  for (const [name, params, notes] of cases){
    const r = await playAndMeasure(params, notes);
    ok(name, r.peakL > 0.005 && r.peakR > 0.005, 'crête L='+r.peakL.toFixed(3)+' R='+r.peakR.toFixed(3)+' voix='+r.voices+' grains='+r.grains+' charge='+(r.load*100).toFixed(1)+'%');
  }
  ok('granulaire : des grains sont bien actifs', await page.evaluate(()=>Eng.viz.grains>0));

  // --- rendu HORS-LIGNE du worklet (preuve indépendante de la carte son) ---
  const off = await page.evaluate(async ()=>{
    const sr = 48000;
    const off = new OfflineAudioContext(2, sr*1.2, sr);
    const b64 = document.getElementById('wkSrc').textContent.trim();
    await off.audioWorklet.addModule('data:application/javascript;base64,' + b64);
    const p = new Float32Array(ENG.NP);
    ENG.PARAM_DEFS.forEach(d=> p[d.idx] = d.def);
    const set = (k,v)=> p[ENG.P[k]] = v;
    set('mixAnalog',0.8); set('mixSampler',0.5); set('mixGrain',0.9); set('gSource',2);
    set('gDensity',24); set('gSize',120); set('rMix',0.4); set('chMix',0.4); set('dMix',0.3);
    const node = new AudioWorkletNode(off, 'granular-hybrid', { numberOfInputs:0, numberOfOutputs:1,
      outputChannelCount:[2], processorOptions:{ params:p } });
    // sample de test
    const n = sr; const l = new Float32Array(n), r = new Float32Array(n);
    for (let i=0;i<n;i++){ const s = 0.4*Math.sin(6.2832*220*i/sr); l[i]=s; r[i]=s*0.9; }
    node.port.postMessage({type:'sample', l:l.slice(0), r:r.slice(0), len:n});
    node.connect(off.destination);
    node.port.postMessage({type:'note', note:57, vel:0.9});
    node.port.postMessage({type:'note', note:64, vel:0.9});
    // laisser le temps aux messages du port d'être livrés avant le rendu
    await new Promise(r=>setTimeout(r, 250));
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let pk=0, sum=0, nan=0;
    for (let i=0;i<L.length;i++){ const a=Math.abs(L[i]); if(a>pk)pk=a; sum+=L[i]*L[i]; if(!isFinite(L[i]))nan++; }
    return { peak:pk, rms:Math.sqrt(sum/L.length), nan, len:L.length };
  });
  ok('rendu hors-ligne du VST-like (worklet) : signal audio fini et non nul',
     off.peak > 0.01 && off.nan === 0, 'crête='+off.peak.toFixed(3)+' RMS='+off.rms.toFixed(4)+' NaN='+off.nan);

  // --- erreurs réseau / ressources externes ---
  const ext = errs.filter(e=>e.startsWith('requête échouée'));
  ok('aucune ressource externe requise (fichier autonome)', ext.length===0, ext[0]||'0 requête');

  if (errs.length) { console.log('\n  Journal des erreurs :'); errs.slice(0,10).forEach(e=>console.log('   - '+e)); }
  await browser.close();
  console.log('\n' + (failures===0 ? '>>> TEST NAVIGATEUR : TOUT PASSE' : '>>> '+failures+' ÉCHEC(S)'));
  process.exit(failures?1:0);
})().catch(e=>{ console.error('Erreur du test :', e); process.exit(1); });
