# Processor surfaces — live preparation

## Aggiornamento delle superfici Mac

Le nuove superfici ricostruite dalle schermate della guida originale, i relativi riferimenti e i limiti sono descritti in [PLUGIN_ORIGINAL_SURFACES.md](PLUGIN_ORIGINAL_SURFACES.md). I file `dist/plugin-original-*.js` forniscono la geometria; la ricetta descritta sotto rimane disponibile per gli altri modelli e per i controlli aggiuntivi. Non equivale a una dichiarazione di parità pixel per pixel con il firmware.

`dist/plugin-panels.js` contains an explicit control-surface recipe for the 109 catalog definitions. The renderer retains every parameter exactly once. The standard output EQ adds bands 5/6 and Tilt to the input EQ surface. Interfaces use local HTML, CSS and SVG; they are independently drawn control surfaces, not official Behringer UI assets.

The VSS3 has an engine readout and Library, Early reflections, Reverb, Decay spectrum and Modulation sections. FET, optical, variable-Mu and bus compressors have separate control arrangements. PULSAR has program and midrange sections; console EQs have individual band columns. GEQ exposes 31 faders, PIA 10; PCORR has a working chromatic keyboard. Integrated strips are separated by signal stage. Delay, amp, tape, rotary, dynamic EQ and multiband processors retain their own controls and layout.

## Live hooks

The optional `window.SculptLive` API is the single connection to the live coordinator. It provides `isLive()`, `ensureProcessor(ctx)`, `processorState(ctx)` (`ready`, `loading`, `error`), `parameterDefinition(ctx,key)`, `triggerProcessor(ctx,key)` and optional `applyProcessorPreset(ctx,{model,params,enabled,mix})`. A panel is locked while the processor is loading. Firmware metadata overrides local control ranges and read-only flags. A live model unknown to the local catalog is preserved and directs the user to the parameter explorer. Model changes must invalidate stale gesture writes in the coordinator.

`LOAD` calls the WING trigger in live mode. The illustrative offline profile loader never runs against the mixer. Preset/reset/copy application uses the optional atomic/sequential coordinator operation and reports success only after its promise resolves. All ordinary controls continue through the shared Desk API.

Gain-reduction meters remain stationary and explicitly unavailable; moving a knob never creates a fake reading. Engine displays show parameter values, not measured sound. The STD EQ graph is an RBJ reference response at 48 kHz, with draggable gain/frequency points. It is labeled as a reference and does not claim to reproduce proprietary WING curves; output Tilt is excluded and labeled. GEQ graphs show the selected band values and claim no RTA.

## Verification

`node --test tests/plugin-panels.test.cjs` requires jsdom (available in the native development dependencies; use `NODE_PATH=native/node_modules` after installing them). Seven tests cover every rendered model, exact parameter reachability, FET ratio control, pitch keyboard, GEQ fader count, listener disposal, hydration lock, live LOAD isolation, firmware limits/read-only state, numeric firmware enums and unknown model preservation. The existing editor integration test still renders all 456 channel pages and passes.

Browser QA and actual WING/iOS validation belong to the combined application verification; these tests do not certify a hardware connection.
