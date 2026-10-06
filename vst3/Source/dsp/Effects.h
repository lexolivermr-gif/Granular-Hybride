/*
    Effects.h — Chorus, Delay (stéréo croisé), Reverb Freeverb, saturation
    master + limiteur de sécurité. Aucune dépendance à JUCE.
*/
#pragma once
#include "DspCore.h"
#include <vector>
#include <array>

namespace gh
{

struct FxParams
{
    float chMix = 0, chRate = 0.7f, chDepth = 0.35f;
    float dTime = 360, dFb = 0.34f, dMix = 0.12f, dTone = 0.5f;
    float rSize = 0.5f, rDamp = 0.4f, rMix = 0.18f, rWidth = 1.0f;
    float outDrive = 0.2f;
};

class Effects
{
public:
    void prepare (double sampleRate)
    {
        sr = (float) sampleRate;

        clLen = (int) (sr * 0.05f);
        clBuf[0].assign ((size_t) clLen, 0.0f);
        clBuf[1].assign ((size_t) clLen, 0.0f);
        clW = 0; clPh = 0.0f;

        dlLen = (int) (sr * 1.55f);
        dlBuf[0].assign ((size_t) dlLen, 0.0f);
        dlBuf[1].assign ((size_t) dlLen, 0.0f);
        dlW = 0; dlF[0] = dlF[1] = 0.0f;

        const float rv = sr / 44100.0f;
        const int combT[8] = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 };
        const int apT[4]   = { 556, 441, 341, 225 };
        for (int ch = 0; ch < 2; ++ch)
        {
            const int spread = ch ? 23 : 0;
            for (int i = 0; i < 8; ++i)
            {
                combLen[ch][i] = std::max (8, (int) (combT[i] * rv) + spread);
                combBuf[ch][i].assign ((size_t) combLen[ch][i], 0.0f);
                combIdx[ch][i] = 0; combFb[ch][i] = 0.0f;
            }
            for (int i = 0; i < 4; ++i)
            {
                apLen[ch][i] = std::max (8, (int) (apT[i] * rv) + spread);
                apBuf[ch][i].assign ((size_t) apLen[ch][i], 0.0f);
                apIdx[ch][i] = 0;
            }
        }
        lim = 1.0f;
    }

    inline void process (float* L, float* R, int n, const FxParams& p) noexcept
    {
        const float dlTime = clampf (p.dTime * 0.001f * sr, 8.0f, (float) dlLen - 4.0f);
        const float toneC  = 0.05f + (1.0f - p.dTone) * 0.9f;
        const float drv    = 1.0f + p.outDrive * 5.0f;
        const float drvOut = 1.0f / (1.0f + p.outDrive * 2.2f);

        for (int i = 0; i < n; ++i)
        {
            float l = L[i], r = R[i];

            /* ---- chorus : deux lignes modulées en opposition ---- */
            if (p.chMix > 1e-4f)
            {
                clPh += p.chRate / sr; if (clPh >= 1.0f) clPh -= 1.0f;
                const float m1 = (12.0f + p.chDepth * 7.0f * (0.5f + 0.5f * std::sin (kTwoPi * clPh))) * 0.001f * sr;
                const float m2 = (12.0f + p.chDepth * 7.0f * (0.5f + 0.5f * std::sin (kTwoPi * clPh + 2.1f))) * 0.001f * sr;
                const float c0 = hermiteRing (clBuf[0].data(), clLen, (float) clW - m1);
                const float c1 = hermiteRing (clBuf[1].data(), clLen, (float) clW - m2);
                clBuf[0][(size_t) clW] = l;
                clBuf[1][(size_t) clW] = r;
                clW = (clW + 1) % clLen;
                l = l * (1.0f - p.chMix * 0.5f) + c0 * p.chMix * 0.7f;
                r = r * (1.0f - p.chMix * 0.5f) + c1 * p.chMix * 0.7f;
            }

            /* ---- delay à rétroaction croisée ---- */
            if (p.dMix > 1e-4f)
            {
                float rp = (float) dlW - dlTime;
                while (rp < 0.0f) rp += (float) dlLen;
                const int i0 = (int) rp, i1 = (i0 + 1) % dlLen;
                const float t = rp - (float) i0;
                const float oL = dlBuf[0][(size_t) i0] * (1.0f - t) + dlBuf[0][(size_t) i1] * t;
                const float oR = dlBuf[1][(size_t) i0] * (1.0f - t) + dlBuf[1][(size_t) i1] * t;
                dlF[0] += (oR - dlF[0]) * toneC;
                dlF[1] += (oL - dlF[1]) * toneC;
                dlBuf[0][(size_t) dlW] = l + dlF[0] * p.dFb;
                dlBuf[1][(size_t) dlW] = r + dlF[1] * p.dFb;
                dlW = (dlW + 1) % dlLen;
                l += oL * p.dMix; r += oR * p.dMix;
            }
            else
            {
                dlBuf[0][(size_t) dlW] = l; dlBuf[1][(size_t) dlW] = r;
                dlW = (dlW + 1) % dlLen;
            }

            /* ---- reverb Freeverb (8 combs + 4 allpass par canal) ---- */
            if (p.rMix > 1e-4f)
            {
                const float fb = 0.72f + p.rSize * 0.26f, damp = p.rDamp * 0.4f;
                const float inS = (l + r) * 0.012f;
                float wetL = 0.0f, wetR = 0.0f;
                for (int ch = 0; ch < 2; ++ch)
                {
                    float acc = 0.0f;
                    for (int k = 0; k < 8; ++k)
                    {
                        float* buf = combBuf[ch][k].data();
                        const int len = combLen[ch][k], j = combIdx[ch][k];
                        const float y = buf[j];
                        combFb[ch][k] = y * (1.0f - damp) + combFb[ch][k] * damp;
                        buf[j] = inS + combFb[ch][k] * fb;
                        combIdx[ch][k] = (j + 1) % len;
                        acc += y;
                    }
                    for (int k = 0; k < 4; ++k)
                    {
                        float* buf = apBuf[ch][k].data();
                        const int len = apLen[ch][k], j = apIdx[ch][k];
                        const float y = buf[j];
                        buf[j] = acc + y * 0.5f;
                        acc = y - acc;
                        apIdx[ch][k] = (j + 1) % len;
                    }
                    if (ch == 0) wetL = acc; else wetR = acc;
                }
                const float mid = (wetL + wetR) * 0.5f;
                const float side = (wetL - wetR) * 0.5f * p.rWidth;
                l += (mid + side) * p.rMix * 3.0f;
                r += (mid - side) * p.rMix * 3.0f;
            }

            /* ---- saturation + limiteur doux ---- */
            l = tclip (l * drv) * drvOut;
            r = tclip (r * drv) * drvOut;
            const float pk = std::max (std::fabs (l), std::fabs (r));
            if (pk > lim) lim = pk; else lim *= 0.9995f;
            const float g = lim > 1.0f ? 1.0f / lim : 1.0f;
            L[i] = l * g; R[i] = r * g;
        }
    }

private:
    float sr = 44100.0f;
    int clLen = 0, clW = 0; float clPh = 0;
    std::vector<float> clBuf[2];
    int dlLen = 0, dlW = 0; float dlF[2] { 0, 0 };
    std::vector<float> dlBuf[2];
    int combLen[2][8] {}, combIdx[2][8] {}; float combFb[2][8] {};
    std::vector<float> combBuf[2][8];
    int apLen[2][4] {}, apIdx[2][4] {};
    std::vector<float> apBuf[2][4];
    float lim = 1.0f;
};

} // namespace gh
