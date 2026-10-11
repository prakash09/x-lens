const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('each execution world gets a distinct model script, all declared assets exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.deepEqual(manifest.content_scripts[1].js, ['content.bundle.js']);
  const files = manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]);
  assert.equal(new Set(files).size, files.length);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const entry of ['page', 'content']) {
    const bundle = ['model.js', `${entry}.js`].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    assert.equal(fs.readFileSync(path.join(root, `${entry}.bundle.js`), 'utf8'), bundle);
  }
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(fs.existsSync(path.join(root, manifest.background.service_worker)));
  assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
});
test('the Safari manifest is the Chrome manifest with an event page', () => {
  const { minimum_chrome_version, ...manifest } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const safari = JSON.parse(fs.readFileSync(path.join(root, 'safari/manifest.json')));
  assert.deepEqual(safari, { ...manifest, background: { scripts: [manifest.background.service_worker], persistent: false } });
});
test('the Safari project bundles each file the manifest and popup load', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const popup = fs.readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
  const files = [
    'manifest.json', manifest.background.service_worker, manifest.action.default_popup,
    ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]),
    ...[...popup.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]),
  ];
  const project = fs.readFileSync(path.join(root, 'safari/X Lens/X Lens.xcodeproj/project.pbxproj'), 'utf8');
  // One copy for the macOS extension and one for the iOS extension.
  for (const file of files) assert.equal(project.split(`/* ${file} in Resources */ = `).length - 1, 2, file);
});
