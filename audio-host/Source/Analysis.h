// Sculpt Wing manual measurement worker, using the adapted OSM GPL math.
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include "OsmAnalysisMath.h"
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

namespace sculpt
{
struct CalibrationPoint
{
    double frequency = 0.0, gainDb = 0.0, phaseDeg = 0.0;
};

struct AnalysisConfig
{
    int measurementChannel = 0, referenceChannel = 1;
    int fftSize = 16384, averages = 8;
    double delayMs = 0.0;
    std::vector<CalibrationPoint> calibration;
    bool calibrationEnabled = false;
    std::optional<double> levelOffsetDb;
};

struct AnalysisResult
{
    std::uint64_t sequence = 0, droppedSamples = 0;
    double sampleRate = 48000.0;
    double measurementPeakDb = -160.0, referencePeakDb = -160.0;
    double measurementRmsDb = -160.0, referenceRmsDb = -160.0;
    std::optional<double> splDb, estimatedDelayMs;
    double delaySearchMs = 0.0, meanCoherence = 0.0;
    double referenceBandwidthHz = 0.0, delayPeakToRmsDb = 0.0;
    bool clipped = false, valid = false, stale = true;
    int averagedWindows = 0;
    std::string quality = "Nessuna acquisizione";
    std::string delayQuality = "Nessuna acquisizione";
    std::vector<double> frequency, magnitudeDb, phaseDeg, coherence, rtaDb;
    std::vector<double> impulseTimeMs, impulseValue;
};

// DSP independent of JUCE/device access so deterministic measurements can be
// checked with a normal C++17 compiler, with no audio device or GUI.
class AnalysisProcessor
{
public:
    AnalysisProcessor(AnalysisConfig config, double sampleRate);
    bool add(float measurement, float reference);
    const AnalysisResult& result() const { return output; }

private:
    void transform();
    CalibrationPoint calibrationAt(double frequency) const;
    AnalysisConfig config;
    double sampleRate;
    std::size_t size, historySize, writeIndex = 0, collected = 0, sinceTransform = 0;
    long delaySamples;
    double fractionalDelay;
    std::vector<float> measurementHistory, referenceHistory;
    std::vector<double> window;
    std::vector<osm::Complex> measurementFFT, referenceFFT, impulse;
    osm::FourierTransform fft;
    osm::Coherence averaging;
    AnalysisResult output;
};

// One producer (CoreAudio callback), one consumer (measurement worker).
// push() has no allocation, locks, FFT, JSON, waits, or OS notification calls.
class AnalysisEngine
{
public:
    AnalysisEngine();
    ~AnalysisEngine();
    void configure(const AnalysisConfig& next);
    void start(double rate, int inputChannels);
    void stop();
    void invalidate() noexcept { discontinuity.fetch_add(1, std::memory_order_release); }
    void push(const float* const* inputs, int channels, int frames) noexcept;
    bool running() const { return active.load(std::memory_order_acquire); }
    bool configured() const { return hasConfig; }
    const AnalysisConfig& configuration() const { return config; }
    AnalysisResult snapshot() const;

private:
    struct Pair { float measurement = 0.0f, reference = 0.0f; };
    static constexpr std::size_t capacity = 1u << 19;
    void work(double rate);
    AnalysisConfig config;
    bool hasConfig = false;
    std::vector<Pair> ring;
    std::atomic<bool> active {false};
    std::atomic<unsigned int> producers {0};
    std::atomic<std::uint64_t> readIndex {0}, writeIndex {0}, dropped {0}, discontinuity {0};
    std::thread worker;
    mutable std::mutex resultMutex;
    AnalysisResult latest;
    std::chrono::steady_clock::time_point lastResult {};
};
}
