#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "dsp/DspCore.h"

using namespace gh;

/* ------------------------------------------------------------------ */
/* Mise en page des paramètres (générée depuis la table X-macro)       */
/* ------------------------------------------------------------------ */
juce::AudioProcessorValueTreeState::ParameterLayout GranularHybridAudioProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    const int versionHint = 1;

    for (int i = 0; i < NUM_PARAMS; ++i)
    {
        const ParamDef& d = paramDef (i);
        const juce::ParameterID pid { d.id, versionHint };
        const juce::String name (d.name);
        juce::String unit (d.unit);

        switch (d.kind)
        {
            case K_CHOICE:
            {
                juce::StringArray opts;
                for (int k = 0; k < d.numOptions; ++k) opts.add (d.options[k]);
                layout.add (std::make_unique<juce::AudioParameterChoice> (pid, name, opts, (int) d.def));
                break;
            }
            case K_BOOL:
                layout.add (std::make_unique<juce::AudioParameterBool> (pid, name, d.def > 0.5f));
                break;
            case K_INT:
                layout.add (std::make_unique<juce::AudioParameterInt> (pid, name, (int) d.min, (int) d.max, (int) d.def));
                break;
            case K_FLOAT:
            default:
            {
                juce::NormalisableRange<float> range (d.min, d.max, 0.0f);
                if (d.centre > 0.0f && d.min > 0.0f)
                    range.setSkewForCentre (d.centre);
                auto attrs = juce::AudioParameterFloatAttributes();
                if (unit.isNotEmpty()) attrs = attrs.withLabel (unit);
                layout.add (std::make_unique<juce::AudioParameterFloat> (pid, name, range, d.def, attrs));
                break;
            }
        }
    }
    return layout;
}

/* ------------------------------------------------------------------ */
GranularHybridAudioProcessor::GranularHybridAudioProcessor()
    : juce::AudioProcessor (BusesProperties()
                              .withOutput ("Sortie", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "GRANULARHYBRID", createLayout())
{
    formats.registerBasicFormats();
    for (int i = 0; i < NUM_PARAMS; ++i) paramCache[i] = paramDef (i).def;
}

GranularHybridAudioProcessor::~GranularHybridAudioProcessor() {}

void GranularHybridAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    engine.prepare (sampleRate);
    renderBuffer.setSize (2, juce::jmax (64, samplesPerBlock), false, false, true);
    refreshParamCache();
    if (engine.getSample() == nullptr)
        loadDefaultBankSample();
}

void GranularHybridAudioProcessor::releaseResources() {}

bool GranularHybridAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

void GranularHybridAudioProcessor::refreshParamCache()
{
    for (int i = 0; i < NUM_PARAMS; ++i)
    {
        if (auto* v = apvts.getRawParameterValue (paramDef (i).id))
            paramCache[i] = v->load();
    }
}

/* ------------------------------------------------------------------ */
void GranularHybridAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                                 juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    /* fusionne les événements du clavier virtuel de l'interface */
    keyboardState.processNextMidiBuffer (midiMessages, 0, buffer.getNumSamples(), true);

    refreshParamCache();
    engine.setParams (paramCache);

    const int total = juce::jmin (buffer.getNumSamples(), renderBuffer.getNumSamples());
    if (total <= 0) { buffer.clear(); return; }

    auto* rL = renderBuffer.getWritePointer (0);
    auto* rR = renderBuffer.getWritePointer (1);

    /* découpage du bloc aux positions d'événements MIDI (timing exact) */
    int start = 0;
    for (const auto meta : midiMessages)
    {
        const int pos = juce::jlimit (0, total, meta.samplePosition);
        if (pos > start)
        {
            engine.render (rL + start, rR + start, pos - start);
            start = pos;
        }
        handleMidiMessage (meta.getMessage());
    }
    if (start < total)
        engine.render (rL + start, rR + start, total - start);

    /* recopie vers la sortie du plugin (mono ou stéréo) */
    const int numOut = buffer.getNumChannels();
    if (numOut >= 2)
    {
        buffer.copyFrom (0, 0, rL, total);
        buffer.copyFrom (1, 0, rR, total);
        for (int ch = 2; ch < numOut; ++ch) buffer.clear (ch, 0, total);
    }
    else if (numOut == 1)
    {
        for (int i = 0; i < total; ++i) rL[i] = (rL[i] + rR[i]) * 0.5f;
        buffer.copyFrom (0, 0, rL, total);
    }
    if (total < buffer.getNumSamples())
        buffer.clear (0, total, buffer.getNumSamples() - total);
}

void GranularHybridAudioProcessor::handleMidiMessage (const juce::MidiMessage& m)
{
    if (m.isNoteOn())
        engine.noteOn (m.getNoteNumber(), m.getFloatVelocity());
    else if (m.isNoteOff())
        engine.noteOff (m.getNoteNumber());
    else if (m.isAllNotesOff() || m.isAllSoundOff())
        engine.allOff();
    else if (m.isPitchWheel())
        engine.setBend ((float) (m.getPitchWheelValue() - 8192) / 8192.0f);
    else if (m.isController() && m.getControllerNumber() == 1)     // molette de modulation
        (void) 0;
}

