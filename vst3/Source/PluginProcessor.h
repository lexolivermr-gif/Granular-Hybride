/*
    GranularHybrid — PluginProcessor.h
    Instrument hybride : synthé analogique + sampler + moteur granulaire
    (le granulaire peut aussi bien granuler le sample que le synthé en direct).
*/
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_dsp/juce_dsp.h>
#include "dsp/SynthEngine.h"

class GranularHybridAudioProcessor : public juce::AudioProcessor
{
public:
    GranularHybridAudioProcessor();
    ~GranularHybridAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 5.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    /* --- sample (chargé depuis l'interface, jamais depuis le thread audio) --- */
    void loadSampleFile (const juce::File& file);
    void loadDefaultBankSample();                       // « Accord Pad » synthétisé
    void setSampleData (std::shared_ptr<const gh::SampleData> s);
    juce::String getSampleName() const { return sampleName; }
    juce::File getSampleFile() const { return lastSampleFile; }

    gh::SynthEngine& getEngine() { return engine; }
    juce::AudioProcessorValueTreeState apvts;
    juce::MidiKeyboardState keyboardState;

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

private:
    void handleMidiMessage (const juce::MidiMessage& m);
    void refreshParamCache();

    gh::SynthEngine engine;
    juce::AudioFormatManager formats;
    juce::AudioBuffer<float> renderBuffer;               // tampon stéréo interne
    float paramCache[gh::NUM_PARAMS] {};
    juce::String sampleName { "Accord Pad (interne)" };
    juce::File lastSampleFile;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GranularHybridAudioProcessor)
};
