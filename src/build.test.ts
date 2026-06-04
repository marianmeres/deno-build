import { assertEquals, assertMatch, assertNotEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { build } from "./build.ts";
import { computeContentHash, insertHashIntoFileName } from "./hash.ts";

const ENTRY = "export const x = 1;\n";

/** Creates a throwaway project dir with `src/mod.ts` and returns its path. */
async function makeProject(src: string = ENTRY): Promise<string> {
	const dir = await Deno.makeTempDir({ prefix: "deno-build-test-" });
	await Deno.mkdir(join(dir, "src"), { recursive: true });
	await Deno.writeTextFile(join(dir, "src", "mod.ts"), src);
	return dir;
}

/** Lists the file names in a directory, sorted. */
async function listDir(dir: string): Promise<string[]> {
	const names: string[] = [];
	for await (const e of Deno.readDir(dir)) names.push(e.name);
	return names.sort();
}

function buildOpts(dir: string, extra: Record<string, unknown> = {}) {
	return {
		root: join(dir, "src"),
		entry: "mod.ts",
		outDir: join(dir, "dist"),
		outFile: "bundle.js",
		...extra,
	};
}

// ── Pure helpers ────────────────────────────────────────────────────────────

Deno.test("insertHashIntoFileName inserts before the extension", () => {
	assertEquals(insertHashIntoFileName("bundle.js", "abc"), "bundle.abc.js");
	assertEquals(insertHashIntoFileName("bundle.min.js", "abc"), "bundle.min.abc.js");
	assertEquals(insertHashIntoFileName("bundle", "abc"), "bundle.abc");
});

Deno.test("computeContentHash is deterministic and content-sensitive", async () => {
	const a = await computeContentHash("hello");
	const b = await computeContentHash("hello");
	const c = await computeContentHash("hello!");
	assertEquals(a, b);
	assertEquals(a.length, 8);
	assertMatch(a, /^[0-9a-f]{8}$/);
	assertNotEquals(a, c);
});

// ── Build integration ───────────────────────────────────────────────────────

Deno.test("default build writes exactly one file (no behavior change)", async () => {
	const dir = await makeProject();
	try {
		await build(buildOpts(dir));
		assertEquals(await listDir(join(dir, "dist")), ["bundle.js"]);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("--hash emits stable + hashed + manifest with correct mapping", async () => {
	const dir = await makeProject();
	const dist = join(dir, "dist");
	try {
		await build(buildOpts(dir, { hash: true }));

		const manifest = JSON.parse(
			await Deno.readTextFile(join(dist, "bundle.js.manifest.json")),
		);
		const hashedName = manifest["bundle.js"];
		assertMatch(hashedName, /^bundle\.[0-9a-f]{8}\.js$/);

		// Stable and hashed files exist and are byte-identical.
		const stable = await Deno.readTextFile(join(dist, "bundle.js"));
		const hashed = await Deno.readTextFile(join(dist, hashedName));
		assertEquals(stable, hashed);

		assertEquals(
			await listDir(dist),
			["bundle.js", "bundle.js.manifest.json", hashedName].sort(),
		);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("--hash honors a custom manifest name", async () => {
	const dir = await makeProject();
	const dist = join(dir, "dist");
	try {
		await build(buildOpts(dir, { hash: true, manifest: "assets.json" }));
		const names = await listDir(dist);
		assertEquals(names.includes("assets.json"), true);
		assertEquals(names.includes("bundle.js.manifest.json"), false);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("--hash cleans the stale hashed file when content changes", async () => {
	const dir = await makeProject();
	const dist = join(dir, "dist");
	try {
		await build(buildOpts(dir, { hash: true }));
		const first = JSON.parse(
			await Deno.readTextFile(join(dist, "bundle.js.manifest.json")),
		)["bundle.js"];

		// An unrelated artifact must survive the cleanup.
		await Deno.writeTextFile(join(dist, "vendor.js"), "/* keep me */\n");

		await Deno.writeTextFile(join(dir, "src", "mod.ts"), "export const x = 999;\n");
		await build(buildOpts(dir, { hash: true }));
		const second = JSON.parse(
			await Deno.readTextFile(join(dist, "bundle.js.manifest.json")),
		)["bundle.js"];

		assertNotEquals(first, second);
		// Old hashed file removed, new one present, unrelated file untouched.
		await assertRejects(() => Deno.stat(join(dist, first)), Deno.errors.NotFound);
		await Deno.stat(join(dist, second));
		await Deno.stat(join(dist, "vendor.js"));
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});
