'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CSP, assetPath } = require('../src/bridge-policy.cjs');

test('PDF worker is local-only while renderer network access stays disabled', () => {
  const rules = Object.fromEntries(CSP.split(';').filter(part => part.trim()).map(part => {
    const [directive, ...values] = part.trim().split(/\s+/);
    return [directive, values];
  }));
  assert.deepEqual(rules['worker-src'], ["'self'"]);
  assert.deepEqual(rules['connect-src'], ["'none'"]);
  assert.deepEqual(rules['script-src'], ["'self'"]);
  assert.deepEqual(rules['object-src'], ["'none'"]);
  const root = path.resolve('/tmp/sculpt-app');
  assert.equal(assetPath('sculpt://app/pdf.worker.js', root), path.join(root, 'pdf.worker.js'));
  assert.equal(assetPath('https://cdn.example/pdf.worker.js', root), null);
  assert.equal(assetPath('sculpt://other/pdf.worker.js', root), null);
});
