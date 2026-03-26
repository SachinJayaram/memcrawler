import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const bg = "#0a0a14";
const surface = "#12121e";
const border = "#1e1e32";
const text = "#e2e2f0";
const muted = "#8888aa";
const accent = "#6c63ff";
const danger = "#ef4444";

/** Deep links — UIs change; if one 404s, use in-app Settings → Memory. */
const HREF_CHATGPT_MEMORY = "https://chatgpt.com/#settings/Personalization";
const HREF_CLAUDE_MEMORY = "https://claude.ai/settings/memory";

/** Which bundled content script matches this URL (for programmatic `executeScript` fallback). */
function pickContentScriptFile(pageUrl: string): string | null {
	let hostname: string;
	try {
		hostname = new URL(pageUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
	if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) {
		return "content/chatgpt.js";
	}
	if (hostname === "chat.openai.com" || hostname.endsWith(".chat.openai.com")) {
		return "content/chatgpt.js";
	}
	if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) {
		return "content/claude.js";
	}
	return null;
}

/** Always inject via the service worker (popup often lacks `chrome.scripting`). */
async function injectContentScriptFiles(
	tabId: number,
	files: string[],
): Promise<void> {
	const message = {
		type: "EXECUTE_CONTENT_SCRIPT" as const,
		tabId,
		files,
	};
	const maxAttempts = 5;
	let lastError = "Could not reach the extension background.";

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, 60 * attempt));
		}
		const result = await new Promise<{ ok?: boolean; error?: string }>(
			(resolve) => {
				chrome.runtime.sendMessage(message, (res) => {
					if (chrome.runtime.lastError) {
						resolve({
							ok: false,
							error: chrome.runtime.lastError.message,
						});
						return;
					}
					resolve((res as { ok?: boolean; error?: string }) ?? {});
				});
			},
		);
		if (result.ok) return;
		lastError =
			result.error ?? "Could not inject script. Reload the extension.";
		const transient =
			result.error?.includes("Receiving end does not exist") ||
			result.error?.includes("message port closed");
		if (!transient) break;
	}

	throw new Error(lastError);
}

type StoredRecord = { suspicionLevel?: string };

