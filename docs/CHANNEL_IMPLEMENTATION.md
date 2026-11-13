# Channel editor — Sculpt Wing 0.4

## Delivered scope

The editor is a working offline control surface for the 76 strips in the shared
Sculpt state: 40 CH inputs, 8 AUX inputs, 16 buses, 4 mains and 8 matrices. It uses
`SculptController` for strip/send state and `SculptDesk` for channel settings,
sources, processing, rack assignments and groups. No separate persistence store
or independent processor catalog is introduced.

The visual design retains the compact red/anthracite Sculpt surface, with fixed
header and section tabs, a scrollable panel and controls sized for touch. The
layout adapts to phone portrait, phone landscape and tablet/desktop widths.

## Public interface and dependencies

- `SculptEditor.open(stripId)` selects and opens the strip.
- `SculptEditor.close()` commits a pending input and releases subscriptions.
- `SculptEditor.isOpen()` returns the modal state.
- `SculptFX.renderProcessor(host, context)` mounts the actual catalog-backed
  EQ, gate, dynamics or filter editor. Its cleanup runs whenever the panel changes.
- `SculptFX.open({type:'fx',slot})` opens a rack processor from an insert.
- I/O, groups and channel presets link to the corresponding registered
  `SculptUI` pages.

Files owned by this module: `dist/editor.js`, `dist/editor.css`,
`tests/editor.integration.test.js` and this document.

## Implemented sections

### Canale

Fader, numeric level, 0 dB and −∞ actions, mute, solo, pan and stereo width.
The displayed effective level/mute includes DCA and mute-group state through
`Desk.effective()`. Name, color, icon and tags are editable. Monitor A/B/A+B and
solo-safe controls are included.

CH/AUX have separate Main and Alt source selectors, source groups and ports,
individual Main/Alt selection and participation in the global source switch.
The active-source display follows the global switch. Explicitly choosing Main
while the global Alt switch is active disables that channel's automatic
participation. Source format, polarity and mute use the shared source object.
Gain and phantom appear only when the selected source exposes a preamplifier.
Changing them affects every strip using that source. Digital trim, input balance
and channel polarity remain strip controls.

BUS/MAIN/MTX have format selection and a summary of their active physical output
assignments, plus a shortcut into I/O. Channel preset management is available
through the shared Scene/Library page.

### Processo

CH processing order is editable for Gate, EQ, Dynamics and Insert. Process nodes
also open the corresponding section. Other strip families show their fixed
processing flow. CH has low/high cuts with slopes plus its catalog filter slot.

Delay has enable and milliseconds/meters/feet/samples views. The demo stores one
canonical time in milliseconds and converts the other views using its sample
rate and a fixed acoustic-speed assumption. The UI spans 0–500 ms; native WING
quantization and exact limits for every unit require validation on hardware.

Insert selectors assign real shared rack instances through `Desk.assignFx`;
they display assignments already in use and expose insert enable and an Open FX
action. AUX has one pre insert. CH/BUS/MAIN/MTX expose pre and post inserts.
The Desk API controls slot exclusivity and ownership.

CH includes its common PRE-send tap, PRE-send stereo width and a three-band
PRE-send EQ with frequency, gain and Q. Those settings are shared by the
channel's PRE sends.

### EQ and Dinamica

The plugin module supplies the family-specific model selector, processor enable,
faceplate and editable documented parameter set. CH offers separate gate and
dynamics blocks; AUX and output families offer dynamics only. CH also has the
dedicated filter block in Processo.

Gate and dynamics include external sidechain selection, tap, filtering,
frequency, Q and listen. CH sidechains select Self or a CH signal; other families
select Self or AUX/BUS/MAIN/MTX signals. CMB omits the sidechain filter controls.
Dynamics crossover type, frequency, depth, Q and listen are offered where that
node exists; AUX deliberately omits the crossover.

### Mandate

All routes accepted by `Controller.canSend()` appear in the appropriate family
bank. Both outgoing sends and incoming contributions are available; a matrix
therefore opens a useful receive view instead of an empty send page.

Each route has on/off, numeric/slider level, PRE/POST and GRP where supported,
pan link, pan and follow-mute behavior. CH routes additionally expose the
channel's common PRE tap directly in the expanded controls. It changes the same
tap shown in Processo, not an unrelated per-send copy. Bus/matrix destinations
offer a SOF shortcut, as does the header of each bus and matrix editor.

The current offline pan-link state is boolean. The native protocol advertises
three pan-link values; their complete semantics remain a live adapter task.
Offline follow-mute represents the inverse of the PRE-always-on concept.

### Gruppi

Membership for all 16 DCA and 8 mute groups is edited in the central Desk state.
Assignments show group names, mute status and DCA level. CH automix membership
is exclusive between X/Y, has weight and group enable controls, and enforces a
combined limit of 16 channels. Selecting automix releases a post-FX assignment,
because those functions occupy the same post-insert mode in the protocol.
The shared Desk handles the reciprocal FX assignment behavior.

Recall safe is editable per strip. Group management remains accessible from a
shortcut without maintaining another set of group data.

## Input and lifecycle behavior

Numeric text commits on change, blur or Enter, with clamping and step handling.
Blank/invalid input restores the saved value. Moving a slider updates its state
without rebuilding the panel. Model changes and structural source/insert
changes rebuild only the relevant panel. Channel navigation commits the old
channel's pending input before changing identity. Preamp setters capture the
physical source being edited, so a source switch cannot redirect an unfinished
gain edit to another preamp.

Processor and editor subscriptions are cleaned up on tab change and close.
Escape and the explicit close action close the modal and restore focus.
Tabs support arrow keys, Home and End in addition to touch.

## Verification performed

`node --check dist/editor.js` passes.

`node tests/editor.integration.test.js` passes. This test runs the actual model,
Desk, catalog, plugin and editor scripts against a minimal DOM fixture. It checks:

- 456 page renders: six pages across all 76 strip identities.
- Every rendered select has a valid selected option.
- Subscription cleanup after each channel and inline processor is closed.
- Numeric typing versus commit, Enter, blank restoration and stable input nodes.
- Shared preamp gain/phantom and global Alt source behavior.
- EQ model change with actual processor controls.
- Send level, GRP mode and shared PRE tap updates.
- Post-FX to automix transition and the 16-channel automix limit.
- AUX omissions for post insert, separate gate, low cut and crossover.

This smoke test is not a layout renderer. Browser QA, iPhone viewport behavior
and offline/service-worker delivery are verified by the main project workflow.
No physical WING connection or audio/DSP processing is performed by this module.

## Reference

Capabilities and parameter distinctions were checked against the local
`wing_remote_protocols_v3.1.2a.md`, especially Channel/Aux/Bus/Main/Matrix Settings,
and the development inventory `docs/WING_IO_AND_SYSTEM.md`. The implementation
uses the shared 0.4 API contract in `IMPLEMENTATION_04.md`. This is an interactive
offline demo; it does not claim a pixel-identical WING UI or tested live control
parity with the physical console.
