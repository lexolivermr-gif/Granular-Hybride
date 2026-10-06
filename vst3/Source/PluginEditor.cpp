#include "PluginEditor.h"
#include "dsp/DspCore.h"

using namespace gh;

/* ==================================================================== */
/* Look & Feel                                                          */
/* ==================================================================== */
GHLookAndFeel::GHLookAndFeel()
{
    setColour (juce::ResizableWindow::backgroundColourId, juce::Colour (0xff0d1017));
    setColour (juce::Slider::rotarySliderOutlineColourId, juce::Colour (0xff2c3342));
    setColour (juce::Slider::rotarySliderFillColourId, juce::Colour (0xffffb248));
    setColour (juce::Slider::textBoxTextColourId, juce::Colour (0xffc9d3e3));
    setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
    setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    setColour (juce::Label::textColourId, juce::Colour (0xff8b94a8));
    setColour (juce::ComboBox::backgroundColourId, juce::Colour (0xff222836));
    setColour (juce::ComboBox::textColourId, juce::Colour (0xffe6ebf5));
    setColour (juce::ComboBox::outlineColourId, juce::Colour (0xff2a3040));
    setColour (juce::TextButton::buttonColourId, juce::Colour (0xff222836));
    setColour (juce::ToggleButton::textColourId, juce::Colour (0xffb9c2d4));
    setColour (juce::ToggleButton::tickColourId, juce::Colour (0xffffb248));
}

void GHLookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height,
                                      float pos, float startAngle, float endAngle, juce::Slider& s)
{
    const auto bounds = juce::Rectangle<int> (x, y, width, height).toFloat().reduced (3.0f);
    const auto radius = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const auto angle = startAngle + pos * (endAngle - startAngle);

    g.setColour (juce::Colour (0xff1b2130));
    g.fillEllipse (bounds);
    g.setColour (findColour (juce::Slider::rotarySliderOutlineColourId));
    g.drawEllipse (bounds, 1.2f);

    juce::Path track, fill;
    track.addCentredArc (centre.x, centre.y, radius - 3.0f, radius - 3.0f, 0.0f, startAngle, endAngle, true);
    g.setColour (juce::Colour (0xff2c3342));
    g.strokePath (track, juce::PathStrokeType (3.2f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    if (pos > 0.002f)
    {
        fill.addCentredArc (centre.x, centre.y, radius - 3.0f, radius - 3.0f, 0.0f, startAngle, angle, true);
        const auto acc = findColour (juce::Slider::rotarySliderFillColourId);
        g.setColour (acc.withAlpha (0.95f));
        g.strokePath (fill, juce::PathStrokeType (3.2f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }
    const juce::Point<float> p (centre.x + std::sin (angle) * (radius - 4.0f),
                                centre.y - std::cos (angle) * (radius - 4.0f));
    g.setColour (juce::Colours::white.withAlpha (0.9f));
    g.drawLine (centre.x, centre.y, p.x, p.y, 1.6f);
    g.setColour (juce::Colour (0xff0d1017));
    g.fillEllipse (centre.x - 2.2f, centre.y - 2.2f, 4.4f, 4.4f);
}

/* ==================================================================== */
/* SectionPanel                                                         */
/* ==================================================================== */
SectionPanel::SectionPanel (GranularHybridAudioProcessor& p, int sectionId)
    : proc (p), section (sectionId)
{
    const auto& sec = sectionInfo (sectionId);
    for (int i = 0; i < NUM_PARAMS; ++i)
    {
        if (kParamSection[i] != sectionId) continue;
        const ParamDef& d = paramDef (i);
        const juce::String id (d.id);
        const auto colour = juce::Colour (sec.colour);

        if (d.kind == K_CHOICE)
        {
            auto* cb = new juce::ComboBox();
            for (int k = 0; k < d.numOptions; ++k) cb->addItem (d.options[k], k + 1);
            cb->setTooltip (d.name);
            auto* att = new juce::AudioProcessorValueTreeState::ComboBoxAttachment (proc.apvts, id, *cb);
            children.add (cb); comboAtt.add (att);
            items.push_back ({ cb, 132, 22 });
        }
        else if (d.kind == K_BOOL)
        {
            auto* tb = new juce::ToggleButton (d.name);
            auto* att = new juce::AudioProcessorValueTreeState::ButtonAttachment (proc.apvts, id, *tb);
            children.add (tb); buttonAtt.add (att);
            items.push_back ({ tb, 92, 22 });
        }
        else
        {
            auto* sl = new juce::Slider (juce::Slider::RotaryHorizontalVerticalDrag,
                                         juce::Slider::TextBoxBelow);
            sl->setColour (juce::Slider::rotarySliderFillColourId, colour);
            sl->setTextBoxStyle (juce::Slider::TextBoxBelow, false, 58, 12);
            sl->setTooltip (d.name);
            if (d.kind == K_INT) sl->setNumDecimalPlacesToDisplay (0);
            auto* att = new juce::AudioProcessorValueTreeState::SliderAttachment (proc.apvts, id, *sl);
            children.add (sl); sliderAtt.add (att);
            items.push_back ({ sl, 58, 54 });
        }
        addAndMakeVisible (children.getLast());
    }
}

int SectionPanel::preferredHeight (int sectionId)
{
    int n = 0;
    for (int i = 0; i < NUM_PARAMS; ++i) if (kParamSection[i] == sectionId) ++n;
    const int rows = juce::jmax (1, (int) std::ceil (n / 4.0));
    return 20 + rows * 56;
}

void SectionPanel::paint (juce::Graphics& g)
{
    const auto& sec = sectionInfo (section);
    auto r = getLocalBounds().toFloat();
    g.setColour (juce::Colour (0xff161b26));
    g.fillRoundedRectangle (r, 9.0f);
    g.setColour (juce::Colour (0xff262d3d));
    g.drawRoundedRectangle (r.reduced (0.5f), 9.0f, 1.0f);
    g.setColour (juce::Colour (sec.colour).withAlpha (0.9f));
    g.fillEllipse (8.0f, 7.5f, 7.0f, 7.0f);
    g.setColour (juce::Colour (0xff8b94a8));
    g.setFont (juce::FontOptions (10.5f, juce::Font::bold));
    g.drawText (juce::String (sec.name).toUpperCase(), 21, 4, getWidth() - 26, 15,
                juce::Justification::centredLeft, false);
}

void SectionPanel::resized()
{
    auto area = getLocalBounds().reduced (6);
    area.removeFromTop (18);
    int x = area.getX(), y = area.getY(), rowH = 0;
    for (auto& it : items)
    {
        if (x + it.w > area.getRight() && x > area.getX())
        {
            x = area.getX();
            y += rowH + 4;
            rowH = 0;
        }
        it.comp->setBounds (x + 2, y, it.w - 4, it.h);
        x += it.w;
        rowH = juce::jmax (rowH, it.h);
    }
}

/* ==================================================================== */
/* SampleView                                                           */
/* ==================================================================== */
SampleView::SampleView (GranularHybridAudioProcessor& p) : proc (p)
{
    grainViz.resize ((size_t) kMaxGrains * 3 * kMaxVoices);
    startTimerHz (30);
}

void SampleView::timerCallback()
{
    const auto* s = proc.getEngine().getSample();
    if (s != nullptr && s->len != lastSampleLen)
        rebuildPeaks (s);
    const int n = proc.getEngine().getGrainViz (grainViz.data(), (int) grainViz.size() / 3);
    grainVizCount = n;
    repaint();
}

void SampleView::rebuildPeaks (const gh::SampleData* s)
{
    lastSampleLen = s->len;
    const int w = juce::jmax (64, getWidth());
    peaks.assign ((size_t) w * 2, 0.0f);
    const int step = juce::jmax (1, s->len / w);
    for (int i = 0; i < w; ++i)
    {
        float mn = 1.0e9f, mx = -1.0e9f;
        for (int j = i * step; j < juce::jmin (s->len, (i + 1) * step); ++j)
        {
            const float v = (s->l[(size_t) j] + s->r[(size_t) j]) * 0.5f;
            mn = juce::jmin (mn, v); mx = juce::jmax (mx, v);
        }
        peaks[(size_t) i * 2] = mn;
        peaks[(size_t) i * 2 + 1] = mx;
    }
}

void SampleView::mouseDown (const juce::MouseEvent& e)
{
    /* clic sur la forme d'onde = déplace la position du granulaire */
    const float pos = juce::jlimit (0.0f, 1.0f, (float) e.x / (float) juce::jmax (1, getWidth()));
    if (auto* p = proc.apvts.getParameter ("gPosition"))
        p->setValueNotifyingHost (pos);
}

void SampleView::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat();
    g.setColour (juce::Colour (0xff0d111a));
    g.fillRoundedRectangle (r, 8.0f);
    g.setColour (juce::Colour (0xff262d3d));
    g.drawRoundedRectangle (r.reduced (0.5f), 8.0f, 1.0f);

    if (peaks.empty())
    {
        g.setColour (juce::Colour (0xff8b94a8));
        g.setFont (12.0f);
        g.drawText ("Chargez un sample (bouton ou glisser-déposer)",
                    getLocalBounds(), juce::Justification::centred, false);
        return;
    }
    const int w = (int) peaks.size() / 2;
    const float midY = r.getCentreY(), amp = r.getHeight() * 0.45f;
    g.setColour (juce::Colour (0xff3fd8c2).withAlpha (0.85f));
    for (int i = 0; i < w; ++i)
    {
        const float x = r.getX() + (float) i / (float) (w - 1) * r.getWidth();
        const float mn = peaks[(size_t) i * 2], mx = peaks[(size_t) i * 2 + 1];
        g.drawVerticalLine ((int) x, midY - mx * amp, midY - mn * amp);
    }
    /* position demandée du grain */
    if (auto* v = proc.apvts.getRawParameterValue ("gPosition"))
    {
        const float x = r.getX() + v->load() * r.getWidth();
        g.setColour (juce::Colour (0xffa97bff).withAlpha (0.7f));
        g.drawVerticalLine ((int) x, r.getY(), r.getBottom());
    }
    /* grains actifs */
    for (int i = 0; i + 2 < grainVizCount; i += 3)
    {
        const float x = r.getX() + juce::jlimit (0.0f, 1.0f, grainViz[(size_t) i]) * r.getWidth();
        const float y = midY + grainViz[(size_t) i + 1] * r.getHeight() * 0.3f;
        const float a = juce::jlimit (0.15f, 1.0f, grainViz[(size_t) i + 2]);
        g.setColour (juce::Colour (0xffffb248).withAlpha (a));
        g.fillEllipse (x - 2.4f, y - 2.4f, 4.8f, 4.8f);
    }
}

/* ==================================================================== */
/* Éditeur                                                              */
/* ==================================================================== */
namespace
{
    struct PresetDef { const char* name; const char* pairs; };
    /* presets rapides : « id=valeur;… » (mêmes réglages que la démo web) */
    const PresetDef kPresets[] =
    {
        { "Basse", "mixAnalog=1;mixSampler=0;mixGrain=0;cutoff=380;reso=0.42;drive=0.45;subLevel=0.65;o2Semi=-12;o2Level=0.35;fEnvAmt=0.55;fD=0.22;fS=0.15;aD=0.18;aS=0.6;aR=0.2;mono=1;glide=12;keyTrack=0.4" },
        { "Pad", "mixAnalog=1;mixSampler=0;mixGrain=0;o1Uni=3;o1Detune=22;o2Uni=3;o2Detune=17;o2Semi=0;o2Fine=9;cutoff=2200;reso=0.12;aA=1.1;aD=1.6;aS=0.8;aR=1.8;fA=0.9;fD=1.5;fS=0.5;fR=1.4;chMix=0.45;chDepth=0.5;chRate=0.35;rMix=0.42;rSize=0.72" },
        { "Nuage", "mixAnalog=0.35;mixSampler=0.75;mixGrain=0.8;gSource=2;gDensity=24;gSize=120;gSpray=0.2;sLoop=1;sLoopXF=0.25;dMix=0.2;rMix=0.28;cutoff=5200;fEnvAmt=0.25;chMix=0.25" },
        { "Grain live", "mixAnalog=0;mixSampler=0;mixGrain=1;gSource=1;gDensity=42;gSize=70;gSpray=0.22;gPitchRand=3;gPan=0.8;gReverse=0.25;gLivePos=110;rMix=0.4;rSize=0.66;dMix=0.18;cutoff=4200;aA=0.35;aR=1.4;fEnvAmt=0.3" },
        { "Gel", "mixAnalog=0;mixSampler=0;mixGrain=1;gSource=1;gFreeze=1;gDensity=30;gSize=140;gSpray=0.1;gPitchRand=0;rMix=0.55;rSize=0.9;aA=0.8;aR=2.5;gPan=0.7" },
        { "Init", "mixAnalog=1;mixSampler=0;mixGrain=0;cutoff=900;reso=0.15;aA=0.006;aD=0.25;aS=0.85;aR=0.4;o2Semi=-12;rMix=0.18;dMix=0.12;chMix=0;mono=0;poly=8;gSource=0;gDensity=16;gSize=90" }
    };
}

GranularHybridAudioProcessorEditor::GranularHybridAudioProcessorEditor (GranularHybridAudioProcessor& p)
    : juce::AudioProcessorEditor (&p), proc (p),
      sampleView (p),
      keyboard (p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard)
{
    setLookAndFeel (&lnf);
    addAndMakeVisible (keyboard);
    addAndMakeVisible (sampleView);

    for (int s = 0; s < NUM_SECTIONS; ++s)
    {
        auto* sp = new SectionPanel (proc, s);
        panels.add (sp);
        addAndMakeVisible (sp);
    }

    for (const auto& pre : kPresets)
    {
        auto* b = new juce::TextButton (pre.name);
        b->onClick = [this, b]{ 
            for (int i = 0; i < (int) (sizeof (kPresets) / sizeof (PresetDef)); ++i)
                if (presetButtons[i] == b) { applyPreset (i); break; }
        };
        presetButtons.add (b);
        addAndMakeVisible (b);
    }

    addAndMakeVisible (loadButton);
    addAndMakeVisible (defaultButton);
    addAndMakeVisible (panicButton);

    sampleLabel.setText (proc.getSampleName(), juce::dontSendNotification);
    sampleLabel.setColour (juce::Label::textColourId, juce::Colour (0xff3fd8c2));
    sampleLabel.setFont (juce::FontOptions (12.0f, juce::Font::bold));
    sampleLabel.setJustificationType (juce::Justification::centredLeft);
    addAndMakeVisible (sampleLabel);

    infoLabel.setColour (juce::Label::textColourId, juce::Colour (0xff8b94a8));
    infoLabel.setFont (juce::FontOptions (11.0f));
    infoLabel.setJustificationType (juce::Justification::centredRight);
    addAndMakeVisible (infoLabel);

    loadButton.onClick = [this]
    {
        chooser = std::make_unique<juce::FileChooser> ("Charger un sample (WAV · AIFF · MP3 · FLAC)",
                                                       juce::File::getSpecialLocation (juce::File::userMusicDirectory),
                                                       "*.wav;*.aif;*.aiff;*.mp3;*.flac;*.ogg");
        chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                              [this] (const juce::FileChooser& fc)
                              {
                                  const auto f = fc.getResult();
                                  if (f.existsAsFile()) loadFileOrWarn (f);
                              });
    };
    defaultButton.onClick = [this]{ proc.loadDefaultBankSample(); };
    panicButton.onClick = [this]{ proc.getEngine().panic(); };

    keyboard.setKeyWidth (17.0f);
    keyboard.setAvailableRange (36, 84);
    keyboard.setOctaveForMiddleC (4);

    setResizable (true, true);
    setResizeLimits (980, 560, 1900, 1100);
    setSize (1220, 660);
    startTimerHz (8);
}

GranularHybridAudioProcessorEditor::~GranularHybridAudioProcessorEditor()
{
    setLookAndFeel (nullptr);
}

bool GranularHybridAudioProcessorEditor::isInterestedInFileDrag (const juce::StringArray& files)
{
    if (files.size() != 1) return false;
    const auto ext = juce::File (files[0]).getFileExtension().toLowerCase();
    return ext == ".wav" || ext == ".aif" || ext == ".aiff" || ext == ".mp3" || ext == ".flac" || ext == ".ogg";
}

void GranularHybridAudioProcessorEditor::filesDropped (const juce::StringArray& files, int, int)
{
    for (const auto& f : files) { loadFileOrWarn (juce::File (f)); break; }
}

void GranularHybridAudioProcessorEditor::loadFileOrWarn (const juce::File& f)
{
    proc.loadSampleFile (f);
    sampleLabel.setText (proc.getSampleName(), juce::dontSendNotification);
}

void GranularHybridAudioProcessorEditor::applyPreset (int index)
{
    const juce::String pairs (kPresets[index].pairs);
    auto tokens = juce::StringArray::fromTokens (pairs, ";", "");
    for (const auto& tk : tokens)
    {
        const auto id = tk.upToFirstOccurrenceOf ("=", false, false).trim();
        const float val = tk.fromFirstOccurrenceOf ("=", false, false).getFloatValue();
        int idx = -1;
        for (int i = 0; i < NUM_PARAMS; ++i) if (id == paramDef (i).id) { idx = i; break; }
        if (idx < 0) continue;
        const ParamDef& d = paramDef (idx);
        if (auto* p = proc.apvts.getParameter (d.id))
        {
            switch (d.kind)
            {
                case K_BOOL:
                    p->setValueNotifyingHost (val > 0.5f ? 1.0f : 0.0f);
                    break;
                case K_CHOICE:
                    p->setValueNotifyingHost (d.numOptions > 1 ? juce::jlimit (0.0f, 1.0f, val / (float) (d.numOptions - 1)) : 0.0f);
                    break;
                default:
                {
                    juce::NormalisableRange<float> range (d.min, d.max, 0.0f);
                    if (d.kind == K_INT) range.interval = 1.0f;
                    if (d.centre > 0.0f && d.min > 0.0f) range.setSkewForCentre (d.centre);
                    p->setValueNotifyingHost (range.convertTo0to1 (juce::jlimit (d.min, d.max, val)));
                    break;
                }
            }
        }
    }
}

void GranularHybridAudioProcessorEditor::timerCallback()
{
    const int v = proc.getEngine().getActiveVoices();
    const int gr = proc.getEngine().getActiveGrains();
    infoLabel.setText ("voix " + juce::String (v) + "  ·  grains " + juce::String (gr)
                       + "  ·  sample : " + proc.getSampleName(),
                       juce::dontSendNotification);
    repaint (infoLabel.getBounds());
}

void GranularHybridAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff0d1017));
    /* entête */
    g.setColour (juce::Colour (0xffe6ebf5));
    g.setFont (juce::FontOptions (20.0f, juce::Font::bold));
    g.drawText ("Granular", 14, 6, 78, 24, juce::Justification::centredLeft, false);
    g.setColour (juce::Colour (0xffffb248));
    g.drawText ("Hybrid", 92, 6, 70, 24, juce::Justification::centredLeft, false);
    g.setColour (juce::Colour (0xff8b94a8));
    g.setFont (juce::FontOptions (10.5f));
    g.drawText ("analo · sampler · grain", 172, 12, 200, 16, juce::Justification::centredLeft, false);
}

