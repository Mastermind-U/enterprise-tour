# Diff tour

The goal is to explain **why the change was needed, how its parts depend on one another, and what observable behavior resulted**.

## Establish the comparison

- If the user specified a base/head, commit, PR, or set of files, use exactly that scope.
- Otherwise, inspect the status, staged and unstaged diffs, and relevant new files. Tell the reader what the working version is being compared against. If plausible scopes differ substantially, ask which set of changes is needed.
- Read the previous and current code, then the call sites and tests. Do not infer the old behavior solely from new function names or the commit message.
- Anchor ordinary `file`/`line`/`selection` values to the current working version. Explain deleted code next to its replacement or a call site that still exists. If a tour of a historical ref is explicitly required, specify the ref and verify its source separately: the local validator checks working files, not the contents of an arbitrary Git ref.

## Cause-and-effect route

1. Describe the original problem or requirement through a concrete scenario. “Before/after” must distinguish behavior, not just files.
2. Find the first decision on which the others depend: a new invariant, input contract, state model, or responsibility boundary.
3. Guide the reader through the changes required by that decision in execution order. Explain each transition: **the previous change requires this because …; these data are now passed, and the recipient does …**.
4. Follow the flow to the observable result: a response to the user, a state change, a protected protocol call, or persisted data.
5. Show how significant errors and partial success are handled. State the actual atomicity guarantees; a local rollback does not undo an external effect or commit that has already occurred.
6. Connect regression tests to the changed contract. Distinguish an added assertion from an actual test run.

Create separate tours for independent scenarios, while retaining a shared overview of the cause and solution. A step may combine several technical edits that share one cause; there is no need for one step per diff hunk.

For a behavior-preserving refactor, explicitly state the contract being preserved and what changed in responsibilities or relationships. Do not invent a new business capability. If a motivation is not supported by a requirement or the code, label it as an assumption.
