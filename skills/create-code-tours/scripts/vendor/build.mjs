import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const destination = process.argv[2];
const result = await build({
  entryPoints: ['entry.mjs'],
  absWorkingDir: process.cwd(),
  outfile: resolve(destination, 'ajv-draft4.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: true,
  legalComments: 'inline',
  metafile: true,
  banner: { js: '/*! Bundled Ajv JSON Schema Draft 4 validator. See LICENSES.txt and ../../references/validator-build.md. */' },
});
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
}
let notices = 'Bundled third-party components in ajv-draft4.mjs\n\n';
for (const name of [...packages].sort()) {
  const directory = resolve('node_modules', name);
  const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  const licenseFile = readdirSync(directory).find((filename) => /^licen[cs]e(?:\.\w+)?$/i.test(filename));
  if (!licenseFile) throw new Error(`License file missing for ${name}`);
  notices += `${'='.repeat(72)}\n${name} ${metadata.version}\nhttps://www.npmjs.com/package/${name}/v/${metadata.version}\n${'='.repeat(72)}\n\n`;
  notices += readFileSync(resolve(directory, licenseFile), 'utf8').trimEnd() + '\n\n';
  console.log(`${name}@${metadata.version}`);
}
writeFileSync(resolve(destination, 'LICENSES.txt'), notices, 'utf8');
console.log(`Bundle size: ${readFileSync(resolve(destination, 'ajv-draft4.mjs')).length} bytes`);
