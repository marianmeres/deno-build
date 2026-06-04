# AGENTS.md

Machine-readable documentation for AI agents working with this codebase.

## Package Overview

- **Name**: `@marianmeres/deno-build`
- **Type**: CLI tool + Library
- **Runtime**: Deno
- **Purpose**: Bundle Deno TypeScript sources into vanilla ES module JavaScript for browser use
- **CLI entry point**: `cli.ts`
- **Library entry point**: `src/mod.ts`
- **Esbuild sub-entry**: `src/esbuild-bundler.ts`

## Architecture

```
cli.ts                 # CLI entry point (argument parsing, main(), top-level catch)
src/
  mod.ts               # Library entry — re-exports utils.ts + build.ts + hash.ts (NOT esbuild)
  build.ts             # Core build logic (build, watchAndRebuild)
  hash.ts              # Content hashing + manifest emission (computeContentHash, emitHashedOutputs)
  esbuild-bundler.ts   # Esbuild bundler (supports npm: specifiers) — own export
  utils.ts             # Types, constants, utilities, EntryNotFoundError
  build.test.ts        # Unit + integration tests (deno test)
example/
  src/mod.ts           # Example entry point
  src/utils.ts         # Example utilities
  dist/bundle.js       # Example build output
  example.html         # Browser demo
```

## Core Dependencies

| Package | Purpose |
|---------|---------|
| `@deno/emit` | TypeScript bundling via `bundle()` function (default bundler) |
| `@std/cli` | CLI argument parsing via `parseArgs()` |
| `@std/path` | Path resolution (`resolve`, `dirname`, `join`, `relative`, `fromFileUrl`) |
| `@std/fs` | File existence checks via `exists()` |
| `esbuild` | Alternative bundler with npm support (dynamically loaded from `build.ts`) |
| `@luca/esbuild-deno-loader` | Deno plugin for esbuild |

The `./esbuild` sub-export keeps esbuild out of the `./lib` import graph, so
consumers who never use esbuild don't pay for its startup cost.

## CLI Interface

### Arguments

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--root` | `-r` | string | `"src"` | Source root directory |
| `--entry` | `-e` | string | `"mod.ts"` | Entry point filename |
| `--outfile` | `-f` | string | `"bundle.js"` | Output filename |
| `--outdir` | `-o` | string | `"./dist"` | Output directory |
| `--watch` | `-w` | boolean | `false` | Enable watch mode |
| `--watch-dir` | `-d` | string[] | `[]` | Additional directories to watch (repeatable) |
| `--strict` | `-s` | boolean | `false` | Run `deno check` before bundling |
| `--esbuild` | `-b` | boolean | `false` | Use esbuild bundler |
| `--minify` | `-m` | boolean | `false` | Minify the output bundle |
| `--hash` | | boolean | `false` | Also emit `outfile.<hash>.js` + manifest (cache-busting) |
| `--manifest` | | string | `"<outfile>.manifest.json"` | Manifest filename (used with `--hash`) |
| `--skip-write` | `-k` | boolean | `false` | Print bundled code to stdout instead of writing a file |
| `--help` | `-h` | boolean | `false` | Show help |

Invalid combinations:
- `--skip-write` + `--watch` → exit code 2 with message on stderr.
- `--skip-write` + `--hash` → `--hash` is ignored (no files written); warning on stderr, exit 0.

### Stream contract

- **stdout**: bundled code (only when `--skip-write`), otherwise nothing.
- **stderr**: version banner, progress messages, errors, watch-mode notifications.

This makes `deno run -A jsr:@marianmeres/deno-build --skip-write > out.js` safe.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Build failed (includes `EntryNotFoundError` and all other errors) |
| 2 | Invalid CLI argument combination (`--skip-write` + `--watch`) |

### Library Usage

```typescript
import { build, EntryNotFoundError } from "jsr:@marianmeres/deno-build/lib";

// Defaults applied automatically
await build();

// With options (all optional)
await build({
  root: "src",
  entry: "mod.ts",
  outDir: "./dist",
  outFile: "bundle.js",
  minify: true,
});

