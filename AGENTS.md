# AGENTS.md

Machine-readable documentation for AI agents working with this codebase.

## Package Overview

- **Name**: `@marianmeres/deno-build`
- **Type**: CLI tool
- **Runtime**: Deno
- **Purpose**: Bundle Deno TypeScript sources into vanilla ES module JavaScript for browser use
- **Entry point**: `deno-build.ts`

## Architecture

```
deno-build.ts          # Single-file CLI tool (main entry)
example/
  src/mod.ts           # Example entry point
  src/utils.ts         # Example utilities
  dist/bundle.js       # Example build output
  example.html         # Browser demo
```

## Core Dependencies

| Package | Purpose |
|---------|---------|
| `@deno/emit` | TypeScript bundling via `bundle()` function |
| `@std/cli` | CLI argument parsing via `parseArgs()` |
| `@std/path` | Path resolution via `resolve()` |
| `@std/fs` | File existence checks via `exists()` |

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
```

## Key Functions

### `getPackageInfo(): Promise<PackageInfo | null>`
- Returns `{ name, version }` from package metadata
- For JSR: parses from `import.meta.url` (no network request)
- For local: reads from `deno.json`
- Returns `null` on any error (silent fail)

### `typeCheck(entryPath: string): Promise<boolean>`
- Runs `deno check` on the entry point via `Deno.Command`
- Streams stdout/stderr to console (user sees errors)
- Returns `true` if type checking passes, `false` otherwise

### `build(options: BuildOptions): Promise<void>`
- Resolves paths relative to `Deno.cwd()`
- If `strict` mode: runs `typeCheck()` before bundling, throws on failure
- Auto-detects import map from `deno.json`, `deno.jsonc`, or `import_map.json`
- Uses `@deno/emit` bundle() with `type: "module"`
- Creates output directory if needed
- Exits with code 1 if entry point not found

### `watchAndRebuild(options: BuildOptions): Promise<void>`
- Watches source directory + additional `watchDirs` via `Deno.watchFs()`
- Debounces rebuilds (100ms)
- Filters for `.ts`, `.tsx`, `.js`, `.jsx` files only
- Continues watching after build errors

### `findImportMap(): Promise<string | undefined>`
- Searches cwd for: `deno.json` > `deno.jsonc` > `import_map.json`
- Returns absolute path or undefined

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
    "build:example": "deno run -A deno-build.ts --root example/src --outdir example/dist"
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
1. **Add minification**: Pass additional options to `bundle()` or post-process `result.code`
2. **Add source maps**: Handle `result.map` from bundle output
3. **Custom transforms**: Process `result.code` before writing
4. **Multiple entry points**: Loop over entries, call `build()` for each
5. **Custom type checking**: Modify `typeCheck()` to use different compiler options
