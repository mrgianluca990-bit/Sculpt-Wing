/**
 * Open Sound Meter portable measurement math.
 * Copyright (C) 2018, 2019 Pavel Smokotnin
 * Sculpt Wing adaptation (2026): standard C++ containers/scalar butterflies,
 * explicit transform convention and bounded FIFO spectra, without Qt/SIMD.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. This program is distributed WITHOUT ANY WARRANTY; see
 * ../vendor/open-sound-meter/LICENSE and PROVENANCE.json for source details.
 */
#pragma once

#include <algorithm>
#include <cmath>
#include <complex>
#include <cstddef>
#include <stdexcept>
#include <vector>

namespace sculpt::osm
{
constexpr double pi = 3.1415926535897932384626433832795;
using Complex = std::complex<double>;

// Scalar port of FourierTransform::prepareFast/fast/transformSingleChannel.
// The butterfly and swap-map algorithm are retained from OSM. This adapter
// uses the conventional negative-exponent forward transform and inverse 1/N
// normalization; callers do not rely on OSM's UI-specific FFT normalization.
class FourierTransform
{
public:
    explicit FourierTransform(std::size_t size) : swapMap(size), twiddles()
    {
        if (size < 2 || (size & (size - 1)) != 0) throw std::invalid_argument("FFT size must be a power of two");
        for (std::size_t i = 0; i < size; ++i) swapMap[i] = i;
        for (std::size_t i = 1, j = 0; i < size; ++i)
        {
            std::size_t bit = size >> 1;
            for (; j >= bit; bit >>= 1) j -= bit;
            j += bit;
            if (i < j) std::swap(swapMap[i], swapMap[j]);
        }
        for (std::size_t len = 2; len <= size; len <<= 1)
        {
            const auto angle = -2.0 * pi / static_cast<double>(len);
            twiddles.emplace_back(std::cos(angle), std::sin(angle));
        }
    }

    void transform(std::vector<Complex>& values, bool reverse = false) const
    {
        if (values.size() != swapMap.size()) throw std::invalid_argument("FFT buffer size mismatch");
        for (std::size_t i = 0; i < values.size(); ++i)
            if (i < swapMap[i]) std::swap(values[i], values[swapMap[i]]);
        for (std::size_t len = 2, stage = 0; len <= values.size(); len <<= 1, ++stage)
        {
            const auto wlen = reverse ? std::conj(twiddles[stage]) : twiddles[stage];
            for (std::size_t i = 0; i < values.size(); i += len)
            {
                Complex w {1.0, 0.0};
                for (std::size_t j = 0; j < len / 2; ++j)
                {
                    const auto a = values[i + j];
                    const auto b = values[i + j + len / 2] * w;
                    values[i + j] = a + b;
                    values[i + j + len / 2] = a - b;
                    w *= wlen;
                }
            }
        }
        if (reverse)
            for (auto& value : values) value /= static_cast<double>(values.size());
    }

private:
    std::vector<std::size_t> swapMap;
    std::vector<Complex> twiddles;
};

// OSM WindowFunction::pointGain(Hann) and calculate(), with double precision.
inline std::vector<double> hannWindow(std::size_t size)
{
    std::vector<double> window(size);
    double gain = 0.0;
    for (std::size_t i = 0; i < size; ++i)
    {
        window[i] = std::pow(std::sin(pi * static_cast<double>(i) / static_cast<double>(size)), 2.0);
        gain += window[i];
    }
    gain /= static_cast<double>(size);
    for (auto& sample : window) sample /= gain;
    return window;
}

// Portable FIFO implementation of OSM Coherence::calculateRR/MM/RM/value.
// The returned coefficient is |Gmr|/sqrt(Gmm*Grr), as in OSM, not squared.
class Coherence
{
public:
    Coherence(std::size_t size, std::size_t depth)
        : size(size), depth(depth), rr(size * depth), mm(size * depth), rm(size * depth),
          sumRR(size), sumMM(size), sumRM(size) {}

    void append(const std::vector<Complex>& measurement, const std::vector<Complex>& reference)
    {
        const auto offset = pointer * size;
        for (std::size_t i = 0; i < size; ++i)
        {
            sumRR[i] -= rr[offset + i];
            sumMM[i] -= mm[offset + i];
            sumRM[i] -= rm[offset + i];
            rr[offset + i] = std::norm(reference[i]);
            mm[offset + i] = std::norm(measurement[i]);
            rm[offset + i] = std::conj(reference[i]) * measurement[i];
            sumRR[i] += rr[offset + i];
            sumMM[i] += mm[offset + i];
            sumRM[i] += rm[offset + i];
        }
        pointer = (pointer + 1) % depth;
        count = std::min(count + 1, depth);
    }
    double value(std::size_t i) const
    {
        const auto denominator = std::max(0.0, sumRR[i]) * std::max(0.0, sumMM[i]);
        return count < 2 || denominator <= 1.0e-30 ? 0.0 : std::clamp(std::abs(sumRM[i]) / std::sqrt(denominator), 0.0, 1.0);
    }
    Complex transfer(std::size_t i) const { return sumRR[i] > 1.0e-20 ? sumRM[i] / sumRR[i] : Complex {}; }
    double referencePower(std::size_t i) const { return count ? std::max(0.0, sumRR[i]) / count : 0.0; }
    double measurementPower(std::size_t i) const { return count ? std::max(0.0, sumMM[i]) / count : 0.0; }
    std::size_t windows() const { return count; }

private:
    std::size_t size, depth, pointer = 0, count = 0;
    std::vector<double> rr, mm;
    std::vector<Complex> rm;
    std::vector<double> sumRR, sumMM;
    std::vector<Complex> sumRM;
};
}
