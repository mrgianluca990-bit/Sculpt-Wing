'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Arch } = require('electron-builder');

const AUDIO_BUNDLE_SOURCE = '../audio-host/build/SculptWingAudio_artefacts/Release/SculptWingAudio.app';
const AUDIO_BUNDLE_RESOURCE = 'audio-host/SculptWingAudio.app';
const AUDIO_EXECUTABLE = 'Contents/MacOS/SculptWingAudio';

function packagingError(reason) {
  return new Error(`Cannot package Sculpt Wing: ${reason}\n` +
    'The Mac app must include the native ARM64 audio engine. From the repository root run ' +
    '`npm run build:audio --prefix desktop`, then package the app again. ' +
    'In GitHub Actions use the updated Mac M1 workflow, which builds the engine before electron-builder.');
}

function assertMacArchitecture(context) {
  if (context.arch !== Arch.arm64) throw packagingError('the Mac target must be arm64 (Apple Silicon).');
}

async function inspectAudioBundle(bundlePath) {
  const executablePath = path.join(bundlePath, AUDIO_EXECUTABLE);
  const plistPath = path.join(bundlePath, 'Contents/Info.plist');
  let bundle, executable, executableBytes, plistBytes;
  try {
    [bundle, executable, executableBytes, plistBytes] = await Promise.all([
      fs.lstat(bundlePath), fs.lstat(executablePath), fs.readFile(executablePath), fs.readFile(plistPath)
    ]);
  } catch (error) {
    throw packagingError(`the audio engine bundle is missing or unreadable at ${bundlePath} (${error.code || error.message}).`);
  }
  if (!bundle.isDirectory() || !executable.isFile()) {
    throw packagingError(`the audio engine must be a real app bundle with a regular executable at ${executablePath}.`);
  }
  if ((executable.mode & 0o111) === 0) throw packagingError(`the audio engine is not executable at ${executablePath}.`);
  // A native arm64-only build is required; do not accidentally ship a stale Intel helper.
  // mach_header_64: MH_MAGIC_64, CPU_TYPE_ARM64, MH_EXECUTE (little endian).
  if (executableBytes.length < 32 || executableBytes.readUInt32LE(0) !== 0xfeedfacf ||
      executableBytes.readUInt32LE(4) !== 0x0100000c || executableBytes.readUInt32LE(12) !== 2) {
    throw packagingError(`the audio engine is not a native ARM64 Mach-O executable at ${executablePath}.`);
  }
  if (!/<key>CFBundleExecutable<\/key>\s*<string>SculptWingAudio<\/string>/.test(plistBytes.toString('utf8'))) {
    throw packagingError(`the audio engine Info.plist does not identify SculptWingAudio at ${plistPath}.`);
  }
  return {
    executableHash: createHash('sha256').update(executableBytes).digest('hex'),
    plistHash: createHash('sha256').update(plistBytes).digest('hex')
  };
}

async function beforePack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  assertMacArchitecture(context);
  await inspectAudioBundle(path.resolve(context.packager.projectDir, AUDIO_BUNDLE_SOURCE));
}

module.exports = beforePack;
Object.assign(module.exports, {
  AUDIO_BUNDLE_SOURCE, AUDIO_BUNDLE_RESOURCE, AUDIO_EXECUTABLE,
  assertMacArchitecture, inspectAudioBundle, packagingError
});
