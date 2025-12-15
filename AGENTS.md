# AGENTS.md

Machine-readable documentation for AI agents working with this codebase.

## Package Overview

- **Name**: `@marianmeres/deno-build`
- **Type**: CLI tool + Library
- **Runtime**: Deno
- **Purpose**: Bundle Deno TypeScript sources into vanilla ES module JavaScript for browser use
- **CLI entry point**: `cli.ts`
- **Library entry point**: `src/mod.ts`

## Architecture

```
cli.ts                 # CLI entry point (argument parsing, main())
src/
  mod.ts               # Library entry point (re-exports all public APIs)
  build.ts             # Core build logic (build, watchAndRebuild)
  esbuild-bundler.ts   # Alternative esbuild bundler (supports npm: specifiers)
  utils.ts             # Types, constants, and utility functions
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
| `@std/path` | Path resolution via `resolve()` |
| `@std/fs` | File existence checks via `exists()` |
| `esbuild` | Alternative bundler with npm support (lazy-loaded) |
| `@luca/esbuild-deno-loader` | Deno plugin for esbuild (lazy-loaded) |

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
| `--esbuild` | `-b` | boolean | `false` | Use esbuild bundler (enables npm: specifier support) |
| `--minify` | `-m` | boolean | `false` | Minify the output bundle |
| `--skip-write` | `-k` | boolean | `false` | Output bundled code to stdout instead of writing to file |
| `--help` | `-h` | boolean | `false` | Show help |

### Usage Patterns

```bash
# Default: src/mod.ts -> dist/bundle.js
deno run -A jsr:@marianmeres/deno-build

# Custom paths
deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js

# Watch mode
deno run -A jsr:@marianmeres/deno-build --watch

# Watch with additional directories
deno run -A jsr:@marianmeres/deno-build --watch --watch-dir ../shared-lib -d ../utils

# Strict mode (type checking)
deno run -A jsr:@marianmeres/deno-build --strict

# Esbuild bundler (supports npm: specifiers)
deno run -A jsr:@marianmeres/deno-build --esbuild

# Minify output
deno run -A jsr:@marianmeres/deno-build --minify

# Esbuild with minification
deno run -A jsr:@marianmeres/deno-build --esbuild --minify

# Output to stdout instead of file
deno run -A jsr:@marianmeres/deno-build --skip-write
```

### Library Usage

```typescript
import { build, BuildOptions } from "jsr:@marianmeres/deno-build/lib";

const options: BuildOptions = {
  root: "src",
  entry: "mod.ts",
  outDir: "./dist",
  outFile: "bundle.js",
  watchDirs: [],
  strict: false,
  useEsbuild: false,
  minify: false,
};

// Write to file and get bundled code
const code = await build(options);

// Get bundled code only (no file written)
const codeOnly = await build({ ...options, skipWrite: true });
```

## Key Functions

### src/utils.ts

#### `getPackageInfo(): Promise<PackageInfo | null>`
- Returns `{ name, version }` from package metadata
- For JSR: parses from `import.meta.url` (no network request)
- For local: reads from `deno.json`
- Returns `null` on any error (silent fail)

#### `typeCheck(entryPath: string): Promise<boolean>`
- Runs `deno check` on the entry point via `Deno.Command`
- Streams stdout/stderr to console (user sees errors)
- Returns `true` if type checking passes, `false` otherwise

#### `findImportMap(): Promise<string | undefined>`
- Searches cwd for: `deno.json` > `deno.jsonc` > `import_map.json`
- Returns absolute path or undefined

### src/build.ts

#### `build(options: BuildOptions): Promise<string>`
- Resolves paths relative to `Deno.cwd()`
- If `strict` mode: runs `typeCheck()` before bundling, throws on failure
- Auto-detects import map from `deno.json`, `deno.jsonc`, or `import_map.json`
- If `useEsbuild`: dynamically imports and uses `buildWithEsbuild()` from `./esbuild-bundler.ts`
- Otherwise: uses `@deno/emit` bundle() with `type: "module"`
- If `minify` with @deno/emit: post-processes output with `minifyCode()` from `./esbuild-bundler.ts`
- If `skipWrite` is false (default): creates output directory and writes file
- If `skipWrite` is true: skips directory creation and file writing
- Always returns the bundled code as a string
- Exits with code 1 if entry point not found

#### `watchAndRebuild(options: BuildOptions): Promise<never>`
- Watches source directory + additional `watchDirs` via `Deno.watchFs()`
- Debounces rebuilds (100ms)
- Filters for `.ts`, `.tsx`, `.js`, `.jsx` files only
- Continues watching after build errors

### src/esbuild-bundler.ts

#### `buildWithEsbuild(options: EsbuildOptions): Promise<string>`
- Uses esbuild with `@luca/esbuild-deno-loader` plugins
- Supports Deno import maps, JSR packages, and npm: specifiers
- Native minification via esbuild's `minify` option
- If `skipWrite` is true: uses esbuild's `write: false` option and returns code from `outputFiles`
- If `skipWrite` is false: writes to file, then reads and returns the code
- Calls `esbuild.stop()` after bundling to clean up

#### `minifyCode(code: string): Promise<string>`
- Uses esbuild's `transform()` API for minification
- Called by @deno/emit path when `--minify` flag is used

## Path Resolution

All paths are resolved relative to `Deno.cwd()` using `@std/path/resolve`:
- Entry point: `resolve(cwd, root, entry)`
- Output dir: `resolve(cwd, outDir)`
- Output file: `resolve(outDirPath, outFile)`
- Import map: `resolve(cwd, candidate)`

This ensures the tool works correctly when installed as a package and run from any project directory.

## Output Format

- ES module JavaScript (`type: "module"`)
- Named exports preserved
- TypeScript types stripped
- Single file bundle (all imports inlined)

## Error Handling

| Error | Behavior |
|-------|----------|
| Entry point not found | Logs error, exits with code 1 |
| Bundle failure | Logs error message, throws (re-throws in watch mode) |
| Watch mode build error | Logs error, continues watching |

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

To modify this tool:
1. **Add source maps**: Handle `result.map` from bundle output
2. **Custom transforms**: Process `result.code` before writing
3. **Multiple entry points**: Loop over entries, call `build()` for each
4. **Custom type checking**: Modify `typeCheck()` to use different compiler options
5. **Additional esbuild options**: Extend `buildWithEsbuild()` to support more esbuild features