void GranularHybridAudioProcessorEditor::resized()
{
    auto r = getLocalBounds().reduced (8);
    auto header = r.removeFromTop (30);
    header.removeFromLeft (300);                       // place pour le titre

    /* boutons de l'entête (presets + actions) */
    auto btn = header.removeFromRight (700);
    for (int i = presetButtons.size() - 1; i >= 0; --i)
        presetButtons[i]->setBounds (btn.removeFromRight (84).reduced (2, 3));
    panicButton.setBounds (btn.removeFromRight (58).reduced (2, 3));
    defaultButton.setBounds (btn.removeFromRight (110).reduced (2, 3));
    r.removeFromTop (6);

    /* lignes de panneaux */
    auto layoutRow = [](juce::Rectangle<int> row, const std::vector<SectionPanel*>& ps)
    {
        if (ps.empty()) return;
        const int colW = row.getWidth() / (int) ps.size();
        for (int i = 0; i < (int) ps.size(); ++i)
        {
            auto cell = row.removeFromLeft (i == (int) ps.size() - 1 ? row.getWidth() : colW);
            ps[(size_t) i]->setBounds (cell.reduced (3, 2));
        }
    };

    /* le clavier et la vue sample sont réservés en bas */
    keyboard.setBounds (r.removeFromBottom (56).reduced (2, 4));
    r.removeFromBottom (4);

    auto bottom = r.removeFromBottom (104);
    sampleView.setBounds (bottom.removeFromLeft (bottom.getWidth() - 380).reduced (2, 2));
    auto side = bottom.reduced (2, 2);
    sampleLabel.setBounds (side.removeFromTop (20));
    infoLabel.setBounds (side.removeFromTop (18));
    side.removeFromTop (4);
    auto b1 = side.removeFromTop (26);
    loadButton.setBounds (b1.removeFromRight (150));
    r.removeFromBottom (4);

    /* répartition des 12 sections en 3 lignes */
    std::vector<SectionPanel*> row1 { panels[SEC_GLOBAL], panels[SEC_MIX], panels[SEC_OSC1], panels[SEC_OSC2] };
    std::vector<SectionPanel*> row2 { panels[SEC_EXTRA], panels[SEC_FILTER], panels[SEC_FENV], panels[SEC_AENV], panels[SEC_LFO] };
    std::vector<SectionPanel*> row3 { panels[SEC_SAMPLER], panels[SEC_GRAIN], panels[SEC_FX] };

    const int h1 = juce::jmax (112, SectionPanel::preferredHeight (SEC_OSC1) + 8);
    const int h2 = juce::jmax (112, SectionPanel::preferredHeight (SEC_FILTER) + 8);
    int avail = r.getHeight();
    const int hh1 = juce::jmin (h1, avail / 3);
    const int hh2 = juce::jmin (h2, avail / 3);
    const int hh3 = juce::jmax (SectionPanel::preferredHeight (SEC_GRAIN) + 8, avail - hh1 - hh2);
    layoutRow (r.removeFromTop (hh1), row1);
    layoutRow (r.removeFromTop (hh2), row2);
    layoutRow (r.removeFromTop (hh3), row3);
}
