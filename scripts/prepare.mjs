import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
try {
	await Promise.all([
		access(resolve(root, ".git")),
		access(resolve(root, "node_modules/.bin/husky")),
	]);
} catch {
	process.exit(0);
}

const result = spawnSync("npm", ["exec", "husky"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
