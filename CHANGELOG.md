# Changelog

## 2.2.0

Additive, non-breaking. Default behavior is unchanged — a build without `--hash`
still writes exactly one file.

### New: content hashing & manifest (`--hash`)

- New `--hash` flag (CLI) / `hash?: boolean` option. When enabled, a build emits
  a content-hashed copy of the bundle (`bundle.<hash>.js`, SHA-256 of the final,
  post-minify bytes, 8 hex chars) **and** a manifest mapping the logical name to
  the hashed name (`{ "bundle.js": "bundle.<hash>.js" }`) for cache-busting. The
  stable `outFile` is still written, so existing references and `--watch` flows
  are unaffected.
- New `--manifest <file>` flag / `manifest?: string` option to set the manifest
  name. Default `<outfile>.manifest.json` (e.g. `bundle.js.manifest.json`) —
  namespaced to the outfile so it won't collide with an unrelated `manifest.json`.
- The manifest doubles as a cleanup ledger: in `--watch` mode each rebuild
  replaces the previous hashed file instead of accumulating orphans.
- `--hash` is ignored with `--skip-write` (no files are written); a warning is
  printed to stderr.

### New exports (`./lib`)

- `function computeContentHash(code: string, len?: number): Promise<string>`
- `function insertHashIntoFileName(fileName: string, hash: string): string`
- `function emitHashedOutputs(options): Promise<EmitHashedOutputsResult>` plus the
  `EmitHashedOutputsOptions` / `EmitHashedOutputsResult` interfaces.
- `const DEFAULT_HASH_LENGTH = 8`, `const DEFAULT_MANIFEST_SUFFIX = ".manifest.json"`.
- `BuildOptions` / `ResolvedBuildOptions` gained `hash` and `manifest` fields.

### Internal

- Watch mode now ignores **all** writes under `outDir` (not just the single
  stable output path) when deciding whether to rebuild, so the hashed file and
  manifest writes can't trigger a feedback loop.

## 2.0.0

Major cleanup and bug-fix release. Most users will not need to change anything;
the breaking changes only affect code that relied on buggy or poorly-defined
behavior.

### Breaking changes

1. **`build()` no longer calls `Deno.exit(1)` when the entry point is missing**.
   It now throws `EntryNotFoundError` (new exported class). The CLI catches this
   and still exits 1 with a clean message, so CLI behavior is unchanged. Library
   consumers previously had their process killed with no way to recover — now
   they get a typed, catchable error.

   *Migration*: wrap `build()` in `try/catch` if you want to recover; otherwise
   no change needed.

2. **`@marianmeres/deno-build/lib` no longer re-exports the esbuild bundler**.
   `buildWithEsbuild`, `minifyCode`, and `EsbuildOptions` have moved to a new
   sub-export `@marianmeres/deno-build/esbuild`. This allows the core library to
   not pull esbuild into its import graph when it isn't needed.

   *Migration*:
   ```ts
   // before
   import { buildWithEsbuild, minifyCode } from "jsr:@marianmeres/deno-build/lib";
   // after
   import { buildWithEsbuild, minifyCode } from "jsr:@marianmeres/deno-build/esbuild";
   ```

3. **`--skip-write` + `--watch` now errors (exit code 2)** instead of silently
   running a single non-watching build. The combination never worked
   meaningfully; the CLI now rejects it with a message on stderr.

4. **Progress/diagnostic messages moved from stdout to stderr**. Previously the
   version banner, `[HH:MM:SS] Building ...` line, success checkmark, and watch
   notifications were all written to stdout. They are now written to stderr.
   This makes `--skip-write` pipe-safe:
   ```bash
   deno run -A jsr:@marianmeres/deno-build --skip-write > bundle.js   # clean file
   ```
   *Migration*: scripts that grep stdout for `Building ...` must read stderr
   instead. Scripts that read the bundle from stdout will now see only the
   bundle (this is the intended behavior).

