import { parseArgs } from "@std/cli/parse-args";
import {
	build,
	type BuildOptions,
	DEFAULT_ENTRY_POINT,
	DEFAULT_OUT_DIR,
	DEFAULT_OUT_FILENAME,
	DEFAULT_ROOT,
	EntryNotFoundError,
	getPackageInfo,
	logStyled,
	watchAndRebuild,
} from "./src/mod.ts";

function printUsage() {
	console.log(`
deno-build: Bundle Deno TypeScript sources into vanilla JS for browser use.

Usage: deno run -A jsr:@marianmeres/deno-build [options]

Options:
  --root, -r <path>      Source root directory (default: "${DEFAULT_ROOT}")
  --entry, -e <file>     Entry point file name (default: "${DEFAULT_ENTRY_POINT}")
  --outfile, -f <file>   Output file name (default: "${DEFAULT_OUT_FILENAME}")
  --outdir, -o <path>    Output directory (default: "${DEFAULT_OUT_DIR}")
  --watch, -w            Watch for changes and rebuild automatically
  --watch-dir, -d <path> Additional directory to watch (can be repeated)
  --strict, -s           Run type checking before bundling (fail on type errors)
  --esbuild, -b          Use esbuild bundler (enables npm: specifier support)
  --minify, -m           Minify the output bundle
  --hash                 Also emit a content-hashed copy + manifest (cache-busting)
  --manifest <file>      Manifest file name (default: "<outfile>.manifest.json")
  --skip-write, -k       Output bundled code to stdout instead of writing to file
  --help, -h             Show this help message

Examples:
  deno run -A jsr:@marianmeres/deno-build
  deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js
  deno run -A jsr:@marianmeres/deno-build --outdir ./public/js --watch
  deno run -A jsr:@marianmeres/deno-build --watch --watch-dir ../shared-lib -d ../utils
  deno run -A jsr:@marianmeres/deno-build --hash --minify

Note: Automatically detects deno.json/deno.jsonc/import_map.json (walking up
from cwd) for import resolution.
`);
}

async function main() {
	const pkg = await getPackageInfo();
	if (pkg) {
		logStyled("err", `%c${pkg.name} v${pkg.version}`, "color: cyan");
	}

	const args = parseArgs(Deno.args, {
		string: ["root", "entry", "outfile", "outdir", "manifest"],
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
		boolean: ["help", "watch", "strict", "esbuild", "minify", "skip-write", "hash"],
		collect: ["watch-dir"],
		default: {
			root: DEFAULT_ROOT,
			entry: DEFAULT_ENTRY_POINT,
			outfile: DEFAULT_OUT_FILENAME,
			outdir: DEFAULT_OUT_DIR,
		},
	});

	if (args.help) {
		printUsage();
		return;
	}

	const skipWrite = args["skip-write"];

	if (skipWrite && args.watch) {
		console.error(
			"Error: --skip-write and --watch cannot be used together. " +
				"Watch mode streams rebuilds to a file; --skip-write prints a single " +
				"build to stdout.",
		);
		Deno.exit(2);
	}

	// --hash produces files; --skip-write produces none. Rather than error, treat
	// it as a no-op so piping still works — just warn (on stderr) that hashing
	// was ignored.
	let hash = args.hash;
	if (hash && skipWrite) {
		console.error(
			"Warning: --hash is ignored with --skip-write (no files are written).",
		);
		hash = false;
	}

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
		hash,
		manifest: args.manifest,
	};

	const code = await build(options);

	if (skipWrite) {
		console.log(code);
		return;
	}

	if (args.watch) {
		await watchAndRebuild(options);
	}
}

main().catch((error) => {
	if (error instanceof EntryNotFoundError) {
		logStyled("err", `%cError: ${error.message}`, "color: red");
		Deno.exit(1);
	}
	console.error(error);
	Deno.exit(1);
});