function Popup() {
	const [loading, setLoading] = useState(true);
	const [total, setTotal] = useState(0);
	const [critical, setCritical] = useState(0);
	const [lastScan, setLastScan] = useState<string | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);
	const [lastErrorAt, setLastErrorAt] = useState<string | null>(null);
	const [scanHint, setScanHint] = useState<string | null>(null);

	const load = useCallback(() => {
		chrome.storage.local.get(
			["mc_records", "mc_last_scan", "mc_last_error", "mc_last_error_at"],
			(res) => {
				const raw = res.mc_records;
				const list: StoredRecord[] = Array.isArray(raw) ? raw : [];
				setTotal(list.length);
				setCritical(list.filter((r) => r.suspicionLevel === "critical").length);
				setLastScan((res.mc_last_scan as string | undefined) ?? null);
				const err = res.mc_last_error as string | undefined;
				setLastError(err && err.length > 0 ? err : null);
				setLastErrorAt((res.mc_last_error_at as string | undefined) ?? null);
				setLoading(false);
			},
		);
	}, []);

	const scanCurrentTab = useCallback(() => {
		setScanHint(null);
		void (async () => {
			const tabs = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			const tab = tabs[0];
			if (tab?.id == null) {
				setScanHint("No active tab.");
				return;
			}
			const tabId = tab.id;
			const url = tab.url ?? tab.pendingUrl ?? "";
			if (!url || /^chrome:/i.test(url)) {
				setScanHint("Switch to a normal https tab (ChatGPT or Claude).");
				return;
			}

			const trySend = (): Promise<boolean> =>
				new Promise((resolve) => {
					chrome.tabs.sendMessage(tabId, { type: "MEM_CRAWLER_SCAN" }, () => {
						resolve(!chrome.runtime.lastError);
					});
				});

			if (await trySend()) {
				setScanHint("Scan triggered. Refresh in a moment if counts stay at 0.");
				window.setTimeout(load, 800);
				return;
			}

			const file = pickContentScriptFile(url);
			if (!file) {
				setScanHint(
					"Unsupported URL. Use chatgpt.com, chat.openai.com, or claude.ai (including www).",
				);
				return;
			}

			try {
				await injectContentScriptFiles(tabId, [file]);
			} catch (e) {
				setScanHint(e instanceof Error ? e.message : String(e));
				return;
			}

			await new Promise((r) => setTimeout(r, 120));
			if (await trySend()) {
				setScanHint("Scan triggered. Refresh in a moment if counts stay at 0.");
				window.setTimeout(load, 800);
				return;
			}

			setScanHint(
				"Script injected but did not respond. Reload the page once, then try Scan again.",
			);
		})();
	}, [load]);

	useEffect(() => {
		load();
		const onStorage = (
			changes: Record<string, chrome.storage.StorageChange>,
			area: string,
		) => {
			if (area !== "local") return;
			if (changes.mc_records || changes.mc_last_scan || changes.mc_last_error) {
				load();
			}
		};
		chrome.storage.onChanged.addListener(onStorage);
		return () => chrome.storage.onChanged.removeListener(onStorage);
	}, [load]);

	return (
		<main
			style={{
				margin: 0,
				minWidth: 300,
				maxWidth: 340,
				fontFamily:
					"ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
				background: bg,
				color: text,
				padding: "14px 16px 16px",
				boxSizing: "border-box",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 12,
				}}
			>
				<span style={{ fontSize: "1.15rem" }} aria-hidden>
					🕷️
				</span>
				<div style={{ flex: 1 }}>
					<h1
						style={{
							margin: 0,
							fontSize: "1rem",
							fontWeight: 700,
							letterSpacing: "-0.02em",
						}}
					>
						Mem Crawler
					</h1>
					<p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: muted }}>
						AI memory audit
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						setLoading(true);
						load();
					}}
					style={{
						padding: "4px 8px",
						fontSize: "0.7rem",
						borderRadius: 4,
						border: `1px solid ${border}`,
						background: surface,
						color: muted,
						cursor: "pointer",
					}}
				>
					Refresh
				</button>
			</div>

			{loading ? (
				<p style={{ margin: "8px 0", fontSize: "0.85rem", color: muted }}>
					Loading…
				</p>
			) : total === 0 ? (
				<section
					style={{
						background: surface,
						border: `1px solid ${border}`,
						borderRadius: 8,
						padding: "12px 12px 14px",
						marginBottom: 12,
					}}
				>
					<p
						style={{
							margin: "0 0 8px",
							fontSize: "0.82rem",
							lineHeight: 1.45,
							color: muted,
						}}
					>
						No records yet. The extension only sees data after a scan on the{" "}
						<strong style={{ color: text }}>Memory</strong> screen (not the main
						chat).
					</p>
					<ol
						style={{
							margin: "0 0 10px",
							paddingLeft: "1.1rem",
							fontSize: "0.78rem",
							lineHeight: 1.5,
							color: muted,
						}}
					>
						<li>Open Memory using the buttons below.</li>
						<li>
							Wait until your saved memories are visible in the list (scroll if
							needed).
						</li>
						<li>
							<strong style={{ color: text }}>Recommended:</strong> use{" "}
							<strong style={{ color: text }}>Paste memory</strong> below — copy
							JSON or text from Memory / export, then analyze (no fragile page
							scraping).
						</li>
						<li>
							Or use the floating scan button on the site, or{" "}
							<strong style={{ color: text }}>Scan this tab</strong>.
						</li>
						<li>Click Refresh here — or close and reopen this popup.</li>
					</ol>
					{lastError && (
						<p
							style={{
								margin: "0 0 8px",
								fontSize: "0.72rem",
								lineHeight: 1.4,
								color: danger,
							}}
						>
							Last issue: {lastError}
							{lastErrorAt && (
								<span style={{ color: muted }}>
									{" "}
									({new Date(lastErrorAt).toLocaleString()})
								</span>
							)}
						</p>
					)}
					<p style={{ margin: 0, fontSize: "0.75rem", color: muted }}>
						Full account exports are slow — use the{" "}
						<code style={{ color: accent }}>crawler</code> CLI when you need an
						offline archive.
					</p>
				</section>
			) : (
				<section
					style={{
						background: surface,
						border: `1px solid ${border}`,
						borderRadius: 8,
						padding: "10px 12px 12px",
						marginBottom: 12,
					}}
				>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 8,
							marginBottom: 8,
						}}
					>
						<div>
							<div
								style={{ fontSize: "1.35rem", fontWeight: 800, color: accent }}
							>
								{total}
							</div>
							<div
								style={{
									fontSize: "0.7rem",
									color: muted,
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Records
							</div>
						</div>
						<div>
							<div
								style={{
									fontSize: "1.35rem",
									fontWeight: 800,
									color: critical > 0 ? danger : muted,
								}}
							>
								{critical}
							</div>
							<div
								style={{
									fontSize: "0.7rem",
									color: muted,
									textTransform: "uppercase",
									letterSpacing: "0.06em",
								}}
							>
								Critical
							</div>
						</div>
					</div>
					{lastScan && (
						<p style={{ margin: 0, fontSize: "0.72rem", color: muted }}>
							Last scan: {new Date(lastScan).toLocaleString()}
						</p>
					)}
				</section>
			)}

			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				<button
					type="button"
					onClick={() => {
						chrome.tabs.create({
							url: chrome.runtime.getURL("options.html#paste"),
						});
					}}
					style={{
						display: "block",
						textAlign: "center",
						padding: "8px 12px",
						borderRadius: 6,
						background: accent,
						border: "none",
						color: "#fff",
						fontSize: "0.82rem",
						fontWeight: 700,
						cursor: "pointer",
					}}
				>
					Paste memory (recommended)
				</button>
				<button
					type="button"
					onClick={() => scanCurrentTab()}
					style={{
						display: "block",
						textAlign: "center",
						padding: "8px 12px",
						borderRadius: 6,
						background: surface,
						border: `2px solid ${accent}`,
						color: accent,
						fontSize: "0.82rem",
						fontWeight: 700,
						cursor: "pointer",
					}}
				>
					Scan this tab
				</button>
				{scanHint && (
					<p
						style={{
							margin: 0,
							fontSize: "0.72rem",
							lineHeight: 1.4,
							color: scanHint.startsWith("Scan triggered") ? muted : danger,
						}}
					>
						{scanHint}
					</p>
				)}
				<a
					href={HREF_CHATGPT_MEMORY}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						display: "block",
						textAlign: "center",
						padding: "8px 12px",
						borderRadius: 6,
						background: accent,
						color: "#fff",
						fontSize: "0.82rem",
						fontWeight: 600,
						textDecoration: "none",
					}}
				>
					ChatGPT → Memory settings
				</a>
				<a
					href={HREF_CLAUDE_MEMORY}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						display: "block",
						textAlign: "center",
						padding: "8px 12px",
						borderRadius: 6,
						background: "transparent",
						border: `1px solid ${border}`,
						color: text,
						fontSize: "0.82rem",
						fontWeight: 600,
						textDecoration: "none",
					}}
				>
					Claude → Memory settings
				</a>
			</div>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<Popup />);
