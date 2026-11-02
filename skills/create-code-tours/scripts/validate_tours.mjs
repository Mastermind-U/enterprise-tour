#!/usr/bin/env node
/** Validate CodeTour JSON and working-tree source anchors without npm setup. */

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import { compileSchema } from "./vendor/ajv-draft4.mjs";

class TourError extends Error {}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const help = `Usage: node validate_tours.mjs [--root DIR] [--schema FILE] [TOUR ...]

Validate CodeTour JSON, source anchors, selections, and nextTour links.
Without TOUR arguments, check all .tours/*.tour files under the repository root.
Relative TOUR paths are resolved from --root (default: the current directory).
--schema selects a local JSON Schema Draft 4 file; the bundled CodeTour schema
is used by default. No network requests or project configuration changes occur.
Use -- before filenames beginning with a dash.
`;

function requireCondition(condition, message) {
  if (!condition) throw new TourError(message);
}

function nonemptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readUtf8(filename) {
  return decoder.decode(readFileSync(filename));
}

// JSON.parse first checks the grammar. This token scan then detects duplicate
// object keys, including equivalent escaped spellings, before they are lost.
function rejectDuplicateKeys(text) {
  const objects = [];
  for (const match of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}]/g)) {
    const token = match[0];
    if (token === "{") {
      objects.push(new Set());
    } else if (token === "}") {
      objects.pop();
    } else {
      let next = match.index + token.length;
      while (" \r\n\t".includes(text[next]) && next < text.length) next += 1;
      if (text[next] === ":") {
        const key = JSON.parse(token);
        const keys = objects[objects.length - 1];
        requireCondition(!keys.has(key), "Duplicate JSON object key");
        keys.add(key);
      }
    }
  }
}

function loadJson(filename) {
  try {
    const text = readUtf8(filename);
    const data = JSON.parse(text);
    rejectDuplicateKeys(text);
    return data;
  } catch (error) {
    if (error instanceof TourError) throw error;
    throw new TourError(`Cannot read valid UTF-8 JSON: ${filename}`);
  }
}

function position(value, lines) {
  const { line, character } = value;
  requireCondition(
    Number.isSafeInteger(line) && line >= 1 && line <= lines.length,
    "Invalid selection line",
  );
  // JavaScript string lengths already count the UTF-16 units used by VS Code.
  requireCondition(
    Number.isSafeInteger(character) && character >= 1 && character <= lines[line - 1].length + 1,
    "Invalid selection character",
  );
  return [line, character];
}

function validateAnchor(step, root) {
  const file = step.file;
  requireCondition(
    nonemptyText(file) && !file.includes("\\") && !/^(?:\/|[A-Za-z]:)/.test(file),
    "File must be a workspace-relative path with forward slashes",
  );
  let source;
  try {
    source = realpathSync(resolve(root, file));
    const fromRoot = relative(root, source);
    requireCondition(
      fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot) && statSync(source).isFile(),
      "Source file missing or outside root",
    );
  } catch {
    throw new TourError("Source file missing or outside root");
  }
  let lines;
  try {
    lines = readUtf8(source).split(/\r\n|\r|\n/);
    if (lines[lines.length - 1] === "") lines.pop();
  } catch {
    throw new TourError("Source must be readable UTF-8 text");
  }
  requireCondition(
    Number.isSafeInteger(step.line) && step.line >= 1 && step.line <= lines.length,
    "Invalid 1-based source line",
  );
  requireCondition(lines[step.line - 1].trim().length > 0, "Source anchor points to a blank line");
  if (Object.hasOwn(step, "selection")) {
    const start = position(step.selection.start, lines);
    const end = position(step.selection.end, lines);
    requireCondition(
      start[0] < end[0] || (start[0] === end[0] && start[1] < end[1]),
      "Selection must be a non-empty forward range",
    );
    requireCondition(start[0] === step.line, "Selection must start on the anchor line");
  }
}

