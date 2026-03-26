import { ADAPTERS } from "@mem-crawler/adapters";
import { analyzeRecords } from "@mem-crawler/core/engine";
import type { MemoryRecord } from "@mem-crawler/types";

export type AnalyzeOk = {
	ok: true;
	records: MemoryRecord[];
	adapterId: string;
};

export type AnalyzeErr = {
	ok: false;
	error: string;
};

export type AnalyzeResult = AnalyzeOk | AnalyzeErr;

/** Same ingestion path as the extension options page / service worker. */
export async function analyzePaste(raw: string): Promise<AnalyzeResult> {
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
				"Could not recognize that format. Try JSON from a ChatGPT/Claude export, or { memories: [{ text: \"...\" }] } / { memories: [{ content: \"...\" }] }, a JSON array of objects with text/content, or markdown-style lists.",
		};
	}

	try {
		const ingested = await adapter.ingest(parsed);
		const records = analyzeRecords(ingested);
		return { ok: true, records, adapterId: adapter.id };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, error: `Ingest failed: ${msg}` };
	}
}

const LEVEL_ORDER: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	clean: 4,
};

export function sortRecordsByRisk(records: MemoryRecord[]): MemoryRecord[] {
	return [...records].sort((a, b) => {
		const da = LEVEL_ORDER[a.suspicionLevel] ?? 99;
		const db = LEVEL_ORDER[b.suspicionLevel] ?? 99;
		if (da !== db) return da - db;
		return b.suspicionScore - a.suspicionScore;
	});
}

export function countByLevel(
	records: MemoryRecord[],
): Record<MemoryRecord["suspicionLevel"], number> {
	const init: Record<MemoryRecord["suspicionLevel"], number> = {
		clean: 0,
		low: 0,
		medium: 0,
		high: 0,
		critical: 0,
	};
	for (const r of records) {
		init[r.suspicionLevel]++;
	}
	return init;
}
