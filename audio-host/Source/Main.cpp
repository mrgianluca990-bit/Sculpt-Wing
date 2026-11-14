#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include "Routing.h"
#include "SelfTest.h"

#include <atomic>
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <poll.h>
#include <set>
#include <stdexcept>
#include <thread>
#include <unistd.h>

namespace sculpt
{
using namespace juce;

static var obj(std::initializer_list<std::pair<const char*, var>> fields)
{
    auto* object = new DynamicObject();
    for (const auto& field : fields) object->setProperty(field.first, field.second);
    return var(object);
}

static var strings(const StringArray& source)
{
    Array<var> values;
    for (const auto& value : source) values.add(value);
    return values;
}

template <typename T> static var numbers(const T& source)
{
    Array<var> values;
    for (const auto value : source) values.add(value);
    return values;
}

static void require(bool condition, const String& message)
{
    if (!condition) throw std::runtime_error(message.toStdString());
}

static String textField(const var& value, const char* key, bool emptyAllowed = false, int maximum = 4096)
{
    const auto field = value.getProperty(key, {});
    require(field.isString(), String("Campo testo mancante: ") + key);
    const auto result = field.toString();
    require((emptyAllowed || result.isNotEmpty()) && result.length() <= maximum,
            String("Campo testo non valido: ") + key);
    return result;
}

static int integerField(const var& value, const char* key, int minimum, int maximum, int fallback = -1)
{
    const auto field = value.getProperty(key, fallback);
    require(field.isInt() || field.isInt64(), String("Numero intero richiesto: ") + key);
    const auto result = static_cast<int64>(field);
    require(result >= minimum && result <= maximum, String("Numero fuori intervallo: ") + key);
    return static_cast<int>(result);
}

static bool booleanField(const var& value, const char* key, bool fallback)
{
    const auto field = value.getProperty(key, fallback);
    require(field.isBool(), String("Valore booleano richiesto: ") + key);
    return static_cast<bool>(field);
}

static std::vector<int> channelsField(const var& source, const char* key)
{
    const auto field = source.getProperty(key, {});
    const auto* values = field.getArray();
    require(values != nullptr && values->size() >= 1 && values->size() <= 2,
            String("Assegnazione mono/stereo richiesta: ") + key);
    std::vector<int> result;
    for (const auto& value : *values)
    {
        require(value.isInt() || value.isInt64(), "I canali USB devono essere numeri interi.");
        const auto channel = static_cast<int64>(value);
        require(channel >= 0 && channel < maxChannels, "I canali USB validi sono 0..47.");
        result.push_back(static_cast<int>(channel));
    }
    return result;
}

static Route routeFrom(const var& source)
{
    require(source.isObject(), "Rack non valido.");
    return {textField(source, "id", false, 128).toStdString(),
            channelsField(source, "inputChannels"), channelsField(source, "outputChannels")};
}

static MemoryBlock decodeState(const String& state)
{
    require(static_cast<std::size_t>(state.getNumBytesAsUTF8()) <= maxStateBytes, "Preset VST3 oltre il limite di 8 MiB.");
    MemoryOutputStream decoded;
    require(Base64::convertFromBase64(decoded, state), "Preset VST3 Base64 non valido.");
    return decoded.getMemoryBlock();
}

static String pluginId(const PluginDescription& description)
{
    // JUCE's createIdentifierString also hashes the installation path. Use its
    // VST3 class-derived UID plus vendor/name so moving the same effect between
    // system and user folders does not orphan its saved rack state.
    const auto uid = description.uniqueId != 0 ? description.uniqueId : description.deprecatedUid;
    const auto identity = description.pluginFormatName + "\n" + description.manufacturerName
                        + "\n" + description.name + "\n" + String::toHexString(uid);
    return "vst3-" + String::toHexString(identity.hashCode64()).paddedLeft('0', 16);
}

class ProtocolOutput
{
public:
    ProtocolOutput()
    {
        // Third-party plugins sometimes print to stdout. Preserve a private
        // protocol FD and redirect their stdout to stderr before loading any.
        fd = ::dup(STDOUT_FILENO);
        if (fd >= 0) ::fcntl(fd, F_SETFD, FD_CLOEXEC);
        ::dup2(STDERR_FILENO, STDOUT_FILENO);
        std::signal(SIGPIPE, SIG_IGN);
    }
    ~ProtocolOutput() { if (fd >= 0) ::close(fd); }
    void send(const var& value) { sendLine(JSON::toString(value, true)); }
    void sendLine(const String& value)
    {
        const auto line = (value + "\n").toStdString();
        if (line.size() > maxMessageBytes) throw std::runtime_error("Stato audio oltre il limite di 64 MiB.");
        const std::lock_guard<std::mutex> lock(mutex);
        std::size_t offset = 0;
        while (fd >= 0 && offset < line.size())
        {
            const auto count = ::write(fd, line.data() + offset, line.size() - offset);
            if (count > 0) offset += static_cast<std::size_t>(count);
            else if (count < 0 && errno == EINTR) continue;
            else break;
        }
    }
private:
    int fd = -1;
    std::mutex mutex;
};

struct Slot
{
    String id, name, cachedState, loadError;
    bool missing = false;
    std::atomic<bool> bypass {false};
    std::unique_ptr<AudioPluginInstance> instance;
};

struct Rack
{
    Route route;
    String name;
    std::atomic<bool> enabled {false};
    std::vector<std::unique_ptr<Slot>> slots;
    AudioBuffer<float> buffer;
    MidiBuffer midi;
    std::atomic<float> inputPeak {0.0f}, outputPeak {0.0f};

    explicit Rack(Route routing) : route(std::move(routing)), buffer(static_cast<int>(route.inputs.size()), maxBlockSize)
    {
        midi.ensureSize(2048);
    }
    int latency() const
    {
        int total = 0;
        if (enabled.load())
            for (const auto& slot : slots)
                if (slot->instance && !slot->bypass.load()) total += slot->instance->getLatencySamples();
        return total;
    }
    bool hasMissing() const
    {
        return std::any_of(slots.begin(), slots.end(), [](const auto& slot) { return slot->missing; });
    }
};

class Engine final : public AudioIODeviceCallback
{
public:
    std::vector<std::unique_ptr<Rack>> racks;
    std::atomic<bool> running {false};
    std::atomic<int> fault {0};
    std::atomic<int64> overloads {0};
    int blockSize = 128;
    double sampleRate = 48000.0;
    String expectedDevice;

