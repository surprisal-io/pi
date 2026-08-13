import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CURRENT_SESSION_VERSION,
	type SessionHeader,
	SessionManager,
	type SessionManagerMutation,
	type SessionMessageEntry,
} from "../../src/core/session-manager.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SessionManager mutation subscriptions", () => {
	it("emits every appended entry with its canonical identity and resulting leaf", () => {
		const session = SessionManager.inMemory(process.cwd(), { id: "mutation-session" });
		const mutations: SessionManagerMutation[] = [];
		session.subscribeMutations((mutation) => mutations.push(mutation));

		const messageId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendThinkingLevelChange("high");
		session.appendModelChange("openai", "gpt-test");
		session.appendCompaction("summary", messageId, 10);
		session.appendCustomEntry("state", { value: 1 });
		session.appendCustomMessageEntry("context", "remember", false, { value: 2 });
		session.appendSessionInfo("name");
		session.appendLabelChange(messageId, "checkpoint");
		session.branchWithSummary(messageId, "branch summary");

		const appended = mutations.filter((mutation) => mutation.type === "entry_appended");
		expect(appended.map((mutation) => mutation.entry.type)).toEqual([
			"message",
			"thinking_level_change",
			"model_change",
			"compaction",
			"custom",
			"custom_message",
			"session_info",
			"label",
			"branch_summary",
		]);
		for (const mutation of appended) {
			expect(mutation.leafId).toBe(mutation.entry.id);
			expect(session.getEntry(mutation.entry.id)).toBe(mutation.entry);
		}
	});

	it("emits explicit leaf changes", () => {
		const session = SessionManager.inMemory();
		const firstId = session.appendMessage({ role: "user", content: "first", timestamp: 1 });
		session.appendMessage({ role: "user", content: "second", timestamp: 2 });
		const mutations: SessionManagerMutation[] = [];
		session.subscribeMutations((mutation) => mutations.push(mutation));

		session.branch(firstId);
		session.resetLeaf();

		expect(mutations).toEqual([
			{ type: "leaf_changed", leafId: firstId },
			{ type: "leaf_changed", leafId: null },
		]);
	});

	it("emits complete snapshots when resetting or replacing a session", () => {
		const session = SessionManager.inMemory(process.cwd(), { id: "original" });
		const mutations: SessionManagerMutation[] = [];
		session.subscribeMutations((mutation) => mutations.push(mutation));

		session.appendMessage({ role: "user", content: "old", timestamp: 1 });
		session.newSession({ id: "replacement", parentSession: "original" });

		const reset = mutations.at(-1);
		expect(reset).toEqual({
			type: "session_reset",
			header: session.getHeader(),
			entries: [],
			leafId: null,
		});
	});

	it("emits the rebuilt branch snapshot after creating an in-memory branched session", () => {
		const session = SessionManager.inMemory(process.cwd(), { id: "source" });
		const firstId = session.appendMessage({ role: "user", content: "first", timestamp: 1 });
		session.appendMessage({ role: "user", content: "second", timestamp: 2 });
		const mutations: SessionManagerMutation[] = [];
		session.subscribeMutations((mutation) => mutations.push(mutation));

		session.createBranchedSession(firstId);

		const reset = mutations.at(-1);
		expect(reset?.type).toBe("session_reset");
		if (reset?.type !== "session_reset") throw new Error("Expected session reset");
		expect(reset.header.id).not.toBe("source");
		expect(reset.entries.map((entry) => entry.id)).toEqual([firstId]);
		expect(reset.leafId).toBe(firstId);
	});

	it("emits a replacement snapshot when loading a session file into an existing manager", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-session-mutations-"));
		tempDirs.push(dir);
		const path = join(dir, "session.jsonl");
		const header: SessionHeader = {
			type: "session",
			version: CURRENT_SESSION_VERSION,
			id: "loaded",
			timestamp: "2026-01-01T00:00:00.000Z",
			cwd: process.cwd(),
		};
		const entry: SessionMessageEntry = {
			type: "message",
			id: "entry-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:01.000Z",
			message: { role: "user", content: "loaded", timestamp: 1 },
		};
		writeFileSync(path, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`);
		const session = SessionManager.inMemory();
		const mutations: SessionManagerMutation[] = [];
		session.subscribeMutations((mutation) => mutations.push(mutation));

		session.setSessionFile(path);

		expect(mutations).toEqual([{ type: "session_reset", header, entries: [entry], leafId: entry.id }]);
	});

	it("stops emitting after unsubscribe", () => {
		const session = SessionManager.inMemory();
		const mutations: SessionManagerMutation[] = [];
		const unsubscribe = session.subscribeMutations((mutation) => mutations.push(mutation));
		unsubscribe();

		session.appendMessage({ role: "user", content: "ignored", timestamp: 1 });

		expect(mutations).toEqual([]);
	});
});
