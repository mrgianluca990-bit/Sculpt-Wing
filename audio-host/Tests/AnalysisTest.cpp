#include "../Source/Analysis.h"
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

namespace
{
void check(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}
std::vector<float> signal(std::size_t count, std::uint32_t value = 0x52b31c7fu)
{
    std::vector<float> data(count);
    for (auto& sample : data)
    {
        value ^= value << 13; value ^= value >> 17; value ^= value << 5;
        sample = static_cast<float>((static_cast<double>(value) / 4294967295.0 - 0.5) * 0.5);
    }
    return data;
}
sculpt::AnalysisResult measure(const sculpt::AnalysisConfig& config, const std::vector<float>& data,
                               int delay = 240, float gain = 0.5f, bool swapped = false)
{
    sculpt::AnalysisProcessor processor(config, 48000.0);
    for (std::size_t i = 0; i < data.size(); ++i)
    {
        const auto reference = data[i];
        const auto measurement = i >= static_cast<std::size_t>(delay) ? data[i - delay] * gain : 0.0f;
        processor.add(swapped ? reference : measurement, swapped ? measurement : reference);
    }
    return processor.result();
}
double averageBand(const sculpt::AnalysisResult& result, const std::vector<double>& values)
{
    double sum = 0.0; int count = 0;
    for (std::size_t i = 0; i < values.size(); ++i)
        if (result.frequency[i] >= 100 && result.frequency[i] <= 8000) { sum += values[i]; ++count; }
    check(count > 0, "No frequency data");
    return sum / count;
}
}

