'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Arch } = require('electron-builder');
const packageJSON = require('../package.json');
const beforePack = require('../scripts/before-pack.cjs');
const afterPack = require('../scripts/after-pack.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sculpt-package-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'desktop');
  const context = { electronPlatformName: 'darwin', arch: Arch.arm64,
    appOutDir: path.join(projectDir, 'release/mac-arm64'),
    packager: { projectDir, appInfo: { productFilename: packageJSON.productName } } };
  const source = path.resolve(projectDir, beforePack.AUDIO_BUNDLE_SOURCE);
  const executable = path.join(source, beforePack.AUDIO_EXECUTABLE);
  // Only a synthetic Mach-O header: these tests verify the packaging gate, not native execution.
  async function makeBundle() {
    const bytes = Buffer.alloc(64);
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(0x0100000c, 4);
    bytes.writeUInt32LE(2, 12);
    await fs.mkdir(path.dirname(executable), { recursive: true });
    await fs.writeFile(executable, bytes, { mode: 0o755 });
    await fs.writeFile(path.join(source, 'Contents/Info.plist'),
      '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>SculptWingAudio</string></dict></plist>');
    return bytes;
  }
  return { context, source, executable, makeBundle };
}

test('Mac packaging fails before copying if the native engine is missing, non-executable or Intel', async t => {
  const { context, executable, makeBundle } = await fixture(t);
  assert.equal(packageJSON.build.beforePack, './scripts/before-pack.cjs');
  await assert.rejects(beforePack(context), /audio engine bundle is missing[\s\S]*npm run build:audio --prefix desktop/);
  const bytes = await makeBundle();
  await fs.chmod(executable, 0o644);
  await assert.rejects(beforePack(context), /not executable/);
  await fs.chmod(executable, 0o755);
  bytes.writeUInt32LE(0x01000007, 4); // CPU_TYPE_X86_64, a stale Intel-only engine.
  await fs.writeFile(executable, bytes);
  await assert.rejects(beforePack(context), /not a native ARM64 Mach-O/);
});

test('Mac packaging requires the exact resource destination and unchanged compiled engine before signing', async t => {
  const { context, source, executable, makeBundle } = await fixture(t);
  await makeBundle();
  await beforePack(context);
  assert.equal(packageJSON.build.afterPack, './scripts/after-pack.cjs');
  await assert.rejects(afterPack(context), /audio engine bundle is missing/);
  const resource = packageJSON.build.extraResources.find(item => item.from === beforePack.AUDIO_BUNDLE_SOURCE);
  assert.ok(resource, 'the native bundle must be included by extraResources');
  assert.equal(resource.to, beforePack.AUDIO_BUNDLE_RESOURCE, 'destination must match the native bridge launch path');
  const destination = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources', resource.to);
  await fs.cp(source, destination, { recursive: true });
  await afterPack(context);
  const corrupted = await fs.readFile(executable);
  corrupted[48] = 1;
  await fs.writeFile(path.join(destination, beforePack.AUDIO_EXECUTABLE), corrupted);
  await assert.rejects(afterPack(context), /does not match the compiled engine/);
});