    void prepare()
    {
        for (auto& rack : racks)
            for (auto& slot : rack->slots)
                if (slot->instance)
                {
                    slot->instance->setRateAndBufferSizeDetails(sampleRate, blockSize);
                    slot->instance->prepareToPlay(sampleRate, blockSize);
                    slot->instance->reset();
                }
        fault.store(0);
    }
    void release()
    {
        for (auto& rack : racks)
        {
            rack->inputPeak.store(0.0f); rack->outputPeak.store(0.0f);
            for (auto& slot : rack->slots) if (slot->instance) slot->instance->releaseResources();
        }
    }
    void audioDeviceIOCallbackWithContext(const float* const* inputs, int numInputs,
                                          float* const* outputs, int numOutputs, int frames,
                                          const AudioIODeviceCallbackContext&) override
    {
        const ScopedNoDenormals noDenormals;
        clearOutputs(outputs, numOutputs, frames);
        if (!running.load(std::memory_order_acquire) || fault.load(std::memory_order_acquire) != 0) return;
        if (frames > blockSize || frames > maxBlockSize) { fault.store(1); return; }
        const auto started = Time::getHighResolutionTicks();
        try
        {
            for (auto& rack : racks)
            {
                const auto count = static_cast<int>(rack->route.inputs.size());
                readRoute(rack->route, inputs, numInputs, rack->buffer.getArrayOfWritePointers(), frames);
                rack->inputPeak.store(peak(rack->buffer.getArrayOfReadPointers(), count, frames), std::memory_order_relaxed);
                AudioBuffer<float> block(rack->buffer.getArrayOfWritePointers(), count, frames);
                if (rack->enabled.load(std::memory_order_relaxed))
                    for (auto& slot : rack->slots)
                        if (slot->instance && !slot->bypass.load(std::memory_order_relaxed))
                        {
                            rack->midi.clear();
                            slot->instance->processBlock(block, rack->midi);
                        }
                for (int channel = 0; channel < count; ++channel)
                    for (int sample = 0; sample < frames; ++sample)
                        if (!std::isfinite(rack->buffer.getSample(channel, sample)))
                        {
                            clearOutputs(outputs, numOutputs, frames);
                            fault.store(4);
                            return;
                        }
                rack->outputPeak.store(peak(rack->buffer.getArrayOfReadPointers(), count, frames), std::memory_order_relaxed);
                writeRoute(rack->route, rack->buffer.getArrayOfReadPointers(), outputs, numOutputs, frames);
            }
        }
        catch (...)
        {
            clearOutputs(outputs, numOutputs, frames);
            fault.store(2);
        }
        const auto elapsed = Time::highResolutionTicksToSeconds(Time::getHighResolutionTicks() - started);
        if (elapsed > static_cast<double>(frames) / sampleRate) overloads.fetch_add(1, std::memory_order_relaxed);
    }
    void audioDeviceAboutToStart(AudioIODevice* device) override
    {
        if (device && (device->getName() != expectedDevice
                    || device->getCurrentBufferSizeSamples() != blockSize
                    || std::abs(device->getCurrentSampleRate() - sampleRate) > 0.5)) fault.store(1);
    }
    void audioDeviceStopped() override { if (running.load()) fault.store(3); }
    void audioDeviceError(const String&) override { fault.store(3); }
};

class PluginWindow final : public DocumentWindow
{
public:
    PluginWindow(const String& title, AudioProcessorEditor* editor, std::function<void()> closed)
        : DocumentWindow(title, Colour(0xff202024), DocumentWindow::closeButton), onClose(std::move(closed))
    {
        setUsingNativeTitleBar(true);
        setContentOwned(editor, true);
        setResizable(editor->isResizable(), false);
        centreWithSize(std::max(320, editor->getWidth()), std::max(200, editor->getHeight()));
        setVisible(true);
        toFront(true);
    }
    void closeButtonPressed() override
    {
        setVisible(false);
        if (onClose) onClose();
    }
private:
    std::function<void()> onClose;
};

class Host final : private Timer
{
public:
    Host(ProtocolOutput& output, File folder, std::function<void()> quit)
        : wire(output), dataFolder(std::move(folder)), quitApplication(std::move(quit)), alive(std::make_shared<std::atomic<bool>>(true))
    {
        addDefaultFormatsToManager(formats);
        dataFolder.createDirectory();
        loadCatalog();
        startTimer(500);
        startReader();
        emitState(false);
    }
    ~Host() override
    {
        alive->store(false);
        closing.store(true);
        stopTimer();
        if (reader.joinable()) reader.join();
        if (scanner.joinable()) scanner.join();
        stopAudio();
        windows.clear();
    }

private:
    ProtocolOutput& wire;
    File dataFolder;
    std::function<void()> quitApplication;
    std::shared_ptr<std::atomic<bool>> alive;
    AudioPluginFormatManager formats;
    AudioDeviceManager devices;
    Engine engine;
    std::map<String, PluginDescription> catalog;
    std::map<String, std::unique_ptr<PluginWindow>> windows;
    std::thread reader, scanner;
    std::atomic<bool> closing {false};
    std::atomic<int> pending {0};
    bool scanning = false, audioConfigured = false;
    String inputDevice, outputDevice, error;
    int inputCount = 0, outputCount = 0, hardwareLatency = 0;

