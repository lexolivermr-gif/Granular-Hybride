/*
    Params.h — Table unique des paramètres du plugin.
    Une seule liste X-macro génère : l'énumération, la table des descripteurs,
    la mise en page AudioProcessorValueTreeState et la disposition de l'UI.
    (Miroir exact du moteur de la démo web : mêmes ids, mêmes plages.)
*/
#pragma once
#include <array>
#include <cstddef>

namespace gh
{

enum ParamKind { K_FLOAT = 0, K_INT, K_BOOL, K_CHOICE };
enum SectionId { SEC_GLOBAL = 0, SEC_MIX, SEC_OSC1, SEC_OSC2, SEC_EXTRA, SEC_FILTER,
                 SEC_FENV, SEC_AENV, SEC_LFO, SEC_SAMPLER, SEC_GRAIN, SEC_FX, NUM_SECTIONS };

/*  X(id, nom affiché, min, max, défaut, centre-de-skew (0 = linéaire),
       type, options, nbOptions, unité)                                    */
#define GH_PARAM_LIST(X)                                                                        \
    X(master,     "Master",     0.0f,   1.5f,   0.80f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(poly,       "Voix",       1.0f,   16.0f,  8.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(mono,       "Mono",       0.0f,   1.0f,   0.0f,  0.0f,   K_BOOL,  nullptr, 0, "")        \
    X(glide,      "Glide",      0.0f,   500.0f, 0.0f,  100.0f, K_FLOAT, nullptr, 0, "ms")      \
    X(bendRange,  "Bend",       0.0f,   24.0f,  2.0f,  0.0f,   K_INT,   nullptr, 0, "st")      \
    /* ---- mix des moteurs ---- */                                                             \
    X(mixAnalog,  "Analo",      0.0f,   1.0f,   1.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(mixSampler, "Sampler",    0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(mixGrain,   "Grain",      0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- oscillateur 1 ---- */                                                              \
    X(o1Wave,     "Forme",      0.0f,   3.0f,   0.0f,  0.0f,   K_CHOICE, kWaves, 4, "")        \
    X(o1Oct,      "Oct",       -2.0f,   2.0f,   0.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o1Semi,     "Semi",     -12.0f,  12.0f,   0.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o1Fine,     "Fine",     -50.0f,  50.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "ct")      \
    X(o1PW,       "PW",         0.05f,  0.95f,  0.50f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(o1Level,    "Niveau",     0.0f,   1.0f,   0.80f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(o1Uni,      "Unison",     1.0f,   3.0f,   1.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o1Detune,   "Détune",     0.0f,   50.0f,  9.0f,  0.0f,   K_FLOAT, nullptr, 0, "ct")      \
    X(o1Spread,   "Largeur",    0.0f,   1.0f,   0.5f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- oscillateur 2 ---- */                                                              \
    X(o2Wave,     "Forme",      0.0f,   3.0f,   0.0f,  0.0f,   K_CHOICE, kWaves, 4, "")        \
    X(o2Oct,      "Oct",       -2.0f,   2.0f,   0.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o2Semi,     "Semi",     -12.0f,  12.0f, -12.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o2Fine,     "Fine",     -50.0f,  50.0f,   6.0f,  0.0f,   K_FLOAT, nullptr, 0, "ct")      \
    X(o2PW,       "PW",         0.05f,  0.95f,  0.50f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(o2Level,    "Niveau",     0.0f,   1.0f,   0.50f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(o2Uni,      "Unison",     1.0f,   3.0f,   1.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(o2Detune,   "Détune",     0.0f,   50.0f,  7.0f,  0.0f,   K_FLOAT, nullptr, 0, "ct")      \
    X(o2Spread,   "Largeur",    0.0f,   1.0f,   0.4f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- sub / noise / ring ---- */                                                         \
    X(subLevel,   "Sub",        0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(subOct,     "Sub oct",    1.0f,   2.0f,   1.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(subWave,    "Sub forme",  0.0f,   1.0f,   0.0f,  0.0f,   K_CHOICE, kSubWaves, 2, "")     \
    X(noiseLevel, "Noise",      0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(noiseType,  "Noise col",  0.0f,   2.0f,   0.0f,  0.0f,   K_CHOICE, kNoiseTypes, 3, "")   \
    X(ringLevel,  "Ring mod",   0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- filtre ---- */                                                                     \
    X(fType,      "Type",       0.0f,   3.0f,   0.0f,  0.0f,   K_CHOICE, kFilterTypes, 4, "")  \
    X(cutoff,     "Cutoff",    20.0f,18000.0f,900.0f,800.0f,   K_FLOAT, nullptr, 0, "Hz")      \
    X(reso,       "Réso",       0.0f,   1.0f,   0.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(drive,      "Drive",      0.0f,   1.0f,   0.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(fEnvAmt,    "Env →",     -1.0f,   1.0f,   0.45f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(keyTrack,   "Keytrack",   0.0f,   1.0f,   0.30f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(fVel,       "Vél →",      0.0f,   1.0f,   0.20f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- enveloppe filtre ---- */                                                           \
    X(fA,         "Att",        0.0f,   5.0f,   0.004f,0.20f,  K_FLOAT, nullptr, 0, "s")       \
    X(fD,         "Dec",        0.0f,   5.0f,   0.45f, 0.20f,  K_FLOAT, nullptr, 0, "s")       \
    X(fS,         "Sus",        0.0f,   1.0f,   0.25f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(fR,         "Rel",        0.0f,   5.0f,   0.35f, 0.20f,  K_FLOAT, nullptr, 0, "s")       \
    /* ---- enveloppe ampli ---- */                                                            \
    X(aA,         "Att",        0.0f,   5.0f,   0.006f,0.20f,  K_FLOAT, nullptr, 0, "s")       \
    X(aD,         "Dec",        0.0f,   5.0f,   0.25f, 0.20f,  K_FLOAT, nullptr, 0, "s")       \
    X(aS,         "Sus",        0.0f,   1.0f,   0.85f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(aR,         "Rel",        0.002f, 5.0f,   0.40f, 0.20f,  K_FLOAT, nullptr, 0, "s")       \
    X(velAmt,     "Vél → amp",  0.0f,   1.0f,   0.70f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- LFO ---- */                                                                        \
    X(lfoRate,    "Vitesse",    0.02f,  30.0f,  4.0f,  3.0f,   K_FLOAT, nullptr, 0, "Hz")      \
    X(lfoWave,    "Forme",      0.0f,   3.0f,   1.0f,  0.0f,   K_CHOICE, kLfoWaves, 4, "")     \
    X(lfoPitch,   "→ Pitch",    0.0f,   12.0f,  0.0f,  0.0f,   K_FLOAT, nullptr, 0, "st")      \
    X(lfoCut,     "→ Cutoff",   0.0f,   4.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "oct")     \
    X(lfoPW,      "→ PW",       0.0f,   0.45f,  0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(lfoPos,     "→ Grain pos",0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(lfoTrem,    "→ Tremolo",  0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- sampler ---- */                                                                    \
    X(sPitch,     "Pitch",    -24.0f,  24.0f,   0.0f,  0.0f,   K_INT,   nullptr, 0, "st")      \
    X(sFine,      "Fine",     -50.0f,  50.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "ct")      \
    X(sRoot,      "Fond.",     24.0f,  84.0f,  48.0f,  0.0f,   K_INT,   nullptr, 0, "")        \
    X(sStart,     "Début",      0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sEnd,       "Fin",        0.0f,   1.0f,   1.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sLoop,      "Loop",       0.0f,   1.0f,   1.0f,  0.0f,   K_BOOL,  nullptr, 0, "")        \
    X(sLoopXF,    "XFade",      0.0f,   1.0f,   0.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sReverse,   "Reverse",    0.0f,   1.0f,   0.0f,  0.0f,   K_BOOL,  nullptr, 0, "")        \
    X(sKeyTrack,  "Pitch→note", 0.0f,   1.0f,   1.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sPan,       "Pan",       -1.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sVel,       "Vél →",      0.0f,   1.0f,   0.8f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(sLevel,     "Niveau",     0.0f,   2.0f,   1.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- granulaire ---- */                                                                 \
    X(gSource,    "Source",     0.0f,   2.0f,   0.0f,  0.0f,   K_CHOICE, kGrainSources, 3, "") \
    X(gPosition,  "Position",   0.0f,   1.0f,   0.3f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gSize,      "Taille",     5.0f, 500.0f,  90.0f, 90.0f,   K_FLOAT, nullptr, 0, "ms")      \
    X(gDensity,   "Densité",    0.5f,  90.0f,  16.0f, 16.0f,   K_FLOAT, nullptr, 0, "/s")      \
    X(gSpray,     "Spray",      0.0f,   1.0f,   0.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gPitch,     "Pitch",    -24.0f,  24.0f,   0.0f,  0.0f,   K_INT,   nullptr, 0, "st")      \
    X(gPitchRand, "±Pitch",     0.0f,  24.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "st")      \
    X(gReverse,   "Reverse",    0.0f,   1.0f,   0.15f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gPan,       "Stéréo",     0.0f,   1.0f,   0.6f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gShape,     "Fenêtre",    0.0f,   3.0f,   0.0f,  0.0f,   K_CHOICE, kGrainShapes, 4, "")  \
    X(gLivePos,   "Live recul",20.0f, 800.0f, 120.0f, 150.0f,  K_FLOAT, nullptr, 0, "ms")      \
    X(gKeyTrack,  "Keytrack",   0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gJitter,    "Jitter",     0.0f,   1.0f,   0.35f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(gFreeze,    "Freeze",     0.0f,   1.0f,   0.0f,  0.0f,   K_BOOL,  nullptr, 0, "")        \
    X(gLevel,     "Niveau",     0.0f,   2.0f,   1.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    /* ---- effets ---- */                                                                     \
    X(chMix,      "Chorus",     0.0f,   1.0f,   0.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(chRate,     "Chorus vit", 0.05f,  8.0f,   0.7f,  1.0f,   K_FLOAT, nullptr, 0, "Hz")      \
    X(chDepth,    "Chorus pr",  0.0f,   1.0f,   0.35f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(dTime,      "Delay",     20.0f,1500.0f, 360.0f,360.0f,   K_FLOAT, nullptr, 0, "ms")      \
    X(dFb,        "Delay fb",   0.0f,   0.95f,  0.34f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(dMix,       "Delay mix",  0.0f,   1.0f,   0.12f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(dTone,      "Delay tone", 0.0f,   1.0f,   0.5f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(rSize,      "Verb size",  0.0f,   1.0f,   0.5f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(rDamp,      "Verb damp",  0.0f,   1.0f,   0.4f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(rMix,       "Verb mix",   0.0f,   1.0f,   0.18f, 0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(rWidth,     "Verb larg",  0.0f,   1.0f,   1.0f,  0.0f,   K_FLOAT, nullptr, 0, "")        \
    X(outDrive,   "Sat. master",0.0f,   1.0f,   0.2f,  0.0f,   K_FLOAT, nullptr, 0, "")

inline constexpr const char* kWaves[]        = { "Saw", "Square", "Tri", "Sine" };
inline constexpr const char* kSubWaves[]     = { "Square", "Tri" };
inline constexpr const char* kNoiseTypes[]   = { "Blanc", "Rose", "Brun" };
inline constexpr const char* kFilterTypes[]  = { "LP 24dB", "LP 12dB", "HP 12dB", "BP 12dB" };
inline constexpr const char* kLfoWaves[]     = { "Sine", "Tri", "Square", "S&H" };
inline constexpr const char* kGrainSources[] = { "Sample", "Synth live", "Sample+Live" };
inline constexpr const char* kGrainShapes[]  = { "Hann", "Triangle", "Exp", "Tukey" };

struct ParamDef
{
    const char* id;
    const char* name;
    float min, max, def, centre;
    ParamKind kind;
    const char* const* options;
    int numOptions;
    const char* unit;
};

enum ParamIndex
{
   #define X(id, ...) id##_,
    GH_PARAM_LIST(X)
   #undef X
    NUM_PARAMS
};

inline const ParamDef& paramDef (int i)
{
    static const ParamDef defs[] =
    {
       #define X(id, name, mn, mx, df, ct, kd, opts, nopts, unit) { #id, name, mn, mx, df, ct, kd, opts, nopts, unit },
        GH_PARAM_LIST(X)
       #undef X
    };
    static_assert (sizeof (defs) / sizeof (ParamDef) == (std::size_t) NUM_PARAMS, "table de paramètres incohérente");
    return defs[i];
}

struct Section { const char* name; unsigned int colour; };
inline const Section& sectionInfo (int i)
{
    static const Section secs[NUM_SECTIONS] =
    {
        { "Global",            0xffb248u },
        { "Mix moteurs",       0xff7ac0u },
        { "Oscillateur 1",     0xffb248u },
        { "Oscillateur 2",     0xff9a3du },
        { "Sub · Noise · Ring",0xffd479u },
        { "Filtre",            0x5aa9ffu },
        { "Env. filtre",       0x7fc0ffu },
        { "Env. ampli",        0x9fd4ffu },
        { "LFO",               0x62e0ffu },
        { "Sampler",           0x3fd8c2u },
        { "Granulaire",        0xa97bffu },
        { "Effets",            0x7ee081u }
    };
    return secs[i];
}
/* appartenance des paramètres aux panneaux (même découpage que la démo web) */
inline constexpr int kParamSection[NUM_PARAMS] =
{
    SEC_GLOBAL, SEC_GLOBAL, SEC_GLOBAL, SEC_GLOBAL, SEC_GLOBAL,
    SEC_MIX, SEC_MIX, SEC_MIX,
    SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1, SEC_OSC1,
    SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2, SEC_OSC2,
    SEC_EXTRA, SEC_EXTRA, SEC_EXTRA, SEC_EXTRA, SEC_EXTRA, SEC_EXTRA,
    SEC_FILTER, SEC_FILTER, SEC_FILTER, SEC_FILTER, SEC_FILTER, SEC_FILTER, SEC_FILTER,
    SEC_FENV, SEC_FENV, SEC_FENV, SEC_FENV,
    SEC_AENV, SEC_AENV, SEC_AENV, SEC_AENV, SEC_AENV,
    SEC_LFO, SEC_LFO, SEC_LFO, SEC_LFO, SEC_LFO, SEC_LFO, SEC_LFO,
    SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER,
    SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER, SEC_SAMPLER,
    SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN,
    SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN, SEC_GRAIN,
    SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX, SEC_FX
};

} // namespace gh
