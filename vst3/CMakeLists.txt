cmake_minimum_required(VERSION 3.22)
project(GranularHybrid VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
#  JUCE : soit le dossier vst3/JUCE (méthode recommandée),
#  soit un chemin explicite :  -DGH_JUCE_PATH=/chemin/vers/JUCE
# ---------------------------------------------------------------------------
if(DEFINED GH_JUCE_PATH AND EXISTS "${GH_JUCE_PATH}/modules/juce_audio_processors")
    set(JUCE_ROOT "${GH_JUCE_PATH}")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_processors")
    set(JUCE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/JUCE")
else()
    message(FATAL_ERROR
        "JUCE introuvable.\n"
        "  git clone --depth 1 https://github.com/juce-framework/JUCE.git vst3/JUCE\n"
        "ou relancez cmake avec -DGH_JUCE_PATH=/chemin/vers/JUCE")
endif()
add_subdirectory("${JUCE_ROOT}" "${CMAKE_BINARY_DIR}/JUCE" EXCLUDE_FROM_ALL)

# ---------------------------------------------------------------------------
#  Le plugin : VST3 + application autonome (pour tester sans Ableton)
# ---------------------------------------------------------------------------
# Par défaut on copie le plugin dans le dossier VST3 du système après compilation.
# Sur une machine d'intégration continue (GitHub Actions) on désactive la copie.
option(GH_COPY_PLUGIN "Copier le plugin après compilation" ON)
if(GH_COPY_PLUGIN)
    set(GH_COPY_PLUGIN_FLAG TRUE)
else()
    set(GH_COPY_PLUGIN_FLAG FALSE)
endif()

juce_add_plugin(GranularHybrid
    PRODUCT_NAME            "Granular Hybrid"
    COMPANY_NAME            "Granular Hybrid Audio"
    BUNDLE_ID               "com.granularhybrid.instrument"
    PLUGIN_MANUFACTURER_CODE Ghyd
    PLUGIN_CODE              Gh01
    IS_SYNTH                 TRUE
    NEEDS_MIDI_INPUT         TRUE
    NEEDS_MIDI_OUTPUT        FALSE
    IS_MIDI_EFFECT           FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD  ${GH_COPY_PLUGIN_FLAG}
    FORMATS                  VST3 Standalone
    VST3_CATEGORIES          Instrument Synth)

target_sources(GranularHybrid PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_include_directories(GranularHybrid PRIVATE Source)

target_compile_definitions(GranularHybrid PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_STRICT_REFCOUNTEDPOINTER=1)

target_link_libraries(GranularHybrid
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
