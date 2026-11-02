import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scriptDirectory, 'validate_tours.mjs');
const bundledSchemaPath = path.join(scriptDirectory, '..', 'references', 'codetour.schema.json');
const bundledSchemaText = fs.readFileSync(bundledSchemaPath, 'utf8');
const bundledSchema = JSON.parse(bundledSchemaText);

function step(overrides = {}) {
  return { title: 'Inspect the operation', description: 'Explain the actual behavior.', file: 'src/main.ts', line: 1, ...overrides };
}

function tour(overrides = {}) {
  return { title: 'Operation tour', steps: [step()], ...overrides };
}

function fixture(t, source = 'const value = 1;\nif (value) {\n  console.log("😀");\n} else {\n  console.log("no");\n}\n') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codetour-cli-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'workspace');
  fs.mkdirSync(path.join(root, '.tours'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'main.ts'), source);
  const schema = path.join(directory, 'schema.json');
  fs.writeFileSync(schema, bundledSchemaText);
  return { directory, root, schema };
}

function writeTour(f, name, value = tour()) {
  const filename = path.join(f.root, '.tours', name + '.tour');
  fs.writeFileSync(filename, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  return path.relative(f.root, filename);
}

function run(f, files = [], options = {}) {
  const args = [cli];
  if (!options.omitRoot) args.push('--root', options.root ?? f.root);
  if (!options.defaultSchema) args.push('--schema', options.schema ?? f.schema);
  args.push(...(options.args ?? []), ...files);
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd ?? f.root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI must terminate normally: ' + result.stderr);
  return result;
}

function pass(result, counts = '1 tours, 1 steps') {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp('PASS: ' + counts));
  assert.equal(result.stderr, '');
}

