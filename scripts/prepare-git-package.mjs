import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const packageName = process.argv[2];
if (packageName !== "@earendil-works/pi-coding-agent")
	throw new Error(`Unknown package '${packageName}'`);

const root = resolve(import.meta.dirname, "..");
try {
	await access(resolve(root, "packages/coding-agent/dist/index.js"));
	process.exit(0);
} catch {}

run("npm", ["install", "--include=dev", "--ignore-scripts"], root);
run("npm", ["run", "build"], root);

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}
