/*
    GranularHybrid — PluginEditor.h
    Interface : panneaux de knobs par section, vue du sample avec les grains
    actifs, boutons de presets, clavier virtuel, glisser-déposer de fichiers.
*/
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_dsp/juce_dsp.h>
#include "PluginProcessor.h"

class GranularHybridAudioProcessor;

/* ---------------- Look & Feel : knobs dessinés à la main --------------- */
class GHLookAndFeel : public juce::LookAndFeel_V4
{
public:
    GHLookAndFeel();
    void drawRotarySlider (juce::Graphics&, int x, int y, int width, int height,
                           float sliderPosProportional, float rotaryStartAngle,
                           float rotaryEndAngle, juce::Slider&) override;
};

/* ---------------- Vue du sample + grains actifs ---------------- */
class SampleView : public juce::Component, private juce::Timer
{
public:
    explicit SampleView (GranularHybridAudioProcessor& p);
    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
private:
    void timerCallback() override;
    void rebuildPeaks (const gh::SampleData* s);
    GranularHybridAudioProcessor& proc;
    std::vector<float> peaks;          // min/max par colonne
    std::vector<float> grainViz;       // triples : position, pan, amplitude
    int grainVizCount = 0;
    int lastSampleLen = -1;
};

/* ---------------- Panneau d'une section de paramètres ---------------- */
class SectionPanel : public juce::Component
{
public:
    SectionPanel (GranularHybridAudioProcessor& p, int sectionId);
    void paint (juce::Graphics&) override;
    void resized() override;
    static int preferredHeight (int sectionId);
private:
    struct Item { juce::Component* comp; int w; int h; };
    GranularHybridAudioProcessor& proc;
    int section;
    juce::OwnedArray<juce::Component> children;
    juce::OwnedArray<juce::AudioProcessorValueTreeState::SliderAttachment> sliderAtt;
    juce::OwnedArray<juce::AudioProcessorValueTreeState::ComboBoxAttachment> comboAtt;
    juce::OwnedArray<juce::AudioProcessorValueTreeState::ButtonAttachment> buttonAtt;
    std::vector<Item> items;
};

/* ---------------- Éditeur principal ---------------- */
class GranularHybridAudioProcessorEditor : public juce::AudioProcessorEditor,
                                           public juce::FileDragAndDropTarget,
                                           private juce::Timer
{
public:
    explicit GranularHybridAudioProcessorEditor (GranularHybridAudioProcessor&);
    ~GranularHybridAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    bool isInterestedInFileDrag (const juce::StringArray& files) override;
    void filesDropped (const juce::StringArray& files, int x, int y) override;

private:
    void timerCallback() override;
    void loadFileOrWarn (const juce::File& f);
    void applyPreset (int index);

    GranularHybridAudioProcessor& proc;
    GHLookAndFeel lnf;

    juce::OwnedArray<SectionPanel> panels;

    juce::TextButton loadButton { "Charger un sample…" };
    juce::TextButton defaultButton { "Banque interne" };
    juce::TextButton panicButton { "Panic" };
    juce::OwnedArray<juce::TextButton> presetButtons;

    SampleView sampleView;
    juce::Label sampleLabel, infoLabel;
    juce::MidiKeyboardComponent keyboard;

    std::unique_ptr<juce::FileChooser> chooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GranularHybridAudioProcessorEditor)
};
