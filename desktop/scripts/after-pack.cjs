'use strict';

const path = require('node:path');
const {
  AUDIO_BUNDLE_SOURCE, AUDIO_BUNDLE_RESOURCE,
  assertMacArchitecture, inspectAudioBundle, packagingError
} = require('./before-pack.cjs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  assertMacArchitecture(context);
  const source = path.resolve(context.packager.projectDir, AUDIO_BUNDLE_SOURCE);
  const bundled = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`,
    'Contents/Resources', AUDIO_BUNDLE_RESOURCE);
  // electron-builder can skip a missing extraResources source without failing.
  // Check the path actually launched by AudioHost, after copying and before signing.
  const [original, packaged] = await Promise.all([inspectAudioBundle(source), inspectAudioBundle(bundled)]);
  if (original.executableHash !== packaged.executableHash || original.plistHash !== packaged.plistHash) {
    throw packagingError(`the bundled audio engine does not match the compiled engine at ${bundled}. Check build.extraResources.`);
  }
};