    void dispatch(std::function<void()> function)
    {
        const std::weak_ptr<std::atomic<bool>> lifetime = alive;
        MessageManager::callAsync([lifetime, action = std::move(function)]
        {
            if (const auto token = lifetime.lock(); token && token->load()) action();
        });
    }
    void event(const char* name, const var& data) { wire.send(obj({{"event", name}, {"data", data}})); }
    void nonFatalError(const String& message)
    {
        error = message;
        event("error", obj({{"message", message}, {"fatal", false}}));
    }
    void startReader()
    {
        reader = std::thread([this]
        {
            std::string buffer;
            char bytes[8192];
            while (!closing.load())
            {
                pollfd descriptor {STDIN_FILENO, POLLIN, 0};
                const auto ready = ::poll(&descriptor, 1, 100);
                if (ready < 0 && errno == EINTR) continue;
                if (ready < 0) break;
                if (ready == 0) continue;
                const auto count = ::read(STDIN_FILENO, bytes, sizeof(bytes));
                if (count <= 0) break;
                buffer.append(bytes, static_cast<std::size_t>(count));
                if (buffer.size() > maxMessageBytes)
                {
                    dispatch([this] { nonFatalError("Richiesta audio oltre il limite di 64 MiB."); quitApplication(); });
                    return;
                }
                std::size_t end;
                while ((end = buffer.find('\n')) != std::string::npos)
                {
                    auto line = buffer.substr(0, end);
                    buffer.erase(0, end + 1);
                    if (line.empty()) continue;
                    if (pending.fetch_add(1) >= 64)
                    {
                        pending.fetch_sub(1);
                        dispatch([this] { nonFatalError("Troppe richieste audio in attesa."); });
                        continue;
                    }
                    dispatch([this, line = std::move(line)] { handleLine(line); pending.fetch_sub(1); });
                }
            }
            dispatch([this] { quitApplication(); });
        });
    }
    void handleLine(const std::string& line)
    {
        int64 id = -1;
        try
        {
            var request;
            require(JSON::parse(String::fromUTF8(line.data(), static_cast<int>(line.size())), request).wasOk()
                    && request.isObject(), "Richiesta JSON non valida.");
            const auto identifier = request.getProperty("id", {});
            require(identifier.isInt() || identifier.isInt64(), "ID richiesta mancante.");
            id = static_cast<int64>(identifier);
            require(id >= 0, "ID richiesta non valido.");
            const auto method = textField(request, "method", false, 64);
            const auto params = request.getProperty("params", obj({}));
            require(params.isObject(), "Parametri della richiesta non validi.");
            const auto result = handle(method, params);
            wire.send(obj({{"id", id}, {"ok", true}, {"result", result}}));
            if (method == "shutdown") dispatch([this] { quitApplication(); });
        }
        catch (const std::exception& exception)
        {
            wire.send(obj({{"id", id}, {"ok", false}, {"error", String(exception.what())}}));
        }
    }
    var handle(const String& method, const var& params)
    {
        if (method == "status") return state(false);
        if (method == "getState") return state(true);
        if (method == "devices") return listDevices();
        if (method == "scanPlugins") { beginScan(); return obj({{"scanning", true}}); }
        if (method == "configureAudio") { configureAudio(params); emitState(false); return state(false); }
        if (method == "startAudio") { startAudio(); emitState(false); return state(false); }
        if (method == "stopAudio") { stopAudio(); emitState(true); return state(false); }
        if (method == "setRack") { setRack(params); emitState(true); return state(false); }
        if (method == "removeRack") { removeRack(textField(params, "id", false, 128)); emitState(true); return state(false); }
        if (method == "openEditor") { openEditor(textField(params, "rackId", false, 128), integerField(params, "slot", 0, maxSlots - 1)); return obj({{"opened", true}}); }
        if (method == "closeEditors") { windows.clear(); emitState(true); return obj({{"closed", true}}); }
        if (method == "restoreState") { restore(params.getProperty("state", {})); emitState(false); return state(false); }
        if (method == "shutdown") { stopAudio(); return obj({{"stopped", true}}); }
        throw std::runtime_error("Comando audio non supportato.");
    }
    void ensureStopped() const
    {
        require(!engine.running.load(), "Ferma l'audio prima di modificare plugin, routing o dispositivo. I bypass restano disponibili durante l'audio.");
    }
    void ensureNotScanning() const { require(!scanning, "Attendi il completamento della scansione VST3."); }

    var audioState() const
    {
        return obj({{"inputDevice", inputDevice}, {"outputDevice", outputDevice},
                    {"sampleRate", engine.sampleRate}, {"bufferSize", engine.blockSize},
                    {"inputChannels", inputCount}, {"outputChannels", outputCount},
                    {"latencySamples", hardwareLatency}, {"configured", audioConfigured}});
    }
    void capture(Slot& slot)
    {
        if (!slot.instance) return;
        MemoryBlock data;
        slot.instance->getStateInformation(data);
        require(data.getSize() <= (maxStateBytes / 4) * 3, "Preset VST3 oltre il limite di 8 MiB Base64.");
        slot.cachedState = Base64::toBase64(data.getData(), data.getSize());
    }
    var state(bool capturePlugins)
    {
        Array<var> pluginValues, rackValues;
        for (const auto& entry : catalog)
        {
            const auto& plugin = entry.second;
            pluginValues.add(obj({{"id", entry.first}, {"name", plugin.name}, {"manufacturer", plugin.manufacturerName},
                                  {"path", plugin.fileOrIdentifier}, {"format", "VST3"}, {"category", plugin.category},
                                  {"version", plugin.version}, {"isInstrument", plugin.isInstrument},
                                  {"inputChannels", plugin.numInputChannels}, {"outputChannels", plugin.numOutputChannels}}));
        }
        for (auto& rack : engine.racks)
        {
            Array<var> slotValues;
            for (auto& slot : rack->slots)
            {
                if (capturePlugins) capture(*slot);
                slotValues.add(obj({{"pluginId", slot->id.isEmpty() ? var() : var(slot->id)},
                                    {"name", slot->name}, {"bypass", slot->bypass.load()},
                                    {"state", slot->cachedState}, {"missing", slot->missing}, {"error", slot->loadError},
                                    {"latencySamples", slot->instance ? slot->instance->getLatencySamples() : 0}}));
            }
            rackValues.add(obj({{"id", rack->route.id.c_str()}, {"name", rack->name},
                                {"inputChannels", numbers(rack->route.inputs)}, {"outputChannels", numbers(rack->route.outputs)},
                                {"enabled", rack->enabled.load()}, {"slots", slotValues},
                                {"latencySamples", rack->latency()}, {"missing", rack->hasMissing()}}));
        }
        return obj({{"running", engine.running.load()}, {"scanning", scanning}, {"audio", audioState()},
                    {"plugins", pluginValues}, {"racks", rackValues}, {"cpu", devices.getCpuUsage()},
                    {"xruns", xrunCount()}, {"error", error}, {"telemetry", false}, {"partial", false}});
    }
    void emitState(bool capturePlugins)
    {
        try { event("state", state(capturePlugins)); }
        catch (const std::exception& exception) { nonFatalError(exception.what()); }
    }
    int64 xrunCount() const
    {
        auto* device = devices.getCurrentAudioDevice();
        return engine.overloads.load() + (device ? std::max(0, device->getXRunCount()) : 0);
    }
    void timerCallback() override
    {
        const auto problem = engine.fault.load();
        if (problem != 0)
        {
            stopAudio();
            nonFatalError(problem == 2 ? "Un plugin ha interrotto l'elaborazione. Audio arrestato."
                         : problem == 4 ? "Un plugin ha restituito campioni audio non validi. Audio arrestato."
                                        : "Il dispositivo audio e cambiato o si e disconnesso. Audio arrestato; riconfigura e riavvia manualmente.");
            emitState(false);
        }
        Array<var> rackMeters;
        for (const auto& rack : engine.racks)
            rackMeters.add(obj({{"id", rack->route.id.c_str()}, {"latencySamples", rack->latency()},
                                {"inputPeak", rack->inputPeak.load()}, {"outputPeak", rack->outputPeak.load()}}));
        event("state", obj({{"telemetry", true}, {"partial", true}, {"running", engine.running.load()},
                            {"scanning", scanning}, {"audio", audioState()}, {"cpu", devices.getCpuUsage()},
                            {"xruns", xrunCount()}, {"rackMeters", rackMeters}, {"error", error}}));
    }

