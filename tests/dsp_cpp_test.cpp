/*
    tests/dsp_cpp_test.cpp — Test du moteur C++ du plugin, SANS JUCE.
    Vérifie : la table de paramètres, les 3 moteurs, les filtres, le granulaire
    (sample / synthé live / les deux), le freeze, la polyphonie, les FX, et
    rend un WAV de contrôle comparable à la démo web.

    Compilation :  g++ -std=c++17 -O2 -o /tmp/dsptest tests/dsp_cpp_test.cpp
    Exécution   :  /tmp/dsptest [sortie.wav]
*/
#include "../vst3/Source/Params.h"
#include "../vst3/Source/dsp/SynthEngine.h"
#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
#include <memory>
#include <string>
#include <functional>
#include <algorithm>
#include <cstdint>

using namespace gh;
static int failures = 0;
static void check (const char* name, bool ok, const std::string& info = "")
{
    std::printf ("  %s %s%s\n", ok ? "OK  " : "ÉCHEC", name,
                 info.empty() ? "" : ("  (" + info + ")").c_str());
    if (! ok) ++failures;
}

static std::shared_ptr<SampleData> makeChord (double sr)
{
    const int n = (int) (sr * 1.0);
    auto s = std::make_shared<SampleData>();
    s->len = n; s->l.assign ((size_t) n, 0.0f); s->r.assign ((size_t) n, 0.0f);
    s->name = "test";
    for (int i = 0; i < n; ++i)
    {
        const double t = (double) i / sr;
        double v = 0.35 * std::sin (6.2832 * 220 * t) + 0.25 * std::sin (6.2832 * 277.18 * t)
                 + 0.2 * std::sin (6.2832 * 329.63 * t);
        v *= 1.0 - 0.8 * (t / 1.0);
        s->l[(size_t) i] = (float) v; s->r[(size_t) i] = (float) (v * 0.95);
    }
    return s;
}

struct Result { float peak = 0, rms = 0; bool nan = false; int grains = 0, voices = 0; };

static Result runCase (SynthEngine& eng, float* p, const std::vector<int>& notes,
                       double seconds, double sr, std::vector<float>* recL = nullptr,
                       std::vector<float>* recR = nullptr)
{
    eng.setParams (p);
    Result r;
    const int block = 256;
    std::vector<float> L ((size_t) block), R ((size_t) block);
    const int blocks = (int) (seconds * sr / block);
    for (int b = 0; b < blocks; ++b)
    {
        if (b % (blocks / 3) == 0)
            for (int nn : notes) eng.noteOn (nn, 0.85f);
        if (b % (blocks / 3) == (blocks / 3) - 1)
            for (int nn : notes) eng.noteOff (nn);
        eng.render (L.data(), R.data(), block);
        for (int i = 0; i < block; ++i)
        {
            if (! std::isfinite (L[(size_t) i])) r.nan = true;
            r.peak = std::max (r.peak, std::abs (L[(size_t) i]));
            r.rms += L[(size_t) i] * L[(size_t) i];
        }
        if (recL) recL->insert (recL->end(), L.begin(), L.end());
        if (recR) recR->insert (recR->end(), R.begin(), R.end());
    }
    eng.allOff();
    for (int b = 0; b < 120; ++b) eng.render (L.data(), R.data(), block);
    r.rms = std::sqrt (r.rms / (double) (blocks * block));
    r.grains = eng.getActiveGrains();
    r.voices = eng.getActiveVoices();
    return r;
}

