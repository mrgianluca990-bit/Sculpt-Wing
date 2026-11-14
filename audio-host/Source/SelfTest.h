#pragma once

#include "Routing.h"
#include <iostream>
#include <stdexcept>

namespace sculpt
{
inline int runRoutingSelfTest()
{
    try
    {
        const auto expect = [](bool condition, const char* reason)
        {
            if (!condition) throw std::runtime_error(reason);
        };
        Route mono {"ch-1", {2}, {4}};
        Route stereo {"bus-1", {0, 1}, {0, 1}};
        expect(validateRoutes({mono, stereo}).empty(), "Valid mono/stereo routing rejected");
        expect(!validateRoutes({mono, {"ch-2", {0}, {4}}}).empty(), "Output collision accepted");
        expect(!validateRoutes({mono, mono}).empty(), "Duplicate rack ID accepted");
        expect(!validateRoutes({{"bad", {48}, {0}}}).empty(), "Out-of-range USB input accepted");
        expect(!validateRoutes({{"bad", {0}, {0, 1}}}).empty(), "Asymmetric layout accepted");
        expect(!validateRoutes({{"bad", {0, 0}, {0, 1}}}).empty(), "Duplicated stereo input accepted");
        expect(!validateRoutes({mono}, 2, 8).empty(), "Hardware channel limit ignored");
        std::vector<Route> tooMany;
        for (int n = 0; n < 17; ++n) tooMany.push_back({std::to_string(n), {n}, {n}});
        expect(!validateRoutes(tooMany).empty(), "Rack capacity ignored");

        constexpr int frames = 8;
        std::array<std::array<float, frames>, 5> source {}, destination {};
        for (int ch = 0; ch < 5; ++ch)
            for (int sample = 0; sample < frames; ++sample)
            {
                source[ch][sample] = float((ch + 1) * (sample + 1)) / 100.0f;
                destination[ch][sample] = 123.0f;
            }
        std::array<const float*, 5> inputs {};
        std::array<float*, 5> outputs {};
        for (int ch = 0; ch < 5; ++ch) { inputs[ch] = source[ch].data(); outputs[ch] = destination[ch].data(); }
        std::array<std::array<float, frames>, 2> scratch {};
        std::array<float*, 2> buffer {scratch[0].data(), scratch[1].data()};
        std::array<const float*, 2> constBuffer {scratch[0].data(), scratch[1].data()};

        clearOutputs(outputs.data(), 5, frames);
        readRoute(stereo, inputs.data(), 5, buffer.data(), frames);
        writeRoute(stereo, constBuffer.data(), outputs.data(), 5, frames);
        readRoute(mono, inputs.data(), 5, buffer.data(), frames);
        for (float& sample : scratch[0]) sample *= 0.5f;
        writeRoute(mono, constBuffer.data(), outputs.data(), 5, frames);
        for (int sample = 0; sample < frames; ++sample)
        {
            expect(destination[0][sample] == source[0][sample], "Stereo left routing corrupted");
            expect(destination[1][sample] == source[1][sample], "Stereo right routing corrupted");
            expect(destination[4][sample] == source[2][sample] * 0.5f, "Mono processed output corrupted");
            expect(destination[2][sample] == 0.0f && destination[3][sample] == 0.0f, "Unassigned outputs leaked audio");
        }
        inputs[2] = nullptr;
        readRoute(mono, inputs.data(), 5, buffer.data(), frames);
        expect(peak(constBuffer.data(), 1, frames) == 0.0f, "Missing input did not produce silence");
        clearOutputs(outputs.data(), 5, frames);
        expect(peak(const_cast<const float* const*>(outputs.data()), 5, frames) == 0.0f,
               "Stopped engine outputs not silent");
        std::cout << "Sculpt Wing audio routing: 14 checks passed. No audio hardware was opened.\n";
        return 0;
    }
    catch (const std::exception& error)
    {
        std::cerr << "Audio self-test failed: " << error.what() << '\n';
        return 1;
    }
}
}
