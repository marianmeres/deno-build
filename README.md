# @marianmeres/deno-build

A quick-and-dirty CLI tool and library to bundle Deno TypeScript sources into vanilla
JavaScript for browser use.

## Motivation

When prototyping web applications, I often write utility modules in Deno/TypeScript
for their excellent DX. But when it comes to including these modules in a simple HTML
file for quick prototyping, there's friction: browsers don't understand TypeScript or
Deno's import maps.

This tool bridges that gap. It takes your Deno TS source and bundles it into a single
ES module JS file that you can drop into any HTML page via `<script type="module">`.

No complex build setup. No node_modules. Just run the command and get browser-ready JS.

## Installation

```bash
# Run directly from JSR (no install needed)
deno run -A jsr:@marianmeres/deno-build

# Or add to your project
deno add jsr:@marianmeres/deno-build
```

## CLI Usage

```bash
# Bundle src/mod.ts -> dist/bundle.js (defaults)
deno run -A jsr:@marianmeres/deno-build

# Custom paths
deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js

# Watch mode for development
deno run -A jsr:@marianmeres/deno-build --watch

# Watch with additional directories (e.g., shared libraries)
deno run -A jsr:@marianmeres/deno-build --watch --watch-dir ../shared-lib

# Strict mode: fail on TypeScript type errors
deno run -A jsr:@marianmeres/deno-build --strict

# Output to different directory
deno run -A jsr:@marianmeres/deno-build --outdir ./public/js

# Use esbuild bundler (enables npm: specifier support)
deno run -A jsr:@marianmeres/deno-build --esbuild

# Minify the output bundle
deno run -A jsr:@marianmeres/deno-build --minify

# Combine flags: esbuild with minification
deno run -A jsr:@marianmeres/deno-build --esbuild --minify

# Content-hashed copy + manifest for cache-busting (see "Content hashing" below)
deno run -A jsr:@marianmeres/deno-build --hash

# Print bundle to stdout instead of writing a file (pipe-friendly)
deno run -A jsr:@marianmeres/deno-build --skip-write > bundle.js
```

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--root` | `-r` | `src` | Source root directory |
| `--entry` | `-e` | `mod.ts` | Entry point file name |
| `--outfile` | `-f` | `bundle.js` | Output file name |
| `--outdir` | `-o` | `./dist` | Output directory |
| `--watch` | `-w` | `false` | Watch for changes and rebuild |
| `--watch-dir` | `-d` | | Additional directory to watch (can be repeated) |
| `--strict` | `-s` | `false` | Run type checking before bundling (fail on type errors) |
| `--esbuild` | `-b` | `false` | Use esbuild bundler (enables npm: specifier support) |
| `--minify` | `-m` | `false` | Minify the output bundle |
| `--hash` | | `false` | Also emit a content-hashed copy + manifest (cache-busting) |
| `--manifest` | | `<outfile>.manifest.json` | Manifest file name (implies/used with `--hash`) |
| `--skip-write` | `-k` | `false` | Print bundled code to stdout instead of writing to file |
| `--help` | `-h` | | Show help message |

Note: `--skip-write` and `--watch` are mutually exclusive.

All progress messages are written to **stderr**. When `--skip-write` is used, only
the bundled code is written to stdout, so piping is safe:

```bash
deno run -A jsr:@marianmeres/deno-build --skip-write | minify-further > bundle.min.js
```

## Example

Given this project structure:

```
my-project/
├── deno.json
├── src/
│   ├── mod.ts
│   └── utils.ts
└── index.html
```

With `src/mod.ts`:

```typescript
export function greet(name: string): string {
    return `Hello, ${name}!`;
}
```

Run the build:

```bash
deno run -A jsr:@marianmeres/deno-build
```

Use in HTML:

```html
<script type="module">
    import { greet } from "./dist/bundle.js";
    console.log(greet("World"));
</script>
```

## Content hashing & cache-busting

For production deploys you usually want a long-lived `Cache-Control` on your JS and a
filename that changes whenever the contents change. Pass `--hash` and the build emits
**three** files instead of one:

```bash
deno run -A jsr:@marianmeres/deno-build --hash
```

```
dist/
├── bundle.js                      # stable name (unchanged — simple/dev includes still work)
├── bundle.a1b2c3d4.js             # same bytes, content-hashed name for cache-busting
└── bundle.js.manifest.json        # { "bundle.js": "bundle.a1b2c3d4.js" }
```

- The stable `bundle.js` is still written, so existing `<script src="./dist/bundle.js">`
  references and `--watch` dev flows keep working unchanged.
- The hashed copy is byte-identical; the **hash is a SHA-256 of the final emitted bundle**
  (computed *after* minification, so `--hash --minify` reflects the minified bytes).
- The **manifest** maps the logical name to the hashed name so a server or template can
  resolve the cache-busted URL:

```ts
// e.g. in a server / template step
const manifest = JSON.parse(await Deno.readTextFile("./dist/bundle.js.manifest.json"));
const src = `/dist/${manifest["bundle.js"]}`; // -> "/dist/bundle.a1b2c3d4.js"
// inject <script type="module" src={src}> with an immutable Cache-Control header
```

The manifest doubles as a cleanup ledger: in `--watch` mode each rebuild replaces the
previous hashed file rather than piling up orphans. Rename the manifest with
`--manifest <file>` (default `<outfile>.manifest.json`, namespaced to the outfile so it
won't collide with an unrelated `manifest.json`). `--hash` is ignored with `--skip-write`
(which writes no files) — a warning is printed to stderr.

## Library Usage

You can also use `deno-build` programmatically. Every `BuildOptions` field is
optional — defaults match the CLI:

```typescript
import { build } from "jsr:@marianmeres/deno-build/lib";