    var listDevices()
    {
        Array<var> result;
        for (auto* type : devices.getAvailableDeviceTypes())
        {
            type->scanForDevices();
            auto names = type->getDeviceNames(true);
            names.addArray(type->getDeviceNames(false));
            names.removeDuplicates(false);
            for (const auto& name : names)
            {
                const bool hasInput = type->getDeviceNames(true).contains(name);
                const bool hasOutput = type->getDeviceNames(false).contains(name);
                std::unique_ptr<AudioIODevice> device(type->createDevice(hasOutput ? name : String(), hasInput ? name : String()));
                if (!device) continue;
                result.add(obj({{"name", name}, {"type", type->getTypeName()},
                                {"inputChannels", strings(device->getInputChannelNames())},
                                {"outputChannels", strings(device->getOutputChannelNames())},
                                {"sampleRates", numbers(device->getAvailableSampleRates())},
                                {"bufferSizes", numbers(device->getAvailableBufferSizes())}}));
            }
        }
        return obj({{"devices", result}, {"audio", audioState()}});
    }
    std::vector<Route> routes() const
    {
        std::vector<Route> result;
        for (const auto& rack : engine.racks) result.push_back(rack->route);
        return result;
    }
    void configureAudio(const var& settings)
    {
        ensureStopped(); ensureNotScanning();
        const auto newInput = textField(settings, "inputDevice");
        const auto newOutput = textField(settings, "outputDevice");
        require(newInput == newOutput, "Usa lo stesso dispositivo USB per ingresso e uscita; i dispositivi aggregati non sono gestiti in questa versione.");
        const auto rateValue = settings.getProperty("sampleRate", 48000);
        require(rateValue.isDouble() || rateValue.isInt() || rateValue.isInt64(), "Sample rate non valido.");
        const double rate = static_cast<double>(rateValue);
        require(std::isfinite(rate) && rate >= 32000 && rate <= 192000, "Sample rate non valido.");
        const int size = integerField(settings, "bufferSize", 16, maxBlockSize, 128);
        AudioIODeviceType* chosenType = nullptr;
        std::unique_ptr<AudioIODevice> probe;
        for (auto* type : devices.getAvailableDeviceTypes())
        {
            type->scanForDevices();
            if (type->getDeviceNames(true).contains(newInput) && type->getDeviceNames(false).contains(newOutput))
            {
                chosenType = type;
                probe.reset(type->createDevice(newOutput, newInput));
                break;
            }
        }
        require(chosenType != nullptr && probe != nullptr, "Dispositivo audio non disponibile. Nessun passaggio automatico agli altoparlanti del Mac.");
        const int ins = std::min(maxChannels, probe->getInputChannelNames().size());
        const int outs = std::min(maxChannels, probe->getOutputChannelNames().size());
        require(ins > 0 && outs > 0, "Il dispositivo deve avere ingressi e uscite audio.");
        const auto routeError = validateRoutes(routes(), ins, outs);
        require(routeError.empty(), String(routeError));
        const auto rates = probe->getAvailableSampleRates();
        const auto sizes = probe->getAvailableBufferSizes();
        require(rates.isEmpty() || std::any_of(rates.begin(), rates.end(), [rate](double item) { return std::abs(item - rate) < 0.5; }), "Sample rate non supportato dal dispositivo.");
        require(sizes.isEmpty() || sizes.contains(size), "Buffer non supportato dal dispositivo.");
        XmlElement setup("DEVICESETUP");
        setup.setAttribute("deviceType", chosenType->getTypeName());
        setup.setAttribute("audioInputDeviceName", newInput);
        setup.setAttribute("audioOutputDeviceName", newOutput);
        setup.setAttribute("audioDeviceRate", rate);
        setup.setAttribute("audioDeviceBufferSize", size);
        setup.setAttribute("audioDeviceInChans", String::repeatedString("1", ins));
        setup.setAttribute("audioDeviceOutChans", String::repeatedString("1", outs));
        probe.reset();
        devices.closeAudioDevice();
        audioConfigured = false;
        const auto failure = devices.initialise(ins, outs, &setup, false);
        if (failure.isNotEmpty()) { devices.closeAudioDevice(); throw std::runtime_error(failure.toStdString()); }
        auto* device = devices.getCurrentAudioDevice();
        require(device != nullptr, "Impossibile aprire il dispositivo audio.");
        const auto actual = devices.getAudioDeviceSetup();
        if (actual.inputDeviceName != newInput || actual.outputDeviceName != newOutput
            || std::abs(device->getCurrentSampleRate() - rate) > 0.5 || device->getCurrentBufferSizeSamples() != size)
        {
            devices.closeAudioDevice();
            throw std::runtime_error("Il dispositivo non ha accettato la configurazione richiesta. Audio arrestato.");
        }
        inputDevice = newInput; outputDevice = newOutput;
        inputCount = ins; outputCount = outs;
        engine.sampleRate = rate; engine.blockSize = size;
        engine.expectedDevice = newOutput;
        hardwareLatency = device->getInputLatencyInSamples() + device->getOutputLatencyInSamples();
        audioConfigured = true;
        error.clear();
        // The device is open, but there is deliberately no processing callback:
        // JUCE clears the output until the explicit startAudio command.
    }
    void startAudio()
    {
        if (engine.running.load()) return;
        ensureNotScanning();
        require(inputDevice.isNotEmpty() && outputDevice.isNotEmpty(), "Configura prima il dispositivo USB.");
        require(!engine.racks.empty(), "Assegna almeno un rack con ingressi e uscite prima di avviare l'audio.");
        if (!audioConfigured || devices.getCurrentAudioDevice() == nullptr)
            configureAudio(obj({{"inputDevice", inputDevice}, {"outputDevice", outputDevice},
                                {"sampleRate", engine.sampleRate}, {"bufferSize", engine.blockSize}}));
        const auto validation = validateRoutes(routes(), inputCount, outputCount);
        require(validation.empty(), validation);
        for (const auto& rack : engine.racks)
            require(!rack->enabled.load() || !rack->hasMissing(), "Un rack attivo contiene plugin mancanti. Disattivalo o ripristina i plugin prima di avviare.");
        engine.prepare();
        engine.overloads.store(0);
        engine.running.store(true, std::memory_order_release);
        devices.addAudioCallback(&engine);
        error.clear();
    }
    void stopAudio()
    {
        const bool wasRunning = engine.running.exchange(false);
        devices.removeAudioCallback(&engine);
        devices.closeAudioDevice();
        if (wasRunning) engine.release();
        audioConfigured = false;
        engine.fault.store(0);
    }

