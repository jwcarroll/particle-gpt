# Particle GPT documentation

This directory is the progressive-discovery entrypoint for humans and LLM agents. Begin with the smallest document that answers the task; follow links only when the work crosses that boundary.

## Choose a path

| If you need to…                           | Read                                             | Why                                                                         |
| ----------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Make any repository change                | [`../AGENTS.md`](../AGENTS.md)                   | Operating rules, invariants, commands, and validation expectations          |
| Understand runtime behavior               | [`architecture.md`](architecture.md)             | Composition, frame flow, state ownership, and current limitations           |
| Build, test, or review a change           | [`development.md`](development.md)               | Workflow and risk-based validation matrix                                   |
| Touch benchmarks or performance           | [`benchmarking.md`](benchmarking.md)             | Measurement lifecycle, manifest, and comparison rules                       |
| Prepare a commit or release               | [`versioning.md`](versioning.md)                 | Semantic Versioning, commit syntax, and release checklist                   |
| Implement the modernization roadmap       | [`improvement-spec.html`](improvement-spec.html) | Standalone requirements, work packages, acceptance criteria, and sequencing |
| Change a recorded architectural direction | [`adrs/README.md`](adrs/README.md)               | Decision index and ADR lifecycle                                            |

## Source-of-truth hierarchy

1. Repository code describes **current implemented behavior**.
2. Accepted ADRs describe **intended architectural constraints**.
3. The improvement specification describes **planned outcomes and sequencing**.
4. Supporting Markdown explains context and working practice.

ADR-0001, ADR-0002, and ADR-0005 are accepted and partially or fully implemented. Other proposed ADRs are guidance for implementation and review, but must not be described as completed behavior.

## Documentation maintenance

Update documentation in the same pull request when a change affects:

- build or validation commands;
- public types, units, lifecycle, or ownership;
- persisted state or benchmark result formats;
- renderer or plugin capability contracts;
- known limitations listed in `AGENTS.md`;
- an acceptance criterion in the improvement specification.

Prefer short, focused pages and links over duplicating large explanations. Keep the HTML specification standalone so it remains useful when opened directly from disk.
