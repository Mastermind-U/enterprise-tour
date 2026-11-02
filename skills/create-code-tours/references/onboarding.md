# Onboarding to a software domain or context

The goal is to give a new developer a map of business capabilities: why the context exists, which operations it supports, and a brief explanation of how each one works.

## Overview route

1. Start with the problem being solved, terminology, and responsibility boundaries. Show who initiates operations and what counts as a successful outcome.
2. Name the main business operations and the purpose of each: for example, creating something, applying a rule, reading a result, or cancelling an operation. Choose operations from the actual application API, rather than a generic CRUD template.
3. Show the key entities and value types: their identity, important states, and invariants. Explain DTOs as data crossing a boundary, rather than as business capabilities in their own right.
4. For **each main operation**, give a brief path: trigger and input → rule being checked → loading or calculation → state change or response → commit or side effect. One or two steps per operation are usually enough in an overview.
5. Explain connections to neighboring contexts at the actual call site, and show which context owns the decision. Include dependency registration or a storage adapter only when it is needed to understand execution.
6. Finish with a suggested order for further study and precise pointers to detailed scenarios or tests.

A small context may need only one tour. For a large context, put independent business scenarios in separate, short tours; the overview must still briefly explain each main operation, rather than merely listing their names.

## What makes the explanation useful

- “The operation lets the user …; it accepts …, checks …, and saves or returns ….”
- “This entity stores …; its state changes here, and the … check prevents ….”
- For a query, explicitly state that it makes no business state changes; for a command, identify the point of change and the transaction boundary.
- Show a significant failure and the consequences of cancellation when they affect the operation's contract.

Do not turn the route into a list of folders, classes, and every HTTP endpoint. Do not describe historical changes without a selected comparison: this mode explains the current system.