function fail(result, reason) {
  assert.notEqual(result.status, 0, 'Invalid input must fail: ' + result.stdout);
  assert.ok(result.stderr.trim(), 'Failures need a readable diagnostic');
  assert.doesNotMatch(result.stdout, /PASS:/);
  assert.doesNotMatch(result.stderr, /Traceback \(most recent call last\)|\n\s+at (?:async |file:|[^ \n]+\s+\()/,
    'CLI errors must not expose a runtime stack trace');
  if (reason) assert.match(result.stderr, reason);
}

test('help works without a repository or schema and documents the supported arguments', (t) => {
  const f = fixture(t);
  const result = run(f, [], { root: path.join(f.directory, 'missing'), schema: path.join(f.directory, 'missing.json'), args: ['--help'] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--root/);
  assert.match(result.stdout, /--schema/);
  assert.match(result.stdout, /tour/i);
  assert.equal(result.stderr, '');
});

test('default schema and default root discover .tours/*.tour without recursing', (t) => {
  const f = fixture(t);
  writeTour(f, '01-first');
  fs.writeFileSync(path.join(f.root, '.tours', 'README.md'), 'not JSON');
  fs.mkdirSync(path.join(f.root, '.tours', 'nested'));
  fs.writeFileSync(path.join(f.root, '.tours', 'nested', 'invalid.tour'), 'not JSON');
  pass(run(f, [], { omitRoot: true, defaultSchema: true }));
});

test('relative and absolute positional tours are selected explicitly', (t) => {
  const f = fixture(t);
  const first = writeTour(f, 'first');
  const second = writeTour(f, 'second', tour({ title: 'Second tour' }));
  fs.writeFileSync(path.join(f.root, '.tours', 'unselected.tour'), 'malformed');
  pass(run(f, [first, path.join(f.root, second)]), '2 tours, 2 steps');
});

test('schema allows unknown properties at every level', (t) => {
  const f = fixture(t);
  const value = tour({
    extra: { enabled: true },
    steps: [step({
      extra: ['anything'],
      selection: {
        start: { line: 1, character: 1, extra: false },
        end: { line: 1, character: 2, extra: { nested: true } },
        extra: 42,
      },
    })],
  });
  pass(run(f, [writeTour(f, 'extras', value)]));
});

test('JSON property names inherited from Object.prototype remain legal extension keys', (t) => {
  const f = fixture(t);
  const raw = '{"title":"Operation tour","steps":[{"title":"Step","description":"Description","file":"src/main.ts","line":1}],"__proto__":{"polluted":true},"constructor":"value","toString":1}';
  pass(run(f, [writeTour(f, 'prototype-keys', raw)]));
});

test('introductory steps can precede source anchors', (t) => {
  const f = fixture(t);
  pass(run(f, [writeTour(f, 'intro', tour({ steps: [
    { title: 'Purpose', description: 'Business context.', view: 'explorer' },
    step(),
  ] }))]), '1 tours, 2 steps');
});

const badSchemaValues = [
  ['tour null', () => null],
  ['tour array', () => []],
  ['missing title', () => ({ steps: [step()] })],
  ['numeric title', () => tour({ title: 3 })],
  ['missing steps', () => ({ title: 'Tour' })],
  ['steps object', () => tour({ steps: {} })],
  ['null step', () => tour({ steps: [null] })],
  ['step array', () => tour({ steps: [[]] })],
  ['numeric description', () => tour({ steps: [step({ description: 12 })] })],
  ['boolean primary marker', () => tour({ isPrimary: 'true' })],
  ['numeric tour description', () => tour({ description: 4 })],
  ['numeric git ref', () => tour({ ref: 4 })],
  ['numeric stepMarker', () => tour({ stepMarker: 4 })],
  ['numeric when', () => tour({ when: 4 })],
  ['nonstring file', () => tour({ steps: [step({ file: 1 })] })],
  ['nonstring directory', () => tour({ steps: [step({ directory: false })] })],
  ['empty view', () => tour({ steps: [step({ view: '' })] })],
  ['numeric uri', () => tour({ steps: [step({ uri: 3 })] })],
  ['numeric pattern', () => tour({ steps: [step({ pattern: 3 })] })],
  ['commands object', () => tour({ steps: [step({ commands: {} })] })],
  ['nonstrings in commands', () => tour({ steps: [step({ commands: ['command:good', 1] })] })],
  ['selection array', () => tour({ steps: [step({ selection: [] })] })],
  ['selection missing end', () => tour({ steps: [step({ selection: { start: { line: 1, character: 1 } } })] })],
  ['selection null start', () => tour({ steps: [step({ selection: { start: null, end: { line: 1, character: 2 } } })] })],
  ['selection missing character', () => tour({ steps: [step({ selection: { start: { line: 1 }, end: { line: 1, character: 2 } } })] })],
  ['selection string line', () => tour({ steps: [step({ selection: { start: { line: '1', character: 1 }, end: { line: 1, character: 2 } } })] })],
];
for (const [name, value] of badSchemaValues) {
  test('schema rejects ' + name, (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'invalid', value())]));
  });
}

const badContent = [
  ['blank tour title', tour({ title: ' \t\n' })],
  ['empty steps', tour({ steps: [] })],
  ['missing step title', { title: 'Tour', steps: [{ description: 'Description', file: 'src/main.ts', line: 1 }] }],
  ['blank step title', tour({ steps: [step({ title: '\t ' })] })],
  ['blank step description', tour({ steps: [step({ description: '\n ' })] })],
  ['no source anchor', tour({ steps: [{ title: 'Intro', description: 'Context' }] })],
  ['nonintroductory unanchored step', tour({ steps: [step(), { title: 'Later', description: 'Context' }] })],
  ['unanchored line', tour({ steps: [{ title: 'Intro', description: 'Context', line: 1 }, step()] })],
  ['unanchored selection', tour({ steps: [{ title: 'Intro', description: 'Context', selection: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } } }, step()] })],
  ['pattern without exact line', tour({ steps: [{ title: 'Step', description: 'Description', file: 'src/main.ts', pattern: 'const' }] })],
];
for (const [name, value] of badContent) {
  test('skill contract rejects ' + name, (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'invalid', value)]));
  });
}

