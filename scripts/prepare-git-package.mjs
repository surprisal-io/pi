import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hydrateModelCatalogBytes } from "./update-model-catalog-pin.mjs";

const root = resolve(import.meta.dirname, "..");
const packageDir = process.argv[2];
const hydrateOnly = packageDir === "--hydrate-only";
if (!hydrateOnly) {
	if (!["ai", "coding-agent", "tui"].includes(packageDir)) throw new Error(`Unknown Git package: ${packageDir}`);
	if (existsSync(join(root, "packages", packageDir, "dist/index.js"))) process.exit(0);
}

function run(command, args) {
	const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.status ?? result.signal}`);
}

const { revision } = JSON.parse(readFileSync(join(root, "nix/model-catalog.json"), "utf8"));
if (!/^sha256-[0-9a-f]{64}$/.test(revision)) throw new Error("Invalid model catalog revision");
const response = await fetch(`https://pi.dev/api/models/revisions/${revision}?types=chat,image,classifier`, {
	signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Model catalog ${revision} is unavailable: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (`sha256-${createHash("sha256").update(bytes).digest("hex")}` !== revision) {
	throw new Error(`Model catalog ${revision} does not match its checksum`);
}
hydrateModelCatalogBytes(root, bytes);
if (!hydrateOnly) {
	run("npm", ["ci", "--include=dev", "--ignore-scripts"]);
	run("npm", ["run", "build:offline"]);
}
