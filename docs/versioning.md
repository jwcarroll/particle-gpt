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

## Automated release process

Release Please runs on every push to `main` and uses Conventional Commit history to calculate the next SemVer version.

1. Normal changes land on `main` with Conventional Commit subjects.
2. Release Please opens or updates one **Release PR** containing the calculated version, `package-lock.json`, and generated changelog entry.
3. Review and merge that Release PR when its proposed version and notes are correct.
4. The next workflow run creates the `vMAJOR.MINOR.PATCH` tag and GitHub release.

`release-please-config.json` and `.release-please-manifest.json` are source-controlled release state. The manifest starts at the existing `2.1.0` release and the bootstrap SHA prevents older history from being included in the first automated release.

Do not manually edit release versions, prepend changelog release sections, or create release tags during ordinary feature work. Use `release-as` in the Release Please configuration only for an intentional override, and never move or reuse a published tag.

The default GitHub Actions token can create the Release PR and release when repository **Settings → Actions → General → Workflow permissions** grants read/write access and enables **Allow GitHub Actions to create and approve pull requests**. Keep the workflow's least-privilege `permissions` block aligned with that setting. If branch policy requires CI checks to execute on an action-created Release PR, configure a fine-grained bot token with repository contents and pull-request write access as the workflow token; GitHub does not recursively trigger workflows from the default token.