static void writeWav (const std::string& path, const std::vector<float>& l,
                      const std::vector<float>& r, double sr)
{
    const size_t n = l.size();
    float pk = 0.0f;
    for (size_t i = 0; i < n; ++i) pk = std::max (pk, std::abs (l[i]));
    const float g = pk > 1e-6f ? 0.89f / pk : 1.0f;
    std::vector<int16_t> inter (n * 2);
    const int fade = (int) (sr * 0.05);
    for (size_t i = 0; i < n; ++i)
    {
        float f = 1.0f;
        if ((int) i < fade) f = (float) i / fade;
        else if (i > n - fade) f = (float) (n - i) / fade;
        const float a = std::max (-1.0f, std::min (1.0f, l[i] * g * f));
        const float b = std::max (-1.0f, std::min (1.0f, r[i] * g * f));
        inter[i * 2] = (int16_t) std::lround (a * 32767.0f);
        inter[i * 2 + 1] = (int16_t) std::lround (b * 32767.0f);
    }
    FILE* f = std::fopen (path.c_str(), "wb");
    if (! f) return;
    const uint32_t dataBytes = (uint32_t) (inter.size() * 2);
    const uint32_t chunk = 36 + dataBytes;
    const uint32_t sr32 = (uint32_t) sr;
    uint32_t byteRate = sr32 * 4; uint16_t blockAlign = 4, bits = 16, ch = 2, fmt = 1;
    std::fwrite ("RIFF", 1, 4, f); std::fwrite (&chunk, 4, 1, f); std::fwrite ("WAVE", 1, 4, f);
    std::fwrite ("fmt ", 1, 4, f); uint32_t sz = 16;
    std::fwrite (&sz, 4, 1, f); std::fwrite (&fmt, 2, 1, f); std::fwrite (&ch, 2, 1, f);
    std::fwrite (&sr32, 4, 1, f); std::fwrite (&byteRate, 4, 1, f);
    std::fwrite (&blockAlign, 2, 1, f); std::fwrite (&bits, 2, 1, f);
    std::fwrite ("data", 1, 4, f); std::fwrite (&dataBytes, 4, 1, f);
    std::fwrite (inter.data(), 2, inter.size(), f);
    std::fclose (f);
}

