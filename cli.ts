import { parseArgs } from "@std/cli/parse-args";
import {
	build,
	watchAndRebuild,
	getPackageInfo,
	type BuildOptions,
	DEFAULT_ROOT,
	DEFAULT_ENTRY_POINT,
	DEFAULT_OUT_FILENAME,
} from "./src/mod.ts";

function printUsage() {
	console.log(`
deno-build: Bundle Deno TypeScript sources into vanilla JS for browser use.

Usage: deno run -A jsr:@marianmeres/deno-build [options]

Options:
  --root, -r <path>      Source root directory (default: "${DEFAULT_ROOT}")
  --entry, -e <file>     Entry point file name (default: "${DEFAULT_ENTRY_POINT}")
  --outfile, -f <file>   Output file name (default: "${DEFAULT_OUT_FILENAME}")
  --outdir, -o <path>    Output directory (default: "./dist")
  --watch, -w            Watch for changes and rebuild automatically
  --watch-dir, -d <path> Additional directory to watch (can be repeated)
  --strict, -s           Run type checking before bundling (fail on type errors)
  --esbuild, -b          Use esbuild bundler (enables npm: specifier support)
  --minify, -m           Minify the output bundle
  --skip-write, -k       Output bundled code to stdout instead of writing to file
  --help, -h             Show this help message

Examples:
  deno run -A jsr:@marianmeres/deno-build
  deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js
  deno run -A jsr:@marianmeres/deno-build --outdir ./public/js --watch
  deno run -A jsr:@marianmeres/deno-build --watch --watch-dir ../shared-lib -d ../utils

Note: Automatically detects deno.json/deno.jsonc/import_map.json in cwd for import resolution.
`);
}

async function main() {
	const pkg = await getPackageInfo();
	if (pkg) {
		console.log(`%c${pkg.name} v${pkg.version}`, "color: cyan");
	}

	const args = parseArgs(Deno.args, {
		string: ["root", "entry", "outfile", "outdir"],
		alias: {
			r: "root",
			e: "entry",
			f: "outfile",
			o: "outdir",
			h: "help",
			w: "watch",
			d: "watch-dir",
			s: "strict",
			b: "esbuild",
			m: "minify",
			k: "skip-write",
		},
		boolean: ["help", "watch", "strict", "esbuild", "minify", "skip-write"],
		collect: ["watch-dir"],
		default: {
			root: DEFAULT_ROOT,
			entry: DEFAULT_ENTRY_POINT,
			outfile: DEFAULT_OUT_FILENAME,
			outdir: "./dist",
		},
	});

	if (args.help) {
		printUsage();
		Deno.exit(0);
	}

	const skipWrite = args["skip-write"];

	const options: BuildOptions = {
		root: args.root,
		entry: args.entry,
		outDir: args.outdir,
		outFile: args.outfile,
		watchDirs: (args["watch-dir"] as string[]) || [],
		strict: args.strict,
		useEsbuild: args.esbuild,
		minify: args.minify,
		skipWrite,
	};

	const code = await build(options);

	if (skipWrite) {
		console.log(code);
	} else if (args.watch) {
		await watchAndRebuild(options);
	}
}

main();