for (const line of [0, -1, 1.25, true, '1', null, 7]) {
  test('source anchor rejects non-1-based-integer or out-of-bounds line ' + JSON.stringify(line), (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'invalid', tour({ steps: [step({ line })] }))]));
  });
}

for (const filename of ['', '   ', 'src\\main.ts', '/src/main.ts', 'C:/src/main.ts', 'C:src/main.ts', '../outside.ts', 'src/../../outside.ts', 'src/missing.ts', 'src']) {
  test('source anchor rejects invalid path ' + JSON.stringify(filename), (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.directory, 'outside.ts'), 'outside\n');
    fail(run(f, [writeTour(f, 'invalid', tour({ steps: [step({ file: filename })] }))]));
  });
}

test('a symlink cannot escape the repository root', (t) => {
  const f = fixture(t);
  const outside = path.join(f.directory, 'outside.ts');
  fs.writeFileSync(outside, 'outside\n');
  try {
    fs.symlinkSync(outside, path.join(f.root, 'src', 'outside-link.ts'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      t.skip('Creating file symlinks is unavailable: ' + error.code);
      return;
    }
    throw error;
  }
  fail(run(f, [writeTour(f, 'invalid', tour({ steps: [step({ file: 'src/outside-link.ts' })] }))]));
});

test('blank anchor lines are rejected', (t) => {
  const f = fixture(t, 'first\n \t \nlast\n');
  fail(run(f, [writeTour(f, 'blank', tour({ steps: [step({ line: 2 })] }))]));
});

test('empty source files are rejected', (t) => {
  const f = fixture(t, '');
  fail(run(f, [writeTour(f, 'empty')]));
});

test('a trailing newline does not create a phantom source line', (t) => {
  const f = fixture(t, 'first\n');
  fail(run(f, [writeTour(f, 'phantom', tour({ steps: [step({ line: 2 })] }))]));
});

test('CRLF source lines are counted without retaining CR characters', (t) => {
  const f = fixture(t, 'first\r\nsecond\r\n');
  pass(run(f, [writeTour(f, 'crlf', tour({ steps: [step({ line: 2, selection: { start: { line: 2, character: 1 }, end: { line: 2, character: 7 } } })] }))]));
});

test('UTF-16 columns include both code units of an emoji', (t) => {
  const f = fixture(t, 'a😀z\n');
  pass(run(f, [writeTour(f, 'emoji', tour({ steps: [step({ selection: { start: { line: 1, character: 1 }, end: { line: 1, character: 5 } } })] }))]));
});

test('UTF-16 columns reject positions past the final code unit plus one', (t) => {
  const f = fixture(t, 'a😀z\n');
  fail(run(f, [writeTour(f, 'emoji', tour({ steps: [step({ selection: { start: { line: 1, character: 1 }, end: { line: 1, character: 6 } } })] }))]));
});

test('adjacent branch selections can split a shared source line precisely', (t) => {
  const f = fixture(t);
  pass(run(f, [writeTour(f, 'branches', tour({ steps: [
    step({ line: 2, selection: { start: { line: 2, character: 1 }, end: { line: 4, character: 2 } } }),
    step({ line: 4, selection: { start: { line: 4, character: 3 }, end: { line: 6, character: 2 } } }),
  ] }))]), '1 tours, 2 steps');
});

const badSelections = [
  ['empty range', { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } }],
  ['reversed columns', { start: { line: 1, character: 3 }, end: { line: 1, character: 2 } }],
  ['backward lines', { start: { line: 2, character: 1 }, end: { line: 1, character: 2 } }],
  ['start off anchor line', { start: { line: 2, character: 1 }, end: { line: 3, character: 2 } }],
  ['zero start line', { start: { line: 0, character: 1 }, end: { line: 1, character: 2 } }],
  ['fractional start line', { start: { line: 1.5, character: 1 }, end: { line: 2, character: 2 } }],
  ['boolean start line', { start: { line: true, character: 1 }, end: { line: 2, character: 2 } }],
  ['end beyond file', { start: { line: 1, character: 1 }, end: { line: 7, character: 1 } }],
  ['zero character', { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } }],
  ['fractional character', { start: { line: 1, character: 1.5 }, end: { line: 1, character: 2 } }],
  ['boolean character', { start: { line: 1, character: true }, end: { line: 1, character: 2 } }],
  ['end character past line', { start: { line: 1, character: 1 }, end: { line: 2, character: 50 } }],
];
for (const [name, selection] of badSelections) {
  test('selection rejects ' + name, (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'invalid', tour({ steps: [step({ selection })] }))]));
  });
}

