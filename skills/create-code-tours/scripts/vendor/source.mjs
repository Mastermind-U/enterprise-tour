// Bundled into ajv-draft4.mjs for offline use; see references/validator-build.md.
import Ajv from "ajv-draft-04";

// Ajv also recognizes OpenAPI and newer-draft keywords. Under Draft 4 these
// names are annotations, not validation rules. Only visit schema positions:
// literal values in enum/default must remain untouched.
function draft4Schema(schema) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  const result = { ...schema };
  for (const name of ["$async", "nullable", "const", "contains", "propertyNames", "if", "then", "else"]) {
    delete result[name];
  }
  for (const name of ["properties", "patternProperties", "definitions", "dependencies"]) {
    const children = result[name];
    if (children && typeof children === "object" && !Array.isArray(children)) {
      result[name] = Object.fromEntries(
        Object.entries(children).map(([key, child]) => [key, draft4Schema(child)]),
      );
    }
  }
  for (const name of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(result[name])) result[name] = result[name].map(draft4Schema);
  }
  for (const name of ["additionalProperties", "additionalItems", "not", "items"]) {
    if (Object.hasOwn(result, name)) {
      result[name] = Array.isArray(result[name])
        ? result[name].map(draft4Schema)
        : draft4Schema(result[name]);
    }
  }
  return result;
}

export function compileSchema(schema) {
  const ajv = new Ajv({
    strict: false,
    validateFormats: false,
    logger: false,
    allErrors: false,
    ignoreKeywordsWithRef: true,
  });
  const validate = ajv.compile(draft4Schema(schema));
  if (validate.$async) throw new Error("Asynchronous validators are unsupported");
  return validate;
}
