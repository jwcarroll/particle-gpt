# Architecture decision records

ADRs record durable architectural direction. They do not prove that the decision has been implemented.

## Status meanings

- **Proposed** — under consideration; useful implementation guidance, not yet binding.
- **Accepted** — approved direction; implementations should conform or create a superseding ADR.
- **Superseded** — replaced by a newer ADR; retained for historical context.
- **Rejected** — considered but not adopted.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-fixed-step-simulation-clock.md) | Accepted | Use 60 Hz fixed physics with independent interpolated rendering and explicit overload handling |
| [0002](0002-explicit-particle-population-lifecycle.md) | Accepted | Make population reset, target, and emission semantics explicit |
| [0003](0003-renderer-capabilities-and-parity.md) | Proposed | Negotiate renderer capabilities and define visual parity |
| [0004](0004-self-describing-plugin-contracts.md) | Proposed | Make force and effect plugins self-describing and versioned |
| [0005](0005-versioned-benchmark-run-manifest.md) | Proposed | Store a versioned manifest with every benchmark result |

## Creating an ADR

Use the next four-digit number. Include title, status, date, context, decision, consequences, implementation notes, and validation. Accepted ADRs are immutable except for status and links; supersede rather than rewrite their rationale.