// Defaults: src/mod.ts -> ./dist/bundle.js
await build();

// With options
const code = await build({
    root: "src",
    entry: "mod.ts",
    outDir: "./dist",
    outFile: "bundle.js",
    minify: true,
});

// Content hashing: writes bundle.js + bundle.<hash>.js + bundle.js.manifest.json
await build({ minify: true, hash: true });

// Get bundled code only (no file written)
const codeOnly = await build({ skipWrite: true });
```

### Error handling

`build()` throws on failure. The specific `EntryNotFoundError` subclass is thrown
when the entry file doesn't exist, so callers can distinguish "user typo" from
"real bundler error":

```typescript
import { build, EntryNotFoundError } from "jsr:@marianmeres/deno-build/lib";

try {
    await build({ root: "src" });
} catch (e) {
    if (e instanceof EntryNotFoundError) {
        console.error(`Nothing to build: ${e.entryPath}`);
    } else {
        throw e;
    }
}
```

### Exports

```typescript
// jsr:@marianmeres/deno-build/lib
export interface PackageInfo { name: string; version: string; }
export interface BuildOptions { /* all fields optional */ }
export interface ResolvedBuildOptions { /* BuildOptions with defaults applied */ }

export class EntryNotFoundError extends Error { entryPath: string }

// Core
export function build(options?: BuildOptions): Promise<string>
export function watchAndRebuild(options?: BuildOptions): Promise<never>

// Content hashing (also reusable standalone)
export function computeContentHash(code: string, len?: number): Promise<string>
export function insertHashIntoFileName(fileName: string, hash: string): string
export function emitHashedOutputs(options: EmitHashedOutputsOptions): Promise<EmitHashedOutputsResult>

// Utilities
export function getPackageInfo(): Promise<PackageInfo | null>
export function findImportMap(startDir?: string): Promise<string | undefined>
export function typeCheck(entryPath: string): Promise<boolean>
export function resolveBuildOptions(options?: BuildOptions): ResolvedBuildOptions
export function supportsColor(): boolean
export function logStyled(stream: "out" | "err", message: string, ...styles: string[]): void
export const timestamp: () => string

// Constants
export const DEFAULT_ROOT: string             // "src"
export const DEFAULT_ENTRY_POINT: string      // "mod.ts"
export const DEFAULT_OUT_FILENAME: string     // "bundle.js"
export const DEFAULT_OUT_DIR: string          // "./dist"
export const DEFAULT_HASH_LENGTH: number      // 8
export const DEFAULT_MANIFEST_SUFFIX: string  // ".manifest.json"
```

### Esbuild sub-export

The esbuild-specific API lives at a separate entry point so the core library
doesn't pull esbuild in when it isn't needed:

```typescript
// jsr:@marianmeres/deno-build/esbuild
export interface EsbuildOptions { /* ... */ }
export function buildWithEsbuild(options: EsbuildOptions): Promise<string>
export function minifyCode(code: string, keepAlive?: boolean): Promise<string>
export function stopEsbuild(): void
```

## Features

- Bundles TypeScript to browser-ready ES modules
- Auto-detects `deno.json`, `deno.jsonc`, or `import_map.json` for import resolution,
  walking up ancestor directories from the current working directory
- Watch mode with debounced, serialized rebuilds that ignore the output file and
  keep esbuild warm between rebuilds (when `--esbuild` is used)
- Strict mode: optional TypeScript type checking before bundling
- Alternative esbuild bundler with npm package support (`npm:` specifiers)
- Output minification (works with both bundlers)
- Optional content-hashed output + manifest for cache-busting (`--hash`)
- Clear error messages when things go wrong, plus a typed `EntryNotFoundError`
- Color-aware logging (strips `%c` styling when stdout isn't a terminal)
- Stdout is reserved for the bundled code; all progress/diagnostic messages go to stderr
- Zero configuration for standard project layouts
- **Dual-use**: works as both CLI tool and importable library

## Upgrading from 1.x

See [CHANGELOG.md](CHANGELOG.md) for the full list of breaking changes in 2.0.0.
Most users will not need to change anything; library consumers of
`buildWithEsbuild`, `minifyCode`, or `EsbuildOptions` must update their import
specifier from `/lib` to `/esbuild`.

## License

MIT
