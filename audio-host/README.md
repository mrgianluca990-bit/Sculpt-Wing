# Sculpt Wing native audio host

`SculptWingAudio` is a real, separate-process VST3 effect host. CoreAudio captures
and returns the WING's USB audio in this process. Electron sends control messages
and receives state; audio samples never pass through JavaScript or IPC. The
existing Ethernet connection continues to control the console.

The same helper also contains a manual measurement engine adapted from the
GPL-3.0-or-later math in Open Sound Meter v1.5.2. It shares the existing audio
device and callback with VST3 processing; it does not launch the OSM Qt app or
another bridge process. The pinned source, originals, checksums and adaptation
notes are in `vendor/open-sound-meter/`.

## Build

The primary target is macOS Apple Silicon. CMake 3.22+, Xcode command line tools
and a C++17 compiler are required. JUCE 9.0.5 is pinned to the verified commit
`d60b7a78030661574a615b586d9325ba7a7fa7dd`. `SCULPT_JUCE_SOURCE` may point to an
existing checkout for offline development.

```sh
cmake -S audio-host -B audio-host/build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64
cmake --build audio-host/build --config Release --target SculptWingAudio --parallel 2
```

Bundle:

`audio-host/build/SculptWingAudio_artefacts/Release/SculptWingAudio.app`

The executable is `Contents/MacOS/SculptWingAudio`. The Electron package copies
the complete bundle outside ASAR into `resources/audio-host/`. The helper has a
microphone usage description and `LSUIElement` so its plugin editor windows do
not add another Dock application. Signing must include the helper executable
and bundle. When enabling hardened runtime for distribution, the host that
loads third-party VST3 code needs the appropriate library-validation exception.
The Electron app must request microphone permission before opening CoreAudio.

JUCE is dual licensed under the JUCE licence and AGPLv3. This project does not
change the repository's licence or purchase a commercial licence. Keep the
applicable JUCE and bundled VST3 SDK notices with releases, using the licensing
arrangement selected for the product. The VST3 SDK bundled by this JUCE release
is 3.8, under MIT.

CMake copies the original JUCE licence, its SPDX dependency inventory, VST3 SDK
notices and the notices of the vendored core/graphics components into
`SculptWingAudio.app/Contents/Resources/ThirdParty/`. These upstream notices are
preserved verbatim and do not select a licence for Sculpt Wing.

## Tests

Routing validation and the exact input/output copy routines used by the audio
callback can be tested without JUCE, a GUI, or audio hardware:

```sh
c++ -std=c++17 -O2 audio-host/Tests/RoutingTest.cpp -o /tmp/sculpt-wing-audio-routing-test
/tmp/sculpt-wing-audio-routing-test
```

The focused measurement test also needs only a C++17 compiler and threads:

```sh
c++ -std=c++17 -O2 -pthread audio-host/Tests/AnalysisTest.cpp audio-host/Source/Analysis.cpp -o /tmp/sculpt-wing-osm-analysis-test
/tmp/sculpt-wing-osm-analysis-test
```

It checks known gain and positive/negative delay, analyzer compensation,
coherence, mic-response correction, raw RMS/SPL offset, silence/clipping,
independent-noise and single-tone rejection, unexcited FFT bins, and queued
capture. This does not replace a CoreAudio/USB test on a Mac with the mixer.

The helper also supports `--self-test`, before any GUI initialisation. It checks
mono/stereo routing, unassigned output silence, missing input silence, channel
bounds, duplicate outputs, duplicate rack IDs, and rack capacity.

The optional test fixture exercises actual VST3 loading and processing rather
than substituting an internal fake processor. Build and run on the same CPU
architecture (an Intel Mac cannot execute the arm64 helper):

```sh
cmake -S audio-host -B audio-host/build-test -DCMAKE_BUILD_TYPE=Release -DSCULPT_AUDIO_BUILD_TEST_PLUGIN=ON
cmake --build audio-host/build-test --config Release --parallel 2
audio-host/build-test/SculptWingAudio_artefacts/Release/SculptWingAudio.app/Contents/MacOS/SculptWingAudio --self-test
audio-host/build-test/SculptWingAudio_artefacts/Release/SculptWingAudio.app/Contents/MacOS/SculptWingAudio --test-plugin audio-host/build-test/SculptWingAudioTestGain_artefacts/Release/VST3/SculptWingAudioTestGain.vst3
```

`--test-plugin` verifies scan/load, mono and stereo processing, serialised state
restore, slot and rack bypass, USB channel mapping, and silence when stopped.
When Python 3 is available, `ctest --test-dir audio-host/build-test --output-on-failure`
also launches the real helper and fixture to check the JSON protocol, isolated
scanner, native editor open/reopen/close with audio stopped, preset capture/restore,
rejected output collisions, retained missing plugins and stopped session restoration.
The editor checks require a graphical session and are opt-in with
`SCULPT_TEST_NATIVE_EDITORS=1`; Linux also enables them when `DISPLAY` is set.
Normal CI runs on a Mac skip them explicitly, since a GUI session cannot be
assumed. It opens no audio device. The fixture is a test effect and is not bundled with
the user-facing application. USB round-trip latency, vendor plugin compatibility
and behaviour during hardware disconnects still require a real Mac and WING.

