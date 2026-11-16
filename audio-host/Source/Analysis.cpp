// Sculpt Wing manual measurement worker, using the adapted OSM GPL math.
// SPDX-License-Identifier: GPL-3.0-or-later
#include "Analysis.h"
#include <limits>

namespace sculpt
{
namespace
{
double decibels(double amplitude)
{
    return std::clamp(20.0 * std::log10(std::max(amplitude, 1.0e-8)), -160.0, 160.0);
}
void checkConfig(const AnalysisConfig& config)
{
    if (config.measurementChannel < 0 || config.measurementChannel >= 48
        || config.referenceChannel < 0 || config.referenceChannel >= 48
        || config.measurementChannel == config.referenceChannel)
        throw std::invalid_argument("Scegli due ingressi USB distinti fra 1 e 48.");
    if (config.fftSize != 16384 && config.fftSize != 32768 && config.fftSize != 65536)
        throw std::invalid_argument("FFT non supportata: scegliere 16384, 32768 o 65536.");
    if (config.averages < 2 || config.averages > 32)
        throw std::invalid_argument("Numero di medie non valido: scegliere da 2 a 32.");
    if (!std::isfinite(config.delayMs) || std::abs(config.delayMs) > 500.0)
        throw std::invalid_argument("Ritardo di misura fuori intervallo (-500..500 ms).");
    if (config.levelOffsetDb && (!std::isfinite(*config.levelOffsetDb) || std::abs(*config.levelOffsetDb) > 240.0))
        throw std::invalid_argument("Taratura SPL non valida.");
    if (config.calibration.size() > 4096)
        throw std::invalid_argument("Il file di calibrazione supera 4096 punti.");
    double previous = 0.0;
    for (const auto& point : config.calibration)
    {
        if (!std::isfinite(point.frequency) || point.frequency <= previous || point.frequency > 192000.0
            || !std::isfinite(point.gainDb) || std::abs(point.gainDb) > 120.0
            || !std::isfinite(point.phaseDeg) || std::abs(point.phaseDeg) > 3600.0)
            throw std::invalid_argument("Punti di calibrazione non validi o non ordinati per frequenza.");
        previous = point.frequency;
    }
    if (config.calibrationEnabled && config.calibration.size() < 2)
        throw std::invalid_argument("Carica almeno due punti prima di abilitare la calibrazione.");
}
}

AnalysisProcessor::AnalysisProcessor(AnalysisConfig settings, double rate)
    : config(std::move(settings)), sampleRate(rate), size(static_cast<std::size_t>(config.fftSize)),
      historySize(size + static_cast<std::size_t>(std::ceil(std::abs(config.delayMs) * rate / 1000.0)) + 2),
      delaySamples(std::lround(config.delayMs * rate / 1000.0)),
      fractionalDelay(config.delayMs * rate / 1000.0 - static_cast<double>(delaySamples)),
      measurementHistory(historySize), referenceHistory(historySize), window(osm::hannWindow(size)),
      measurementFFT(size), referenceFFT(size), impulse(size), fft(size),
      averaging(size / 2 + 1, static_cast<std::size_t>(config.averages))
{
    checkConfig(config);
    if (!std::isfinite(rate) || rate < 32000.0 || rate > 192000.0)
        throw std::invalid_argument("Sample rate di misura non supportato.");
    output.sampleRate = sampleRate;
    output.delaySearchMs = (static_cast<double>(size) / 2.0 - 1.0) * 1000.0 / sampleRate;
}

bool AnalysisProcessor::add(float measurement, float reference)
{
    measurementHistory[writeIndex] = std::isfinite(measurement) ? measurement : 0.0f;
    referenceHistory[writeIndex] = std::isfinite(reference) ? reference : 0.0f;
    writeIndex = (writeIndex + 1) % historySize;
    collected = std::min(collected + 1, historySize);
    ++sinceTransform;
    if (collected < size + static_cast<std::size_t>(std::abs(delaySamples)) || sinceTransform < size / 4)
        return false;
    sinceTransform = 0;
    transform();
    return true;
}

CalibrationPoint AnalysisProcessor::calibrationAt(double frequency) const
{
    if (!config.calibrationEnabled || config.calibration.empty()) return {};
    const auto& points = config.calibration;
    if (frequency <= points.front().frequency) return points.front();
    if (frequency >= points.back().frequency) return points.back();
    const auto upper = std::lower_bound(points.begin(), points.end(), frequency,
        [](const CalibrationPoint& point, double value) { return point.frequency < value; });
    const auto& a = *(upper - 1);
    const auto& b = *upper;
    const auto portion = std::log(frequency / a.frequency) / std::log(b.frequency / a.frequency);
    return {frequency, a.gainDb + portion * (b.gainDb - a.gainDb), a.phaseDeg + portion * (b.phaseDeg - a.phaseDeg)};
}

void AnalysisProcessor::transform()
{
    const auto measurementBack = static_cast<std::size_t>(std::max(0L, -delaySamples));
    const auto referenceBack = static_cast<std::size_t>(std::max(0L, delaySamples));
    double meanM = 0.0, meanR = 0.0, powerM = 0.0, powerR = 0.0, peakM = 0.0, peakR = 0.0;
    for (std::size_t i = 0; i < size; ++i)
    {
        const auto m = static_cast<double>(measurementHistory[(writeIndex + historySize * 2 - size - measurementBack + i) % historySize]);
        const auto r = static_cast<double>(referenceHistory[(writeIndex + historySize * 2 - size - referenceBack + i) % historySize]);
        measurementFFT[i] = m;
        referenceFFT[i] = r;
        meanM += m; meanR += r;
        powerM += m * m; powerR += r * r;
        peakM = std::max(peakM, std::abs(m)); peakR = std::max(peakR, std::abs(r));
    }
    meanM /= static_cast<double>(size); meanR /= static_cast<double>(size);
    for (std::size_t i = 0; i < size; ++i)
    {
        measurementFFT[i] = (measurementFFT[i].real() - meanM) * window[i];
        referenceFFT[i] = (referenceFFT[i].real() - meanR) * window[i];
    }
    fft.transform(measurementFFT);
    fft.transform(referenceFFT);
    averaging.append(measurementFFT, referenceFFT);
    double referenceMaximum = 0.0;
    for (std::size_t i = 1; i <= size / 2; ++i)
        referenceMaximum = std::max(referenceMaximum, averaging.referencePower(i));

    output.measurementPeakDb = decibels(peakM);
    output.referencePeakDb = decibels(peakR);
    output.measurementRmsDb = decibels(std::sqrt(powerM / size));
    output.referenceRmsDb = decibels(std::sqrt(powerR / size));
    output.splDb = config.levelOffsetDb ? std::optional<double>(output.measurementRmsDb + *config.levelOffsetDb) : std::nullopt;
    output.clipped = peakM >= 0.999 || peakR >= 0.999;
    output.averagedWindows = static_cast<int>(averaging.windows());

    // OSM deconvolution principle: divide measurement by reference in the
    // frequency domain and transform back. The averaged cross/auto spectra
    // provide a bounded H1 estimate in place of an unstable per-bin division.
    impulse[0] = {};
    for (std::size_t i = 1; i <= size / 2; ++i)
    {
        auto h = averaging.transfer(i);
        // A quiet/unexcited reference bin must not amplify measurement noise
        // into a false impulse peak. Regularize relative to the actual signal,
        // then taper bins with poor coherence; never divide by a bare epsilon.
        const auto power = averaging.referencePower(i);
        const auto regularization = referenceMaximum * 1.0e-4;
        const auto excitation = power + regularization > 1.0e-20 ? power / (power + regularization) : 0.0;
        const auto coherenceWeight = std::clamp((averaging.value(i) - 0.25) / 0.5, 0.0, 1.0);
        h *= excitation * coherenceWeight;
        h *= std::polar(1.0, 2.0 * osm::pi * static_cast<double>(i) * fractionalDelay / size);
        impulse[i] = h;
        if (i < size / 2) impulse[size - i] = std::conj(h);
    }
    impulse[size / 2] = {impulse[size / 2].real(), 0.0};
    fft.transform(impulse, true);

    output.frequency.clear(); output.magnitudeDb.clear(); output.phaseDeg.clear();
    output.coherence.clear(); output.rtaDb.clear();
    double coherenceSum = 0.0, coherenceWeight = 0.0;
    const double low = std::max(20.0, sampleRate / size);
    const double high = std::min(24000.0, sampleRate / 2.0);
    std::size_t previousBin = 0;
    for (std::size_t point = 0; point < 1024; ++point)
    {
        const auto wanted = low * std::pow(high / low, static_cast<double>(point) / 1023.0);
        const auto i = std::clamp(static_cast<std::size_t>(std::llround(wanted * size / sampleRate)), std::size_t(1), size / 2);
        if (i == previousBin) continue;
        previousBin = i;
        const auto frequency = static_cast<double>(i) * sampleRate / size;
        const auto correction = calibrationAt(frequency);
        auto h = averaging.transfer(i);
        h *= std::polar(std::pow(10.0, -correction.gainDb / 20.0),
                        2.0 * osm::pi * static_cast<double>(i) * fractionalDelay / size - correction.phaseDeg * osm::pi / 180.0);
        const auto coefficient = averaging.value(i);
        output.frequency.push_back(frequency);
        output.magnitudeDb.push_back(decibels(std::abs(h)));
        output.phaseDeg.push_back(std::arg(h) * 180.0 / osm::pi);
        output.coherence.push_back(coefficient);
        output.rtaDb.push_back(std::clamp(decibels(std::sqrt(2.0 * averaging.measurementPower(i)) / size) - correction.gainDb, -160.0, 160.0));
        const auto weight = std::sqrt(averaging.referencePower(i));
        coherenceSum += coefficient * weight;
        coherenceWeight += weight;
    }
    output.meanCoherence = coherenceWeight > 1.0e-12 ? coherenceSum / coherenceWeight : 0.0;
    output.valid = averaging.windows() >= 2 && output.referenceRmsDb > -100.0
                   && output.measurementRmsDb > -100.0 && !output.clipped && output.meanCoherence >= 0.35;
    output.quality = output.clipped ? "Clipping"
                   : output.referenceRmsDb <= -100.0 ? "Reference assente"
                   : output.measurementRmsDb <= -100.0 ? "Misura assente"
                   : averaging.windows() < 2 ? "Media in acquisizione"
                   : output.meanCoherence < 0.35 ? "Coerenza bassa" : "Misura valida";

    // A coherent tone has an ambiguous delay; with only a few overlapping
    // averages even unrelated noises can have deceptively high coherence.
    // Require an actually excited reference bandwidth and an impulse peak
    // that rises above its distributed energy before offering a delay value.
    std::size_t excitedBins = 0;
    for (std::size_t i = 1; i <= size / 2; ++i)
        if (referenceMaximum > 1.0e-20 && averaging.referencePower(i) >= referenceMaximum * 1.0e-4)
            ++excitedBins;
    output.referenceBandwidthHz = static_cast<double>(excitedBins) * sampleRate / size;

    double maximum = 0.0, impulseEnergy = 0.0;
    std::size_t peakIndex = 0;
    for (std::size_t i = 0; i < size; ++i)
    {
        impulseEnergy += impulse[i].real() * impulse[i].real();
        if (std::abs(impulse[i].real()) > maximum)
        {
            maximum = std::abs(impulse[i].real()); peakIndex = i;
        }
    }
    const auto impulseRms = std::sqrt(impulseEnergy / size);
    output.delayPeakToRmsDb = impulseRms > 1.0e-12 ? decibels(maximum / impulseRms) : 0.0;
    const auto before = std::abs(impulse[(peakIndex + size - 1) % size].real());
    const auto after = std::abs(impulse[(peakIndex + 1) % size].real());
    const auto curvature = before - 2.0 * maximum + after;
    const auto fraction = std::abs(curvature) > 1.0e-12 ? std::clamp(0.5 * (before - after) / curvature, -0.5, 0.5) : 0.0;
    const auto signedPeak = peakIndex <= size / 2 ? static_cast<long>(peakIndex) : static_cast<long>(peakIndex) - static_cast<long>(size);
    const auto residualMs = (static_cast<double>(signedPeak) + fraction) * 1000.0 / sampleRate;
    const bool enoughBandwidth = output.referenceBandwidthHz >= 500.0 && excitedBins >= 16;
    const bool distinctImpulse = output.delayPeakToRmsDb >= 18.0 && maximum > 1.0e-8;
    const bool withinRange = std::abs(residualMs) < output.delaySearchMs * 0.98;
    output.delayQuality = !output.valid ? output.quality
                        : !enoughBandwidth ? "Reference a banda stretta: delay ambiguo; usa un segnale a banda larga"
                        : !distinctImpulse ? "Picco impulso non distinguibile: delay non affidabile"
                        : !withinRange ? "Picco al limite FFT: amplia la finestra o compensa il ritardo"
                        : "Picco impulso rilevato";
    output.estimatedDelayMs = output.valid && enoughBandwidth && distinctImpulse && withinRange
        ? std::optional<double>(config.delayMs + residualMs) : std::nullopt;

    // Two extrema per bucket preserve narrow positive and negative impulses,
    // while retaining a bounded 1024-point IPC payload in chronological order.
    output.impulseTimeMs.clear(); output.impulseValue.clear();
    const auto bucket = std::max(std::size_t(1), size / 512);
    const auto appendPoint = [&](std::size_t orderedIndex)
    {
        output.impulseTimeMs.push_back((static_cast<double>(orderedIndex) - size / 2.0) * 1000.0 / sampleRate);
        output.impulseValue.push_back(impulse[(orderedIndex + size / 2) % size].real());
    };
    for (std::size_t start = 0; start < size; start += bucket)
    {
        auto minimumIndex = start, maximumIndex = start;
        for (std::size_t i = start + 1; i < std::min(start + bucket, size); ++i)
        {
            const auto value = impulse[(i + size / 2) % size].real();
            if (value < impulse[(minimumIndex + size / 2) % size].real()) minimumIndex = i;
            if (value > impulse[(maximumIndex + size / 2) % size].real()) maximumIndex = i;
        }
        appendPoint(std::min(minimumIndex, maximumIndex));
        if (minimumIndex != maximumIndex) appendPoint(std::max(minimumIndex, maximumIndex));
    }
    ++output.sequence;
    output.stale = false;
}

AnalysisEngine::AnalysisEngine() : ring(capacity) {}
AnalysisEngine::~AnalysisEngine() { stop(); }

void AnalysisEngine::configure(const AnalysisConfig& next)
{
    if (running()) throw std::runtime_error("Ferma la misura prima di cambiarne la configurazione.");
    checkConfig(next);
    stop();
    config = next;
    hasConfig = true;
    const std::lock_guard<std::mutex> guard(resultMutex);
    latest = {};
    lastResult = {};
}

void AnalysisEngine::start(double rate, int inputChannels)
{
    if (running()) return;
    if (!hasConfig) throw std::runtime_error("Configura prima mic e reference.");
    if (config.measurementChannel >= inputChannels || config.referenceChannel >= inputChannels)
        throw std::runtime_error("Mic o reference non sono presenti fra gli ingressi del dispositivo.");
    checkConfig(config);
    if (!std::isfinite(rate) || rate < 32000.0 || rate > 192000.0)
        throw std::runtime_error("Sample rate di misura non supportato.");
    stop();
    readIndex.store(0); writeIndex.store(0); dropped.store(0); discontinuity.store(0);
    {
        const std::lock_guard<std::mutex> guard(resultMutex);
        latest = {}; latest.sampleRate = rate;
        latest.delaySearchMs = (config.fftSize / 2.0 - 1.0) * 1000.0 / rate;
        latest.quality = "In attesa di campioni";
        lastResult = {};
    }
    active.store(true, std::memory_order_release);
    try { worker = std::thread([this, rate] { work(rate); }); }
    catch (...) { active.store(false, std::memory_order_release); throw; }
}

void AnalysisEngine::stop()
{
    active.store(false, std::memory_order_release);
    // push is bounded to one hardware block, not the plugin processing time.
    while (producers.load(std::memory_order_acquire) != 0) std::this_thread::yield();
    if (worker.joinable()) worker.join();
}

void AnalysisEngine::push(const float* const* inputs, int channels, int frames) noexcept
{
    if (!active.load(std::memory_order_acquire)) return;
    producers.fetch_add(1, std::memory_order_acq_rel);
    if (!active.load(std::memory_order_acquire)) { producers.fetch_sub(1, std::memory_order_release); return; }
    const auto done = [&] { producers.fetch_sub(1, std::memory_order_release); };
    if (frames <= 0 || channels <= config.measurementChannel || channels <= config.referenceChannel
        || !inputs || !inputs[config.measurementChannel] || !inputs[config.referenceChannel])
    {
        discontinuity.fetch_add(1, std::memory_order_release); done(); return;
    }
    const auto write = writeIndex.load(std::memory_order_relaxed);
    const auto read = readIndex.load(std::memory_order_acquire);
    if (static_cast<std::uint64_t>(frames) > capacity - (write - read))
    {
        dropped.fetch_add(static_cast<std::uint64_t>(frames), std::memory_order_relaxed);
        discontinuity.fetch_add(1, std::memory_order_release); done(); return;
    }
    for (int i = 0; i < frames; ++i)
    {
        const float measurement = inputs[config.measurementChannel][i], reference = inputs[config.referenceChannel][i];
        if (!std::isfinite(measurement) || !std::isfinite(reference))
        {
            dropped.fetch_add(static_cast<std::uint64_t>(frames), std::memory_order_relaxed);
            discontinuity.fetch_add(1, std::memory_order_release); done(); return;
        }
        ring[(write + static_cast<std::uint64_t>(i)) & (capacity - 1)] = {measurement, reference};
    }
    writeIndex.store(write + static_cast<std::uint64_t>(frames), std::memory_order_release);
    done();
}

void AnalysisEngine::work(double rate)
{
    try
    {
        auto processor = std::make_unique<AnalysisProcessor>(config, rate);
        std::uint64_t seenDiscontinuity = 0, sequence = 0;
        while (active.load(std::memory_order_acquire))
        {
            const auto currentDiscontinuity = discontinuity.load(std::memory_order_acquire);
            if (currentDiscontinuity != seenDiscontinuity)
            {
                seenDiscontinuity = currentDiscontinuity;
                readIndex.store(writeIndex.load(std::memory_order_acquire), std::memory_order_release);
                processor = std::make_unique<AnalysisProcessor>(config, rate);
                const std::lock_guard<std::mutex> guard(resultMutex);
                latest.valid = false; latest.stale = true; latest.estimatedDelayMs.reset();
                latest.quality = "Acquisizione interrotta: nuova media";
                latest.delayQuality = latest.quality;
            }
            auto read = readIndex.load(std::memory_order_relaxed);
            const auto write = writeIndex.load(std::memory_order_acquire);
            if (read == write) { std::this_thread::sleep_for(std::chrono::milliseconds(2)); continue; }
            const auto until = std::min(write, read + 1024);
            for (; read < until && active.load(std::memory_order_acquire); ++read)
            {
                const auto sample = ring[read & (capacity - 1)];
                if (processor->add(sample.measurement, sample.reference)
                    && seenDiscontinuity == discontinuity.load(std::memory_order_acquire))
                {
                    const std::lock_guard<std::mutex> guard(resultMutex);
                    latest = processor->result(); latest.sequence = ++sequence;
                    latest.droppedSamples = dropped.load(std::memory_order_relaxed);
                    lastResult = std::chrono::steady_clock::now();
                }
            }
            readIndex.store(read, std::memory_order_release);
        }
    }
    catch (const std::exception& exception)
    {
        const std::lock_guard<std::mutex> guard(resultMutex);
        latest.valid = false; latest.stale = true; latest.estimatedDelayMs.reset();
        latest.quality = std::string("Errore analisi: ") + exception.what();
        latest.delayQuality = latest.quality;
        active.store(false, std::memory_order_release);
    }
}

AnalysisResult AnalysisEngine::snapshot() const
{
    const std::lock_guard<std::mutex> guard(resultMutex);
    auto result = latest;
    const auto age = std::chrono::duration<double>(std::chrono::steady_clock::now() - lastResult).count();
    const auto maximumAge = std::max(1.5, 3.0 * config.fftSize / std::max(32000.0, latest.sampleRate));
    result.stale = result.stale || !running() || lastResult == std::chrono::steady_clock::time_point() || age > maximumAge;
    if (result.stale && running())
    {
        result.valid = false; result.estimatedDelayMs.reset();
        result.delayQuality = "Acquisizione non aggiornata";
    }
    result.droppedSamples = dropped.load(std::memory_order_relaxed);
    return result;
}
}
