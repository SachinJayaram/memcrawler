import type { MemoryRecord } from "@mem-crawler/types";
import { SUSPICION_COLORS } from "@mem-crawler/types";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { analyzePaste, countByLevel, sortRecordsByRisk } from "./analyzePaste";

const bg = "#0a0a14";
const surface = "#12121e";
const border = "#1e1e32";
const text = "#e2e2f0";
const muted = "#8888aa";
const accent = "#6c63ff";

type Filter = "all" | "critical" | "high" | "medium" | "low" | "clean";

function levelLabel(level: MemoryRecord["suspicionLevel"]): string {
	return level.charAt(0).toUpperCase() + level.slice(1);
}

function RecordCard({
	record,
	expanded,
	onToggle,
}: {
	record: MemoryRecord;
	expanded: boolean;
	onToggle: () => void;
}) {
	const color = SUSPICION_COLORS[record.suspicionLevel];
	return (
		<article
			style={{
				background: surface,
				border: `1px solid ${border}`,
				borderLeft: `4px solid ${color}`,
				borderRadius: 8,
				padding: "12px 14px",
				marginBottom: 10,
			}}
		>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 8,
					marginBottom: 8,
				}}
			>
				<span
					style={{
						fontSize: "0.72rem",
						fontWeight: 700,
						textTransform: "uppercase",
						letterSpacing: "0.06em",
						color,
					}}
				>
					{levelLabel(record.suspicionLevel)}
				</span>
				<span style={{ fontSize: "0.75rem", color: muted }}>
					Score {record.suspicionScore}
				</span>
				<span style={{ fontSize: "0.72rem", color: muted }}>
					{record.platform} · {record.surface}
				</span>
			</div>
			<button
				type="button"
				onClick={onToggle}
				style={{
					width: "100%",
					textAlign: "left",
					background: "transparent",
					border: "none",
					color: text,
					cursor: "pointer",
					fontSize: "0.85rem",
					lineHeight: 1.5,
					padding: 0,
					fontFamily: "inherit",
				}}
			>
				{expanded ? record.content : truncate(record.content, 280)}
			</button>
			{record.content.length > 280 && (
				<button
					type="button"
					onClick={onToggle}
					style={{
						marginTop: 6,
						background: "transparent",
						border: "none",
						color: accent,
						cursor: "pointer",
						fontSize: "0.75rem",
						padding: 0,
					}}
				>
					{expanded ? "Show less" : "Show full text"}
				</button>
			)}
			{record.flags.length > 0 && (
				<ul
					style={{
						margin: "12px 0 0",
						paddingLeft: "1.1rem",
						fontSize: "0.78rem",
						color: muted,
						lineHeight: 1.45,
					}}
				>
					{record.flags.map((f) => (
						<li key={f.ruleId} style={{ marginBottom: 6 }}>
							<strong style={{ color: text }}>{f.ruleName}</strong> (
							{f.severity}) — {f.explanation}
							{f.matchedText && (
								<span
									style={{
										display: "block",
										marginTop: 4,
										fontFamily: "ui-monospace, monospace",
										fontSize: "0.72rem",
										color: muted,
									}}
								>
									“{truncate(f.matchedText, 160)}”
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</article>
	);
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}…`;
}

export type PasteAnalyzerProps = {
	/** When true, fits inside the marketing page (no full-viewport shell). */
	embedded?: boolean;
};

export function PasteAnalyzer({ embedded = false }: PasteAnalyzerProps) {
	const [paste, setPaste] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [records, setRecords] = useState<MemoryRecord[] | null>(null);
	const [adapterId, setAdapterId] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpand = useCallback((id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const run = useCallback(async () => {
		setErr(null);
		setRecords(null);
		setAdapterId(null);
		setBusy(true);
		const result = await analyzePaste(paste);
		setBusy(false);
		if (!result.ok) {
			setErr(result.error);
			return;
		}
		setRecords(sortRecordsByRisk(result.records));
		setAdapterId(result.adapterId);
	}, [paste]);

	const counts = useMemo(() => {
		if (!records?.length) return null;
		return countByLevel(records);
	}, [records]);

	const filtered = useMemo(() => {
		if (!records) return [];
		if (filter === "all") return records;
		return records.filter((r) => r.suspicionLevel === filter);
	}, [records, filter]);

	const outer: CSSProperties = embedded
		? {
				background: "transparent",
				color: text,
				fontFamily:
					"ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
				boxSizing: "border-box",
			}
		: {
				minHeight: "100vh",
				background: bg,
				color: text,
				fontFamily:
					"ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
				padding: "24px 20px 48px",
				boxSizing: "border-box",
			};

	return (
		<div style={outer}>
			<div style={{ maxWidth: 800, margin: "0 auto" }}>
				{!embedded && (
					<header style={{ marginBottom: 28 }}>
						<h1 style={{ margin: "0 0 6px", fontSize: "1.5rem" }}>
							🕷️ Mem Crawler
						</h1>
						<p style={{ margin: 0, color: muted, fontSize: "0.95rem" }}>
							Paste memory JSON or text from ChatGPT, Claude, or an export —
							same analysis as the browser extension.
						</p>
					</header>
				)}

				<section
					style={{
						background: surface,
						border: `1px solid ${border}`,
						borderRadius: 10,
						padding: "16px 18px 18px",
						marginBottom: 24,
					}}
				>
					<label
						htmlFor={embedded ? "paste-embedded" : "paste"}
						style={{ display: "block", marginBottom: 8, fontSize: "0.9rem" }}
					>
						Memory data
					</label>
					<textarea
						id={embedded ? "paste-embedded" : "paste"}
						value={paste}
						onChange={(e) => setPaste(e.target.value)}
						placeholder={`Example:\n{ "memories": [ { "text": "User prefers dark mode" } ] }`}
						spellCheck={false}
						style={{
							width: "100%",
							minHeight: 180,
							boxSizing: "border-box",
							padding: 12,
							borderRadius: 8,
							border: `1px solid ${border}`,
							background: "#0d0d18",
							color: text,
							fontSize: "0.85rem",
							fontFamily: "ui-monospace, monospace",
							lineHeight: 1.45,
							resize: "vertical",
							marginBottom: 12,
						}}
					/>
					<button
						type="button"
						disabled={busy || !paste.trim()}
						onClick={() => void run()}
						style={{
							padding: "10px 20px",
							borderRadius: 6,
							border: "none",
							background: busy || !paste.trim() ? border : accent,
							color: "#fff",
							fontSize: "0.9rem",
							fontWeight: 700,
							cursor: busy || !paste.trim() ? "not-allowed" : "pointer",
						}}
					>
						{busy ? "Analyzing…" : "Analyze"}
					</button>
					{err && (
						<p
							style={{
								margin: "12px 0 0",
								fontSize: "0.85rem",
								color: "#ef4444",
							}}
						>
							{err}
						</p>
					)}
				</section>

				{records && records.length > 0 && counts && (
					<section style={{ marginBottom: 20 }}>
						<h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Results</h2>
						<p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: muted }}>
							Adapter: <code style={{ color: accent }}>{adapterId}</code> ·{" "}
							{records.length} record{records.length === 1 ? "" : "s"}
						</p>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
								gap: 10,
								marginBottom: 16,
							}}
						>
							{(["critical", "high", "medium", "low", "clean"] as const).map(
								(level) => (
									<div
										key={level}
										style={{
											background: surface,
											border: `1px solid ${border}`,
											borderRadius: 8,
											padding: "10px 12px",
											textAlign: "center",
										}}
									>
										<div
											style={{
												fontSize: "1.25rem",
												fontWeight: 800,
												color: SUSPICION_COLORS[level],
											}}
										>
											{counts[level]}
										</div>
										<div
											style={{
												fontSize: "0.65rem",
												color: muted,
												textTransform: "uppercase",
												letterSpacing: "0.05em",
											}}
										>
											{level}
										</div>
									</div>
								),
							)}
						</div>

						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: 6,
								marginBottom: 14,
							}}
						>
							{(
								["all", "critical", "high", "medium", "low", "clean"] as const
							).map((f) => (
								<button
									key={f}
									type="button"
									onClick={() => setFilter(f)}
									style={{
										padding: "6px 12px",
										borderRadius: 6,
										border:
											filter === f
												? `1px solid ${accent}`
												: `1px solid ${border}`,
										background: filter === f ? `${accent}33` : surface,
										color: filter === f ? text : muted,
										fontSize: "0.78rem",
										cursor: "pointer",
										textTransform: f === "all" ? "none" : "capitalize",
									}}
								>
									{f === "all" ? "All" : f}
								</button>
							))}
						</div>

						<p style={{ margin: "0 0 10px", fontSize: "0.8rem", color: muted }}>
							Showing {filtered.length} of {records.length} (highest risk first)
						</p>

						{filtered.map((r) => (
							<RecordCard
								key={r.id}
								record={r}
								expanded={expandedIds.has(r.id)}
								onToggle={() => toggleExpand(r.id)}
							/>
						))}
					</section>
				)}

				{records && records.length === 0 && (
					<p style={{ color: muted }}>
						No records were produced from that input.
					</p>
				)}

				{!embedded && (
					<footer style={{ marginTop: 32, fontSize: "0.75rem", color: muted }}>
						Run locally:{" "}
						<code style={{ color: accent }}>
							pnpm --filter @mem-crawler/desktop dev
						</code>
						<br />
						For large exports, use the{" "}
						<code style={{ color: accent }}>crawler</code> CLI from the repo.
					</footer>
				)}
				{embedded && (
					<p style={{ marginTop: 16, fontSize: "0.75rem", color: muted }}>
						Analysis runs in your browser. For large exports, use the{" "}
						<code style={{ color: accent }}>crawler</code> CLI.
					</p>
				)}
			</div>
		</div>
	);
}
