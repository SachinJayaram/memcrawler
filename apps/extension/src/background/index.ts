/**
 * MV3 service worker — runs adapters + detection on data from content scripts.
 */
import { ADAPTERS } from "@mem-crawler/adapters";
import { analyzeRecords } from "@mem-crawler/core/engine";
import type { MemoryRecord } from "@mem-crawler/types";

export const DB_KEY = "mc_records";
export const LAST_SCAN_KEY = "mc_last_scan";
export const LAST_ERROR_KEY = "mc_last_error";
export const LAST_ERROR_AT_KEY = "mc_last_error_at";

type MCMessage = {
	type: "RECORDS_FROM_PAGE";
	platform: "chatgpt" | "claude";
	rawData: unknown;
};

type ExecuteScriptMessage = {
	type: "EXECUTE_CONTENT_SCRIPT";
	tabId: number;
	files: string[];
};

type PasteImportMessage = {
	type: "PASTE_IMPORT";
	raw: string;
};

chrome.runtime.onMessage.addListener(
	(
		msg: MCMessage | ExecuteScriptMessage | PasteImportMessage,
		_sender,
		sendResponse: (r: unknown) => void,
	) => {
		if (
			msg &&
			typeof msg === "object" &&
			"type" in msg &&
			msg.type === "EXECUTE_CONTENT_SCRIPT"
		) {
			const m = msg as ExecuteScriptMessage;
			if (!chrome.scripting?.executeScript) {
				sendResponse({
					ok: false,
					error:
						"chrome.scripting is unavailable. Use Chrome or Edge 88+ and reload the extension.",
				});
				return true;
			}
			chrome.scripting
				.executeScript({ target: { tabId: m.tabId }, files: m.files })
				.then(() => sendResponse({ ok: true }))
				.catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
			return true;
		}
		if (
			msg &&
			typeof msg === "object" &&
			"type" in msg &&
			msg.type === "PASTE_IMPORT"
		) {
			handlePasteImport((msg as PasteImportMessage).raw)
				.then(sendResponse)
				.catch((err: unknown) => {
					sendResponse({ ok: false, error: String(err) });
				});
			return true;
		}
		handleMessage(msg as MCMessage)
			.then(sendResponse)
			.catch((err: unknown) => {
				sendResponse({ ok: false, error: String(err) });
			});
		return true;
	},
);

function platformForAdapterId(adapterId: string): "chatgpt" | "claude" {
	if (adapterId === "claude-export") return "claude";
	return "chatgpt";
}

/** JSON from export, or plain text / markdown for the markdown adapter. */
async function handlePasteImport(raw: string): Promise<unknown> {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { ok: false, error: "Paste some JSON or text first." };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		parsed = trimmed;
	}

	const adapter = ADAPTERS.find((a) => a.canIngest(parsed));
	if (!adapter) {
		return {
			ok: false,
			error:
				'Could not recognize that format. Use JSON from a ChatGPT/Claude data export, or { memories: [{ text: "..." }] } / { memories: [{ content: "..." }] }, or a JSON array of objects with text/content fields. Plain markdown lists also work.',
		};
	}

	const platform = platformForAdapterId(adapter.id);
	return handleMessage({
		type: "RECORDS_FROM_PAGE",
		platform,
		rawData: parsed,
	});
}

async function handleMessage(msg: MCMessage): Promise<unknown> {
	if (msg.type !== "RECORDS_FROM_PAGE") {
		return { ok: false, reason: "unknown message" };
	}

	const adapter = ADAPTERS.find((a) => a.canIngest(msg.rawData));
	if (!adapter) {
		const reason =
			"No adapter matched this page data. Open the Memory list (not just chat), or use a data export with the CLI.";
		await chrome.storage.local.set({
			[LAST_ERROR_KEY]: reason,
			[LAST_ERROR_AT_KEY]: new Date().toISOString(),
		});
		return { ok: false, reason };
	}

	let raw: MemoryRecord[];
	try {
		raw = await adapter.ingest(msg.rawData);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		await chrome.storage.local.set({
			[LAST_ERROR_KEY]: `Ingest failed: ${reason}`,
			[LAST_ERROR_AT_KEY]: new Date().toISOString(),
		});
		return { ok: false, reason };
	}

	const analyzed = analyzeRecords(raw);
	const existing = await loadRecords();
	const merged = mergeRecords(existing, analyzed);
	await saveRecords(merged);
	await chrome.storage.local.set({
		[LAST_SCAN_KEY]: new Date().toISOString(),
	});
	await chrome.storage.local.remove([LAST_ERROR_KEY, LAST_ERROR_AT_KEY]);

	const criticals = analyzed.filter((r) => r.suspicionLevel === "critical");
	if (criticals.length > 0) {
		await chrome.notifications.create({
			type: "basic",
			iconUrl: chrome.runtime.getURL("icons/mc-48.png"),
			title: "Mem Crawler — critical finding",
			message: `${criticals.length} critical record(s) on ${msg.platform}. Open the extension popup for details.`,
			priority: 2,
		});
	}

	return {
		ok: true,
		count: analyzed.length,
		criticals: criticals.length,
		adapter: adapter.id,
	};
}

async function loadRecords(): Promise<MemoryRecord[]> {
	const res = await chrome.storage.local.get(DB_KEY);
	return (res[DB_KEY] as MemoryRecord[]) ?? [];
}

async function saveRecords(records: MemoryRecord[]): Promise<void> {
	await chrome.storage.local.set({ [DB_KEY]: records });
}

function mergeRecords(
	existing: MemoryRecord[],
	incoming: MemoryRecord[],
): MemoryRecord[] {
	const map = new Map(existing.map((r) => [r.contentHash, r]));
	for (const r of incoming) {
		if (!map.has(r.contentHash)) {
			map.set(r.contentHash, r);
		} else {
			const prev = map.get(r.contentHash)!;
			map.set(r.contentHash, { ...prev, lastSeen: r.lastSeen });
		}
	}
	return Array.from(map.values());
}

chrome.runtime.onInstalled.addListener(() => {
	// reserved for onboarding / alarms
});
