# ✅ À FAIRE — 2 étapes, dans cet ordre

---

## ÉTAPE 1 — Écouter le synthé maintenant (1 minute, rien à installer)

1. Dans cette conversation, cliquez sur le fichier **`index.html`**, puis sur **Download**.
2. **Double-cliquez** sur le fichier téléchargé (il s'ouvre dans Chrome / Firefox / Edge).
3. Cliquez sur le bouton orange **« ▶ DÉMARRER L'AUDIO »**.
4. Jouez avec les touches de votre clavier : **`W S E D F T G Y H U J K`**
   (octave plus bas / plus haut : touches **`Z`** et **`X`** · tout couper : **Espace**).

> C'est exactement le même moteur sonore que le plugin. Vous pouvez tout tester :
> les 3 curseurs `Analo`, `Sampler`, `Grain` dans « Mix moteurs », les presets en haut,
> et même glisser-déposer un de vos fichiers WAV sur la zone en bas à droite.

---

## ÉTAPE 2 — Avoir le plugin dans Ableton (10 minutes, gratuit, sans rien installer)

Le fichier du plugin doit être fabriqué par une machine Windows. **GitHub le fait
gratuitement pour vous.** Voici les clics, dans l'ordre :

### 2.1 — Mettre le projet sur GitHub

1. Allez sur **https://github.com** et créez un compte gratuit (si vous n'en avez pas).
2. En haut à droite, cliquez sur le **`+`** puis **« New repository »**.
3. Nom : **granular-hybrid** — cochez **Public** — cliquez **« Create repository »**.
4. Sur la page qui s'ouvre, cliquez sur le lien **« uploading an existing file »**.
5. Sur votre ordinateur, ouvrez le dossier **`GranularHybrid`** (téléchargez-le depuis
   cette conversation si ce n'est pas déjà fait).
6. Sélectionnez **tout son contenu** (`Ctrl + A`) et **glissez-déposez-le** dans la page
   GitHub, à l'endroit indiqué.
7. Attendez la fin du chargement, puis cliquez sur le bouton vert
   **« Commit changes »** (en bas de page).

### 2.2 — Laisser GitHub fabriquer le plugin

8. Cliquez sur l'onglet **« Actions »** en haut de la page du dépôt.
9. Une ligne **« Build VST3 (Windows) »** apparaît avec un rond **jaune** (en cours).
   ⏳ Attendez environ **10 minutes** — rechargez la page si besoin.
10. Quand le rond devient **vert ✅**, cliquez sur **« Build VST3 (Windows) »**,
    puis sur le nom du travail **« Compilation du VST3 (Windows x64) »**.
11. Tout en bas de cette page, dans la section **« Artifacts »**, cliquez sur
    **`GranularHybrid-VST3-Windows`** → un fichier **.zip** se télécharge.

### 2.3 — Installer dans Ableton

12. **Décompressez** le .zip : vous obtenez un dossier nommé
    **« Granular Hybrid.vst3 »**.
13. Copiez ce dossier dans **`C:\Program Files\Common Files\VST3\`**
    (Windows peut demander une autorisation : cliquez « Continuer »).
14. Ouvrez **Ableton Live** → **Options → Preferences → Plug-Ins**
    → vérifiez que **« VST3 »** est activé (dossier système : `C:\Program Files\Common Files\VST3`)
    → cliquez sur **« Rescan »**.
15. Dans le navigateur d'Ableton à gauche : **Instruments → Granular Hybrid**.
    Glissez-le sur une piste MIDI, dessinez des notes… et jouez ! 🎹

---

## ❓ Si quelque chose ne marche pas

| Problème | Solution |
|---|---|
| Le son ne démarre pas dans l'étape 1 | Vérifiez que vous avez bien **téléchargé** le fichier `index.html` puis ouvert le fichier local (pas l'aperçu intégré). Autorisez le son dans le navigateur. |
| GitHub : le rond devient **rouge ❌** | Envoyez-moi la capture d'écran de l'erreur : je corrige et vous repoussez le code (2 clics). |
| Ableton ne voit pas le plugin | Vérifiez que le dossier s'appelle bien `Granular Hybrid.vst3` (et pas `Granular Hybrid.vst3.zip`), qu'il est bien dans `C:\Program Files\Common Files\VST3`, puis **quittez et relancez Ableton**. |
| Vous préférez compiler vous-même | Guide classique (Visual Studio) : `vst3/README-BUILD.md` |

---

## 📌 Pourquoi dois-je passer par GitHub ?

Un plugin `.vst3` est **propre à chaque système**. Le fichier pour Windows ne peut être
fabriqué que par un ordinateur Windows avec le compilateur de Microsoft. Mon serveur est
sous Linux et JUCE (la bibliothèque utilisée) refuse les compilateurs croisés vers Windows
— j'ai essayé, et c'est écrit noir sur blanc dans son code : *« MinGW is not supported »*.
GitHub, lui, prête gratuitement une machine Windows : c'est le chemin le plus simple, et
le fichier obtenu est compilé avec l'outil officiel de Microsoft (le plus fiable).