int main (int argc, char** argv)
{
    const double sr = 44100.0;
    std::printf ("=== TEST DU MOTEUR C++ (VST3, sans JUCE) ===\n\n");

    /* --- intégrité de la table de paramètres --- */
    check ("table de paramètres complète", NUM_PARAMS == 94, std::to_string (NUM_PARAMS) + " paramètres");
    int secCount[NUM_SECTIONS] = { 0 };
    for (int i = 0; i < NUM_PARAMS; ++i) secCount[kParamSection[i]]++;
    check ("répartition par section cohérente", secCount[SEC_GRAIN] == 15 && secCount[SEC_SAMPLER] == 12
           && secCount[SEC_FX] == 12 && secCount[SEC_OSC1] == 9,
           "grain=" + std::to_string (secCount[SEC_GRAIN]) + " sampler=" + std::to_string (secCount[SEC_SAMPLER])
           + " fx=" + std::to_string (secCount[SEC_FX]));
    bool idsOk = true;
    for (int i = 0; i < NUM_PARAMS && idsOk; ++i)
        for (int j = i + 1; j < NUM_PARAMS; ++j)
            if (std::strcmp (paramDef (i).id, paramDef (j).id) == 0) idsOk = false;
    check ("identifiants uniques", idsOk);

    /* --- moteurs --- */
    SynthEngine eng;
    eng.prepare (sr);
    float p[NUM_PARAMS];
    auto set = [&](const char* id, float v)
    {
        for (int i = 0; i < NUM_PARAMS; ++i)
            if (std::strcmp (paramDef (i).id, id) == 0) { p[i] = v; return; }
        std::printf ("  !! paramètre inconnu : %s\n", id);
        ++failures;
    };
    auto reset = [&]() { for (int i = 0; i < NUM_PARAMS; ++i) p[i] = paramDef (i).def; };

    for (int i = 0; i < NUM_PARAMS; ++i) p[i] = paramDef (i).def;
    eng.offerSample (makeChord (sr));
    eng.render (new float[256], new float[256], 0);   // amorce l'échange de sample

    struct Case { const char* name; std::function<void()> setup; std::vector<int> notes; };
    std::vector<Case> cases;

    cases.push_back ({ "ANALO (2 osc + ladder)", [&] {
        reset(); set ("mixAnalog", 1); set ("cutoff", 2600); set ("reso", 0.3f); }, { 48, 55, 60 } });
    cases.push_back ({ "SAMPLER", [&] {
        reset(); set ("mixAnalog", 0); set ("mixSampler", 1); set ("sLoop", 1); }, { 55, 60 } });
    cases.push_back ({ "GRAIN sur SAMPLE", [&] {
        reset(); set ("mixAnalog", 0); set ("mixGrain", 1); set ("gSource", 0);
        set ("gDensity", 22); set ("gSize", 110); }, { 55, 62 } });
    cases.push_back ({ "GRAIN sur SYNTH LIVE", [&] {
        reset(); set ("mixAnalog", 0); set ("mixGrain", 1); set ("gSource", 1);
        set ("gDensity", 26); set ("gSize", 130); set ("gLivePos", 110); }, { 48, 55 } });
    cases.push_back ({ "GRAIN SAMPLE+LIVE + freeze", [&] {
        reset(); set ("mixAnalog", 0.4f); set ("mixSampler", 0.3f); set ("mixGrain", 1);
        set ("gSource", 2); set ("gDensity", 18); set ("gFreeze", 1); }, { 45, 52 } });
    cases.push_back ({ "TOUT COMBINÉ + FX", [&] {
        reset(); set ("mixAnalog", 0.9f); set ("mixSampler", 0.6f); set ("mixGrain", 0.9f);
        set ("gSource", 2); set ("rMix", 0.4f); set ("chMix", 0.4f); set ("dMix", 0.3f); }, { 48, 55, 60, 64 } });
    cases.push_back ({ "MONO/LÉGATO + UNISON + glide", [&] {
        reset(); set ("mono", 1); set ("glide", 120); set ("o1Uni", 3); set ("o1Detune", 25);
        set ("o2Uni", 3); set ("subLevel", 0.5f); set ("noiseLevel", 0.2f); set ("ringLevel", 0.3f); }, { 60 } });
    cases.push_back ({ "LP12 résonant extrême", [&] {
        reset(); set ("fType", 1); set ("cutoff", 600); set ("reso", 1.0f); set ("drive", 1.0f); }, { 45, 57, 64 } });
    cases.push_back ({ "HP12 / BP12", [&] {
        reset(); set ("fType", 2); set ("cutoff", 400); }, { 48, 60 } });
    cases.push_back ({ "16 VOIX", [&] {
        reset(); set ("poly", 16); set ("mixGrain", 0.5f); set ("gDensity", 40); },
        { 60, 63, 65, 67, 70, 72, 74, 77 } });
    for (int sh = 0; sh < 4; ++sh)
        cases.push_back ({ nullptr, [&, sh] {
            reset(); set ("mixGrain", 1); set ("gSource", 0); set ("gShape", (float) sh);
            set ("gSpray", 1.0f); set ("gPitch", 12); set ("gPitchRand", 7); set ("gDensity", 60); }, { 55, 62 } });

    std::vector<float> demoL, demoR;
    for (size_t ci = 0; ci < cases.size(); ++ci)
    {
        auto& c = cases[ci];
        c.setup();
        std::string name = c.name ? c.name : std::string ("GRAIN fenêtre ") + std::to_string (ci - 10);
        const bool record = (ci == 5);
        auto r = runCase (eng, p, c.notes, 1.5, sr, record ? &demoL : nullptr, record ? &demoR : nullptr);
        check (name.c_str(), ! r.nan && r.peak > 0.02f && r.peak < 12.0f,
               "crête=" + std::to_string (r.peak).substr (0, 5) + " voix=" + std::to_string (r.voices)
               + " grains=" + std::to_string (r.grains));
    }

    /* --- WAV de démonstration (moteur C++ = celui du plugin) --- */
    const std::string out = (argc > 1) ? argv[1]
                                       : std::string ("/home/user/GranularHybrid/demo/plugin-cpp-test.wav");
    if (! demoL.empty())
    {
        writeWav (out, demoL, demoR, sr);
        std::printf ("\n  WAV du moteur C++ écrit : %s  (%.1f s)\n", out.c_str(),
                     demoL.size() / sr);
    }

    std::printf ("\n%s\n", failures == 0 ? ">>> MOTEUR C++ : TOUS LES TESTS PASSENT"
                                         : (">>> " + std::to_string (failures) + " ÉCHEC(S)").c_str());
    return failures == 0 ? 0 : 1;
}