/* ------------------------------------------------------------------ */
/* Sample : lecture de fichier (thread message) → poussé au moteur     */
/* ------------------------------------------------------------------ */
void GranularHybridAudioProcessor::setSampleData (std::shared_ptr<const gh::SampleData> s)
{
    if (s == nullptr) return;
    sampleName = juce::String (s->name);
    engine.offerSample (std::move (s));
}

void GranularHybridAudioProcessor::loadSampleFile (const juce::File& file)
{
    std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (file));
    if (reader == nullptr || reader->lengthInSamples <= 0)
        return;

    const int n = (int) juce::jmin ((juce::int64) reader->lengthInSamples, (juce::int64) (reader->sampleRate * 60.0));
    auto s = std::make_shared<gh::SampleData>();
    s->len = n;
    s->l.assign ((size_t) n, 0.0f);
    s->r.assign ((size_t) n, 0.0f);
    s->name = file.getFileNameWithoutExtension().toStdString();

    juce::AudioBuffer<float> tmp (2, n);
    tmp.clear();
    reader->read (&tmp, 0, n, 0, true, reader->numChannels > 1);

    const float* cl = tmp.getReadPointer (0);
    const float* cr = tmp.getReadPointer (tmp.getNumChannels() > 1 ? 1 : 0);
    std::copy (cl, cl + n, s->l.begin());
    std::copy (cr, cr + n, s->r.begin());

    /* fondu des bords (évite les clics en boucle) */
    const int fade = juce::jmin ((int) (reader->sampleRate * 0.025), n / 4);
    for (int i = 0; i < fade; ++i)
    {
        const float g = (float) i / (float) fade;
        s->l[(size_t) i] *= g;            s->r[(size_t) i] *= g;
        s->l[(size_t) (n - 1 - i)] *= g;  s->r[(size_t) (n - 1 - i)] *= g;
    }
    lastSampleFile = file;
    setSampleData (s);
}

/* Banque interne : accord « pad » synthétisé — le plugin sonne dès l'ouverture */
void GranularHybridAudioProcessor::loadDefaultBankSample()
{
    const double sr = getSampleRate() > 0.0 ? getSampleRate() : 44100.0;
    const int n = (int) (sr * 2.2);
    auto s = std::make_shared<gh::SampleData>();
    s->len = n;
    s->l.assign ((size_t) n, 0.0f);
    s->r.assign ((size_t) n, 0.0f);
    s->name = "Accord Pad (interne)";

    const double fr[5] = { 220.0, 261.63, 329.63, 392.0, 440.0 };
    for (int i = 0; i < n; ++i)
    {
        const double t = (double) i / sr;
        double sL = 0.0, sR = 0.0;
        for (int k = 0; k < 5; ++k)
        {
            const double f = fr[k] * (1.0 + 0.0012 * std::sin (6.2832 * 0.3 * t + k));
            double saw = 0.0;
            for (int h = 1; h <= 8; ++h) saw += std::sin (6.2832 * f * h * t) / h;
            saw *= 0.4;
            const double pan = (k - 2) / 4.0;
            sL += saw * (1.0 - juce::jmax (0.0, pan));
            sR += saw * (1.0 + juce::jmin (0.0, pan));
        }
        const double env = juce::jmin (1.0, t / 0.4) * std::exp (-1.6 * t);
        s->l[(size_t) i] = (float) (sL * 0.2 * env);
        s->r[(size_t) i] = (float) (sR * 0.2 * env);
    }
    /* normalisation + fondu */
    float pk = 0.0f;
    for (int i = 0; i < n; ++i)
        pk = std::max (pk, std::max (std::abs (s->l[(size_t) i]), std::abs (s->r[(size_t) i])));
    if (pk > 1e-6f)
    {
        const float g = 0.75f / pk;
        for (int i = 0; i < n; ++i) { s->l[(size_t) i] *= g; s->r[(size_t) i] *= g; }
    }
    const int fade = (int) (sr * 0.025);
    for (int i = 0; i < fade && i < n / 4; ++i)
    {
        const float g = (float) i / (float) fade;
        s->l[(size_t) i] *= g;            s->r[(size_t) i] *= g;
        s->l[(size_t) (n - 1 - i)] *= g;  s->r[(size_t) (n - 1 - i)] *= g;
    }
    lastSampleFile = juce::File();
    setSampleData (s);
}

/* ------------------------------------------------------------------ */
void GranularHybridAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty ("samplePath", lastSampleFile.getFullPathName(), nullptr);
    std::unique_ptr<juce::XmlElement> xml (state.createXml());
    copyXmlToBinary (*xml, destData);
}

void GranularHybridAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml (getXmlFromBinary (data, sizeInBytes));
    if (xml == nullptr) return;
    auto tree = juce::ValueTree::fromXml (*xml);
    if (! tree.isValid()) return;
    if (tree.hasType (apvts.state.getType()))
        apvts.replaceState (tree);

    const juce::String path = tree.getProperty ("samplePath", "").toString();
    if (path.isNotEmpty())
    {
        const juce::File f (path);
        if (f.existsAsFile()) loadSampleFile (f);
        else loadDefaultBankSample();
    }
}

juce::AudioProcessorEditor* GranularHybridAudioProcessor::createEditor()
{
    return new GranularHybridAudioProcessorEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new GranularHybridAudioProcessor();
}
