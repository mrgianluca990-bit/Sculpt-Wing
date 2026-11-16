# Sculpt Wing native audio host

`SculptWingAudio` is a real, separate-process VST3 effect host. CoreAudio captures
and returns the WING's USB audio in this process. Electron sends control messages
and receives state; audio samples never pass through JavaScript or IPC. The
existing Ethernet connection continues to control the console.

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
scanner, preset capture/restore, rejected output collisions, retained missing
plugins and stopped session restoration.
It opens no audio device. The fixture is a test effect and is not bundled with
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
| `configureAudio` | `{inputDevice,outputDevice,sampleRate,bufferSize}`. Requires the same input/output device, opens explicitly selected channels, leaves outputs silent. |
| `startAudio` / `stopAudio` | Explicitly starts / stops processing. Start requires a device and at least one routed rack. |
| `setRack` | `{id,name?,placement?,inputChannels,outputChannels,enabled,slots:[{pluginId,bypass,state?,name?}]}`. Channel numbers are zero based. `placement` is `null`, `pre`, `insert1`, or `insert2`; legacy omission means `null`. |
| `removeRack` | `{id}`; audio must be stopped. |
| `openEditor` | `{rackId,slot}`; slot is zero based. Opens the plugin's actual native editor or a generic parameter editor if unavailable. |
| `closeEditors` | Closes native editors and captures updated presets. |
| `restoreState` | `{state}`. Preserves missing plugin slots and their preset data, disables affected racks, never opens a device or starts audio. |
| `shutdown` | Stops audio, acknowledges, then quits. |

There are at most 16 racks, 8 slots per rack, 48 device inputs and outputs, and
one or two channels per rack. Two racks cannot write to the same USB output,
including bypassed racks. Multiple racks may read a common input. MIDI and
instruments, sidechain inputs and aggregate devices are outside this version.

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
