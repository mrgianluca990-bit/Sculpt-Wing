# Live coordinator verification

The coordinator observes UI mutations before the app commits them. It loads current mixer values, starts read-only, and accepts writes only for loaded metadata and the current session. It never replays a stored demo or project on connection. Fader gestures coalesce by parameter. Write confirmation comes from the driver's mixer readback; a rejected write restores the confirmed value, or requests a fresh read when none arrived.

Session changes clear pending gestures and meter data. Values arriving while disconnected/error are ignored. A failed initial synchronization closes the transport. Direct parameter writes recheck the session and Controllo switch after asynchronous metadata and queue waits. Source-linked effective names and colors remain read-only descriptors; source changes write their actual source nodes. Local libraries, macros and layouts remain local.

Model changes clear queued parameters from the old model before the model write, lock the processor while the new schema loads, invalidate metadata and parameter values, and discard stale read results. Multiple opens/forced refreshes coalesce. The native driver's explicit refresh notifications do not trigger an endless refresh loop. Unknown parameters in an otherwise mapped compound action cause the complete action to be rejected before transmission; a projection through the real map distinguishes source/insert derived state from unsupported mutations.

`Session.snapshot()` exposes monotonic `failureVersion` and `failure`. They record write operation failures and survive disconnect/reset so a macro executor can compare the counter before/after `settled()`. They are diagnostic state, not proof of an audio change.

## Executed checks

- `node --test tests/live-session.test.cjs`: 14 passing tests covering no replay, initial read-only mode, gesture coalescing, delayed replies/disconnect/reconnect, disarming, rejection recovery, dynamic model changes, stale schema reads, refresh coalescing, direct writes across async gaps, failed sync closure, leaf reads/local libraries, real source-linked mapping, atomic rejection of mixed unsupported actions, and numeric firmware enum preservation.
- `NODE_PATH=native/node_modules node --test tests/live-ui.integration.test.cjs`: one passing integration test runs the actual `app.js`, Desk, catalog, plugin renderer, map, coordinator and `live.js` in JSDOM. It opens the connection form against a driver fixture exposing all 76 strips, reads current faders/inserts, checks no replay and read-only rollback, uses the real registered fader keyboard handler, verifies successful/rejected readbacks and retained object references, hydrates VSS3 controls from firmware metadata, writes a plugin parameter, assigns an insert through the actual map, rejects a compound unmapped edit, and returns to the demo without writing its values to the fixture mixer.
- `NODE_PATH=native/node_modules node --test tests/plugin-panels.test.cjs`: seven passing panel tests.
- `node tests/editor.integration.test.js`: the existing 456 editor page renders pass.

The fixture validates the JavaScript/native boundary contract. It does not replace Xcode compilation, an installed iPhone/iPad run, native socket testing or a physical WING console check.

## Final editor read-state review

The live channel editor now shows a reading state instead of seeded fields until its tab's required scopes complete. Input source Main/Alt and their shared preamps are loaded before the channel controls appear; sends are loaded for their selected direction. A failed read shows a retry and parameter-explorer action. Connection changes are observed separately from parameter pushes, so disconnect/background removes stale editor controls immediately. Standalone processor panels subscribe to that status as well and disable themselves when the connection ends. Native channel mute-group assignments and local recall safes are not presented as mixer state.

The actual-app integration test now also holds and rejects an editor read, verifies absence of seeded inputs, retries successfully, checks a real source-gain update arriving through `onValue`, checks palette conversion through the mutation guard, and asserts immediate editor/plugin gating after a suspended status. All 22 tests remain passing; the existing 456-page editor fixture remains passing.