const duplicateJson = [
  ['top-level key', '{"title":"One","title":"Two","steps":[]}'],
  ['escaped top-level spelling', '{"title":"One","\\u0074itle":"Two","steps":[]}'],
  ['step key', '{"title":"Tour","steps":[{"title":"Step","description":"Description","file":"src/main.ts","line":1,"line":2}]}'],
  ['escaped step spelling', '{"title":"Tour","steps":[{"title":"Step","description":"Description","file":"src/main.ts","line":1,"\\u006cine":2}]}'],
  ['nested extension key', '{"title":"Tour","steps":[{"title":"Step","description":"Description","file":"src/main.ts","line":1}],"extra":{"key":1,"key":2}}'],
  ['nested position key', '{"title":"Tour","steps":[{"title":"Step","description":"Description","file":"src/main.ts","line":1,"selection":{"start":{"line":1,"character":1,"character":2},"end":{"line":1,"character":3}}}]}'],
];
for (const [name, raw] of duplicateJson) {
  test('duplicate JSON keys reject ' + name, (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'duplicate', raw)]));
  });
}

for (const [name, raw] of [
  ['trailing comma', '{"title":"Tour","steps":[],}'],
  ['comment', '{"title":"Tour",/* comment */"steps":[]}'],
  ['trailing tokens', '{"title":"Tour","steps":[]} true'],
  ['truncated object', '{"title":'],
  ['UTF-8 BOM', '\ufeff' + JSON.stringify(tour())],
  ['invalid UTF-8', Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])],
]) {
  test('tour input rejects ' + name + ' without a traceback', (t) => {
    const f = fixture(t);
    fail(run(f, [writeTour(f, 'malformed', raw)]));
  });
}

test('source input requires well-formed UTF-8 instead of replacement decoding', (t) => {
  const f = fixture(t, Buffer.from([0x63, 0x6f, 0x64, 0x65, 0x20, 0xc3, 0x28]));
  fail(run(f, [writeTour(f, 'source-encoding')]));
});

for (const [name, raw] of [
  ['malformed JSON', '{"type":'],
  ['duplicate JSON keys', '{"type":"object","type":"array"}'],
  ['escaped duplicate JSON keys', '{"type":"object","\\u0074ype":"array"}'],
  ['invalid UTF-8', Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d])],
  ['unknown schema type', '{"type":"not-a-type"}'],
  ['bad required keyword', '{"type":"object","required":"title"}'],
  ['boolean instead of Draft4 schema', 'true'],
]) {
  test('schema input rejects ' + name + ' without a traceback', (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.schema, raw);
    fail(run(f, [writeTour(f, 'schema-error')]));
  });
}

function customSchema() {
  return {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: { ...bundledSchema.properties, approval: { $ref: '#/definitions/approval~0value' } },
    required: ['title', 'steps', 'approval'],
    additionalProperties: false,
    allOf: [{ $ref: '#/definitions/review/rule' }],
    definitions: {
      'approval~value': { type: 'string', enum: ['reviewed'] },
      review: { rule: { properties: { title: { pattern: '^Approved ' }, steps: { minItems: 2 } } } },
    },
  };
}