function validateTour(filename, root, validate) {
  const tour = loadJson(filename);
  if (!validate(tour)) {
    const error = validate.errors[0];
    throw new TourError(`Schema rule '${error.keyword}' failed at ${error.instancePath || "/"}`);
  }
  // The skill's structural requirements also apply with a custom schema.
  requireCondition(
    tour !== null && typeof tour === "object" && !Array.isArray(tour) && nonemptyText(tour.title) && Array.isArray(tour.steps) && tour.steps.length > 0,
    "Title and steps must not be empty",
  );
  let anchored = false;
  for (const [index, step] of tour.steps.entries()) {
    try {
      requireCondition(step !== null && typeof step === "object" && !Array.isArray(step), "Every step must be an object");
      requireCondition(nonemptyText(step.title), "Every step needs a title");
      requireCondition(nonemptyText(step.description), "Every step needs a description");
      if (Object.hasOwn(step, "file")) {
        validateAnchor(step, root);
        anchored = true;
      } else {
        requireCondition(!anchored, "Only introductory steps may omit a file");
        requireCondition(!Object.hasOwn(step, "line") && !Object.hasOwn(step, "selection"), "A line or selection requires a file");
      }
    } catch (error) {
      if (!(error instanceof TourError)) throw error;
      throw new TourError(`Step ${index + 1}: ${error.message}`);
    }
  }
  requireCondition(anchored, "A tour must include at least one source anchor");
  return tour;
}

function tourFiles(root) {
  const directory = resolve(root, ".tours");
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".tour") && (entry.isFile() || entry.isSymbolicLink()))
      .map((entry) => resolve(directory, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new TourError("Cannot read .tours directory");
  }
}

function validateLinks(tours, root, selected) {
  const catalog = new Map(tours);
  for (const filename of tourFiles(root)) {
    let candidate;
    try {
      if (selected.has(realpathSync(filename))) continue;
      candidate = loadJson(filename);
    } catch {
      // Unselected malformed files are not audited, but cannot supply a target.
      continue;
    }
    if (candidate && typeof candidate === "object" && nonemptyText(candidate.title)) {
      requireCondition(!catalog.has(candidate.title), "Duplicate tour title in .tours");
      catalog.set(candidate.title, candidate);
    }
  }
  for (const title of tours.keys()) {
    const seen = new Set();
    let current = title;
    while (current !== undefined) {
      requireCondition(!seen.has(current), "nextTour contains a cycle");
      requireCondition(catalog.has(current), "nextTour target title does not exist");
      seen.add(current);
      const candidate = catalog.get(current);
      requireCondition(!Object.hasOwn(candidate, "nextTour") || nonemptyText(candidate.nextTour), "nextTour must name a tour title");
      current = candidate.nextTour;
    }
  }
}

function parseArguments(args) {
  const options = {
    root: process.cwd(),
    schema: fileURLToPath(new URL("../references/codetour.schema.json", import.meta.url)),
    tours: [],
  };
  let positional = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!positional && (arg === "--help" || arg === "-h")) return { help: true };
    if (!positional && arg === "--") {
      positional = true;
    } else if (!positional && /^(?:--root|--schema)(?:=|$)/.test(arg)) {
      const equals = arg.indexOf("=");
      const name = (equals === -1 ? arg : arg.slice(0, equals)).slice(2);
      const value = equals === -1 ? args[++index] : arg.slice(equals + 1);
      requireCondition(nonemptyText(value) && !value.startsWith("--"), `Missing value for --${name}`);
      options[name] = value;
    } else {
      requireCondition(positional || !arg.startsWith("-"), `Unknown option: ${arg}`);
      options.tours.push(arg);
    }
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) {
      process.stdout.write(help);
      return 0;
    }
    let root;
    try {
      root = realpathSync(resolve(options.root));
      requireCondition(statSync(root).isDirectory(), "Repository root does not exist");
    } catch {
      throw new TourError("Repository root does not exist");
    }
    const files = options.tours.length ? options.tours.map((file) => resolve(root, file)) : tourFiles(root);
    requireCondition(files.length > 0, "No .tour files selected");
    const schema = loadJson(resolve(options.schema));
    let validate;
    try {
      requireCondition(schema !== null && typeof schema === "object" && !Array.isArray(schema), "Invalid JSON Schema");
      validate = compileSchema(schema);
    } catch {
      throw new TourError("Invalid JSON Schema");
    }
    const tours = new Map();
    const selected = new Set();
    let steps = 0;
    for (const filename of files) {
      try {
        const tour = validateTour(filename, root, validate);
        selected.add(realpathSync(filename));
        requireCondition(!tours.has(tour.title), "Duplicate tour title");
        tours.set(tour.title, tour);
        steps += tour.steps.length;
      } catch (error) {
        if (!(error instanceof TourError)) throw error;
        throw new TourError(`${basename(filename)}: ${error.message}`);
      }
    }
    validateLinks(tours, root, selected);
    process.stdout.write(`PASS: ${tours.size} tours, ${steps} steps; schema, anchors, selections and nextTour\n`);
    return 0;
  } catch (error) {
    const message = error instanceof TourError ? error.message : `Validation failed (${error.code || error.name})`;
    process.stderr.write(`ERROR: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