5. **`minifyCode(code)` signature gained an optional second parameter**:
   `minifyCode(code, keepAlive = false)`. Existing single-argument calls are
   unchanged in behavior. The new flag lets long-running callers opt out of
   the internal `esbuild.stop()` call.

6. **`EsbuildOptions` gained an optional `keepAlive` field**. Optional, defaults
   to `false` = previous behavior. Used internally by watch mode.

7. **`BuildOptions` gained an optional `keepEsbuildAlive` field**. Optional,
   defaults to `false` = previous behavior. Used internally by watch mode.

### Non-breaking API additions

- `BuildOptions` is now fully optional — every field has a default. Calling
  `build()` with no arguments is valid. Previous strict signatures still
  compile.
- New exports from `./lib`:
  - `class EntryNotFoundError extends Error` — thrown by `build()` when the
    entry file does not exist. Exposes `.entryPath`.
  - `interface ResolvedBuildOptions` — all fields required; `BuildOptions`
    after defaults are applied.
  - `function resolveBuildOptions(options?: BuildOptions): ResolvedBuildOptions`
  - `function supportsColor(): boolean`
  - `function logStyled(stream: "out" | "err", message: string, ...styles: string[]): void`
  - `const DEFAULT_OUT_DIR = "./dist"`
- New sub-export `./esbuild` — see BC item 2.
  - `function stopEsbuild(): void`
- `findImportMap()` now takes an optional `startDir` argument (default
  `Deno.cwd()`), and walks up ancestor directories instead of only checking
  cwd. This mirrors Deno's own config lookup.

### Bug fixes

- **`cli.ts` main()** is now properly awaited with a top-level `.catch()`.
  Previously an unhandled rejection would still crash the process but with a
  noisy doubled error message.
- **`esbuild.stop()` is now in `try/finally`** in both `buildWithEsbuild` and
  `minifyCode`. Previously a thrown error before the stop call left the
  esbuild child process running, so Deno could hang on exit.
- **Unsafe non-null assertion removed** from `buildWithEsbuild`: previously
  `result.outputFiles![0].text` could crash with "Cannot read properties of
  undefined"; now throws a clear `Error("esbuild produced no output files")`.
- **Redundant disk I/O removed** from `buildWithEsbuild`: previously the code
  was written to disk via `esbuild.build({ write: true })`, then read back
  with `Deno.readTextFile(outPath)` so the function could return it. Now
  esbuild runs with `write: false`, the text is captured from `outputFiles`,
  and the function writes to disk itself (one write, no read-back).
- **Watch-mode rebuild race fixed**: the 100ms debounce only cancelled
  timeouts that had not yet fired. Once a rebuild started, additional file
  changes could trigger parallel builds writing the same output file. Builds
  are now serialized; changes arriving during a rebuild coalesce into exactly
  one follow-up rebuild.
- **Watch-mode feedback loop fixed**: the output bundle path is now excluded
  from watch trigger events, so setting `--outdir` inside `--root` no longer
  produces an infinite rebuild loop.
- **Watch directories are validated** before entering the watcher loop; a
  missing path produces a clean error instead of an opaque `Deno.watchFs`
  failure.
- **Esbuild watch-mode performance**: `esbuild.stop()` was being called after
  every rebuild, requiring esbuild to re-initialize on the next change. Watch
  mode now passes `keepAlive: true` to keep the esbuild service warm across
  rebuilds.
- **`findImportMap()` now walks ancestors**, so invoking the CLI from a
  subdirectory of the project still finds the project's `deno.json`.

### Internal / documentation

- Documented the stream contract (stdout = bundle code only; stderr =
  everything else).
- Documented exit codes (0/1/2).
- Added color-aware logging via `supportsColor()` + `logStyled()` — `%c`
  styling is stripped when stdout is not a terminal.

## 1.7.0 and earlier

See git history.
