# ADR-0006: Complete workloads and scene configurations

- Status: Accepted
- Date: 2026-11-08
- Supersedes: ADR-0005 persisted-format and legacy-comparison policy; its immutable-workload and restoration principles remain in force.

## Decision

New benchmark records use manifest schema 2, adding serializable color policies, field/emitter instances, presentation state, and declared plugin schema/evaluation modes. Unknown metadata must never be replaced with a generic compatibility token. Schema-1 records retain their original content as readable/exportable/deletable history, excluded from comparisons. Import is all-or-nothing and persistence failure is visible.

Scene configuration schema 1 stores initialization settings/seed and plugin configuration, not an in-progress particle replay. Shared logical dimensions remain fixed until explicitly fitted to the window. Radial plugin schema 2 retains the stable ID and adds an evaluation mode; older configuration migrates to uniform centroid semantics. New configurations default to per-particle evaluation.

Benchmark execution is an edit-locked transaction that restores world, RNG, plugin runtime, clock, pause, and presentation state. Unavoidable resize, DPR, visibility, and renderer changes invalidate the transaction. Timeout and cancellation do not produce completed baselines.

## Consequences and validation

The new format is an intentional persisted-contract change and must be called out in release notes. No old record is destructively rewritten or silently dropped merely for being schema 1. Unit/browser coverage verifies mismatch rejection, atomic import, history export, exact restoration, context loss, deterministic scenes, and paused capture. Actual native browser zoom and hardware-specific performance remain host acceptance checks.
