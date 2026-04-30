# Creating project files for Genopatch POC and zipping them.
import os, textwrap, zipfile, json, pathlib, sys
root = '/mnt/data/genopatch_poc'
os.makedirs(root, exist_ok=True)
src = os.path.join(root, 'Source')
os.makedirs(src, exist_ok=True)

files = {
"README_BUILD.md": textwrap.dedent("""\
GenopatchPOC - Minimal JUCE synth + simple genetic features (proof of concept)

Folder structure:
- CMakeLists.txt (not included because user may use Projucer/CMake with JUCE)
- Source/
    - PluginProcessor.h / .cpp
    - PluginEditor.h / .cpp
    - SimpleSynthSound.h
    - SimpleSynthVoice.h / .cpp
    - Branch.h
    - Genome.h

Build:
- Create a JUCE project (CMake or Projucer) and add these Source files.
- Ensure JUCE modules are available and project uses C++17.
- Build as an Audio Plugin (VST3/AU) and test in a DAW with MIDI input.

Notes:
- This is a compact, educational proof-of-concept. Expand DSP, safety checks, and threading for production.
"""),

"CMakeLists.txt": textwrap.dedent("""\
cmake_minimum_required(VERSION 3.15)
project(GenopatchPOC LANGUAGES CXX)

# Adjust this path if your JUCE clone is elsewhere
add_subdirectory(juce)

juce_add_plugin(GenopatchPOC
    COMPANY_NAME "You"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    OUTPUT_NAME "GenopatchPOC"
    PRODUCT_NAME "Genopatch POC"
    FORMATS VST3 AU
    BUNDLE_ID "com.yourname.genopatchpoc"
    SOURCES
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
        Source/SimpleSynthVoice.cpp
        Source/SimpleSynthVoice.h
        Source/SimpleSynthSound.h
        Source/Branch.h
        Source/Genome.h
)
target_compile_features(GenopatchPOC PRIVATE cxx_std_17)
"""),

"Source/Genome.h": textwrap.dedent("""\
#pragma once
#include <random>
#include <vector>

struct Genome
{
    float masterGain = 0.8f;
    float filterCut = 10000.0f;
    float attack = 0.01f;
    float fmAmount = 0.0f;

    static std::mt19937& rng() {
        static std::random_device rd;
        static std::mt19937 g(rd());
        return g;
    }

    void randomize() {
        std::uniform_real_distribution<float> u01(0.0f, 1.0f);
        masterGain = std::lerp(0.1f, 1.5f, u01(rng()));
        filterCut  = std::lerp(200.0f, 8000.0f, u01(rng()));
        attack     = std::lerp(0.001f, 1.0f, u01(rng()));
        fmAmount   = std::lerp(0.0f, 40.0f, u01(rng()));
    }

    void mutate(float strength = 0.15f) {
        std::normal_distribution<float> n(0.0f, strength);
        masterGain = std::clamp(masterGain + n(rng()), 0.0f, 3.0f);
        filterCut  = std::clamp(filterCut + n(rng()) * 2000.0f, 50.0f, 20000.0f);
        attack     = std::clamp(attack + n(rng()) * 0.5f, 0.0001f, 3.0f);
        fmAmount   = std::clamp(fmAmount + n(rng()) * 10.0f, 0.0f, 100.0f);
    }
};
"""),

"Source/Branch.h": textwrap.dedent("""\
#pragma once
#include <JuceHeader.h>

// Small draggable seed/branch component (visual only, reports XY via callback)
class Branch : public juce::Component
{
public:
    Branch(std::function<void(float,float)> cb) : callback(cb) { setSize(28,28); }

    void paint(juce::Graphics& g) override
    {
        g.setColour(juce::Colour(150,255,170));
        g.fillEllipse(getLocalBounds().toFloat());
    }

    void mouseDrag(const juce::MouseEvent& e) override
    {
        auto newPos = getPosition() + e.getOffsetFromDragStart();
        setTopLeftPosition(newPos);
        if (parentCenter.x != 0 || parentCenter.y != 0) {
            auto me = getBounds().toFloat().getCentre();
            auto delta = me - parentCenter;
            float dx = delta.x / 150.0f;
            float dy = delta.y / 150.0f;
            dx = juce::jlimit(-1.0f, 1.0f, dx);
            dy = juce::jlimit(-1.0f, 1.0f, dy);
            callback(dx,dy);
        }
    }

    void setParentCenter(juce::Point<float> p) { parentCenter = p; }

private:
    std::function<void(float,float)> callback;
    juce::Point<float> parentCenter {0,0};
};
"""),

"Source/SimpleSynthSound.h": textwrap.dedent("""\
#pragma once
#include <JuceHeader.h>

class SimpleSynthSound : public juce::SynthesiserSound
{
public:
    bool appliesToNote (int) override { return true; }
    bool appliesToChannel (int) override { return true; }
};
"""),

"Source/SimpleSynthVoice.h": textwrap.dedent("""\
#pragma once
#include <JuceHeader.h>
#include "SimpleSynthSound.h"
#include "Genome.h"

class SimpleSynthVoice : public juce::SynthesiserVoice
{
public:
    SimpleSynthVoice();
    ~SimpleSynthVoice() override = default;

    bool canPlaySound (juce::SynthesiserSound* sound) override;
    void startNote (int midiNoteNumber, float velocity, juce::SynthesiserSound*, int) override;
    void stopNote (float velocity, bool allowTailOff) override;
    void pitchWheelMoved (int) override {}
    void controllerMoved (int, int) override {}

    void renderNextBlock (juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;

    void prepare(double sampleRate, int samplesPerBlock, int outputChannels);
    void setBranchParams(float x, float y);
    void applyGenome(const Genome& g);

private:
    juce::dsp::Oscillator<float> osc{[](float x){ return std::sin(x); }};
    juce::dsp::StateVariableTPTFilter<float> filter;
    juce::ADSR adsr;
    juce::ADSR::Parameters adsrParams;
    float level = 0.0f;
    float baseFreq = 440.0f;
    float xMod = 0.0f, yMod = 0.0f;
    Genome currentGenome;
    bool prepared = false;
};
"""),

"Source/SimpleSynthVoice.cpp": textwrap.dedent("""\
#include "SimpleSynthVoice.h"
#include <cmath>

SimpleSynthVoice::SimpleSynthVoice()
{
    filter.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
    adsr.setParameters(adsrParams);
    osc.initialise([](float x){ return std::sin(x); });
}

bool SimpleSynthVoice::canPlaySound(juce::SynthesiserSound* sound)
{
    return dynamic_cast<SimpleSynthSound*>(sound) != nullptr;
}

void SimpleSynthVoice::startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound*, int)
{
    level = velocity;
    baseFreq = (float)juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);
    osc.setFrequency(baseFreq);
    adsr.noteOn();
    DBG(\"NoteOn \" << midiNoteNumber << \" vel=\" << velocity);
}

void SimpleSynthVoice::stopNote(float, bool allowTailOff)
{
    adsr.noteOff();
    if (!allowTailOff)
        clearCurrentNote();
}

void SimpleSynthVoice::prepare(double sampleRate, int samplesPerBlock, int outputChannels)
{
    juce::dsp::ProcessSpec spec{ sampleRate, (juce::uint32)samplesPerBlock, (juce::uint32)outputChannels };
    osc.prepare(spec);
    filter.prepare(spec);
    adsr.setSampleRate(sampleRate);
    prepared = true;
}

void SimpleSynthVoice::setBranchParams(float x, float y)
{
    xMod = x; yMod = y;
}

void SimpleSynthVoice::applyGenome(const Genome& g)
{
    currentGenome = g;
    adsrParams.attack = g.attack;
    adsrParams.decay = 0.1f;
    adsrParams.sustain = 0.8f;
    adsrParams.release = 0.2f;
    adsr.setParameters(adsrParams);
}

void SimpleSynthVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples)
{
    if (! prepared) return;

    juce::AudioBuffer<float> temp(1, numSamples);
    temp.clear();

    auto* w = temp.getWritePointer(0);

    for (int i = 0; i < numSamples; ++i)
    {
        float fm = yMod * currentGenome.fmAmount;
        osc.setFrequency(baseFreq + fm);

        float s = osc.processSample(0.0f) * level;
        w[i] = s;
    }

    // apply filter (mono) and envelope, then mix to output
    juce::dsp::AudioBlock<float> block (temp);
    juce::dsp::ProcessContextReplacing<float> ctx(block);
    filter.setCutoffFrequency(currentGenome.filterCut);
    filter.process(ctx);

    adsr.applyEnvelopeToBuffer(temp, 0, numSamples);

    for (int ch = 0; ch < outputBuffer.getNumChannels(); ++ch)
        for (int i = 0; i < numSamples; ++i)
            outputBuffer.addSample(ch, startSample + i, temp.getSample(0, i) * currentGenome.masterGain);
}
"""),

"Source/PluginProcessor.h": textwrap.dedent("""\
#pragma once
#include <JuceHeader.h>
#include \"SimpleSynthVoice.h\"
#include \"SimpleSynthSound.h\"
#include \"Genome.h\"

class GenopatchAudioProcessor  : public juce::AudioProcessor
{
public:
    GenopatchAudioProcessor();
    ~GenopatchAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return \"GenopatchPOC\"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // genome control
    void applyGenomeToVoices();
    void randomizeGenome();
    void mutateGenome();

    // branch control used by editor
    void setXY(float x, float y) { xParam = x; yParam = y; }

    juce::Synthesiser synth;
    Genome genome;

private:
    float xParam = 0.0f, yParam = 0.0f;
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GenopatchAudioProcessor)
};
"""),

"Source/PluginProcessor.cpp": textwrap.dedent("""\
#include \"PluginProcessor.h\"
#include \"PluginEditor.h\"

GenopatchAudioProcessor::GenopatchAudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
    : AudioProcessor (BusesProperties().withOutput (\"Output\", juce::AudioChannelSet::stereo(), true))
#endif
{
    synth.clearVoices();
    for (int i = 0; i < 8; ++i)
        synth.addVoice(new SimpleSynthVoice());

    synth.clearSounds();
    synth.addSound(new SimpleSynthSound());

    genome.randomize();
}

GenopatchAudioProcessor::~GenopatchAudioProcessor() {}

void GenopatchAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;
    synth.setCurrentPlaybackSampleRate(sampleRate);

    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* v = dynamic_cast<SimpleSynthVoice*>(synth.getVoice(i)))
            v->prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    }

    applyGenomeToVoices();
}

void GenopatchAudioProcessor::releaseResources() {}

bool GenopatchAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    return true;
}

void GenopatchAudioProcessor::applyGenomeToVoices()
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* v = dynamic_cast<SimpleSynthVoice*>(synth.getVoice(i)))
            v->applyGenome(genome);
    }
}

void GenopatchAudioProcessor::randomizeGenome()
{
    genome.randomize();
    applyGenomeToVoices();
}

void GenopatchAudioProcessor::mutateGenome()
{
    genome.mutate(0.12f);
    applyGenomeToVoices();
}

void GenopatchAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    buffer.clear();

    // update voices with XY (branch) modulation
    for (int i = 0; i < synth.getNumVoices(); ++i)
        if (auto* v = dynamic_cast<SimpleSynthVoice*>(synth.getVoice(i)))
            v->setBranchParams(xParam, yParam);

    synth.renderNextBlock(buffer, midiMessages, 0, buffer.getNumSamples());
}

void GenopatchAudioProcessor::getStateInformation(juce::MemoryBlock& destData) {}

void GenopatchAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {}
"""),

"Source/PluginEditor.h": textwrap.dedent("""\
#pragma once
#include <JuceHeader.h>\n#include \"PluginProcessor.h\"\n#include \"Branch.h\"\n\nclass GenopatchAudioProcessorEditor  : public juce::AudioProcessorEditor\n{\npublic:\n    GenopatchAudioProcessorEditor (GenopatchAudioProcessor&);\n    ~GenopatchAudioProcessorEditor() override;\n\n    void paint (juce::Graphics&) override;\n    void resized() override;\n\n    void mouseDown (const juce::MouseEvent& e) override;\n    void mouseDrag (const juce::MouseEvent& e) override;\n    void mouseUp   (const juce::MouseEvent& e) override;\n\nprivate:\n    GenopatchAudioProcessor& processor;\n\n    juce::Point<float> seedPosition;\n    bool dragging = false;\n\n    static constexpr int numBranches = 6;\n    float branchValues[numBranches] {0};\n\n    // controls\n    juce::Slider gainSlider, cutoffSlider, attackSlider;\n    using Attach = juce::AudioProcessorValueTreeState::SliderAttachment;\n    std::unique_ptr<Attach> gainAttach, cutoffAttach, attackAttach;\n\n    juce::TextButton randomizeButton {\"Randomize\"}, mutateButton{\"Mutate\"};\n\n    float getAngleForBranch(int index) const;\n\n    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GenopatchAudioProcessorEditor)\n};\n"""),

"Source/PluginEditor.cpp": textwrap.dedent("""\
#include \"PluginEditor.h\"\n\nGenopatchAudioProcessorEditor::GenopatchAudioProcessorEditor(GenopatchAudioProcessor& p)\n    : AudioProcessorEditor(&p), processor(p)\n{\n    setSize(760, 360);\n    seedPosition = { 200.0f, 180.0f };\n\n    // Sliders\n    addAndMakeVisible(gainSlider);\n    gainSlider.setSliderStyle(juce::Slider::Rotary);\n    gainSlider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 20);\n    gainSlider.setRange(0.0, 2.0, 0.01);\n    gainSlider.setValue(processor.genome.masterGain);\n\n    addAndMakeVisible(cutoffSlider);\n    cutoffSlider.setSliderStyle(juce::Slider::Rotary);\n    cutoffSlider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 20);\n    cutoffSlider.setRange(20.0, 20000.0, 1.0);\n    cutoffSlider.setSkewFactorFromMidPoint(1000.0);\n    cutoffSlider.setValue(processor.genome.filterCut);\n\n    addAndMakeVisible(attackSlider);\n    attackSlider.setSliderStyle(juce::Slider::Rotary);\n    attackSlider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 20);\n    attackSlider.setRange(0.001, 2.0, 0.001);\n    attackSlider.setValue(processor.genome.attack);\n\n    // Attachments (we don't have APVTS here; manual apply on value change)\n    gainSlider.onValueChange = [this]() { processor.genome.masterGain = (float)gainSlider.getValue(); processor.applyGenomeToVoices(); };\n    cutoffSlider.onValueChange = [this]() { processor.genome.filterCut = (float)cutoffSlider.getValue(); processor.applyGenomeToVoices(); };\n    attackSlider.onValueChange = [this]() { processor.genome.attack = (float)attackSlider.getValue(); processor.applyGenomeToVoices(); };\n\n    // Buttons\n    addAndMakeVisible(randomizeButton);\n    randomizeButton.onClick = [this]() { processor.randomizeGenome(); gainSlider.setValue(processor.genome.masterGain, juce::dontSendNotification); cutoffSlider.setValue(processor.genome.filterCut, juce::dontSendNotification); attackSlider.setValue(processor.genome.attack, juce::dontSendNotification); repaint(); };\n\n    addAndMakeVisible(mutateButton);\n    mutateButton.onClick = [this]() { processor.mutateGenome(); gainSlider.setValue(processor.genome.masterGain, juce::dontSendNotification); cutoffSlider.setValue(processor.genome.filterCut, juce::dontSendNotification); attackSlider.setValue(processor.genome.attack, juce::dontSendNotification); repaint(); };\n\n    // Branch components (one draggable seed for now)\n    for (int i = 0; i < numBranches; ++i)\n    {\n        auto b = std::make_unique<Branch>([this](float dx, float dy){ processor.setXY(dx, dy); });\n        addAndMakeVisible(b.get());\n        auto x = 40 + i * 40;\n        b->setTopLeftPosition(x, 30);\n        b->setParentCenter(seedPosition);\n        ownedBranches.push_back(std::move(b));\n    }\n}\n\nGenopatchAudioProcessorEditor::~GenopatchAudioProcessorEditor() {}\n\nvoid GenopatchAudioProcessorEditor::paint(juce::Graphics& g)\n{\n    g.fillAll(juce::Colours::black);\n    g.setColour(juce::Colour(40,40,40));\n    g.fillEllipse(320, 120, 380, 200);\n\n    // draw seed and branches\n    g.setColour(juce::Colour(150,255,170));\n    g.fillEllipse(seedPosition.x - 16, seedPosition.y - 16, 32, 32);\n\n    g.setColour(juce::Colours::green);\n    for (int i = 0; i < numBranches; ++i)\n    {\n        auto ang = getAngleForBranch(i);\n        float len = branchValues[i] * 80.0f;\n        juce::Point<float> end = seedPosition + juce::Point<float>(std::cos(ang), std::sin(ang)) * len;\n        g.drawLine(seedPosition.x, seedPosition.y, end.x, end.y, 2.0f);\n    }\n}\n\nvoid GenopatchAudioProcessorEditor::resized()\n{\n    auto r = getLocalBounds();\n    gainSlider.setBounds(20, 220, 120, 120);\n    cutoffSlider.setBounds(150, 220, 120, 120);\n    attackSlider.setBounds(280, 220, 120, 120);\n    randomizeButton.setBounds(420, 230, 100, 30);\n    mutateButton.setBounds(420, 270, 100, 30);\n\n    // position small branch widgets\n    for (int i = 0; i < ownedBranches.size(); ++i)\n    {\n        ownedBranches[i]->setParentCenter(seedPosition);\n    }\n}\n\nfloat GenopatchAudioProcessorEditor::getAngleForBranch(int index) const\n{\n    return juce::MathConstants<float>::twoPi * (float)index / (float)numBranches;\n}\n\nvoid GenopatchAudioProcessorEditor::mouseDown(const juce::MouseEvent& e)\n{\n    auto d = e.position - seedPosition;\n    if (d.getDistanceFromOrigin() < 20.0f) dragging = true;\n}\n\nvoid GenopatchAudioProcessorEditor::mouseDrag(const juce::MouseEvent& e)\n{\n    if (!dragging) return;\n    seedPosition = e.position;\n\n    float centerX = 520.0f, centerY = 220.0f; // pod center used to derive XY\n    float dx = seedPosition.x - centerX;\n    float dy = seedPosition.y - centerY;\n    float dist = std::sqrt(dx*dx + dy*dy);\n    float norm = juce::jlimit(0.0f, 1.0f, dist / 150.0f);\n    float direction = std::atan2(dy, dx);\n\n    for (int i = 0; i < numBranches; ++i)\n    {\n        float ang = getAngleForBranch(i);\n        float dot = std::cos(direction - ang);\n        dot = juce::jmax(0.0f, dot);\n        branchValues[i] = dot * norm;\n    }\n\n    // send a simple XY pair to processor for modulation\n    processor.setXY(dx / 150.0f, dy / 150.0f);\n    repaint();\n}\n\nvoid GenopatchAudioProcessorEditor::mouseUp(const juce::MouseEvent&)\n{\n    dragging = false;\n}\n"""),

}

# write files
for path, content in files.items():
    full = os.path.join(root, path)
    dirn = os.path.dirname(full)
    os.makedirs(dirn, exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)

# create zip
zip_path = '/mnt/data/genopatch_poc.zip'
with zipfile.ZipFile(zip_path, 'w') as zf:
    for folder, _, filenames in os.walk(root):
        for fname in filenames:
            fpath = os.path.join(folder, fname)
            arcname = os.path.relpath(fpath, root)
            zf.write(fpath, arcname)

print(json.dumps({"zip": zip_path}))

