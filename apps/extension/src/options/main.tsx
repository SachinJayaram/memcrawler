import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const bg = "#0a0a14";
const surface = "#12121e";
const border = "#1e1e32";
const text = "#e2e2f0";
const muted = "#8888aa";
const accent = "#6c63ff";
const danger = "#ef4444";
const ok = "#22c55e";

const HREF_CHATGPT_MEMORY = "https://chatgpt.com/#settings/Personalization";
const HREF_CLAUDE_MEMORY = "https://claude.ai/settings/memory";

function Options() {
	const [paste, setPaste] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		if (window.location.hash === "#paste") {
			document.getElementById("paste-section")?.scrollIntoView({
				behavior: "smooth",
			});
		}
	}, []);

	const analyze = useCallback(() => {
		setMsg(null);
		setErr(null);
		setBusy(true);
		chrome.runtime.sendMessage(
			{ type: "PASTE_IMPORT", raw: paste },
			(res: unknown) => {
				setBusy(false);
				if (chrome.runtime.lastError) {
					setErr(chrome.runtime.lastError.message ?? "Message failed.");
					return;
				}
				const r = res as {
					ok?: boolean;
					error?: string;
					reason?: string;
					count?: number;
					criticals?: number;
					adapter?: string;
				};
				if (r?.ok === true) {
					setMsg(
						`Analyzed ${r.count ?? 0} record(s) (${r.criticals ?? 0} critical). Open the extension popup to see totals.`,
					);
					return;
				}
				setErr(r?.error ?? r?.reason ?? "Analysis failed.");
			},
		);
	}, [paste]);

	return (
		<main
			style={{
				margin: 0,
				minHeight: "100vh",
				boxSizing: "border-box",
				background: bg,
				color: text,
				fontFamily:
					"ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
				padding: "24px 20px 40px",
				maxWidth: 640,
			}}
		>
			<div style={{ marginBottom: 20 }}>
				<h1 style={{ margin: "0 0 6px", fontSize: "1.35rem" }}>
					🕷️ Mem Crawler
				</h1>
				<p style={{ margin: 0, fontSize: "0.9rem", color: muted }}>
					Paste memory data you copied from ChatGPT or Claude — no page scraping
					required.
				</p>
			</div>

			<section
				id="paste-section"
				style={{
					background: surface,
					border: `1px solid ${border}`,
					borderRadius: 10,
					padding: "16px 18px 18px",
					marginBottom: 20,
				}}
			>
				<h2 style={{ margin: "0 0 10px", fontSize: "1rem" }}>
					1. Open Memory and copy data
				</h2>
				<p
					style={{
						margin: "0 0 12px",
						fontSize: "0.85rem",
						lineHeight: 1.5,
						color: muted,
					}}
				>
					Use your product’s Memory / Personalization screen, or paste JSON from
					an official <strong style={{ color: text }}>data export</strong> (same
					shapes the CLI accepts). You can paste a{" "}
					<code style={{ color: accent }}>memories</code> array, export JSON, or
					plain markdown-style lists.
				</p>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginBottom: 16,
					}}
				>
					<a
						href={HREF_CHATGPT_MEMORY}
						target="_blank"
						rel="noopener noreferrer"
						style={{
							padding: "8px 14px",
							borderRadius: 6,
							background: accent,
							color: "#fff",
							fontSize: "0.82rem",
							fontWeight: 600,
							textDecoration: "none",
						}}
					>
						ChatGPT → Memory
					</a>
					<a
						href={HREF_CLAUDE_MEMORY}
						target="_blank"
						rel="noopener noreferrer"
						style={{
							padding: "8px 14px",
							borderRadius: 6,
							border: `1px solid ${border}`,
							color: text,
							fontSize: "0.82rem",
							fontWeight: 600,
							textDecoration: "none",
						}}
					>
						Claude → Memory
					</a>
				</div>

				<h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>2. Paste here</h2>
				<textarea
					value={paste}
					onChange={(e) => setPaste(e.target.value)}
					placeholder={`Example: { "memories": [ { "text": "User prefers dark mode" } ] }`}
					spellCheck={false}
					style={{
						width: "100%",
						minHeight: 160,
						boxSizing: "border-box",
						padding: 12,
						borderRadius: 8,
						border: `1px solid ${border}`,
						background: "#0d0d18",
						color: text,
						fontSize: "0.8rem",
						fontFamily: "ui-monospace, monospace",
						lineHeight: 1.45,
						resize: "vertical",
						marginBottom: 12,
					}}
				/>
				<button
					type="button"
					disabled={busy || !paste.trim()}
					onClick={() => analyze()}
					style={{
						padding: "10px 18px",
						borderRadius: 6,
						border: "none",
						background: busy || !paste.trim() ? border : accent,
						color: "#fff",
						fontSize: "0.9rem",
						fontWeight: 700,
						cursor: busy || !paste.trim() ? "not-allowed" : "pointer",
					}}
				>
					{busy ? "Analyzing…" : "Analyze paste"}
				</button>
				{msg && (
					<p style={{ margin: "12px 0 0", fontSize: "0.85rem", color: ok }}>
						{msg}
					</p>
				)}
				{err && (
					<p style={{ margin: "12px 0 0", fontSize: "0.85rem", color: danger }}>
						{err}
					</p>
				)}
			</section>

			<p
				style={{
					margin: 0,
					fontSize: "0.78rem",
					color: muted,
					lineHeight: 1.5,
				}}
			>
				In-page scanning from the popup is still available as a shortcut;
				pasting is usually more reliable when the site UI changes. For huge
				exports, use the <code style={{ color: accent }}>crawler</code> CLI.
			</p>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<Options />);
