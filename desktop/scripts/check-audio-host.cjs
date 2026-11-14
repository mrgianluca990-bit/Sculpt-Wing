'use strict';
// Run after compiling the helper. Exercises the real Electron-side bridge and
// native JSON contract without opening an audio device or loading user plugins.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AudioHost } = require('../src/audio-host.cjs');

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node check-audio-host.cjs <native-helper-executable>');
  const executablePath = path.resolve(process.argv[2]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sculpt-native-bridge-'));
  const sessionFile = path.join(directory, 'session.json');
  const create = () => new AudioHost({ executablePath, dataDirectory: directory, sessionFile, requestTimeoutMs: 10000 });
  let host = create();
  try {
    const initial = await host.request({ method: 'status' });
    assert.equal(initial.running, false);
    assert.equal(initial.audio.configured, false);
    assert.equal(initial.audio.inputDevice, '');
    await host.request({ method: 'setRack', params: {
      id: 'ch-1', name: 'Bridge fixture', inputChannels: [0], outputChannels: [1], enabled: false,
      slots: [{ pluginId: null, bypass: false }]
    } });
    const state = await host.request({ method: 'getState' });
    assert.equal(state.racks.length, 1);
    // Echo the native rack, including its read-only slot/rack metadata, exactly
    // as the real UI does. The bridge must discard metadata and accept the edit.
    const rack = state.racks[0];
    assert.equal(typeof rack.slots[0].latencySamples, 'number');
    rack.enabled = true;
    await host.request({ method: 'setRack', params: rack });
    await host.request({ method: 'saveSession' });
    const saved = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
    assert.equal(saved.state.racks[0].enabled, true);
    await host.close();
    host = create();
    const restored = await host.request({ method: 'loadSession' });
    assert.equal(restored.loaded, true);
    assert.equal(restored.state.running, false);
    assert.equal(restored.state.audio.configured, false);
    assert.equal(restored.state.racks[0].enabled, true);
    assert.deepEqual(restored.state.racks[0].outputChannels, [1]);
    console.log('Native bridge integration passed: real helper, metadata round-trip, atomic session save and stopped restore.');
  } finally {
    await host.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
