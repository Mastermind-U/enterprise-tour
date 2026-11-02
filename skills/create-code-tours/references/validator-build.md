# Maintaining the validator

Normal users run `node scripts/validate_tours.mjs`; the bundled schema engine already includes its dependencies. The CLI and its tests use Node.js built-ins. No package installation is needed to validate tours or run the tests:

```sh
node --test scripts/validate_tours.test.mjs
```

The schema engine is Ajv with JSON Schema Draft 4 support. Its entry point is `scripts/vendor/source.mjs`, its generated runtime is `scripts/vendor/ajv-draft4.mjs`, and complete upstream license notices are in `scripts/vendor/LICENSES.txt`.

## Rebuild the bundled engine

Perform these steps only when updating the vendored dependencies or the entry point:

1. Create an empty temporary build directory outside the project being documented.
2. Copy `scripts/vendor/source.mjs` into it as `entry.mjs`, and `scripts/vendor/build.mjs` as `build.mjs`.
3. From that directory, install the pinned build and runtime dependencies:

   ```sh
   npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund ajv@8.20.0 ajv-draft-04@1.0.0 fast-deep-equal@3.1.3 fast-uri@3.1.9 json-schema-traverse@1.0.0 esbuild@0.28.2
   ```

4. Run the builder, providing the skill's vendor directory as the output location:

   ```sh
   node build.mjs "<skill-dir>/scripts/vendor"
   ```

5. Review both the generated runtime and `LICENSES.txt`, then run the CLI tests and a validation against actual tours. Check that the output works with the temporary build directory and its `node_modules` unavailable.

The build preserves upstream license text and records the exact versions included in the bundle. The validator compiles local schemas without fetching external references and does not execute commands embedded in tours.
