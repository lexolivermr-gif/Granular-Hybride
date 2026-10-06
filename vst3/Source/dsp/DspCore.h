/*
    DspCore.h — Briques DSP (sans dépendance à JUCE, testables telles quelles)
    Portage 1:1 du moteur de la démo web : oscillateurs PolyBLEP + unison,
    filtre ladder 24 dB ZDF et SVF TPT, enveloppes ADSR, LFO, nuage granulaire.
*/
#pragma once
#include <cmath>
#include <cstdlib>
#include <algorithm>

namespace gh
{
inline float clampf (float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
constexpr float kPi    = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

/* saturation bornée (Padé) — utilisée dans la boucle du filtre */
inline float tclip (float x)
{
    if (x < -3.0f) return -1.0f;
    if (x >  3.0f) return  1.0f;
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}
/* correction PolyBLEP anti-repliement */
inline float polyBlep (float t, float dt)
{
    if (t < dt)      { t /= dt; return t + t - t * t - 1.0f; }
    if (t > 1.0f - dt){ t = (t - 1.0f) / dt; return t * t + t + t + 1.0f; }
    return 0.0f;
}
/* interpolation cubique de Hermite (lecture d'échantillons) */
inline float hermite (const float* buf, int len, float pos)
{
    if (pos < 0.0f || pos >= (float) (len - 1)) return 0.0f;
    const int i = (int) pos;
    const float t = pos - (float) i;
    const float x0 = buf[i > 0 ? i - 1 : 0], x1 = buf[i],
                x2 = buf[(i + 1 < len) ? i + 1 : len - 1], x3 = buf[(i + 2 < len) ? i + 2 : len - 1];
    const float c1 = 0.5f * (x2 - x0);
    const float c2 = x0 - 2.5f * x1 + 2.0f * x2 - 0.5f * x3;
    const float c3 = 0.5f * (x3 - x0) + 1.5f * (x1 - x2);
    return ((c3 * t + c2) * t + c1) * t + x1;
}
/* idem en lecture circulaire (tampon « live » du granulaire) */
inline float hermiteRing (const float* buf, int len, float pos)
{
    if (len <= 4) return 0.0f;
    pos = std::fmod (std::fmod (pos, (float) len) + (float) len, (float) len);
    const int i = (int) pos;
    const float t = pos - (float) i;
    const int i0 = (i - 1 + len) % len, i1 = (i + 1) % len, i2 = (i + 2) % len;
    const float x0 = buf[i0], x1 = buf[i], x2 = buf[i1], x3 = buf[i2];
    const float c1 = 0.5f * (x2 - x0);
    const float c2 = x0 - 2.5f * x1 + 2.0f * x2 - 0.5f * x3;
    const float c3 = 0.5f * (x3 - x0) + 1.5f * (x1 - x2);
    return ((c3 * t + c2) * t + c1) * t + x1;
}
inline float rnd11() { return (float) std::rand() / (float) RAND_MAX * 2.0f - 1.0f; }

/* ------------------------------------------------------------------ */
/* Oscillateur PolyBLEP                                               */
/* ------------------------------------------------------------------ */
struct Osc
{
    double ph = 0.0;
    void reset() { ph = 0.0; }
    inline float step (float freq, float sr, int wave, float pw) noexcept
    {
        const float dt = freq / sr;
        ph += dt;
        if (ph >= 1.0) ph -= std::floor (ph);
        const float t = (float) ph;
        switch (wave)
        {
            case 1: { float s = t < pw ? 1.0f : -1.0f;
                      s += polyBlep (t, dt);
                      s -= polyBlep (std::fmod (t - pw + 1.0f, 1.0f), dt);
                      return s; }
            case 2: return 1.0f - 4.0f * std::fabs (t - 0.5f);
            case 3: return std::sin (kTwoPi * t);
            default: return 2.0f * t - 1.0f - polyBlep (t, dt);
        }
    }
};

/* ------------------------------------------------------------------ */
/* Filtre ladder 4 pôles ZDF (type Moog) avec saturation              */
/* ------------------------------------------------------------------ */
struct Ladder
{
    float a = 0, b = 0, c = 0, d = 0, G = 0;
    void reset() { a = b = c = d = 0.0f; }
    inline void setCut (float fc, float sr) noexcept
    {
        fc = clampf (fc, 15.0f, sr * 0.45f);
        const float g = std::tan (kPi * fc / sr);
        G = g / (1.0f + g);
    }
    inline float process (float x, float k) noexcept   // k : 0 → 4.2
    {
        const float G2 = G * G, G3 = G2 * G, G4 = G3 * G;
        const float S = ((a * G + b) * G + c) * G + d;
        const float y4 = (G4 * x + (1.0f - G) * S) / (1.0f + k * G4);
        const float u = tclip (x - k * y4);
        float v = (u - a) * G; float y = v + a; a = y + v;
        v = (y - b) * G;       y = v + b;       b = y + v;
        v = (y - c) * G;       y = v + c;       c = y + v;
        v = (y - d) * G;       y = v + d;       d = y + v;
        return y * (1.0f + 0.3f * k);
    }
};

/* ------------------------------------------------------------------ */
/* Filtre SVF « topologie à variables d'état » (LP/HP/BP 12 dB)       */
/* ------------------------------------------------------------------ */
struct SVF
{
    float i1 = 0, i2 = 0, a1 = 0, a2 = 0, a3 = 0, k = 1;
    void reset() { i1 = i2 = 0.0f; }
    inline void setCut (float fc, float sr, float res) noexcept
    {
        fc = clampf (fc, 15.0f, sr * 0.45f);
        k = 1.0f / (0.5f + res * 12.0f);
        const float g = std::tan (kPi * fc / sr);
        a1 = 1.0f / (1.0f + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    inline float process (float x, int mode) noexcept  // 0 LP · 1 HP · 2 BP
    {
        const float v3 = x - i2;
        const float v1 = a1 * i1 + a2 * v3;
        const float v2 = i2 + a2 * i1 + a3 * v3;
        i1 = 2.0f * v1 - i1; i2 = 2.0f * v2 - i2;
        if (mode == 0) return v2;
        if (mode == 1) return x - k * v1 - v2;
        return v1;
    }
};

/* ------------------------------------------------------------------ */
/* Enveloppe ADSR (mêmes coefficients que la version web)             */
/* ------------------------------------------------------------------ */
struct ADSR
{
    enum State { off = 0, att, dec, sus, rel };
    float v = 0; int st = off;
    void reset() { v = 0.0f; st = off; }
    void gateOn() { st = att; }
    void gateOff() { if (st != off) st = rel; }
    inline float process (float sr, float A, float D, float S, float R) noexcept
    {
        switch (st)
        {
            case att: { const float c = 1.0f - std::exp (-1.0f / (sr * std::max (5e-4f, A) * 0.35f));
                        v += (1.08f - v) * c; if (v >= 1.0f) { v = 1.0f; st = dec; } break; }
            case dec: { const float c = std::exp (-1.0f / (sr * std::max (1e-3f, D) * 0.35f));
                        v = S + (v - S) * c; if (std::fabs (v - S) < 1e-4f) st = sus; break; }
            case sus: v = S; break;
            case rel: { const float c = std::exp (-1.0f / (sr * std::max (2e-3f, R) * 0.35f));
                        v *= c; if (v < 2e-4f) { v = 0.0f; st = off; } break; }
            default: break;
        }
        return v;
    }
};

/* ------------------------------------------------------------------ */
/* LFO (sine / tri / carré / échantillon-bloqué)                      */
/* ------------------------------------------------------------------ */
struct LFO
{
    float ph = 0, sh = 0;
    void reset() { ph = 0.0f; }
    inline float process (float sr, float rate, int wave) noexcept
    {
        ph += rate / sr;
        if (ph >= 1.0f) { ph -= std::floor (ph); sh = rnd11(); }
        switch (wave)
        {
            case 0: return std::sin (kTwoPi * ph);
            case 1: return 4.0f * std::fabs (ph - 0.5f) - 1.0f;
            case 2: return ph < 0.5f ? 1.0f : -1.0f;
            default: return sh;
        }
    }
};

/* ------------------------------------------------------------------ */
/* Grain + nuage de grains                                            */
/* ------------------------------------------------------------------ */
struct Grain
{
    bool on = false; float rp = 0, inc = 1, life = 0, len = 1, gl = 0.5f, gr = 0.5f;
    int shape = 0, live = 0; float pos0 = 0;
};
inline constexpr int kMaxGrains = 14;

struct GrainCloud
{
    Grain g[kMaxGrains];
    int idx = 0; float timer = 0, frozenBase = -1, lfoPos = 0, posViz = 0;

    void reset() { for (auto& x : g) { x.on = false; } idx = 0; timer = 0; frozenBase = -1; }
    int freeCount() const { int n = 0; for (auto& x : g) if (x.on) ++n; return n; }
    void kill() { for (auto& x : g) x.on = false; }

    /*  spawn — source : 0 = sample, 1 = synthé live, 2 = les deux (une fois sur deux)
        motion : déplacement LFO de la position (déjà calculé par la voix)        */
    inline void spawn (float sr, int smpLen, int liveLen, float keyRatio, int writeHead, int ringLen,
                       int source, float sizeMs, float position, float spray, float pitchSemis,
                       float pitchRand, float reverseProb, float panAmount, float livePosMs,
                       float motion, bool freeze, int shape)
    {
        Grain& x = g[idx]; idx = (idx + 1) % kMaxGrains;
        const float segLen = sizeMs * 0.001f * sr;
        const bool live = (source == 1) || (source == 2 && rnd11() > 0.0f);
        const int len = live ? liveLen : smpLen;
        if (len < 8) { x.on = false; return; }
        const float sp = freeze ? 0.0f : spray;
        const float posN = clampf (position + motion + rnd11() * sp * 0.5f, 0.0f, 1.0f);
        const float pitch = pitchSemis + (freeze ? 0.0f : rnd11() * pitchRand);
        const bool rev = ! freeze && (std::rand() / (float) RAND_MAX) < reverseProb;
        float base = 0.0f;
        if (live)
        {
            const float back = livePosMs * 0.001f * sr;
            if (frozenBase >= 0.0f && freeze)
                base = frozenBase;
            else
            {
                base = (float) writeHead - back - segLen * (1.0f + 0.5f * std::rand() / (float) RAND_MAX);
                frozenBase = base;
            }
            base = std::fmod (std::fmod (base, (float) ringLen) + (float) ringLen, (float) ringLen);
        }
        else
        {
            const float usable = std::max (8.0f, (float) len - segLen - 2.0f);
            base = clampf (posN, 0.0f, 1.0f) * usable;
        }
        const float pan = rnd11() * panAmount;
        const float a = (pan + 1.0f) * 0.25f * kTwoPi;
        x.gl = std::cos (a); x.gr = std::sin (a);
        x.shape = shape; x.life = 0.0f; x.len = std::max (8.0f, segLen); x.live = live ? 1 : 0;
        const float ratio = keyRatio * std::pow (2.0f, pitch / 12.0f);
        x.inc = rev ? -ratio : ratio;
        x.rp = base + (rev ? segLen : 0.0f);
        x.pos0 = posN;
        x.on = true;
    }

    /*  mélange les grains actifs dans outL/outR  */
    inline void process (float* outL, float* outR, const float* smpL, const float* smpR, int smpLen,
                         const float* rL, const float* rR, int ringLen)
    {
        float l = 0.0f, r = 0.0f;
        for (int i = 0; i < kMaxGrains; ++i)
        {
            Grain& x = g[i];
            if (! x.on) continue;
            const float t = x.life / x.len;
            if (t >= 1.0f || x.life >= x.len) { x.on = false; continue; }
            float w;
            switch (x.shape)
            {
                case 0:  w = 0.5f - 0.5f * std::cos (kTwoPi * t); break;
                case 1:  w = 1.0f - std::fabs (2.0f * t - 1.0f); break;
                case 2:  w = (1.0f - std::exp (-25.0f * t)) * std::exp (-3.4f * t); break;
                default: w = (t < 0.15f) ? (0.5f - 0.5f * std::cos (kTwoPi * t / 0.3f))
                                         : ((t > 0.85f) ? (0.5f - 0.5f * std::cos (kTwoPi * (1.0f - t) / 0.3f)) : 1.0f);
            }
            float sl, sr2;
            if (x.live) { sl = hermiteRing (rL, ringLen, x.rp); sr2 = hermiteRing (rR, ringLen, x.rp); }
            else        { sl = hermite (smpL, smpLen, x.rp);      sr2 = hermite (smpR, smpLen, x.rp); }
            l += sl * w * x.gl;
            r += sr2 * w * x.gr;
            x.rp += x.inc;
            ++x.life;
            x.pos0 = clampf (x.rp / (float) (x.live ? ringLen : smpLen), 0.0f, 1.0f);
        }
        *outL = l; *outR = r;
    }
};

} // namespace gh