int main()
{
    try
    {
        sculpt::AnalysisConfig config; config.averages = 4;
        const auto data = signal(16384 * 5);
        const auto original = measure(config, data);
        check(original.valid && !original.stale && original.estimatedDelayMs.has_value(), "Known delayed signal is not valid");
        check(std::abs(*original.estimatedDelayMs - 5.0) < 0.03, "Delay finder sign/value incorrect");
        check(std::abs(averageBand(original, original.magnitudeDb) + 6.0206) < 0.12, "Transfer gain incorrect");
        check(averageBand(original, original.coherence) > 0.97, "Coherence incorrect for correlated inputs");
        check(original.frequency.size() <= 1024 && original.impulseTimeMs.size() <= 1024, "Display data is not bounded");

        config.delayMs = 5.0;
        const auto aligned = measure(config, data);
        check(aligned.valid && std::abs(*aligned.estimatedDelayMs - 5.0) < 0.03, "Analyzer compensation lost original delay");
        check(std::abs(averageBand(aligned, aligned.phaseDeg)) < 0.03, "Analyzer compensation phase is incorrect");
        config.delayMs = 0.0;
        const auto reversed = measure(config, data, 240, 0.5f, true);
        check(reversed.valid && std::abs(*reversed.estimatedDelayMs + 5.0) < 0.03, "Negative delay sign incorrect");

        config.calibration = {{20, 6.0206, 0}, {24000, 6.0206, 0}};
        config.calibrationEnabled = true; config.levelOffsetDb = 100.0;
        const auto calibrated = measure(config, data);
        check(std::abs(averageBand(calibrated, calibrated.magnitudeDb) - averageBand(original, original.magnitudeDb) + 6.0206) < 0.001,
              "Microphone response was not subtracted");
        check(std::abs(calibrated.measurementRmsDb - original.measurementRmsDb) < 0.001, "Raw calibration RMS changed");
        check(calibrated.splDb && std::abs(*calibrated.splDb - calibrated.measurementRmsDb - 100.0) < 0.001, "SPL offset incorrect");

        const auto silent = measure(config, std::vector<float>(data.size()));
        check(!silent.valid && !silent.estimatedDelayMs, "Silence produced a valid delay");
        for (const auto value : silent.magnitudeDb) check(std::isfinite(value), "Silence produced non-finite values");
        const auto clipped = measure(config, std::vector<float>(data.size(), 1.0f), 0, 1.0f);
        check(clipped.clipped && !clipped.valid, "Clipped acquisition accepted");

        // High coherence from overlapping short averages alone is not proof
        // of a usable delay. Independent inputs must never produce one.
        config.calibrationEnabled = false; config.levelOffsetDb.reset();
        const auto independentA = signal(16384 * 12, 0x7cb912a1u);
        const auto independentB = signal(16384 * 12, 0x056f23b8u);
        for (const int depth : {2, 8})
        {
            config.averages = depth;
            sculpt::AnalysisProcessor unrelated(config, 48000.0);
            for (std::size_t i = 0; i < independentA.size(); ++i)
                unrelated.add(independentA[i], independentB[i]);
            check(!unrelated.result().estimatedDelayMs, "Independent noise produced a reliable delay");
        }
        config.averages = 4;
        std::vector<float> tone(16384 * 8);
        for (std::size_t i = 0; i < tone.size(); ++i)
            tone[i] = static_cast<float>(0.2 * std::sin(2.0 * sculpt::osm::pi * 1000.0 * i / 48000.0));
        const auto ambiguous = measure(config, tone);
        check(ambiguous.valid && !ambiguous.estimatedDelayMs, "A single tone produced an unambiguous delay");
        check(ambiguous.referenceBandwidthHz < 500.0, "Single tone incorrectly classified as broadband");

        // A sub-band reference leaves most FFT bins unexcited. Measurement
        // noise in those bins must not create a stronger, unrelated IR peak.
        auto lowpassed = independentA;
        double poles[4] {};
        for (auto& sample : lowpassed)
        {
            double input = sample;
            for (auto& pole : poles) { pole += 0.03 * (input - pole); input = pole; }
            sample = static_cast<float>(input);
        }
        config.averages = 8;
        sculpt::AnalysisProcessor subBand(config, 48000.0);
        for (std::size_t i = 0; i < lowpassed.size(); ++i)
            subBand.add((i >= 240 ? lowpassed[i - 240] * 0.5f : 0.0f) + independentB[i] * 0.0005f, lowpassed[i]);
        check(!subBand.result().estimatedDelayMs || std::abs(*subBand.result().estimatedDelayMs - 5.0) < 0.15,
              "Unexcited FFT bins produced a false sub-band delay");
        config.averages = 4;

        sculpt::AnalysisEngine engine;
        config.calibrationEnabled = false; config.levelOffsetDb.reset();
        engine.configure(config); engine.start(48000.0, 2);
        bool rejected = false;
        try { engine.configure(config); } catch (...) { rejected = true; }
        check(rejected, "Running configuration changed");
        std::vector<float> measurement(data.size());
        for (std::size_t i = 240; i < data.size(); ++i) measurement[i] = data[i - 240] * 0.5f;
        for (std::size_t i = 0; i < data.size(); i += 128)
        {
            const float* inputs[] {measurement.data() + i, data.data() + i};
            engine.push(inputs, 2, static_cast<int>(std::min(std::size_t(128), data.size() - i)));
        }
        const auto end = std::chrono::steady_clock::now() + std::chrono::seconds(3);
        while (engine.snapshot().averagedWindows < 4 && std::chrono::steady_clock::now() < end)
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        const auto live = engine.snapshot();
        check(live.valid && live.estimatedDelayMs && std::abs(*live.estimatedDelayMs - 5.0) < 0.03, "Queued capture did not measure real samples");
        engine.stop();
        check(!engine.running() && engine.snapshot().stale, "Analysis did not stop");
        std::cout << "OSM analysis: gain, positive/negative delay, compensation, coherence, calibration, silence/clipping, independent noise/tone rejection and queued capture passed.\n";
        return EXIT_SUCCESS;
    }
    catch (const std::exception& exception)
    {
        std::cerr << "OSM analysis failed: " << exception.what() << '\n';
        return EXIT_FAILURE;
    }
}
