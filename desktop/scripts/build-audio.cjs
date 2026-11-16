'use strict';

const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const desktopDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(desktopDir, '..');

function run(args) {
  const result = spawnSync('cmake', args, { cwd: repoDir, stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`Cannot run CMake: ${result.error.message}. Install CMake and the Xcode command line tools.`);
  if (result.status !== 0) throw new Error(`CMake failed (${result.signal || result.status}). The native audio engine was not built.`);
}

try {
  if (process.platform !== 'darwin') throw new Error('Build the Apple Silicon audio engine on macOS, or use the Mac M1 GitHub Actions workflow.');
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--with-test-plugin')) throw new Error('Usage: npm run build:audio [-- --with-test-plugin]');
  const electronPlist = path.join(desktopDir, 'node_modules/electron/dist/Electron.app/Contents/Info.plist');
  let minOS;
  try {
    minOS = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', electronPlist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error('Cannot read the installed Electron minimum macOS version. Run `npm ci --prefix desktop` on the Mac before building audio.');
  }
  if (!/^\d+\.\d+(\.\d+)?$/.test(minOS)) throw new Error(`Invalid Electron minimum macOS version: ${minOS}`);
  console.log(`Building SculptWingAudio for arm64, macOS ${minOS}+ (same minimum as Electron).`);
  run(['-S', 'audio-host', '-B', 'audio-host/build', '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_OSX_ARCHITECTURES=arm64', `-DCMAKE_OSX_DEPLOYMENT_TARGET=${minOS}`,
    `-DSCULPT_AUDIO_BUILD_TEST_PLUGIN=${args.includes('--with-test-plugin') ? 'ON' : 'OFF'}`]);
  run(['--build', 'audio-host/build', '--config', 'Release', '--parallel', '2']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
