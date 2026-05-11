# @ftschopp/dynatable-migrations [2.0.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.3.2...@ftschopp/dynatable-migrations@2.0.0) (2026-05-11)


### Code Refactoring

* adopt functional style across core, migrations, and docs ([#53](https://github.com/ftschopp/dynatable/issues/53)) ([de6a6c4](https://github.com/ftschopp/dynatable/commit/de6a6c46aad452be51d08d7ac5886b6c4406ddea))


### BREAKING CHANGES

* (migrations): convert class-based public APIs to factory
functions to remove gratuitous OO ceremony — no behavior changes.

- MigrationRunner / DynamoDBMigrationTracker / MigrationLoader / ConfigLoader
  → createMigrationRunner / createMigrationTracker / createMigrationLoader
  → loadConfig / createDefaultConfig (free functions)
- Centralize CLI try/catch in a single runCommand helper; replace `error: any`
  with `unknown` + narrowing throughout migrations.
- Group migration statuses with a single reduce instead of four .filter passes.

Core (no behavior changes):
- buildProjectionExpression, operators.in, resolveKeys: replace forEach/for-of
  + mutation with Object.fromEntries / map composition.
- scan.dbParams / query.dbParams / update.dbParams: replace `let params: any` +
  imperative assignments with a single object literal using conditional spread;
  replace `Object.assign(allNames, …)` loops with a buildSection helper that
  reduces actions into { part, names, values }.

Docs: replace `let query = …; if (cond) query = query.set(…)` with
`.set(filteredFields)` or conditional `startFrom`; switch a mutating `.sort()`
on a feed array to `.toSorted()`.

* chore: switch to createRequire in migrations CLI/loader and pin Node 22

- Replace top-level `require()` calls with `createRequire(__filename)` in
  cli.ts and loader.ts so the package compiles cleanly without falling back
  on bundler-specific shims; switch `require('ts-node')` to `await import`
  for ESM compatibility (registerTsNode is now async).
- Simplify update examples in blog-system.md: pass the partial `updates`
  object directly to `.set(...)` — Dynatable already ignores undefined
  fields, so the manual filter was redundant.
- Add .nvmrc pinning to Node 22 (matches engines field in package.json).

## @ftschopp/dynatable-migrations [1.3.2](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.3.1...@ftschopp/dynatable-migrations@1.3.2) (2026-05-10)


### Bug Fixes

* **migrations:** unify tracker timestamps to ISO 8601; add --major/--minor/--patch flags to create ([#47](https://github.com/ftschopp/dynatable/issues/47)) ([24f9bea](https://github.com/ftschopp/dynatable/commit/24f9beac9b0f920561515a7bb86228f34ba67327)), closes [#17](https://github.com/ftschopp/dynatable/issues/17) [#17](https://github.com/ftschopp/dynatable/issues/17)

## @ftschopp/dynatable-migrations [1.3.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.3.0...@ftschopp/dynatable-migrations@1.3.1) (2026-05-10)


### Performance Improvements

* **migrations:** cache migration loader and avoid per-step rollback queries ([#43](https://github.com/ftschopp/dynatable/issues/43)) ([38724ef](https://github.com/ftschopp/dynatable/commit/38724efaf8b6c0b52696d4c55a3b9b2c47cc745c))

# @ftschopp/dynatable-migrations [1.3.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.6...@ftschopp/dynatable-migrations@1.3.0) (2026-05-09)


### Features

* **migrations:** down --yes confirmation, unlock cmd, config validation, init race fix, loader error categorization ([#37](https://github.com/ftschopp/dynatable/issues/37)) ([a2f65c6](https://github.com/ftschopp/dynatable/commit/a2f65c6891e0b9642117a491d61e63a3b88428d7)), closes [#17](https://github.com/ftschopp/dynatable/issues/17)

## @ftschopp/dynatable-migrations [1.2.6](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.5...@ftschopp/dynatable-migrations@1.2.6) (2026-05-09)


### Bug Fixes

* **migrations:** reject non-positive --steps and --limit at the CLI boundary ([#30](https://github.com/ftschopp/dynatable/issues/30)) ([9e8484c](https://github.com/ftschopp/dynatable/commit/9e8484c039b486722e591d61af93631bd29ec238)), closes [#12](https://github.com/ftschopp/dynatable/issues/12)

## @ftschopp/dynatable-migrations [1.2.5](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.4...@ftschopp/dynatable-migrations@1.2.5) (2026-05-08)


### Bug Fixes

* **migrations:** make markAsApplied idempotent and surface typed errors ([#29](https://github.com/ftschopp/dynatable/issues/29)) ([133b836](https://github.com/ftschopp/dynatable/commit/133b83656c0891a04a155c603f53220dadaa6f87)), closes [#10](https://github.com/ftschopp/dynatable/issues/10)

## @ftschopp/dynatable-migrations [1.2.4](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.3...@ftschopp/dynatable-migrations@1.2.4) (2026-05-08)


### Bug Fixes

* **migrations:** add lock refresh and gate tracker writes on ownership ([#28](https://github.com/ftschopp/dynatable/issues/28)) ([5d9d033](https://github.com/ftschopp/dynatable/commit/5d9d0336c0e79179208209906f4c72797eb5f275)), closes [#9](https://github.com/ftschopp/dynatable/issues/9)

## @ftschopp/dynatable-migrations [1.2.3](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.2...@ftschopp/dynatable-migrations@1.2.3) (2026-05-08)


### Bug Fixes

* **migrations:** use compareSemver instead of localeCompare for version sorting ([#24](https://github.com/ftschopp/dynatable/issues/24)) ([5d19158](https://github.com/ftschopp/dynatable/commit/5d19158089cf720c69c5831b7406fcf63aa3b6fc)), closes [#16](https://github.com/ftschopp/dynatable/issues/16) [#7](https://github.com/ftschopp/dynatable/issues/7)

## @ftschopp/dynatable-migrations [1.2.2](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.1...@ftschopp/dynatable-migrations@1.2.2) (2026-05-05)


### Bug Fixes

* migration next version ([af97480](https://github.com/ftschopp/dynatable/commit/af97480882af546a58957474f9fef46697314bb3))

## @ftschopp/dynatable-migrations [1.2.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.2.0...@ftschopp/dynatable-migrations@1.2.1) (2026-04-29)


### Bug Fixes

* get keyname for attribute index ([5bd47c3](https://github.com/ftschopp/dynatable/commit/5bd47c38585c78153ff51f5e457777e928d6e667))

# @ftschopp/dynatable-migrations [1.2.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.1.0...@ftschopp/dynatable-migrations@1.2.0) (2026-03-06)


### Features

* add migrations playground ([660acf8](https://github.com/ftschopp/dynatable/commit/660acf84d5ddbedba87b86310b1a9f70886c6fde))

# @ftschopp/dynatable-migrations [1.1.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-migrations@1.0.0...@ftschopp/dynatable-migrations@1.1.0) (2026-01-20)


### Features

* improve types ([3a87c5c](https://github.com/ftschopp/dynatable/commit/3a87c5c37565f92d8c4a4790396eefa57cd9a5c5))

# @ftschopp/dynatable-migrations 1.0.0 (2026-01-10)


### Features

* major initial release ([e282548](https://github.com/ftschopp/dynatable/commit/e28254895a40fdc26bab1dde2c634f663857ec16))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