    Rack* findRack(const String& id)
    {
        for (auto& rack : engine.racks) if (rack->route.id == id.toStdString()) return rack.get();
        return nullptr;
    }
    std::unique_ptr<Rack> buildRack(const var& source, bool allowMissing, Rack* previous = nullptr)
    {
        auto rack = std::make_unique<Rack>(routeFrom(source));
        rack->name = source.getProperty("name", String(rack->route.id)).toString().substring(0, 256);
        rack->enabled.store(booleanField(source, "enabled", false));
        const auto slotData = source.getProperty("slots", {});
        const auto* slots = slotData.getArray();
        require(slots && slots->size() <= maxSlots, "Un rack puo contenere al massimo 8 slot.");
        for (const auto& item : *slots)
        {
            require(item.isObject(), "Slot plugin non valido.");
            auto slot = std::make_unique<Slot>();
            const auto identifier = item.getProperty("pluginId", {});
            require(identifier.isVoid() || identifier.isUndefined() || identifier.isString(), "Identificatore plugin non valido.");
            slot->id = identifier.toString();
            require(slot->id.length() <= 128, "Identificatore plugin troppo lungo.");
            slot->name = item.getProperty("name", slot->id).toString().substring(0, 256);
            slot->bypass.store(booleanField(item, "bypass", false));
            const auto saved = item.getProperty("state", String());
            require(saved.isString(), "Stato plugin non valido.");
            slot->cachedState = saved.toString();
            const auto decoded = decodeState(slot->cachedState);
            if (slot->id.isNotEmpty())
            {
                const auto found = catalog.find(slot->id);
                bool existingMissing = false;
                if (previous)
                    for (const auto& oldSlot : previous->slots)
                        if (oldSlot->id == slot->id && oldSlot->missing) existingMissing = true;
                try
                {
                    require(found != catalog.end() && File(found->second.fileOrIdentifier).exists(), "Plugin non disponibile: " + slot->name);
                    require(!found->second.isInstrument, "Questa versione ospita effetti VST3, non strumenti virtuali.");
                    String pluginError;
                    slot->instance = formats.createPluginInstance(found->second, engine.sampleRate, engine.blockSize, pluginError);
                    require(slot->instance != nullptr, pluginError.isEmpty() ? "Impossibile caricare il plugin." : pluginError);
                    slot->name = found->second.name;
                    slot->instance->disableNonMainBuses();
                    auto layout = slot->instance->getBusesLayout();
                    require(layout.inputBuses.size() > 0 && layout.outputBuses.size() > 0, "Il plugin non dispone di un percorso audio ingresso/uscita.");
                    const auto channelSet = rack->route.inputs.size() == 1 ? AudioChannelSet::mono() : AudioChannelSet::stereo();
                    layout.inputBuses.set(0, channelSet); layout.outputBuses.set(0, channelSet);
                    require(slot->instance->setBusesLayout(layout), "Il plugin non supporta il formato mono/stereo del rack.");
                    if (decoded.getSize() > 0) slot->instance->setStateInformation(decoded.getData(), static_cast<int>(decoded.getSize()));
                    // Some presets change a plugin's buses. Enforce the selected
                    // mapping again before the plugin can enter the audio path.
                    require(slot->instance->setBusesLayout(layout), "Il preset modifica il formato audio del plugin.");
                    capture(*slot);
                }
                catch (const std::exception& exception)
                {
                    if (!allowMissing && !existingMissing) throw;
                    slot->instance.reset(); slot->missing = true; slot->loadError = exception.what();
                    rack->enabled.store(false);
                }
            }
            else
            {
                slot->name.clear(); slot->cachedState.clear(); slot->bypass.store(false);
            }
            rack->slots.push_back(std::move(slot));
        }
        return rack;
    }
    void setRack(const var& source)
    {
        ensureNotScanning();
        const auto route = routeFrom(source);
        auto* existing = findRack(route.id);
        const auto slotData = source.getProperty("slots", {});
        const auto* requestedSlots = slotData.getArray();
        require(requestedSlots && requestedSlots->size() <= maxSlots, "Slot rack non validi.");
        if (engine.running.load())
        {
            require(existing && existing->route.inputs == route.inputs && existing->route.outputs == route.outputs
                    && existing->slots.size() == static_cast<std::size_t>(requestedSlots->size()),
                    "Ferma l'audio prima di modificare il routing o gli slot.");
            for (int i = 0; i < requestedSlots->size(); ++i)
                require((*requestedSlots)[i].getProperty("pluginId", {}).toString() == existing->slots[static_cast<std::size_t>(i)]->id,
                        "Ferma l'audio prima di cambiare plugin.");
            const bool enabled = booleanField(source, "enabled", false);
            require(!enabled || !existing->hasMissing(), "Il rack contiene plugin mancanti e non puo essere abilitato.");
            std::array<bool, maxSlots> bypass {};
            for (int i = 0; i < requestedSlots->size(); ++i)
                bypass[static_cast<std::size_t>(i)] = booleanField((*requestedSlots)[i], "bypass", false);
            // State blobs are intentionally ignored for this live-only update.
            // Reloading presets or changing graph structure requires Stop.
            existing->enabled.store(enabled);
            for (std::size_t i = 0; i < existing->slots.size(); ++i) existing->slots[i]->bypass.store(bypass[i]);
            existing->name = source.getProperty("name", existing->name).toString().substring(0, 256);
            return;
        }
        auto allRoutes = routes();
        allRoutes.erase(std::remove_if(allRoutes.begin(), allRoutes.end(), [&route](const Route& item) { return item.id == route.id; }), allRoutes.end());
        allRoutes.push_back(route);
        const auto validation = validateRoutes(allRoutes, audioConfigured ? inputCount : maxChannels, audioConfigured ? outputCount : maxChannels);
        require(validation.empty(), validation);
        auto replacement = buildRack(source, false, existing);
        closeRackEditors(route.id);
        for (auto& rack : engine.racks)
            if (rack.get() == existing) { rack = std::move(replacement); return; }
        engine.racks.push_back(std::move(replacement));
    }
    void removeRack(const String& id)
    {
        ensureStopped(); ensureNotScanning();
        closeRackEditors(id);
        engine.racks.erase(std::remove_if(engine.racks.begin(), engine.racks.end(), [&id](const auto& rack)
        {
            return rack->route.id == id.toStdString();
        }), engine.racks.end());
    }
    void closeRackEditors(const String& id)
    {
        const auto prefix = id + ":";
        for (auto item = windows.begin(); item != windows.end();)
            if (item->first.startsWith(prefix)) item = windows.erase(item); else ++item;
    }
    void openEditor(const String& id, int index)
    {
        ensureNotScanning();
        auto* rack = findRack(id);
        require(rack && index < static_cast<int>(rack->slots.size()), "Slot non disponibile.");
        auto& slot = *rack->slots[static_cast<std::size_t>(index)];
        require(slot.instance != nullptr, "Nessun plugin disponibile in questo slot.");
        const auto key = id + ":" + String(index);
        const auto previous = windows.find(key);
        if (previous != windows.end()) { previous->second->setVisible(true); previous->second->toFront(true); return; }
        auto* editor = slot.instance->createEditorAndMakeActive();
        if (!editor) editor = new GenericAudioProcessorEditor(*slot.instance);
        windows[key] = std::make_unique<PluginWindow>(rack->name + " - " + slot.name, editor, [this, key]
        {
            dispatch([this, key] { windows.erase(key); emitState(true); });
        });
    }
    void restore(const var& saved)
    {
        ensureStopped(); ensureNotScanning();
        require(saved.isObject(), "Sessione audio non valida.");
        const auto rackData = saved.getProperty("racks", var(Array<var>()));
        const auto* requested = rackData.getArray();
        require(requested && requested->size() <= maxRacks, "Sessione audio con troppi rack.");
        std::vector<Route> routing;
        for (const auto& value : *requested) routing.push_back(routeFrom(value));
        const auto validation = validateRoutes(routing);
        require(validation.empty(), validation);
        const auto audio = saved.getProperty("audio", obj({}));
        require(audio.isObject(), "Configurazione audio della sessione non valida.");
        const auto newInput = audio.getProperty("inputDevice", String());
        const auto newOutput = audio.getProperty("outputDevice", String());
        require(newInput.isString() && newOutput.isString(), "Nomi dispositivo non validi.");
        const auto rateValue = audio.getProperty("sampleRate", 48000);
        require(rateValue.isDouble() || rateValue.isInt() || rateValue.isInt64(), "Sample rate della sessione non valido.");
        const double rate = static_cast<double>(rateValue);
        require(std::isfinite(rate) && rate >= 32000 && rate <= 192000, "Sample rate della sessione non valido.");
        const int size = integerField(audio, "bufferSize", 16, maxBlockSize, 128);
        std::vector<std::unique_ptr<Rack>> rebuilt;
        for (const auto& value : *requested) rebuilt.push_back(buildRack(value, true));
        windows.clear();
        stopAudio();
        engine.racks = std::move(rebuilt);
        engine.sampleRate = rate; engine.blockSize = size;
        inputDevice = newInput.toString(); outputDevice = newOutput.toString();
        inputCount = 0; outputCount = 0; hardwareLatency = 0;
        error.clear();
        // Never open a device or start processing from a restored project.
        // Saved plugin paths supplied by the UI are ignored; only the local
        // scanner catalogue can select code to load.
    }

