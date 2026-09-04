# Versioning and commit policy

## Release version

Particle GPT follows [Semantic Versioning](https://semver.org/) using `MAJOR.MINOR.PATCH`:

- increment **MAJOR** for incompatible changes to user-visible behavior, persisted formats, documented integration contracts, or other declared public interfaces;
- increment **MINOR** for backward-compatible features;
- increment **PATCH** for backward-compatible bug fixes;
- use a prerelease suffix such as `-alpha.1` or `-rc.1` only for intentionally unstable release candidates.

The authoritative version appears in both `package.json` and the root package entry in `package-lock.json`. Release tags use the strict three-part form `vMAJOR.MINOR.PATCH`. Legacy two-part tags remain historical; do not copy their format for new releases.

This repository is a private browser application. Internal TypeScript types are not automatically public API, but persisted benchmark data, shared scene formats, documented plugin contracts, and user-visible behavior are release contracts. Call out uncertainty before choosing a lower version bump.

## Conventional Commits

Every commit subject uses:

```text
type(optional-scope): imperative summary
```

Common types:

- `feat` — a new capability; normally included in a minor release;
- `fix` — a defect correction; normally included in a patch release;
- `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore` — focused non-feature work;
- `revert` — reverts an earlier commit.

Use `!` after the type or scope and include a `BREAKING CHANGE:` footer when a commit changes a declared public contract incompatibly. Keep the subject concise, imperative, and free of a trailing period.

Examples:

```text
feat(simulation): add fixed-step physics clock
fix(benchmark): reject mismatched run manifests
docs(adr): accept renderer capability policy
feat(storage)!: version benchmark result schema
```

## Release checklist

1. Confirm the intended change set and select the SemVer bump from the public impact.
2. Update both package version fields and any documentation that names the current release.
3. Run `npm test`, `npm run build`, and the task-specific checks in `development.md`.
4. Commit with a Conventional Commit subject.
5. Create an annotated `vMAJOR.MINOR.PATCH` tag on the validated release commit.
6. Do not move or reuse a published release tag; issue a new patch version for corrections.
