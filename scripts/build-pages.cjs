const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '..', '_site');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
if (!html.includes('window.schoolBackend')) throw new Error('Missing static transport support');
fs.mkdirSync(output, { recursive: true });
// Publish an explicit allowlist. Backend code and local credentials never enter the artifact.
const logo=html.match(/src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/);
if(!logo)throw Error('Official embedded logo missing');
fs.writeFileSync(path.join(output, 'moe-logo.svg'),Buffer.from(logo[1],'base64'));
fs.copyFileSync(path.join(root,'favicon.svg'),path.join(output,'favicon.svg'));
const head='<link rel="icon" type="image/svg+xml" href="./favicon.svg"><script src="./web-client.js" defer></script></head>';
fs.writeFileSync(path.join(output, 'index.html'), html.replace(logo[0],'src="./moe-logo.svg"').replace('</head>',head));
fs.copyFileSync(path.join(root, 'web-client.js'), path.join(output, 'web-client.js'));
fs.writeFileSync(path.join(output, 'monitor.html'), fs.readFileSync(path.join(root, 'Monitor.html'), 'utf8').replace('</head>',head));
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Built GitHub Pages frontend and cacheable ministry logo.');
