const fs = require('node:fs');
fs.writeFileSync('page.bundle.js', ['model.js', 'page.js'].map(file => fs.readFileSync(file, 'utf8')).join('\n'));