test('custom Draft4 schema resolves local refs and allOf and accepts a conforming tour', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.schema, JSON.stringify(customSchema()));
  pass(run(f, [writeTour(f, 'custom', tour({ title: 'Approved operation', approval: 'reviewed', steps: [step(), step({ line: 2 })] }))]), '1 tours, 2 steps');
});

for (const [name, overrides] of [
  ['referenced enum', { approval: 'unchecked' }],
  ['allOf pattern', { title: 'Unapproved operation' }],
  ['allOf minItems', { steps: [step()] }],
  ['additionalProperties false', { unexpected: true }],
]) {
  test('custom Draft4 schema enforces ' + name, (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.schema, JSON.stringify(customSchema()));
    const value = tour({ title: 'Approved operation', approval: 'reviewed', steps: [step(), step({ line: 2 })], ...overrides });
    fail(run(f, [writeTour(f, 'custom-invalid', value)]));
  });
}

test('custom Draft4 additionalProperties can validate extension values', (t) => {
  const f = fixture(t);
  const schema = { ...bundledSchema, additionalProperties: { type: 'integer', minimum: 1 } };
  fs.writeFileSync(f.schema, JSON.stringify(schema));
  pass(run(f, [writeTour(f, 'valid-extension', tour({ rank: 1 }))]));
  fail(run(f, [writeTour(f, 'invalid-extension', tour({ rank: 'one' }))]));
});

test('selected tours can link by exact title to an existing unselected tour', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected', tour({ nextTour: 'Next exact title' }));
  writeTour(f, 'target', tour({ title: 'Next exact title' }));
  pass(run(f, [selected]));
});

test('selected tour links traverse existing unselected targets', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected', tour({ nextTour: 'Second' }));
  writeTour(f, 'second', tour({ title: 'Second', nextTour: 'Third' }));
  writeTour(f, 'third', tour({ title: 'Third' }));
  pass(run(f, [selected]));
});

test('duplicate selected tour titles are rejected', (t) => {
  const f = fixture(t);
  const first = writeTour(f, 'first');
  const second = writeTour(f, 'second');
  fail(run(f, [first, second]));
});

test('duplicate title between selected and unselected tours is rejected', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected');
  writeTour(f, 'other');
  fail(run(f, [selected]));
});

test('duplicate unselected titles are rejected', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected');
  writeTour(f, 'other-one', tour({ title: 'Other' }));
  writeTour(f, 'other-two', tour({ title: 'Other' }));
  fail(run(f, [selected]));
});

for (const [name, nextTour] of [['missing title', 'Missing'], ['filename instead of title', 'target.tour'], ['wrong title case', 'target title'], ['blank title', '  '], ['nonstring title', 5]]) {
  test('nextTour rejects ' + name, (t) => {
    const f = fixture(t);
    const selected = writeTour(f, 'selected', tour({ nextTour }));
    writeTour(f, 'target', tour({ title: 'Target Title' }));
    fail(run(f, [selected]));
  });
}

test('nextTour rejects a self-cycle', (t) => {
  const f = fixture(t);
  fail(run(f, [writeTour(f, 'self', tour({ nextTour: 'Operation tour' }))]));
});

test('nextTour rejects cycles through unselected tours', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected', tour({ nextTour: 'Second' }));
  writeTour(f, 'second', tour({ title: 'Second', nextTour: 'Third' }));
  writeTour(f, 'third', tour({ title: 'Third', nextTour: 'Second' }));
  fail(run(f, [selected]));
});

test('nextTour rejects a missing target reached through an unselected tour', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected', tour({ nextTour: 'Second' }));
  writeTour(f, 'second', tour({ title: 'Second', nextTour: 'Missing' }));
  fail(run(f, [selected]));
});

test('unselected malformed tours are ignored when no selected link needs them', (t) => {
  const f = fixture(t);
  const selected = writeTour(f, 'selected');
  fs.writeFileSync(path.join(f.root, '.tours', 'broken.tour'), 'broken');
  fs.writeFileSync(path.join(f.root, '.tours', 'bad-encoding.tour'), Buffer.from([0xc3, 0x28]));
  pass(run(f, [selected]));
});

