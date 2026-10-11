const fs = require('node:fs');
for (const entry of ['page', 'content']) {
  fs.writeFileSync(`${entry}.bundle.js`, ['model.js', `${entry}.js`].map(file => fs.readFileSync(file, 'utf8')).join('\n'));
}
// Reports show that Safari on iOS can stop a service worker and not start it again. An event page does not have this problem.
const { minimum_chrome_version, ...manifest } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const safariManifest = { ...manifest, background: { scripts: [manifest.background.service_worker], persistent: false } };
fs.writeFileSync('safari/manifest.json', `${JSON.stringify(safariManifest, null, 2)}\n`);
