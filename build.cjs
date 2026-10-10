const fs = require('node:fs');
for (const entry of ['page', 'content']) {
  fs.writeFileSync(`${entry}.bundle.js`, ['model.js', `${entry}.js`].map(file => fs.readFileSync(file, 'utf8')).join('\n'));
}