test('missing root is reported as a normal CLI error', (t) => {
  const f = fixture(t);
  fail(run(f, [], { root: path.join(f.directory, 'missing') }));
});

test('a regular file cannot be the repository root', (t) => {
  const f = fixture(t);
  fail(run(f, [], { root: f.schema }));
});

test('an empty default tour selection fails', (t) => {
  const f = fixture(t);
  fail(run(f));
});

test('missing selected tour and missing schema fail without tracebacks', (t) => {
  const f = fixture(t);
  fail(run(f, ['.tours/missing.tour']));
  fail(run(f, [writeTour(f, 'exists')], { schema: path.join(f.directory, 'missing-schema.json') }));
});

for (const args of [['--unknown-option'], ['--root'], ['--schema']]) {
  test('argument errors are readable: ' + args.join(' '), (t) => {
    const f = fixture(t);
    fail(run(f, [], { args }));
  });
}

test('CR-only source lines use editor line conventions', (t) => {
  const f = fixture(t, 'first\rsecond\r');
  pass(run(f, [writeTour(f, 'cr', tour({ steps: [step({ line: 2, selection: { start: { line: 2, character: 1 }, end: { line: 2, character: 7 } } })] }))]));
});

test('a Windows directory junction cannot escape the repository root', { skip: process.platform !== 'win32' }, (t) => {
  const f = fixture(t);
  const outside = path.join(f.directory, 'outside-directory');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'main.ts'), 'outside\n');
  const junction = path.join(f.root, 'src', 'outside-junction');
  try {
    fs.symlinkSync(outside, junction, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      t.skip('Creating directory junctions is unavailable: ' + error.code);
      return;
    }
    throw error;
  }
  try {
    assert.ok(fs.lstatSync(junction).isSymbolicLink(), 'Fixture must create a real junction');
    fail(run(f, [writeTour(f, 'junction-escape', tour({ steps: [step({ file: 'src/outside-junction/main.ts' })] }))]));
  } finally {
    fs.unlinkSync(junction);
  }
});

test('Draft4 ignores $async metadata while enforcing required fields synchronously', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.schema, JSON.stringify({
    $schema: 'http://json-schema.org/draft-04/schema#',
    $async: true,
    required: ['approval'],
  }));
  const result = run(f, [writeTour(f, 'missing-approval')]);
  fail(result);
  assert.doesNotMatch(result.stderr, /UnhandledPromiseRejection|ERR_UNHANDLED_REJECTION|unhandled rejection/i);
});

test('Draft4 accepts a valid tour with ignored $async metadata', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.schema, JSON.stringify({
    $schema: 'http://json-schema.org/draft-04/schema#',
    $async: true,
  }));
  pass(run(f, [writeTour(f, 'ignored-async')]));
});

test('Draft4 nullable annotation cannot widen a string property to null', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.schema, JSON.stringify({
    $schema: 'http://json-schema.org/draft-04/schema#',
    properties: { approval: { type: 'string', nullable: true } },
  }));
  pass(run(f, [writeTour(f, 'optional-approval')]));
  fail(run(f, [writeTour(f, 'null-approval', tour({ approval: null }))]));
});

for (const [name, keywords] of [
  ['const', { properties: { title: { const: 'A different title' } } }],
  ['if/then/else', { if: { required: ['title'] }, then: { required: ['approval'] }, else: { required: ['fallback'] } }],
  ['contains', { properties: { steps: { contains: { type: 'null' } } } }],
  ['propertyNames', { propertyNames: { pattern: '^never-matches-a-tour-property$' } }],
]) {
  test('Draft4 ignores later-draft keyword ' + name, (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.schema, JSON.stringify({
      $schema: 'http://json-schema.org/draft-04/schema#',
      ...keywords,
    }));
    pass(run(f, [writeTour(f, 'ignored-keyword')]));
  });
}
