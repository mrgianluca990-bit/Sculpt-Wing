#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

namespace sculpt
{
constexpr int maxChannels = 48;
constexpr int maxRacks = 16;
constexpr int maxSlots = 8;
constexpr int maxBlockSize = 8192;
constexpr std::size_t maxMessageBytes = 64u * 1024u * 1024u;
constexpr std::size_t maxStateBytes = 8u * 1024u * 1024u;

struct Route
{
    std::string id;
    std::vector<int> inputs;
    std::vector<int> outputs;
};

// This describes the intended WING insertion point. It never changes the
// host's DSP graph or proves that the console has been patched accordingly.
enum class RackPlacement { Unassigned, Pre, Insert1, Insert2 };

inline std::optional<RackPlacement> parseRackPlacement(std::string_view value)
{
    if (value == "pre") return RackPlacement::Pre;
    if (value == "insert1") return RackPlacement::Insert1;
    if (value == "insert2") return RackPlacement::Insert2;
    return std::nullopt;
}

inline const char* rackPlacementName(RackPlacement value) noexcept
{
    switch (value)
    {
        case RackPlacement::Pre: return "pre";
        case RackPlacement::Insert1: return "insert1";
        case RackPlacement::Insert2: return "insert2";
        case RackPlacement::Unassigned: return nullptr;
    }
    return nullptr;
}

inline bool sameRackRouting(const Route& previous, const Route& requested,
                            RackPlacement previousPlacement, RackPlacement requestedPlacement)
{
    return previous.id == requested.id && previous.inputs == requested.inputs
        && previous.outputs == requested.outputs && previousPlacement == requestedPlacement;
}

inline std::string validateRoutes(const std::vector<Route>& routes,
                                  int availableInputs = maxChannels,
                                  int availableOutputs = maxChannels)
{
    if (routes.size() > maxRacks) return "Sono consentiti al massimo 16 rack.";
    std::set<std::string> ids;
    std::set<int> outputs;
    for (const auto& route : routes)
    {
        if (route.id.empty() || route.id.size() > 128 || !ids.insert(route.id).second)
            return "Identificatore rack vuoto, troppo lungo o duplicato.";
        if (route.inputs.empty() || route.inputs.size() > 2 || route.inputs.size() != route.outputs.size())
            return "Ogni rack richiede un ingresso/uscita mono oppure due ingressi/uscite stereo.";
        std::set<int> inputs;
        for (const int input : route.inputs)
            if (input < 0 || input >= availableInputs || !inputs.insert(input).second)
                return "Canale di ingresso non disponibile o duplicato nel rack.";
        for (const int output : route.outputs)
            if (output < 0 || output >= availableOutputs || !outputs.insert(output).second)
                return "Canale di uscita non disponibile o gia assegnato a un altro rack.";
    }
    return {};
}

inline void clearOutputs(float* const* outputs, int count, int frames) noexcept
{
    for (int channel = 0; channel < count; ++channel)
        if (outputs[channel] != nullptr)
            std::fill_n(outputs[channel], frames, 0.0f);
}

inline void readRoute(const Route& route, const float* const* inputs, int count,
                      float* const* rackBuffer, int frames) noexcept
{
    for (std::size_t channel = 0; channel < route.inputs.size(); ++channel)
    {
        const int input = route.inputs[channel];
        if (input >= 0 && input < count && inputs[input] != nullptr)
            std::copy_n(inputs[input], frames, rackBuffer[channel]);
        else
            std::fill_n(rackBuffer[channel], frames, 0.0f);
    }
}

inline void writeRoute(const Route& route, const float* const* rackBuffer,
                       float* const* outputs, int count, int frames) noexcept
{
    for (std::size_t channel = 0; channel < route.outputs.size(); ++channel)
    {
        const int output = route.outputs[channel];
        if (output >= 0 && output < count && outputs[output] != nullptr)
            std::copy_n(rackBuffer[channel], frames, outputs[output]);
    }
}

inline float peak(const float* const* data, int channels, int frames) noexcept
{
    float value = 0.0f;
    for (int channel = 0; channel < channels; ++channel)
        for (int sample = 0; sample < frames; ++sample)
            value = std::max(value, std::abs(data[channel][sample]));
    return value;
}
}
