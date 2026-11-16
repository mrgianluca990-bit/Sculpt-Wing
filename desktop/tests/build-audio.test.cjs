'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const script = path.resolve(__dirname, '../scripts/build-audio.cjs');
const scriptSource = fs.readFileSync(script, 'utf8');
// Exercise the installed dependency's real lazy-download entrypoint, without
// downloading or executing a Mac binary on the test machine.
const electronEntrySource = fs.readFileSync(require.resolve('electron'), 'utf8');

function buildFixture(t, { downloadFails = false, minimumOS = '14.0' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sculpt-build-audio-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executableRelative = 'Electron.app/Contents/MacOS/Electron';
  const executable = path.join(root, 'dist', executableRelative);
  const plist = path.resolve(path.dirname(executable), '../Info.plist');
  const cmakeCalls = [], errors = [];
  let downloads = 0;
  const targetProcess = { platform: 'darwin', argv: [process.execPath, script, '--with-test-plugin'] };
  assert.equal(fs.existsSync(path.join(root, 'path.txt')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);

  function electronPath() {
    const electronModule = { exports: {} };
    vm.runInNewContext(electronEntrySource, {
      __dirname: root, module: electronModule, process: { env: {}, execPath: process.execPath },
      console: { log() {} },
      require(id) {
        if (id !== 'child_process') return require(id);
        return { spawnSync(command, args) {
          downloads++;
          assert.equal(command, process.execPath);
          assert.deepEqual(Array.from(args), [path.join(root, 'install.js')]);
          if (downloadFails) return { status: 1 };
          fs.mkdirSync(path.dirname(executable), { recursive: true });
          fs.writeFileSync(executable, 'synthetic binary for path resolution only');
          fs.writeFileSync(plist, `<plist><dict><key>LSMinimumSystemVersion</key><string>${minimumOS}</string></dict></plist>`);
          fs.writeFileSync(path.join(root, 'path.txt'), executableRelative);
          return { status: 0 };
        } };
      }
    }, { filename: require.resolve('electron') });
    return electronModule.exports;
  }

  vm.runInNewContext(scriptSource, {
    __dirname: path.dirname(script), process: targetProcess,
    console: { log() {}, error(message) { errors.push(message); } },
    require(id) {
      if (id === 'electron') return electronPath();
      if (id !== 'node:child_process') return require(id);
      return {
        execFileSync(command, args) {
          assert.equal(command, '/usr/libexec/PlistBuddy');
          assert.deepEqual(Array.from(args), ['-c', 'Print :LSMinimumSystemVersion', plist]);
          assert.equal(fs.existsSync(executable), true);
          return `${fs.readFileSync(plist, 'utf8').match(/<string>([^<]*)<\/string>/)[1]}\n`;
        },
        spawnSync(command, args, options) {
          assert.equal(command, 'cmake');
          assert.equal(options.shell, false);
          cmakeCalls.push(Array.from(args));
          return { status: 0 };
        }
      };
    }
  }, { filename: script });
  return { downloads, cmakeCalls, errors, exitCode: targetProcess.exitCode };
}

test('a clean Electron npm package installs its binary before deriving the native deployment target', t => {
  const result = buildFixture(t);
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.equal(result.downloads, 1);
  assert.equal(result.cmakeCalls.length, 2);
  assert(result.cmakeCalls[0].includes('-DCMAKE_OSX_ARCHITECTURES=arm64'));
  assert(result.cmakeCalls[0].includes('-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0'));
  assert(result.cmakeCalls[0].includes('-DSCULPT_AUDIO_BUILD_TEST_PLUGIN=ON'));
  assert.deepEqual(result.cmakeCalls[1], ['--build', 'audio-host/build', '--config', 'Release', '--parallel', '2']);
});

test('an Electron download failure stops before CMake and reports the installation failure', t => {
  const result = buildFixture(t, { downloadFails: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.downloads, 1);
  assert.equal(result.cmakeCalls.length, 0);
  assert.match(result.errors.join('\n'), /Electron.*install/i);
});

test('invalid Electron minimum macOS metadata stops before CMake instead of guessing a target', t => {
  const result = buildFixture(t, { minimumOS: 'not-a-version' });
  assert.equal(result.exitCode, 1);
  assert.equal(result.downloads, 1);
  assert.equal(result.cmakeCalls.length, 0);
  assert.match(result.errors.join('\n'), /Invalid Electron minimum macOS version/);
});
