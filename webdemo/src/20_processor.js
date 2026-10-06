/* =========================================================================
   20_processor.js — AudioWorkletProcessor (thread audio dédié).
   Ce fichier est concaténé APRÈS le moteur (10_engine.js) pour former le
   module worklet envoyé au navigateur.
   ========================================================================= */
const GH = ENGINE_CODE();
const GH_Synth = GH.Synth;

class GranularHybridProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();
    this.synth = new GH_Synth(sampleRate, 16);
    const o = (options && options.processorOptions) || {};
    if (o.params) this.synth.setParams(o.params);
    this.vizCtr = 0;
    this.peakL = 0; this.peakR = 0; this.load = 0;
    this.port.onmessage = (e)=>{
      const d = e.data;
      try {
        switch (d.type){
          case 'params':  this.synth.setParams(d.arr); break;
          case 'param':   this.synth.setParam(d.idx, d.val); break;
          case 'note':    this.synth.noteOn(d.note, d.vel); break;
          case 'noteoff': this.synth.noteOff(d.note); break;
          case 'alloff':  this.synth.allOff(); break;
          case 'panic':   this.synth.panic(); break;
          case 'bend':    this.synth.setBend(d.v); break;
          case 'sample':  this.synth.setSample(d.l, d.r, d.len); break;
        }
      } catch (err){ /* on n'interrompt jamais le thread audio */ }
    };
    this.port.postMessage({type:'ready', sr:sampleRate});
  }
  process(inputs, outputs){
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0], R = out[1] || out[0];
    const t0 = (typeof performance!=='undefined' && performance.now) ? performance.now() : 0;
    this.synth.render(L, R, L.length);
    const t1 = t0 ? performance.now() : 0;
    if (t0 && t1){
      const dur = (t1-t0)/1000;
      const budget = L.length/sampleRate;
      this.load = this.load*0.9 + (dur/budget)*0.1;
    }
    for (let i=0;i<L.length;i++){
      const a = L[i]<0?-L[i]:L[i]; if (a>this.peakL) this.peakL = a;
      const b = R[i]<0?-R[i]:R[i]; if (b>this.peakR) this.peakR = b;
    }
    if (++this.vizCtr >= 6){
      this.vizCtr = 0;
      const v = this.synth.getViz();
      this.port.postMessage({
        type:'viz', pos: v.buf.slice(0, v.count), count: v.count,
        voices: v.voices, grains: v.grains,
        peakL: this.peakL, peakR: this.peakR, load: this.load
      });
      this.peakL = 0; this.peakR = 0;
    }
    return true;
  }
}
registerProcessor('granular-hybrid', GranularHybridProcessor);
