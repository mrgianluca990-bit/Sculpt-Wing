#include <juce_audio_processors/juce_audio_processors.h>

class TestGain final : public juce::AudioProcessor
{
public:
    TestGain() : AudioProcessor(BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                                .withOutput("Output", juce::AudioChannelSet::stereo(), true))
    {
        gain = new juce::AudioParameterFloat(juce::ParameterID {"gain", 1}, "Gain", 0.0f, 1.0f, 0.5f);
        addParameter(gain);
    }
    const juce::String getName() const override { return "SculptWingAudioTestGain"; }
    bool isBusesLayoutSupported(const BusesLayout& layout) const override
    {
        return layout.getMainInputChannelSet() == layout.getMainOutputChannelSet()
            && (layout.getMainInputChannelSet() == juce::AudioChannelSet::mono()
             || layout.getMainInputChannelSet() == juce::AudioChannelSet::stereo());
    }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override { buffer.applyGain(gain->get()); }
    juce::AudioProcessorEditor* createEditor() override { return new juce::GenericAudioProcessorEditor(*this); }
    bool hasEditor() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock& block) override
    {
        const float value = gain->get(); block.replaceAll(&value, sizeof(value));
    }
    void setStateInformation(const void* data, int bytes) override
    {
        if (bytes == sizeof(float)) { float value; std::memcpy(&value, data, sizeof(value)); if (std::isfinite(value)) gain->setValueNotifyingHost(value); }
    }
private:
    juce::AudioParameterFloat* gain = nullptr;
};

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new TestGain(); }
