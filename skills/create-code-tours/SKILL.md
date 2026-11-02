---
name: create-code-tours
description: Create CodeTour .tours/*.tour files for onboarding to a software domain or bounded context, explaining Git changes through cause and effect, or walking business logic in complete control-flow blocks. Use for navigable source-code tours.
---

# Create Code Tours

Create ready-to-use `.tours/*.tour` JSON files that guide readers from the business problem to the code's behavior. Write titles and descriptions in the language requested by the user; otherwise, match the language of their request. Choose the mode that fits the task rather than generating all three modes automatically.

Apply the guidance to the source language and programming model in use. Explain equivalent constructs by their role; use clearly labeled pseudocode in annotations when it helps, while keeping source anchors tied to the actual implementation.

Keep reusable examples domain-neutral, using placeholders for values, data sources, conditions, and errors. In generated tours, use the actual names and rules found in the repository rather than assuming a predefined domain model.

## Choose a Mode

| Request | What to explain | Read |
| --- | --- | --- |
| Onboarding to a domain, context, or subsystem | Why its business operations exist, how data is organized, and how each operation works at a glance | [references/onboarding.md](references/onboarding.md) |
| A tour of a diff, PR, or change | Requirement → previous behavior → decision → new behavior → consequences | [references/diff.md](references/diff.md) |
| A business-logic walkthrough | Execution flow, branches, and state changes in complete blocks | [references/business-logic.md](references/business-logic.md) |

If the request combines modes, separate the overview from detailed scenarios. Let the complexity of the behavior determine the length: a short tour has one clear purpose, not an arbitrary step limit.

## Preparation

1. Determine the scope from the request, current code, and Git state. If the recent conversation and current diff concern different tasks and the distinction changes the result, ask one scope question. A request for a tour does not authorize implementation changes.
2. Read the repository instructions and existing tours. Preserve other tours, `.tours/.gitignore`, and configuration; do not run `git add -f`, commit, or restructure the project to produce documentation.
3. Locate the actual operation entry point, DTOs, application rules, entities, gateways, transactions, and relevant tests. Follow execution order rather than alphabetical file order or method placement. Explain why each transition to the next component is needed.
4. Distinguish deductions from code, assertions covered by tests, and checks actually run. Do not invent a previous version for onboarding or business-logic tours; before-and-after comparison is required specifically in diff mode.

## Format and Source Anchors

- Use the [official CodeTour schema](https://raw.githubusercontent.com/microsoft/codetour/main/schema.json). A copy for offline validation is bundled at `references/codetour.schema.json`; check it against the original when the format changes.
- The schema requires `title` and `steps` for a tour and `description` for a step. This skill adds the following requirements: **every step has a nonempty title and description**, and every code step has an existing `file` relative to the repository root and an exact integer `line`, starting at 1. Only introductory steps may omit a source anchor.
- For a complete block, set `line` to its first line and `selection` from the header through the block's final token, including its closing delimiter where applicable. Both `selection.start/end.line` and `character` are 1-based; place the end immediately after that token. If a line contains both a block ending and the next branch header, use precise character positions to keep the selections separate. Code steps still require `line`; `pattern` does not replace it.
- Connect the business purpose, input data, applied rule, result, and next step in each description. Explain state changes, errors, invariants, commit/rollback boundaries, locks, and external effects where they matter. Do not repeat the same checklist of incidental details in every step.
- Keep each step concise: a few connected sentences about one decision rather than a line-by-line paraphrase. Explain an unknown guarantee once at the relevant boundary instead of repeating the caveat in every subsequent step.
- A short example of data passed between components is useful; do not copy credentials, keys, or real sensitive records into a tour.
- Create one overview and separate short scenario tours when the scope has multiple independent paths. Numeric prefixes and descriptive filenames provide a useful reading order; do not overwrite an unrelated tour with the same number.
- `nextTour` contains the exact **title** of the next tour, not its filename. Use it to express the chosen reading order without cycles. Set `isPrimary: true` on the overview only when appropriate and no other primary tour exists; do not change an existing primary tour unnecessarily.

## Validate the Result

The bundled validator runs on Node.js 18 or newer and checks source files in any language. Its JSON Schema Draft 4 engine is included, so it needs no Python, npm installation, network requests, or project configuration changes:

```sh
node "<skill-dir>/scripts/validate_tours.mjs" --root "<repository-root>" .tours/overview.tour .tours/scenario.tour
```

Without a file list, it checks all `.tours/*.tour` files. Use `--schema <path>` to select another verified local Draft 4 schema explicitly. Validation covers JSON, duplicate keys, the schema, this skill's required fields, source files and lines, `selection` ranges, unique tour titles, and valid `nextTour` links.

If that runtime is unavailable, use an available JSON Schema validator and check source anchors, selections, and tour links directly. State which checks were performed; do not change the target project's tooling merely to validate documentation.

Read [references/validator-build.md](references/validator-build.md) only when maintaining the helper or rebuilding its bundled schema engine. The normal validation command above requires no build step.

Then read each selected code fragment together with its description: mechanical validation does not establish semantic accuracy, branch coverage, or appropriate granularity. Recheck line anchors when reusing tours. Run suitable whitespace/diff checks; remember that ordinary `git diff --check` does not check ignored or untracked files. Creating tours does not require running product tests; do not claim they were run.

In the response, link to the starting tour, list the scenarios created, and briefly state which checks were performed.
