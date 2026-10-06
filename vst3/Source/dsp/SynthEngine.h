/*
    SynthEngine.h — Voix + moteur (16 voix).
    Portage fidèle du moteur de la démo web, paramètres indexés via l'énum
    ParamIndex de Params.h (aucun « nombre magique »).
*/
#pragma once
#include "DspCore.h"
#include "Effects.h"
#include "../Params.h"
#include <vector>
#include <array>
#include <algorithm>
#include <memory>
#include <mutex>
#include <string>

namespace gh
{

struct SampleData
{
    std::vector<float> l, r;
    int len = 0;
    std::string name = "—";
};

inline constexpr int   kMaxVoices   = 16;
inline constexpr float kRingSeconds = 1.5f;

/* ------------------------------------------------------------------ */
class Voice
{
public:
    void prepare (double sr)
    {
        sampleRate = (float) sr;
        ringLen = (int) (kRingSeconds * sr);
        ringL.assign ((size_t) ringLen, 0.0f);
        ringR.assign ((size_t) ringLen, 0.0f);
        reset();
    }
    void reset()
    {
        o1.reset(); o2.reset(); oSub.reset();
        ladL.reset(); ladR.reset(); svfL.reset(); svfR.reset();
        ampEnv.reset(); fEnv.reset(); lfo.reset(); cloud.reset();
        smpOn = false; active = false; gate = false;
        wHead = 0; noiseSlow = 0; brown = 0; freq = target = 261.63f;
    }
    void noteOn (int n, float v, float glideMs, const float* p, const SampleData* smp)
    {
        note = n; vel = v; gate = true;
        target = 440.0f * std::pow (2.0f, (note - 69) / 12.0f);
        if (! active || glideMs <= 0.001f) freq = target;
        active = true; age = 0.0f;
        ampEnv.gateOn(); fEnv.gateOn();
        cloud.frozenBase = -1.0f;
        if (smp != nullptr && smp->len > 8)
        {
            const float st = clampf (p[sStart_], 0.0f, 0.999f);
            const float en = clampf (p[sEnd_], st + 0.0005f, 1.0f);
            smpS = st * (float) (smp->len - 2);
            smpE = en * (float) (smp->len - 2);
            smpRatio = std::pow (2.0f, (p[sPitch_] + p[sFine_] * 0.01f
                                        + (note - p[sRoot_]) * p[sKeyTrack_]) / 12.0f);
            smpDir = p[sReverse_] > 0.5f ? -1 : 1;
            smpPos = smpDir < 0 ? smpE : smpS;
            smpOn = true;
        }
    }
    void noteOff()
    {
        gate = false; ampEnv.gateOff(); fEnv.gateOff();
    }
    void quickRelease() { gate = false; ampEnv.st = ADSR::rel; }

    bool isActive() const { return active; }
    bool isGate()   const { return gate; }
    int  getNote()  const { return note; }
    float getAge()  const { return age; }
    const GrainCloud& getCloud() const { return cloud; }