    void loadCatalog()
    {
        const auto file = dataFolder.getChildFile("plugin-catalog.xml");
        if (!file.existsAsFile() || file.getSize() > 16 * 1024 * 1024) return;
        auto xml = XmlDocument::parse(file);
        if (!xml || !xml->hasTagName("SCULPT_VST3_CATALOG")) return;
        for (auto* child : xml->getChildIterator())
        {
            PluginDescription description;
            if (description.loadFromXml(*child) && description.pluginFormatName == "VST3") catalog[pluginId(description)] = description;
        }
    }
    void saveCatalog()
    {
        XmlElement xml("SCULPT_VST3_CATALOG");
        for (const auto& item : catalog) xml.addChildElement(item.second.createXml().release());
        const auto target = dataFolder.getChildFile("plugin-catalog.xml");
        TemporaryFile temporary(target);
        require(xml.writeTo(temporary.getFile()), "Impossibile salvare il catalogo VST3.");
        require(temporary.overwriteTargetFileWithTemporary(), "Impossibile aggiornare il catalogo VST3.");
    }
    void beginScan()
    {
        ensureStopped(); ensureNotScanning();
        if (scanner.joinable()) scanner.join();
        scanning = true;
        emitState(false);
        scanner = std::thread([this]
        {
            StringArray paths;
            FileSearchPath locations;
            for (auto* format : formats.getFormats()) if (format->getName() == "VST3") locations = format->getDefaultLocationsToSearch();
            for (int i = 0; i < locations.getNumPaths(); ++i)
            {
                Array<File> found;
                locations[i].findChildFiles(found, File::findDirectories, true, "*.vst3");
                for (const auto& candidate : found) paths.addIfNotAlreadyThere(candidate.getFullPathName());
            }
            std::map<String, PluginDescription> scanned;
            for (int index = 0; index < paths.size() && !closing.load(); ++index)
            {
                const auto path = paths[index];
                dispatch([this, index, total = paths.size(), path]
                {
                    event("scanProgress", obj({{"current", index}, {"total", total}, {"path", path}}));
                });
                ChildProcess process;
                // A shell bundle may expose hundreds of effects. Return its
                // catalogue through a bounded temporary file: waiting for an
                // undrained stdout pipe would deadlock once that pipe is full.
                TemporaryFile resultFile(dataFolder.getChildFile("scan-result.json"));
                const StringArray args {File::getSpecialLocation(File::currentExecutableFile).getFullPathName(),
                                        "--scan-one", path, "--scan-result", resultFile.getFile().getFullPathName()};
                String failure;
                if (!process.start(args, 0)) failure = "Impossibile avviare lo scanner isolato.";
                else
                {
                    int elapsed = 0;
                    while (process.isRunning() && elapsed < 30000 && !closing.load())
                    {
                        process.waitForProcessToFinish(100); elapsed += 100;
                    }
                    if (process.isRunning())
                    {
                        process.kill();
                        process.waitForProcessToFinish(1000);
                        failure = "Scansione scaduta o annullata.";
                    }
                    if (failure.isEmpty() && process.getExitCode() != 0) failure = "Plugin non compatibile o scanner interrotto.";
                    bool received = false;
                    if (failure.isEmpty() && resultFile.getFile().existsAsFile())
                    {
                        if (resultFile.getFile().getSize() > 16 * 1024 * 1024) failure = "Risultato scanner oltre il limite di 16 MiB.";
                        else
                        {
                            const auto result = JSON::parse(resultFile.getFile().loadFileAsString());
                            const auto descriptions = result.getProperty("plugins", var(Array<var>()));
                            if (const auto* values = descriptions.getArray())
                                for (const auto& descriptionValue : *values)
                                {
                                    auto xml = XmlDocument::parse(descriptionValue.toString());
                                    PluginDescription description;
                                    if (xml && description.loadFromXml(*xml) && description.pluginFormatName == "VST3")
                                    {
                                        scanned[pluginId(description)] = description;
                                        received = true;
                                    }
                                }
                        }
                    }
                    if (!received && failure.isEmpty()) failure = "Nessun effetto VST3 compatibile trovato.";
                }
                if (failure.isNotEmpty()) dispatch([this, path, failure, index, total = paths.size()]
                {
                    event("scanProgress", obj({{"current", index + 1}, {"total", total}, {"path", path}, {"error", failure}}));
                });
            }
            dispatch([this, scanned = std::move(scanned), total = paths.size()]() mutable
            {
                catalog = std::move(scanned);
                scanning = false;
                try { saveCatalog(); } catch (const std::exception& exception) { nonFatalError(exception.what()); }
                event("scanProgress", obj({{"current", total}, {"total", total}, {"done", true}}));
                emitState(false);
            });
        });
    }
};

static int scanOne(ProtocolOutput& wire, const String& path, const File& resultFile = {})
{
    AudioPluginFormatManager manager;
    addDefaultFormatsToManager(manager);
    Array<var> values;
    for (auto* format : manager.getFormats())
        if (format->getName() == "VST3")
        {
            OwnedArray<PluginDescription> descriptions;
            format->findAllTypesForFile(descriptions, path);
            for (const auto* description : descriptions)
                if (!description->isInstrument && description->numInputChannels > 0 && description->numOutputChannels > 0)
                    values.add(description->createXml()->toString());
        }
    const auto result = JSON::toString(obj({{"plugins", values}}), true);
    require(result.getNumBytesAsUTF8() <= 16 * 1024 * 1024, "Risultato scanner oltre il limite di 16 MiB.");
    if (resultFile.getFullPathName().isNotEmpty())
        require(resultFile.replaceWithText(result), "Impossibile salvare il risultato dello scanner.");
    else
        wire.sendLine("SCULPT_SCAN_RESULT " + result);
    return values.isEmpty() ? 2 : 0;
}

static int testPlugin(ProtocolOutput& wire, const String& path)
{
    AudioPluginFormatManager manager;
    addDefaultFormatsToManager(manager);
    OwnedArray<PluginDescription> descriptions;
    for (auto* format : manager.getFormats())
        if (format->getName() == "VST3") format->findAllTypesForFile(descriptions, path);
    require(!descriptions.isEmpty(), "Fixture VST3 non trovata dallo scanner.");
    auto moved = *descriptions[0];
    moved.fileOrIdentifier = "/another/vst3/folder/SculptWingAudioTestGain.vst3";
    require(pluginId(moved) == pluginId(*descriptions[0]), "Identita VST3 dipendente dal percorso di installazione.");
    String failure;
    auto plugin = manager.createPluginInstance(*descriptions[0], 48000.0, 64, failure);
    require(plugin != nullptr, failure.isEmpty() ? "Caricamento VST3 fallito." : failure);
    require(plugin->getName().contains("SculptWingAudioTestGain"), "--test-plugin richiede la fixture SculptWingAudioTestGain.");
    auto layout = plugin->getBusesLayout();
    layout.inputBuses.set(0, AudioChannelSet::mono());
    layout.outputBuses.set(0, AudioChannelSet::mono());
    require(plugin->setBusesLayout(layout), "Il plugin fixture non supporta mono.");
    plugin->prepareToPlay(48000.0, 64);
    AudioBuffer<float> mono(1, 64);
    for (int frame = 0; frame < 64; ++frame) mono.setSample(0, frame, 0.4f);
    MidiBuffer midi;
    plugin->processBlock(mono, midi);
    require(std::abs(mono.getSample(0, 63) - 0.2f) < 0.00001f, "Elaborazione mono VST3 errata.");
    plugin->releaseResources();
    layout.inputBuses.set(0, AudioChannelSet::stereo());
    layout.outputBuses.set(0, AudioChannelSet::stereo());
    require(plugin->setBusesLayout(layout), "Il plugin fixture non supporta stereo.");
    MemoryBlock original;
    plugin->getStateInformation(original);
    const auto encoded = Base64::toBase64(original.getData(), original.getSize());
    const auto restored = decodeState(encoded);
    require(restored == original, "Serializzazione Base64 dello stato VST3 non reversibile.");

    auto rack = std::make_unique<Rack>(Route {"test", {0, 1}, {1, 2}});
    auto slot = std::make_unique<Slot>();
    slot->instance = std::move(plugin);
    auto* instance = slot->instance.get();
    auto* bypass = &slot->bypass;
    rack->slots.push_back(std::move(slot));
    rack->enabled.store(true);
    auto* enabled = &rack->enabled;
    Engine engine;
    engine.blockSize = 64;
    engine.racks.push_back(std::move(rack));
    engine.prepare();
    engine.running.store(true);
    std::array<float, 64> left {}, right {}, out0 {}, out1 {}, out2 {};
    left.fill(0.2f); right.fill(-0.6f);
    const float* inputs[] {left.data(), right.data()};
    float* outputs[] {out0.data(), out1.data(), out2.data()};
    const auto renderAndCheck = [&](float gain)
    {
        engine.audioDeviceIOCallbackWithContext(inputs, 2, outputs, 3, 64, {});
        require(engine.fault.load() == 0, "Errore callback durante il test VST3.");
        for (int frame = 0; frame < 64; ++frame)
        {
            require(std::abs(out1[frame] - 0.2f * gain) < 0.00001f
                 && std::abs(out2[frame] + 0.6f * gain) < 0.00001f,
                    "Elaborazione VST3 o mapping stereo errati.");
            require(out0[frame] == 0.0f, "Audio su uscita non assegnata.");
        }
    };
    renderAndCheck(0.5f);
    AudioProcessorParameter* gainParameter = nullptr;
    for (auto* parameter : instance->getParameters())
        if (parameter->getName(128) == "Gain") gainParameter = parameter;
    require(gainParameter != nullptr, "Parametro Gain VST3 non esposto dall'host.");
    gainParameter->setValueNotifyingHost(0.25f);
    renderAndCheck(0.25f);
    instance->setStateInformation(restored.getData(), static_cast<int>(restored.getSize()));
    renderAndCheck(0.5f);
    bypass->store(true); renderAndCheck(1.0f);
    bypass->store(false); enabled->store(false); renderAndCheck(1.0f);
    engine.fault.store(3);
    engine.audioDeviceIOCallbackWithContext(inputs, 2, outputs, 3, 64, {});
    require(out1[0] == 0.0f && out2[0] == 0.0f, "Un errore dispositivo non silenzia immediatamente l'audio.");
    engine.fault.store(0);
    engine.running.store(false);
    engine.audioDeviceIOCallbackWithContext(inputs, 2, outputs, 3, 64, {});
    require(out1[0] == 0.0f && out2[0] == 0.0f, "Engine fermo non silenzioso.");
    engine.release();
    wire.sendLine("Sculpt Wing VST3 smoke: scan, load, mono/stereo processing, state restore, slot/rack bypass and stopped silence passed.");
    return 0;
}

class Application final : public JUCEApplication
{
public:
    const String getApplicationName() override { return "SculptWingAudio"; }
    const String getApplicationVersion() override { return "0.7.2"; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void initialise(const String& commandLine) override
    {
        wire = std::make_unique<ProtocolOutput>();
        const auto arguments = StringArray::fromTokens(commandLine, true);
        const auto scan = arguments.indexOf("--scan-one");
        if (scan >= 0)
        {
            try
            {
                const auto result = arguments.indexOf("--scan-result");
                const auto target = result >= 0 && result + 1 < arguments.size() ? File(arguments[result + 1].unquoted()) : File();
                setApplicationReturnValue(scan + 1 < arguments.size() ? scanOne(*wire, arguments[scan + 1].unquoted(), target) : 2);
            }
            catch (...) { setApplicationReturnValue(3); }
            quit(); return;
        }
        const auto test = arguments.indexOf("--test-plugin");
        if (test >= 0)
        {
            try { setApplicationReturnValue(test + 1 < arguments.size() ? testPlugin(*wire, arguments[test + 1].unquoted()) : 2); }
            catch (const std::exception& exception)
            {
                wire->sendLine("VST3 smoke failed: " + String(exception.what()));
                setApplicationReturnValue(4);
            }
            quit(); return;
        }
        File folder = File::getSpecialLocation(File::userApplicationDataDirectory).getChildFile("SculptWingAudio");
        const auto location = arguments.indexOf("--data-dir");
        if (location >= 0 && location + 1 < arguments.size()) folder = File(arguments[location + 1].unquoted());
        host = std::make_unique<Host>(*wire, folder, [] { JUCEApplication::quit(); });
    }
    void shutdown() override { host.reset(); wire.reset(); }
    void systemRequestedQuit() override { quit(); }
private:
    std::unique_ptr<ProtocolOutput> wire;
    std::unique_ptr<Host> host;
};
}

JUCE_CREATE_APPLICATION_DEFINE(sculpt::Application)

int main(int argc, char* argv[])
{
    for (int i = 1; i < argc; ++i)
        if (std::strcmp(argv[i], "--self-test") == 0) return sculpt::runRoutingSelfTest();
    juce::JUCEApplicationBase::createInstance = &juce_CreateApplication;
    return juce::JUCEApplicationBase::main(argc, const_cast<const char**>(argv));
}