## Control protocol

Launch with `--stdio --data-dir <application-user-data/audio-host>`. Requests and
responses are one JSON object per line. The app owns the child's standard input
and output. Vendor writes to stdout are redirected to stderr; protocol output
uses a separate inherited descriptor. No network listener is opened.

Request: `{ "id": 1, "method": "status", "params": {} }`

Success: `{ "id": 1, "ok": true, "result": { ... } }`

Failure: `{ "id": 1, "ok": false, "error": "Readable explanation" }`

Events: `{ "event": "state" | "error" | "scanProgress", "data": { ... } }`

Methods:

| Method | Parameters / behaviour |
|---|---|
| `status` | Returns the full state using cached plugin preset blobs. |
| `getState` | Captures live plugin preset state on the message thread and returns full state. Does not emit another state event. |
| `devices` | Lists audio devices, input/output channel names, supported sample rates and buffers without starting audio. |
| `scanPlugins` | Returns `{scanning:true}` immediately, then progress and final state events. Audio must be stopped. |
| `configureAudio` | `{inputDevice,outputDevice,sampleRate,bufferSize}`. Opens only the explicitly selected input/output pair and leaves outputs silent. CoreAudio supports distinct names, including the Mac's built-in microphone and speakers. |
| `startAudio` / `stopAudio` | Explicitly starts / stops processing. Start requires a device and at least one routed rack. |
| `configureAnalysis` | `{measurementChannel,referenceChannel,fftSize?,averages?,delayMs?,calibration?,calibrationEnabled?,levelOffsetDb?}`. Analysis must be stopped. Returns accepted settings, including calibration points. |
| `startAnalysis` / `stopAnalysis` | Starts / stops manual capture. Start needs the configured audio device and two distinct inputs; no VST rack is required. |
| `getAnalysis` | Returns bounded measurement arrays and metadata. No audio samples, mixer writes or implicit start. |
| `setRack` | `{id,name?,placement?,inputChannels,outputChannels,enabled,slots:[{pluginId,bypass,state?,name?}]}`. Channel numbers are zero based. `placement` is `null`, `pre`, `insert1`, or `insert2`; legacy omission means `null`. |
| `removeRack` | `{id}`; audio must be stopped. |
| `openEditor` | `{rackId,slot}`; slot is zero based. Opens the plugin's actual native editor or a generic parameter editor if unavailable. |
| `closeEditors` | Closes native editors and captures updated presets. |
| `restoreState` | `{state}`. Preserves missing plugin slots and their preset data, disables affected racks, never opens a device or starts audio. |
| `shutdown` | Stops audio, acknowledges, then quits. |

There are at most 16 racks, 8 slots per rack, 48 device inputs and outputs, and
one or two channels per rack. Two racks cannot write to the same USB output,
including bypassed racks. Multiple racks may read a common input. MIDI and
instruments and sidechain inputs are outside this version. CoreAudio may combine
the explicitly selected input and output internally; no manual aggregate setup
is required for the Mac's built-in devices. Other drivers must report support
for separate input/output devices. Listing devices never configures audio.

`enabled:false` is **rack bypass**: while the engine is running, the assigned USB
input passes directly to its output. A slot's `bypass:true` skips that processor.
With the engine stopped every output is silent. Bypasses and rack names may be
changed during processing using `setRack` only when plugin identities, slot
count and channel mapping are unchanged; preset blobs in that live update are
ignored. Loading/removing/reordering plugins, applying preset blobs and changing
device/routing require Stop. This avoids hidden graph rebuilds during a show.

Placement is persisted channel metadata; the host does not write WING routing.
Changing placement also requires Stop. The app's explicit WING routing manager
reads, previews, applies and restores the matching mixer patch separately.
PRE preserves the original physical source for headamp control and uses a USB
return through ALT; it does not consume either insert point. Insert 1/2 use
the console's External effect and reserve a free FX slot. Saving or restoring
a host session never replays a mixer patch.

State blobs use standard Base64, up to 8 MiB encoded per slot and a 64 MiB JSON
message limit. The catalogue is local XML populated only by the scanner;
`pluginId` values (`vst3-` plus 16 hex digits) select entries from this catalogue.
File paths supplied in project metadata never cause arbitrary plugin loading.
Electron owns session persistence. The helper only stores its plugin catalogue.

Full state events have `telemetry:false, partial:false`. A separate lightweight
state event is sent every 500 ms with `telemetry:true, partial:true`, running
status, audio setup, CPU, xrun/overload count, and `rackMeters`. These events
contain no plugin state blobs and must not replace the persisted full session.
`cpu` is a fraction of the callback budget; `xruns` combines reported device
xruns and callbacks whose execution exceeded their deadline. It is a diagnostic
count, not a sample-accurate inventory of every audible dropout.

## Manual Open Sound Meter analysis