    void render (float* outL, float* outR, int n, const float* p, const SampleData* smp)
    {
        /* --- paramètres mis en cache pour le bloc --- */
        const int   w1 = (int) p[o1Wave_], w2 = (int) p[o2Wave_], subW = (int) p[subWave_];
        const float pw1 = p[o1PW_], pw2 = p[o2PW_];
        const float lvl1 = p[o1Level_], lvl2 = p[o2Level_];
        const int   uni1 = (int) p[o1Uni_], uni2 = (int) p[o2Uni_];
        const float det1 = p[o1Detune_], det2 = p[o2Detune_], spr1 = p[o1Spread_], spr2 = p[o2Spread_];
        const float f1 = std::pow (2.0f, p[o1Oct_] + p[o1Semi_] / 12.0f + p[o1Fine_] / 1200.0f);
        const float f2 = std::pow (2.0f, p[o2Oct_] + p[o2Semi_] / 12.0f + p[o2Fine_] / 1200.0f);
        const float subLvl = p[subLevel_], subDiv = p[subOct_] > 1.5f ? 4.0f : 2.0f;
        const float nzLvl = p[noiseLevel_]; const int nzType = (int) p[noiseType_];
        const float ringLvl = p[ringLevel_];
        const float mAna = p[mixAnalog_], mSmp = p[mixSampler_], mGrn = p[mixGrain_];
        const float drive = p[drive_], reso = p[reso_]; const int fType = (int) p[fType_];
        const float baseCut = p[cutoff_], kt = p[keyTrack_], fVelA = p[fVel_], fEnvA = p[fEnvAmt_];
        const float lfoRate = p[lfoRate_]; const int lfoWave = (int) p[lfoWave_];
        const float lfoPitch = p[lfoPitch_], lfoCut = p[lfoCut_], lfoPW = p[lfoPW_];
        const float lfoPos = p[lfoPos_], lfoTrem = p[lfoTrem_];
        const float gSize = p[gSize_], gDens = p[gDensity_], gJit = p[gJitter_];
        const int   gShape = (int) p[gShape_], gSrc = (int) p[gSource_];
        const float gLevel = p[gLevel_];
        const bool  freeze = p[gFreeze_] > 0.5f;
        const float sLevel = p[sLevel_];
        const float sVelAmt = 1.0f - p[sVel_] * (1.0f - vel);
        const float drv = 1.0f + drive * 7.0f, drvOut = 1.0f / (1.0f + drive * 2.4f);
        const float keyRatio = std::pow (2.0f, (note - p[sRoot_]) / 12.0f) * p[gKeyTrack_] + (1.0f - p[gKeyTrack_]);
        const float gInterval = sampleRate / std::max (0.1f, gDens);
        const float velAmp = 1.0f - p[velAmt_] * (1.0f - vel);
        const float bendMul = std::pow (2.0f, sharedBend * p[bendRange_] / 12.0f);
        const float sPan = p[sPan_];
        const float sA = (sPan + 1.0f) * 0.25f * kTwoPi;
        const float sGL = std::cos (sA), sGR = std::sin (sA);
        const bool  sLoop = p[sLoop_] > 0.5f, sRev = p[sReverse_] > 0.5f;
        const float loopXF = p[sLoopXF_];
        const float glideCoef = p[glide_] > 0.1f
            ? 1.0f - std::exp (-1.0f / (sampleRate * std::max (0.001f, p[glide_] * 0.001f) * 0.35f)) : 1.0f;
        const int smpLen = smp != nullptr ? smp->len : 0;
        float peakOut = 0.0f;

        for (int i = 0; i < n; ++i)
        {
            /* ---------- enveloppes / LFO ---------- */
            const float e1 = ampEnv.process (sampleRate, p[aA_], p[aD_], p[aS_], p[aR_]);
            const float e2 = fEnv.process  (sampleRate, p[fA_], p[fD_], p[fS_], p[fR_]);
            const float lv = lfo.process (sampleRate, lfoRate, lfoWave);
            if (ampEnv.st == ADSR::off && ! gate) { active = false; break; }

            /* ---------- pitch ---------- */
            freq += (target - freq) * glideCoef;
            const float fBase = freq * bendMul * std::pow (2.0f, lv * lfoPitch / 12.0f);

            /* ---------- oscillateurs (unison + largeur stéréo) ---------- */
            const float pw1m = clampf (pw1 + lv * lfoPW, 0.02f, 0.98f);
            const float pw2m = clampf (pw2 + lv * lfoPW, 0.02f, 0.98f);
            float aL = 0.0f, aR = 0.0f;
            if (lvl1 > 1e-4f)
            {
                for (int u = 0; u < uni1; ++u)
                {
                    const float off = uni1 == 1 ? 0.0f : ((float) u - (uni1 - 1) * 0.5f);
                    const float s = o1.step (fBase * f1 * std::pow (2.0f, off * det1 / 1200.0f), sampleRate, w1, pw1m);
                    const float pan = off * spr1 * 0.9f, a = (pan + 1.0f) * 0.25f * kTwoPi;
                    aL += s * std::cos (a); aR += s * std::sin (a);
                }
                const float g1 = lvl1 / std::sqrt ((float) uni1);
                aL *= g1; aR *= g1;
            }
            if (lvl2 > 1e-4f)
            {
                float s2L = 0.0f, s2R = 0.0f;
                for (int u = 0; u < uni2; ++u)
                {
                    const float off = uni2 == 1 ? 0.0f : ((float) u - (uni2 - 1) * 0.5f);
                    const float s = o2.step (fBase * f2 * std::pow (2.0f, off * det2 / 1200.0f), sampleRate, w2, pw2m);
                    const float pan = off * spr2 * 0.9f, a = (pan + 1.0f) * 0.25f * kTwoPi;
                    s2L += s * std::cos (a); s2R += s * std::sin (a);
                }
                const float cf = lvl1 > 1e-4f ? 0.75f : 1.0f;
                const float g2 = cf * lvl2 / std::sqrt ((float) uni2) * 1.33f;
                aL += s2L * g2; aR += s2R * g2;
            }
            float mono = 0.0f;
            if (subLvl > 1e-4f)
                mono += oSub.step (fBase / subDiv, sampleRate, subW == 1 ? 2 : 1, 0.5f) * subLvl * 0.9f;
            if (nzLvl > 1e-4f)
            {
                float nz = rnd11();
                if (nzType == 1)      { noiseSlow = noiseSlow * 0.96f + nz * 0.04f; nz = noiseSlow * 3.2f; }
                else if (nzType == 2) { brown = clampf (brown + nz * 0.02f, -1.0f, 1.0f); nz = brown * 1.6f; }
                mono += nz * nzLvl * 0.5f;
            }
            if (ringLvl > 1e-4f) mono += (aL * 0.5f) * (aR * 0.5f) * ringLvl * 2.4f;
            const float anaL = (aL + mono) * mAna, anaR = (aR + mono) * mAna;

            /* ---------- tampon « live » (signal analo brut, pré-mix) ---------- */
            wHead = (wHead + 1) % ringLen;
            ringL[(size_t) wHead] = aL + mono;
            ringR[(size_t) wHead] = aR + mono;

            /* ---------- sampler ---------- */
            float smpLv = 0.0f, smpRv = 0.0f;
            if (mSmp > 1e-4f && smpOn && smpLen > 8)
            {
                const float pos = smpPos;
                float l1 = hermite (smp->l.data(), smpLen, pos);
                float r1 = hermite (smp->r.data(), smpLen, pos);
                if (sLoop)
                {
                    const float loopLen = std::max (16.0f, smpE - smpS);
                    const float xf = std::min (loopLen * 0.5f, loopXF * loopLen);
                    const float cur = sRev ? (smpE - pos) : (pos - smpS);
                    if (xf > 8.0f && cur < xf)
                    {
                        const float th = (cur / xf) * kPi * 0.5f;
                        const float a2 = std::sin (th), b2 = std::cos (th);
                        const float alt = sRev ? (smpS + (xf - cur)) : (smpE - xf + cur);
                        l1 = l1 * a2 + hermite (smp->l.data(), smpLen, alt) * b2;
                        r1 = r1 * a2 + hermite (smp->r.data(), smpLen, alt) * b2;
                    }
                }
                smpPos += sRev ? -smpRatio : smpRatio;
                if (sRev ? (smpPos <= smpS) : (smpPos >= smpE))
                {
                    if (sLoop) smpPos = sRev ? smpE : smpS;
                    else       smpOn = false;
                }
                if (smpOn) { smpLv = l1 * sGL * mSmp * sLevel * sVelAmt; smpRv = r1 * sGR * mSmp * sLevel * sVelAmt; }
            }

            /* ---------- granulaire ---------- */
            float grnL = 0.0f, grnR = 0.0f;
            if (mGrn > 1e-4f)
            {
                cloud.posViz = clampf (p[gPosition_] + lv * lfoPos, 0.0f, 1.0f);
                cloud.lfoPos = lv * lfoPos * 0.5f;
                cloud.timer -= 1.0f;
                if (cloud.timer <= 0.0f)
                {
                    cloud.timer = freeze ? gInterval * 3.0f
                                         : gInterval * std::max (0.15f, 1.0f + rnd11() * gJit);
                    cloud.spawn (sampleRate, smpLen, ringLen, keyRatio, wHead, ringLen,
                                 gSrc, gSize, p[gPosition_], p[gSpray_], p[gPitch_], p[gPitchRand_],
                                 p[gReverse_], p[gPan_], p[gLivePos_], cloud.lfoPos, freeze, gShape);
                }
                float oL = 0.0f, oR = 0.0f;
                cloud.process (&oL, &oR, smp != nullptr ? smp->l.data() : nullptr,
                               smp != nullptr ? smp->r.data() : nullptr, smpLen,
                               ringL.data(), ringR.data(), ringLen);
                const float avg = 1.0f / std::sqrt (std::max (1.0f, gDens * gSize * 0.001f));
                grnL = oL * mGrn * avg * 1.6f * gLevel;
                grnR = oR * mGrn * avg * 1.6f * gLevel;
            }

            /* ---------- somme + filtre + VCA ---------- */
            const float vL = anaL + smpLv + grnL;
            const float vR = anaR + smpRv + grnR;
            float cut = baseCut * std::pow (2.0f, e2 * fEnvA * 5.0f + lv * lfoCut
                                                 + kt * (note - 60) / 12.0f + fVelA * (vel - 0.5f) * 2.0f);
            cut = clampf (cut, 18.0f, sampleRate * 0.45f);
            const float kk = reso * 4.2f;
            float fL, fR;
            if (fType == 0)
            {
                ladL.setCut (cut, sampleRate); ladR.setCut (cut, sampleRate);
                fL = ladL.process (vL * drv, kk) * drvOut;
                fR = ladR.process (vR * drv, kk) * drvOut;
            }
            else
            {
                svfL.setCut (cut, sampleRate, reso); svfR.setCut (cut, sampleRate, reso);
                fL = svfL.process (vL * drv, fType - 1) * drvOut;
                fR = svfR.process (vR * drv, fType - 1) * drvOut;
            }
            const float g = e1 * velAmp * (1.0f - lfoTrem * 0.5f * (1.0f - lv));
            const float oL2 = fL * g, oR2 = fR * g;
            outL[i] += oL2; outR[i] += oR2;
            const float pk = std::max (std::fabs (oL2), std::fabs (oR2));
            if (pk > peakOut) peakOut = pk;
        }
        age += (float) n;
        lastPeak = peakOut;
    }

