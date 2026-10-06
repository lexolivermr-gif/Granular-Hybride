# Granular Hybrid — synthé analogique + sampler + moteur granulaire

Instrument VST3 pour Ableton Live (et tout hôte VST3) : **trois moteurs qui tournent
en parallèle et se mixent en continu**, avec un moteur granulaire qui peut granuler
**le sample chargé**, **le synthé analogique en direct**, ou **les deux en alternance**.

```
                       ┌──────────────┐
  2 OSC + SUB/NOISE ──▶│  FILTRE      │──▶ AMP ──▶ [ Mix moteurs ] ──▶ Effets ──▶ sortie
                       │  ladder 24dB │              Analo / Sampler / Grain
  SAMPLER (boucle,◀────┤  résonant    │
  crossfade, reverse)  └──────────────┘
        │                                              ▲
        └────────────▶ [ MOTEUR GRANULAIRE ] ──────────┘
                       source : Sample | Synth live | Sample+Live
                       position · taille · densité · spray · pitch ±  ·
                       reverse % · fenêtre · freeze · stéréo
```

---

## 1. Écouter tout de suite (aucune installation)

| Fichier | Quoi |
|---|---|
| **`index.html`** | **La démo web jouable** : le même moteur DSP, en un seul fichier autonome. Ouvrez-le dans Chrome/Firefox/Edge, cliquez « DÉMARRER L'AUDIO », jouez au clavier (`W S E D F T G Y H U J K`, octave avec `Z`/`X`). 81 knobs, 6 presets, chargement de vos WAV par glisser-déposer. |
| `demo/granular-hybrid-demo.wav` | Rendue audio (19 s) : basse analogique → pad granulé en direct → nuage sur sample → tout combiné. |
| `demo/plugin-cpp-test.wav` | Contrôle du moteur **C++** (celui du VST3), rendu par le test unitaire. |

## 2. Compiler le plugin VST3

Guide détaillé : **`vst3/README-BUILD.md`** (Windows / macOS / Linux).

Version courte pour **Windows** :

```bat
cd vst3
git clone --depth 1 https://github.com/juce-framework/JUCE.git JUCE
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target GranularHybrid_VST3
```

Le `.vst3` est copié automatiquement dans `C:\Program Files\Common Files\VST3`.
Dans Ableton : `Preferences → Plug-Ins → VST3 → Rescan` → le plugin apparaît dans
**Instruments → Granular Hybrid**. (Une version **Standalone** est aussi produite :
elle permet de tester sans Ableton.)

Un binaire **Linux déjà compilé** est fourni dans `vst3/prebuilt-linux/` (`.vst3` à
copier dans `~/.vst3/`) — c'est le résultat du build vérifié de ce projet.

## 3. Les commandes

- **Global** : Master, polyphonie 1-16, mono/légato, glide, plage de pitch-bend.
- **Mix moteurs** : Analo · Sampler · Grain (à doser librement).
- **Oscillateur 1 & 2** : saw/square/triangle/sine, octave/semi/fine, largeur
  d'impulsion (PW), niveau, **unison 1-3 avec détune et largeur stéréo**.
- **Sub · Noise · Ring** : sub-oscillateur (1 ou 2 octaves), bruit blanc/rose/brun,
  modulation en anneau.
- **Filtre** : LP 24 dB (ladder ZDF saturé, type Moog), LP/HP/BP 12 dB, cutoff
  20 Hz-18 kHz, résonance, drive, suivi de clavier, sensibilité à la vélocité,
  enveloppe dédiée.
- **Enveloppes** : ADSR pour l'ampli (avec vélocité) + ADSR pour le filtre.
- **LFO** : sine/tri/carré/échantillon-bloqué, routable vers pitch, cutoff, PW,
  position des grains, trémolo.
- **Sampler** : 12 paramètres (pitch, fine, note de base, début/fin, boucle avec
  fondu enchaîné, reverse, suivi de clavier, pan, vélocité, niveau).
- **Granulaire** : source, position, taille de grain (5-500 ms), densité (0,5-90 /s),
  spray, transposition ± et aléatoire, % de grains inversés, largeur stéréo,
  fenêtre (Hann/triangle/exp/tukey), recul de capture du « live », suivi de clavier,
  jitter, **freeze**, niveau.
- **Effets** : chorus, delay stéréo croisé (avec filtrage du feedback),
  reverb Freeverb (taille, amortissement, largeur, mix), saturation master.

## 4. Structure du dépôt

```
index.html                  la démo web autonome (moteur + interface)
demo/                       rendus audio de contrôle
webdemo/
  build.py                  assemble index.html depuis src/
  src/10_engine.js          LE moteur DSP (référence : analo + sampler + granulaire + FX)
  src/20_processor.js       wrapper AudioWorklet (thread audio dédié)
  src/30_ui.js              interface : knobs, presets, clavier, banque de samples
  src/40_main.js            démarrage, façade moteur, visualisation, lecture de fichiers
  src/00_head.html          mise en page et styles
vst3/
  CMakeLists.txt            projet JUCE (VST3 + Standalone)
  Source/Params.h           table unique des 94 paramètres (génère l'énum, la table,
                            la mise en page du plugin et l'interface)
  Source/dsp/DspCore.h      oscillateurs PolyBLEP, filtre ladder ZDF, SVF, ADSR, LFO,
                            nuage granulaire (aucune dépendance à JUCE)
  Source/dsp/Effects.h      chorus, delay, reverb Freeverb, saturation + limiteur
  Source/dsp/SynthEngine.h  voix (16) + moteur : les 3 moteurs et leur mixage
  Source/PluginProcessor.*  paramètres, MIDI, chargement de sample, état du projet
  Source/PluginEditor.*     interface du plugin (knobs, vue du sample + grains, clavier)
  README-BUILD.md           compilation pas-à-pas Windows / macOS / Linux
tests/
  engine_test.js            tests du moteur (JS, 30 vérifications)
  e2e_browser.js            test bout-en-bout dans Chromium (clics + audio réel)
  dsp_cpp_test.cpp          tests du moteur C++ (celui du plugin)
  render_demo.js            rend la démo WAV
```

## 5. Vérifications effectuées

| Test | Commande | Résultat |
|---|---|---|
| Moteur JS (analo, sampler, grain sample/live/les deux, freeze, 16 voix, filtres, FX) | `node tests/engine_test.js` | **tous passent** (~7× le temps réel) |
| Démo web dans un vrai navigateur (clic, AudioWorklet, son réel) | `node tests/e2e_browser.js` | **tous passent** — crêtes 0,30 à 0,56 selon les moteurs |
| Moteur C++ du plugin (94 paramètres, 3 moteurs, 16 voix) | `g++ -std=c++17 -O2 -o /tmp/t tests/dsp_cpp_test.cpp && /tmp/t` | **tous passent** |
| Compilation + validation du VST3 (fabrique, classe instrument) | `cmake --build … --target GranularHybrid_VST3` | **build OK**, VST3 chargé et fabrique validée |

## 6. Notes

- Le moteur granulaire est **polyphonique** : chaque voix a son propre nuage de grains
  (14 grains/voix) et son propre tampon de 1,5 s pour granuler le synthé en direct.
- Le moteur granulaire fonctionne même si `Analo` est à zéro : il peut être la seule
  source audible (le « live » capture le signal des oscillateurs avant le mix).
- Rendu sans allocation ni verrou dans le thread audio ; le sample est échangé par
  `try_lock`. Le chemin du sample est mémorisé dans le projet du DAW.
- Licence JUCE : AGPL ou licence commerciale selon votre usage.
