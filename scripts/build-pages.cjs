const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '..', '_site');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
if (!html.includes('window.schoolBackend')) throw new Error('Missing static transport support');
fs.mkdirSync(output, { recursive: true });
// Publish an explicit allowlist. Backend code and local credentials never enter the artifact.
fs.writeFileSync(path.join(output, 'index.html'), html.replace('</head>', '<script src="./web-client.js" defer></script></head>'));
fs.copyFileSync(path.join(root, 'web-client.js'), path.join(output, 'web-client.js'));
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Built GitHub Pages: index.html, web-client.js, .nojekyll');