    void setBend (float b) { sharedBend = clampf (b, -1.0f, 1.0f); }

private:
    float sampleRate = 44100.0f;
    Osc o1, o2, oSub;
    Ladder ladL, ladR;
    SVF svfL, svfR;
    ADSR ampEnv, fEnv;
    LFO lfo;
    GrainCloud cloud;
    std::vector<float> ringL, ringR;
    int ringLen = 0, wHead = 0;
    int note = 60;
    float vel = 0.8f, freq = 261.63f, target = 261.63f, age = 0.0f;
    bool active = false, gate = false, smpOn = false;
    float smpPos = 0, smpInc = 1, smpS = 0, smpE = 0, smpRatio = 1, smpDir = 1;
    float noiseSlow = 0, brown = 0, sharedBend = 0, lastPeak = 0;
};

/* ------------------------------------------------------------------ */
class SynthEngine
{
public:
    void prepare (double sr)
    {
        sampleRate = (float) sr;
        for (auto& v : voices) v.prepare (sr);
        fx.prepare (sr);
        for (int i = 0; i < NUM_PARAMS; ++i) params[i] = paramDef (i).def;
        noteStack.clear();
        current = nullptr; incoming = nullptr; hasIncoming = false;
    }
    /* --- mise à jour des paramètres (appelée une fois par bloc) --- */
    void setParam (int idx, float v)
    {
        if (idx >= 0 && idx < NUM_PARAMS) params[idx] = v;
    }
    void setParams (const float* src)
    {
        for (int i = 0; i < NUM_PARAMS; ++i) params[i] = src[i];
    }
    void setBend (float v)
    {
        bend = clampf (v, -1.0f, 1.0f);
        for (auto& v : voices) v.setBend (bend);
    }
    /* --- échange de sample sans verrou sur le thread audio --- */
    void offerSample (std::shared_ptr<const SampleData> s)
    {
        std::lock_guard<std::mutex> g (mx);
        incoming = std::move (s);
        hasIncoming = true;
    }
    /* --- notes --- */
    void noteOn (int note, float vel)
    {
        if (params[mono_] > 0.5f)
        {
            Voice& v = voices[0];
            const bool legato = v.isActive() && v.isGate();
            v.noteOn (note, vel, legato ? params[glide_] : params[glide_] * 0.01f, params, current.get());
            noteStack.erase (std::remove (noteStack.begin(), noteStack.end(), note), noteStack.end());
            noteStack.push_back (note);
            return;
        }
        const int poly = std::max (1, (int) params[poly_]);
        int target = -1; float oldestAge = -1.0f; int oldest = -1;
        for (int i = 0; i < poly && i < kMaxVoices; ++i)
        {
            Voice& v = voices[i];
            if (! v.isActive()) { target = i; break; }
            if (! v.isGate() && v.isActive()) { target = i; break; }
            if (v.getAge() > oldestAge) { oldestAge = v.getAge(); oldest = i; }
        }
        if (target < 0) target = oldest >= 0 ? oldest : 0;
        voices[target].noteOn (note, vel, params[glide_], params, current.get());
    }
    void noteOff (int note)
    {
        noteStack.erase (std::remove (noteStack.begin(), noteStack.end(), note), noteStack.end());
        if (params[mono_] > 0.5f)
        {
            Voice& v = voices[0];
            if (! noteStack.empty() && v.isActive())
                v.noteOn (noteStack.back(), 0.8f, params[glide_], params, current.get());
            else
                v.noteOff();
            return;
        }
        for (auto& v : voices)
            if (v.isActive() && v.isGate() && v.getNote() == note) v.noteOff();
    }
    void allOff()  { for (auto& v : voices) v.noteOff(); }
    void panic()
    {
        for (auto& v : voices) v.reset();
        noteStack.clear();
    }
    void render (float* outL, float* outR, int n)
    {
        /* récupération du sample éventuellement poussé par l'UI */
        if (hasIncoming)
        {
            std::unique_lock<std::mutex> lk (mx, std::try_to_lock);
            if (lk.owns_lock() && incoming) { current = incoming; incoming.reset(); hasIncoming = false; }
        }
        std::fill (outL, outL + n, 0.0f);
        std::fill (outR, outR + n, 0.0f);
        int vc = 0, gc = 0;
        for (auto& v : voices)
        {
            if (! v.isActive()) continue;
            v.render (outL, outR, n, params, current.get());
            if (v.isActive()) { ++vc; gc += v.getCloud().freeCount(); }
        }
        activeVoices = vc; activeGrains = gc;
        FxParams fp;
        fp.chMix = params[chMix_]; fp.chRate = params[chRate_]; fp.chDepth = params[chDepth_];
        fp.dTime = params[dTime_]; fp.dFb = params[dFb_]; fp.dMix = params[dMix_]; fp.dTone = params[dTone_];
        fp.rSize = params[rSize_]; fp.rDamp = params[rDamp_]; fp.rMix = params[rMix_]; fp.rWidth = params[rWidth_];
        fp.outDrive = params[outDrive_];
        fx.process (outL, outR, n, fp);
        const float m = params[master_];
        for (int i = 0; i < n; ++i) { outL[i] *= m; outR[i] *= m; }
    }
    /* --- infos pour l'interface --- */
    int getActiveVoices() const { return activeVoices; }
    int getActiveGrains() const { return activeGrains; }
    const SampleData* getSample() const { return current.get(); }
    std::shared_ptr<const SampleData> getSamplePtr() const { return current; }
    int getGrainViz (float* out, int maxTriples) const
    {
        int k = 0;
        for (const auto& v : voices)
        {
            if (! v.isActive()) continue;
            const GrainCloud& c = v.getCloud();
            for (const auto& g : c.g)
            {
                if (! g.on) continue;
                if (k + 3 > maxTriples * 3) return k;
                out[k++] = g.pos0;
                out[k++] = g.gl - g.gr;
                out[k++] = 1.0f - g.life / g.len;
            }
        }
        return k;
    }
private:
    float sampleRate = 44100.0f;
    std::array<Voice, kMaxVoices> voices;
    Effects fx;
    float params[NUM_PARAMS] {};
    std::vector<int> noteStack;
    float bend = 0.0f;
    std::mutex mx;
    std::shared_ptr<const SampleData> current, incoming;
    bool hasIncoming = false;
    int activeVoices = 0, activeGrains = 0;
};

} // namespace gh