// Content hashing: also writes outfile.<hash>.js + a manifest (returns stable code)
await build({ hash: true, manifest: "assets.json" });

// Skip disk write, just return code
const code = await build({ skipWrite: true });

// Error handling
try {
  await build();
} catch (e) {
  if (e instanceof EntryNotFoundError) {
    // user typo or wrong cwd
  } else {
    // real bundler error
  }
}
```

## Key Functions

### src/utils.ts

#### `resolveBuildOptions(options?: BuildOptions): ResolvedBuildOptions`
- Fills in defaults for any omitted fields.
- Used internally by `build()` and `watchAndRebuild()`; exported for advanced callers.

#### `getPackageInfo(): Promise<PackageInfo | null>`
- Returns `{ name, version }` from package metadata.
- For JSR: parses from `import.meta.url` (no network request).
- For local: reads from `deno.json` relative to `src/utils.ts`.
- Returns `null` on any error (silent fail).

#### `typeCheck(entryPath: string): Promise<boolean>`
- Runs `deno check` on the entry point via `Deno.Command`.
- Streams stdout/stderr to console.
- Returns `true` if type checking passes, `false` otherwise.

#### `findImportMap(startDir?: string): Promise<string | undefined>`
- Searches for `deno.json`, `deno.jsonc`, or `import_map.json` (in that order).
- Walks **up** from `startDir` (default: `Deno.cwd()`) to the filesystem root.
- Returns the first absolute path found, or `undefined`.

#### `supportsColor(): boolean`
- Returns true when `Deno.stdout.isTerminal()` — cached after first call.

#### `logStyled(stream, message, ...styles): void`
- Writes to stdout or stderr with CSS `%c` styling when terminal, stripped otherwise.

### src/build.ts

#### `build(options?: BuildOptions): Promise<string>`
- Resolves paths relative to `Deno.cwd()`.
- **Throws `EntryNotFoundError` if the entry file does not exist** (does NOT call `Deno.exit`).
- If `strict`: runs `typeCheck()` before bundling, throws on failure.
- Auto-detects import map via `findImportMap()` (walks ancestors).
- If `useEsbuild`: dynamically imports `./esbuild-bundler.ts`, calls `buildWithEsbuild()`.
- Otherwise: uses `@deno/emit` `bundle()`.
- If `minify` with @deno/emit path: post-processes via `minifyCode()`.
- If `skipWrite` is false: creates output directory and writes file.
- If `hash` (and not `skipWrite`): after writing the stable file, calls
  `emitHashedOutputs()` to additively write `outfile.<hash>.js` + the manifest.
  The stable file from either bundler path is left untouched.
- Returns the bundled code as a string (unchanged by `hash`).
- All progress/success messages go to **stderr**; errors rethrow after logging.

#### `watchAndRebuild(options?: BuildOptions): Promise<never>`
- Validates every watch path exists (throws otherwise).
- Watches source dir + `watchDirs` via `Deno.watchFs()`.
- **Debounces** rebuilds (100ms) **and serializes** them: a rebuild cannot start
  while a previous one is running. If changes arrive during a rebuild, exactly
  one follow-up rebuild is queued.
- Filters for `.ts`/`.tsx`/`.js`/`.jsx` files only.
- **Excludes everything under `outDir`** (stable bundle, hashed copy, manifest)
  from trigger events to prevent feedback loops.
- Passes `keepEsbuildAlive: true` to `build()` so the esbuild service is reused
  across rebuilds instead of being started/stopped each time.
- Calls `stopEsbuild()` on watcher termination (best-effort).
- Never returns normally — throws only if the watcher itself dies.

### src/hash.ts (re-exported from `./lib`)

#### `computeContentHash(code: string, len = 8): Promise<string>`
- SHA-256 of `code` (UTF-8) via Web Crypto (`crypto.subtle.digest`) — no deps.
- Returns the first `len` lowercase hex chars (default `DEFAULT_HASH_LENGTH = 8`).

#### `insertHashIntoFileName(fileName: string, hash: string): string`
- `bundle.js` + `abc` → `bundle.abc.js`. Only the final extension is treated as
  the extension (`bundle.min.js` → `bundle.min.abc.js`); no extension → appended.

#### `emitHashedOutputs(options): Promise<EmitHashedOutputsResult>`
- `options`: `{ outDir, outFile, manifest, code }` (all absolute except names).
- Computes the hash, writes `outDir/<hashedName>` and the manifest
  (`{ [outFile]: hashedName }`, pretty-printed).
- **Ledger-based cleanup**: reads the previous manifest; if the prior hashed name
  differs from the new one **and** matches the `name.<hex>.ext` pattern, removes
  the stale file (ignoring `NotFound`). The pattern guard ensures only files this
  tool produced are ever deleted. This is what keeps `--watch` from accumulating
  orphaned hashed bundles.
- The caller writes the stable `outFile`; this function only adds the hashed file
  and manifest.

### src/esbuild-bundler.ts (sub-export `./esbuild`)

#### `buildWithEsbuild(options: EsbuildOptions): Promise<string>`
- Uses esbuild with `@luca/esbuild-deno-loader` plugins.
- Always runs with `write: false` internally; the function handles the final
  disk write itself (single I/O, no redundant read-back).
- Creates the output directory if writing.
- Defensive check on `result.outputFiles`; throws `"esbuild produced no output files"` if empty.
- `try { ... } finally { esbuild.stop() }` — service is always cleaned up on error.
- When `keepAlive: true`, does NOT call `esbuild.stop()`. Caller must invoke `stopEsbuild()`.

#### `minifyCode(code: string, keepAlive?: boolean): Promise<string>`
- Uses esbuild's `transform()` API for minification.
- `try/finally` ensures `esbuild.stop()` is called on errors.
- `keepAlive: true` skips the stop call.

#### `stopEsbuild(): void`
- Explicitly stops the esbuild service. Safe to call multiple times.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Entry point not found | `build()` throws `EntryNotFoundError`; CLI prints `Error: Entry point not found: ...` and exits 1 |
| Type check fails | `build()` throws `Error("Type checking failed")`; `deno check` output already streamed to user |
| Bundle failure | `build()` logs `[HH:MM:SS] Build failed: ...` on stderr, rethrows |
| Watch-mode rebuild failure | Error already logged by `build()`; watcher continues |
| Watch path missing | `watchAndRebuild()` throws before entering the loop |
| `--skip-write` + `--watch` | CLI exits 2 before building |

## Path Resolution

All paths are resolved relative to `Deno.cwd()` using `@std/path`:
- Entry point: `resolve(cwd, root, entry)`
- Output dir: `resolve(cwd, outDir)`
- Output file: `resolve(outDirPath, outFile)`
- Watch paths: `resolve(cwd, watchDir)` for each
- Import map: walks up starting at `resolve(cwd)`

## Deno Tasks

```json
{
  "tasks": {
    "build:example": "deno run -A cli.ts --root example/src --outdir example/dist",
    "build:example2": "deno run -A cli.ts --root example/src --outdir example/dist --esbuild -f bundle2.js"
  }
}
```

## Required Permissions

- `--allow-read`: Read source files and import map
- `--allow-write`: Write bundled output
- `--allow-env`: Environment access (used by dependencies)
- `--allow-net`: Fetch remote dependencies during bundling
- `--allow-run`: Run `deno check` subprocess (only needed with `--strict`)

Shorthand: `deno run -A` (all permissions)

## Extension Points

1. **Source maps**: Handle `result.map` from bundle output.
2. **Custom transforms**: Post-process the returned code before writing.
3. **Multiple entry points**: Loop over entries, call `build()` for each.
4. **Custom type checking**: Fork `typeCheck()` to pass different compiler options.
5. **Additional esbuild options**: Extend `buildWithEsbuild()` to forward more esbuild knobs.
6. **Alternative color handling**: Replace `logStyled()` or override `supportsColor()`'s cache.
