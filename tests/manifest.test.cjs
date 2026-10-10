const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('each execution world gets a distinct model script, all declared assets exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const files = manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]);
  assert.equal(new Set(files).size, files.length);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  const bundle = ['model.js', 'page.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.equal(fs.readFileSync(path.join(root, 'page.bundle.js'), 'utf8'), bundle);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(fs.existsSync(path.join(root, manifest.background.service_worker)));
  assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
});
