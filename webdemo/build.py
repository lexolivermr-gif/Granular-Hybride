#!/usr/bin/env python3
"""Assemble la démo web autonome : webdemo/index.html (fichier unique, zéro dépendance).

- concatène : 00_head.html + [10_engine.js + 30_ui.js + 40_main.js] + pied de page
- embarque le module AudioWorklet (10_engine.js + 20_processor.js) en base64
  dans une balise <script type="text/plain"> → aucun fichier externe, aucune
  requête réseau : fonctionne même en ouvrant le fichier depuis le disque.
"""
import base64, pathlib, sys, datetime

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent / "index.html"

def read(p): return (SRC / "src" / p).read_text(encoding="utf-8")

head   = read("00_head.html")
engine = read("10_engine.js")
proc   = read("20_processor.js")
ui     = read("30_ui.js")
main   = read("40_main.js")

worklet_src = engine + "\n" + proc
b64 = base64.b64encode(worklet_src.encode("utf-8")).decode("ascii")

footer = """
<script type="text/plain" id="wkSrc">%s</script>
<script>
/* --------------------------------------------------------------------
   Source du module AudioWorklet (moteur + processeur), embarquée en base64
   puis décodée en texte : aucune ressource externe n'est nécessaire.
   -------------------------------------------------------------------- */
const WORKLET_SRC = (function(){
  try{
    const txt = document.getElementById('wkSrc').textContent.trim();
    const bin = atob(txt);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch(e){ console.warn('WORKLET_SRC indisponible', e); return ''; }
})();
</script>
<script>
/* ---------------- MOTEUR DSP ---------------- */
%s
/* ---- liaisons globales : l'API du moteur exposée à l'interface ---- */
const ENG = ENGINE_CODE();
const SECTIONS = ENG.SECTIONS, PARAM_DEFS = ENG.PARAM_DEFS,
      P = ENG.P, NP = ENG.NP, WAVES = ENG.WAVES;
/* ---------------- INTERFACE ---------------- */
%s
/* ---------------- DÉMARRAGE ---------------- */
%s
</script>
</body>
</html>
""" % (b64, engine, ui, main)

html = head + footer
OUT.write_text(html, encoding="utf-8")
kb = len(html.encode("utf-8"))/1024
print("OK → %s  (%.0f Ko)  %s" % (OUT, kb, datetime.datetime.now().strftime("%H:%M:%S")))
print("   worklet embarqué : %d octets de source" % len(worklet_src))
