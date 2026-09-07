import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti/static";
import { afterEach, describe, expect, it } from "vitest";
import { buildPiAiAliases } from "../src/core/extensions/loader.ts";

describe("extension loader pi-ai aliases", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("keeps pi-ai subpaths outside the compat entrypoint", () => {
		const root = join(tmpdir(), `pi-ai-aliases-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const dist = join(root, "dist");
		mkdirSync(join(dist, "utils"), { recursive: true });
		for (const relativePath of ["compat.js", "oauth.js", "providers/all.js", "utils/uuid.js"]) {
			const filePath = join(dist, relativePath);
			mkdirSync(join(filePath, ".."), { recursive: true });
			writeFileSync(filePath, "export {};\n", "utf8");
		}
		roots.push(root);

		const aliases = buildPiAiAliases("@earendil-works/pi-ai", {
			distDir: dist,
			compatEntry: join(dist, "compat.js"),
			oauthEntry: join(dist, "oauth.js"),
			providersEntry: join(dist, "providers/all.js"),
		});
		const jiti = createJiti(import.meta.url, { alias: aliases });

		expect(realpathSync(jiti.resolve("@earendil-works/pi-ai"))).toBe(realpathSync(join(dist, "compat.js")));
		expect(realpathSync(jiti.resolve("@earendil-works/pi-ai/compat"))).toBe(realpathSync(join(dist, "compat.js")));
		expect(realpathSync(jiti.resolve("@earendil-works/pi-ai/utils/uuid"))).toBe(
			realpathSync(join(dist, "utils/uuid.js")),
		);
	});
});
