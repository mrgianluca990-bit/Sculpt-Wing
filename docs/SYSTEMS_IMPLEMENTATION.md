# Sculpt Wing 0.4 — global console modules

Implemented in `dist/systems.js` and `dist/systems.css`. The seven pages use the same `SculptController` and `SculptDesk` state as the faders, channel editor, FX rack, and I/O page. This module does not create a separate storage system.

## Implemented pages

| Page | Editable state and working demo interactions |
| --- | --- |
| DCA / Mute Groups | 16 named DCA with level, mute, solo, member selection and spill; eight named mute groups with membership and enable; Automix X/Y enable, membership and channel weights. |
| Monitor / Talkback | Monitor A/B sources, level, mute, dim, mono, pan, width, polarity, delay, eight EQ bands, filters and limiter; PFL/AFL/SIP settings, exclusive solo, follow selection, trim and clear; Talk A/B momentary or latched controls, CH40/AUX8 source, destination assignment and per-destination levels. |
| Meter / RTA | Animated level bridges for CH, AUX, BUS, MAIN, MTX, DCA and FX; PRE/POST selection, peak hold/reset and simulated gain reduction; RTA source, range, decay and freeze; two configurable oscillators with routing. |
| Scenes / Library | Show name; create, update, rename, tag, duplicate, reorder, delete and recall scenes; seven recall scopes; strip safes; scoped snippets with target strips; compatible-family channel presets; full project export/import, scene import/export, undo import and demo reset. |
| Recorder / Player | SD A/B, USB recorder and USB player virtual transports; play, record, pause/resume, stop, rewind, seek, loop/repeat, session settings, markers, virtual take creation, load/reorder/delete sessions, playlist and metadata export; WING-LIVE capability gate and Main/Alt switching on SD playback. |
| Setup | Audio clock/rate and USB channels; Main link settings; Rack/Full/Compact hardware profiles, card and module selection; StageCONNECT channel budget; Ethernet profile and IPv4 validation; MIDI settings and simulated scene Program Change; GPIO macro triggers; eight custom macro buttons and four fader encoders; custom layers; action history. |
| Macro Sculpt | Eight configurable macro slots, up to 32 ordered actions per macro; fader set/offset, mute, solo, sends, DCA, mute groups, scenes, talkback, monitor dim, Main/Alt, FX enable, oscillators, recorder and waits; fades, execution status, cancellation and undo of the latest macro. |

Controls for DSP, network and hardware properties store the simulated console configuration. Meter, RTA and recorder activity is generated locally. The demo does not synthesize or process audio, record audio files, connect to sockets, configure a Dante network, transfer files to the mixer or upload firmware. These boundaries are stated in the relevant pages.

## State and integration

- `SculptDesk.change` and `SculptController.updateStrip`/`setSend` update the shared model. Existing project persistence and export therefore include these pages.
- The module adds defaults for solo configuration, meter preferences, monitor processing, recorder transport metadata, GPIO, custom controls, layers, scene/preset libraries and macro actions.
- Initialization runs again after a full restore to support earlier project files. Demo scenes and macro examples are seeded once. Deleting every scene is preserved on future restores.
- Initial scenes are **Soundcheck** and **Concerto**. The eight existing footer macro names receive working actions: Talk A, mute FX group, vocal +1/−1 dB, SD record/stop, monitor dim, and scene recall.
- `SculptSystems.runMacro(id)` is the footer/custom-control/GPIO entry point. It returns `{ok, count}` or `{ok:false, error}` and emits `sculpt-macro-status` events. `stopMacros`, `transport`, and `recallScene` are also exposed.
- `SculptUI.open('scenes', {tab:'presets', target:stripId})` opens the preset page for the channel editor. Other supported scene tabs are `show`, `snippets`, and `project`.
- A custom layer calls `SculptController.showLayer(members, name)` and retains the main mixer’s separate input/output rows. Spill opens an editable member list.
- Macro execution takes an independent pre-action snapshot. Only one macro executes at a time; cancellation is checked between actions and during fades. Unavailable transports and invalid targets return an error rather than reporting success.

## Recall and import

Scene capture uses `SculptDesk.capture`, which omits scene, snippet, preset and macro libraries to prevent recursive snapshots. Scene recall delegates to `SculptDesk.recall(snapshot, scope, safes)`.

Scope names are `levels`, `processing`, `routing`, `groups`, `monitor`, `recorder`, and `setup`. Processing includes FX. Safes are strip IDs. Snippets add all unselected strips to the safe list before recall; global sections remain global if explicitly selected in the snippet scope.

Project export uses the wrapper `sculpt-control-demo`, version 4, around the model snapshot version 3. Import also accepts the shell’s `sculpt-control-project` wrapper. The importer validates snapshot version and strip ranges, rejects files over 8 MB and strips prototype keys. These JSON files are Sculpt demo projects, not native WING snapshot files.

Channel presets preserve source patch and FX slot assignments on the destination. Level and mute recall is optional. A preset can be loaded only onto a channel of the same family.

## Capability rules

- Automix is limited to 16 CH across X and Y. A channel belongs to one group. Assigning an automix channel releases its post FX insert; the shared desk model implements the reciprocal constraint.
- SD transport is enabled only for a WING-LIVE profile. The player rejects record actions.
- StageCONNECT inputs and outputs share a 32-channel budget.
- Hardware profile changes feed the existing I/O capacity model. No port is labeled as actually connected based on these profile settings.
- DCA and mute-group actions affect the shared effective-level calculation, leaving channel fader values intact.
- Macro send changes affect the selected send, independently of the destination bus master.

## Interaction and styling

The global pages use the same dark Sculpt surface, red active states and compact touch controls. Grids collapse on phone widths; dialogs and lists scroll within the shell. Native selects, inputs, sliders and buttons expose accessible labels. Numeric input accompanies each slider for precise entry.

Moving a slider updates the control and shared state without reconstructing the page. RTA and meter timers are cleared when the page closes. Momentary talkback releases on pointer up, cancellation, lost capture and page cleanup. No browser `alert` or `prompt` is used.

## Verification

Executed:

```sh
node --check dist/systems.js
node --test tests/system-actions.test.cjs
```

Eight tests pass, covering:

1. Relative channel levels and independent send/master behavior.
2. Group, talkback, dim, solo, source and FX state changes.
3. Scene scope and safe forwarding.
4. Invalid input and unavailable-transport error paths.
5. Fade completion and macro cancellation.
6. Virtual transport elapsed time, pause, loop and duration boundaries.
7. Both project wrappers, strip-range validation and prototype-key removal.
8. Registration of all seven pages, useful seeded macros, preserved empty scene libraries and full reset using the real model and desk modules.

Browser integration, touch layout, deployment and offline-cache checks are performed by the main integration workflow. No hardware behavior is certified by these tests.
