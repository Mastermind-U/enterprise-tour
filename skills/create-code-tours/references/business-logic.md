# Business logic in complete blocks

Follow the selected operation in execution order, explaining decisions and consequences. **A step represents a complete block of logic, not a line of code.** Use the source language's syntax; the forms below are examples of equivalent roles, not required keywords.

## Block boundaries

| Construct | Typical forms or pseudocode | Step granularity |
| --- | --- | --- |
| Conditional branch | `IF condition THEN …`, `if (…) { … }` | The header and entire branch body form one block |
| Alternative condition | `ELSE IF …`, `else if`, `elseif`, `elif` | Each alternative branch and its body form a separate block |
| Fallback branch | `ELSE …`, `else`, a default arm | A separate block when it materially changes the outcome |
| Multi-way decision | `switch/case`, `match`, pattern-matching arms | One complete logical alternative; explain fallthrough or shared arms when present |
| Iteration | `FOR EACH … DO …`, `WHILE …`, `REPEAT … UNTIL …`, asynchronous iteration | The complete loop, including its header, body, closing delimiter, and trailing condition if any; explain the items, accumulation or mutation rule, and exit |
| Resource, lock, or transaction scope | `USING resource DO …`, `using`, `with`, try-with-resources, a scope with deterministic cleanup | The entire lifetime scope from entry to exit; explain acquisition, use, and actual release or transaction guarantees |
| Consecutive short calls | A sequence of reads, gateway calls, or simple transformations | One linear block; five consecutive gateway calls form one step |
| Error handling and cleanup | `TRY … CATCH … FINALLY …`, exception handlers, explicit error-result branches | Complete meaningful sections; explain failure propagation, recovery, and guaranteed cleanup where they affect the result |

Keep short calls grouped even when their arguments span several lines: formatting does not create a new business step. If the sequence contains a real effect boundary, commit, or contract change, explain it explicitly; do not combine different phases merely to reduce the number of steps.

A nested block may have its own step when it carries an independent rule; every selected fragment must still be complete. Explain the outer context first and then the nested branches, without presenting mutually exclusive branches as though they execute consecutively. Do not split a loop into individual iterations or isolate a transaction's commit from its surrounding scope.

For cleanup registered with `defer`, or resources managed through RAII, identify the owning lifetime scope rather than treating the cleanup-registration statement as a new context. Resource cleanup does not by itself imply commit, rollback, compensation, or restoration of in-memory state; explain the behavior established by the implementation.

## How to determine ranges

- Set `line` and `selection.start` to the chosen block's header. End the selection immediately after the block's final token, including its closing delimiter, terminator, or trailing loop condition as applicable. Exclude the next branch and neighboring statements.
- When a closing delimiter and the next branch share a line, select exact character ranges. For example, in `} else if (…) {`, the previous branch ends after its closing brace and the next branch starts at `else if`; a whole-line selection would mix them.
- Use the actual source text and, where useful, a parser or syntax tree for that language. A conditional node may cover an entire alternative chain: determine the selected branch's range from its own header and body rather than the parent node's full span.
- Parser offsets may be byte counts, character counts, or zero-based positions. Convert them to CodeTour's 1-based lines and UTF-16 character positions; do not copy parser offsets without checking their units. Verify the selected fragment in the actual file.

## What to explain in each significant block

Connect the entry condition to the business rule, the data read or passed, and the result. Name the state being changed and any side effects. For a failure path, explain why it is required, what has not yet happened, and what can no longer be rolled back. For iteration, explain one item and the overall result. For a lifetime scope, explain the guarantees on success, failure, early return, and cancellation where those exits apply and the implementation establishes them.

## Annotated pseudocode example

The labels identify tour steps; they are explanatory annotations, not source syntax or statements to add to the project.

```text
[Block 1: load decision inputs]
value_1 <- READ source_1 USING input
value_2 <- READ source_2 USING value_1
value_3 <- READ source_3 USING input
value_4 <- READ source_4 USING input
value_5 <- READ source_5

[Block 2: handle the first condition]
IF condition_1 THEN
    FAIL error_1
[Block 3: handle the alternative condition]
ELSE IF condition_2 THEN
    FAIL error_2
[Block 4: compute the result]
ELSE
    result <- TRANSFORM values
END IF

[Block 5: process the collection]
FOR EACH element IN collection DO
    UPDATE result FROM element
END FOR

[Block 6: enter the persistence scope]
USING transaction_scope DO
    STAGE result
    COMMIT transaction_scope
END USING
```

The five initial reads form one step. The first condition, alternative condition, and meaningful fallback have separate steps with complete branch bodies. The loop is one block, and the persistence scope is another block including its commit and scope exit. In a finished tour, anchor steps to the actual code; keep pseudocode in descriptions only and label it as illustrative.
