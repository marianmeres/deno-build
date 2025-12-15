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
| `--skip-write` | `-k` | `false` | Output bundled code to stdout instead of writing to file |
| `--help` | `-h` | | Show help message |

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

## Library Usage

You can also use `deno-build` programmatically:

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

### Exports

```typescript
// Types
export interface PackageInfo { name: string; version: string; }
export interface BuildOptions { root, entry, outDir, outFile, watchDirs, strict, useEsbuild, minify, skipWrite? }
export interface EsbuildOptions { entryPath, outPath, importMapPath?, minify?, skipWrite? }

// Core functions
export function build(options: BuildOptions): Promise<string>
export function watchAndRebuild(options: BuildOptions): Promise<never>

// Esbuild functions
export function buildWithEsbuild(options: EsbuildOptions): Promise<string>
export function minifyCode(code: string): Promise<string>

// Utilities
export function getPackageInfo(): Promise<PackageInfo | null>
export function findImportMap(): Promise<string | undefined>
export function typeCheck(entryPath: string): Promise<boolean>

// Constants
export const DEFAULT_ROOT: string        // "src"
export const DEFAULT_ENTRY_POINT: string // "mod.ts"
export const DEFAULT_OUT_FILENAME: string // "bundle.js"
```

## Features

- Bundles TypeScript to browser-ready ES modules
- Auto-detects `deno.json`, `deno.jsonc`, or `import_map.json` for import resolution
- Watch mode with debounced rebuilds (supports watching additional directories)
- Strict mode: optional TypeScript type checking before bundling
- Alternative esbuild bundler with npm package support (`npm:` specifiers)
- Output minification (works with both bundlers)
- Clear error messages when things go wrong
- Zero configuration for standard project layouts
- Displays package name and version on startup
- **Dual-use**: works as both CLI tool and importable library

## License

MIT