Analysis and VST processing have independent running flags. Starting or stopping
one preserves the other; the device closes when both are stopped. Device
changes and session restoration require both to stop. A device fault or helper
shutdown stops both. Saved analysis settings never automatically start capture.
The existing top-level `running` continues to mean VST processing; analysis
metadata is under `analysis`. Full state and periodic telemetry omit analysis
curves. Call `getAnalysis` only while the panel is open to retrieve those curves.

The microphone and reference are two distinct zero-based USB inputs in 0..47,
bounded further by the selected device. The UI can describe a reference as a
channel, bus or master; the actual signal must already reach the selected USB
input through the console's patch. This engine does not alter console routing,
levels, EQ, delay, matrices or mute. It has no signal generator.

The callback copies the selected inputs to a preallocated single-producer,
single-consumer ring. It performs no FFT, allocation, locks, JSON or file I/O.
A worker applies the OSM-derived Hann window and FFT and averages cross/auto
spectra over a bounded FIFO. Transfer magnitude/phase, amplitude coherence
(`|Gmr| / sqrt(Gmm*Grr)`, following OSM), RTA and a regularized H1 impulse are
returned as at most 1024 points per curve. Dropouts invalidate the averages;
old results become stale. The RTA is a windowed per-bin RMS spectrum, not a
third-octave or standardized noise measurement.

FFT sizes are 16384 (default), 32768 and 65536; averaging depth is 2..32
(default 8). Analyzer delay is limited to ±500 ms. Positive delay shifts the
reference to match a later microphone arrival. The displayed phase and impulse
are relative to this analyzer delay. `estimatedDelayMs` adds the residual
impulse lag to it, preserving the original path delay. It is the strongest
impulse peak, not a decision about which speaker or reflection to align.
`delaySearchMs` is the residual search limit (approximately half the FFT window).

The delay estimate is withheld when the signal is clipped, absent, stale,
insufficiently coherent, near the FFT limit, too narrow-band, or has no distinct
impulse peak. The current confidence gate requires at least 500 Hz of excited
reference bandwidth (and 16 bins), plus a peak at least 18 dB above the impulse
RMS. IFFT bins are regularized relative to reference power and tapered by
coherence, preventing unexcited bins from amplifying measurement noise into a
false delay. A single tone or a limited sub-band reference may still show a
useful transfer curve while returning no reliable delay. Use `delayQuality`
alongside `estimatedDelayMs`; never convert a null estimate to zero. These
conservative gates are diagnostics, not a calibrated uncertainty guarantee.

Mic calibration accepts up to 4096 strictly ascending frequency points from
0..192000 Hz (excluding zero), gain ±120 dB and optional phase ±3600 degrees.
The file describes the microphone's response; its interpolated gain and phase
are subtracted from the frequency-domain plots. The impulse and arrival estimate
retain the raw path, including the microphone, and do not apply this response
file. `measurementRmsDb` is always the raw, unwindowed RMS in dBFS.
`splDb` is available only after an explicit level offset has been entered or
calibrated: raw RMS + `levelOffsetDb`. It is unweighted, not dBA/dBC or a
certified sound-level meter. RTA, raw meters and calibrated SPL remain available
when the reference is absent and transfer/delay are invalid.

`getAnalysis` includes the settings summary, sample rate, sequence, validity,
staleness, quality, raw peak/RMS meters, optional SPL and delay,
`referenceBandwidthHz`, `delayPeakToRmsDb`, and `frequency`, `magnitudeDb`,
`phaseDeg`, `coherence`, `rtaDb`, `impulse:{timeMs,value}` arrays. Calibration
points are returned only by `configureAnalysis`, keeping periodic IPC bounded.

## Plugin scanning and lifetime

Each candidate in standard VST3 directories is inspected by a separate instance
of this executable (`--scan-one <path>`). The controller kills a scan after 30
seconds and proceeds to other files when a plugin crashes or hangs. Scanning
does not run in the audio process. Effects with unsupported architectures or
layouts are reported rather than replaced silently.

Audio has preallocated per-rack buffers. The callback does not construct JSON,
query device lists, access files or interact with Electron. GUI/editor work and
preset capture happen on the native message thread. All plugins in the running
host still share a process: a plugin crash can terminate audio while Electron
remains available. Host bypass does not provide mixer failover or recover audio
after a Mac/USB failure; the WING's insert/routing bypass is a separate operation.

Reported hardware latency is the device's input + output latency. Rack latency
is the sum of active plugin latency reports. This is not a physical round-trip
measurement. No cross-rack or mixer dry-path delay compensation is applied in
this version. Bypass can change latency and is not advertised as click-free.

## Reference documentation

- [JUCE 9.0.5 source](https://github.com/juce-framework/JUCE/tree/d60b7a78030661574a615b586d9325ba7a7fa7dd)
- [JUCE CMake API](https://github.com/juce-framework/JUCE/blob/master/docs/CMake%20API.md)
- [JUCE AudioPluginFormatManager](https://docs.juce.com/master/classjuce_1_1AudioPluginFormatManager.html)
- [JUCE AudioDeviceManager](https://docs.juce.com/master/classjuce_1_1AudioDeviceManager.html)
- [Electron Builder v26 application contents](https://www.electron.build/v26/docs/contents/)
