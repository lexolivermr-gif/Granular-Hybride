# Granular Hybrid — Compiler le VST3

Instrument VST3 : synthé analogique (2 oscillateurs + sub/noise/ring, filtre ladder 24 dB),
sampler et moteur granulaire — **les trois se mixent en continu**, le granulaire pouvant
granuler le sample **ou** le synthé en direct (ou les deux en alternance).

---

## 1. Récupérer JUCE (une seule fois)

```bash
cd GranularHybrid/vst3
git clone --depth 1 https://github.com/juce-framework/JUCE.git JUCE
```

JUCE est gratuit pour un usage personnel/éducatif et pour les projets open source
(licence AGPL) ; une licence commerciale est requise pour un plugin propriétaire vendu.

---

## 2. Windows (Visual Studio 2022)

1. Installer **Visual Studio 2022** avec « Développement Desktop en C++ » et **CMake**.
2. Ouvrir un terminal dans `GranularHybrid\vst3` :

```bat
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target GranularHybrid_VST3
```

3. Le fichier compilé est automatiquement copié (option `COPY_PLUGIN_AFTER_BUILD`) dans :
   `C:\Users\<vous>\AppData\Roaming\...` ou, plus courant, dans
   `C:\Program Files\Common Files\VST3\Granular Hybrid.vst3`
   (lancer Visual Studio / le terminal **en administrateur** si la copie échoue).
4. Dans **Ableton Live** : `Options → Preferences → Plug-Ins → Activer VST3` +
   choisir le dossier `C:\Program Files\Common Files\VST3`, puis « Rescan ».
   Le plugin apparaît sous **Instruments → Granular Hybrid**.

> Pour tester sans passer par Ableton : lancez `Granular Hybrid.exe`
> (cible *Standalone*) — l'interface, le clavier virtuel et le son y sont identiques.

## 3. macOS (Xcode)

```bash
xcode-select --install
cmake -B build -G Xcode
cmake --build build --config Release --target GranularHybrid_VST3
```
Le `.vst3` est copié dans `~/Library/Audio/Plug-Ins/VST3/` (copie universelle Intel + Apple
Silicon si vous ajoutez `-DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"`).
Ableton : `Preferences → Plug-Ins → VST3` puis rescan (ou « VST3 > Rescan »).

## 4. Linux

```bash
sudo apt install build-essential cmake ninja-build pkg-config \
     libasound2-dev libx11-dev libxext-dev libxinerama-dev libxrandr-dev \
     libxcursor-dev libfreetype-dev libfontconfig1-dev libgl1-mesa-dev
cmake -B build -GNinja -DCMAKE_BUILD_TYPE=Release
cmake --build build --target GranularHybrid_VST3
# → build/GranularHybrid_artefacts/Release/VST3/Granular Hybrid.vst3
mkdir -p ~/.vst3 && cp -r "build/GranularHybrid_artefacts/Release/VST3/Granular Hybrid.vst3" ~/.vst3/
```

---

## Utilisation rapide

| Réglage | Fait quoi |
|---|---|
| `Mix moteurs → Analo / Sampler / Grain` | dose des 3 moteurs (ils s'additionnent) |
| `Granulaire → Source` | **Sample**, **Synth live** (granule le synthé en direct) ou **Sample+Live** |
| `Granulaire → Position / Taille / Densité / Spray` | le cœur du moteur granulaire |
| `Granulaire → Live recul` | retard de capture quand la source est le synthé live |
| `Granulaire → Freeze` | fige le nuage (drone) |
| `Sampler → Début / Fin / Loop / XFade` | boucle avec fondu enchaîné à la lecture |
| Clic sur la forme d'onde (interface) | déplace la position du granulaire |
| Glisser-déposer un WAV/AIFF/MP3 | charge un sample (aussi : bouton « Charger un sample… ») |

Presets fournis : Basse · Pad · Nuage · Grain live · Gel · Init.
L'état du projet Ableton mémorise les réglages **et** le chemin du sample chargé.

## Notes techniques

- 16 voix, oversampling interne « à la demande » sur le filtre ladder (pas de repliement),
  PolyBLEP sur les oscillateurs (pas d'aliasing), saturation douce + limiteur en sortie.
- Le DSP est isolé du reste (`Source/dsp/`), sans dépendance à JUCE : il est identique à
  celui de la démo web fournie (`../index.html`) — même code, mêmes réglages par défaut.
- Thread audio sans allocation ni verrou : le sample chargé est échangé via `try_lock`.
