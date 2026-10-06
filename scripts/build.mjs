import { readFile, mkdir, copyFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile(new URL('../data/dashboard.json', import.meta.url), 'utf8'));
if (snapshot.schemaVersion !== 1 || !snapshot.generatedAt || !snapshot.sources) throw new Error('Invalid dashboard snapshot');
await mkdir(new URL('../dist/data/', import.meta.url), {recursive:true});
for (const name of ['index.html', 'styles.css', 'app.js']) await copyFile(new URL('../site/' + name, import.meta.url), new URL('../dist/' + name, import.meta.url));
await copyFile(new URL('../data/dashboard.json', import.meta.url), new URL('../dist/data/dashboard.json', import.meta.url));
console.log('Built dist/ with static assets and the public data snapshot.');
