# @marianmeres/deno-build

A quick-and-dirty CLI tool to bundle Deno TypeScript sources into vanilla JavaScript
for browser use.

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

## Usage

```bash
# Bundle src/mod.ts -> dist/bundle.js (defaults)
deno run -A jsr:@marianmeres/deno-build

# Custom paths
deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js

# Watch mode for development
deno run -A jsr:@marianmeres/deno-build --watch

# Output to different directory
deno run -A jsr:@marianmeres/deno-build --outdir ./public/js
```

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--root` | `-r` | `src` | Source root directory |
| `--entry` | `-e` | `mod.ts` | Entry point file name |
| `--outfile` | `-f` | `bundle.js` | Output file name |
| `--outdir` | `-o` | `./dist` | Output directory |
| `--watch` | `-w` | `false` | Watch for changes and rebuild |
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

## Features

- Bundles TypeScript to browser-ready ES modules
- Auto-detects `deno.json`, `deno.jsonc`, or `import_map.json` for import resolution
- Watch mode with debounced rebuilds
- Clear error messages when things go wrong
- Zero configuration for standard project layouts

## License

MIT
