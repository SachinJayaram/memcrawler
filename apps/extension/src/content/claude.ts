/** Claude memory page — self-contained bundle (no shared chunk; MV3 reliability). */

(() => {
	const GUARD = window as unknown as { __MEM_CRAWLER_CLAUDE?: boolean };
	if (GUARD.__MEM_CRAWLER_CLAUDE) return;
	GUARD.__MEM_CRAWLER_CLAUDE = true;

	const MSG_SCAN = "MEM_CRAWLER_SCAN" as const;
	const HOST_ID = "mem-crawler-scan-host";

	function uniqueStrings(
		items: string[],
		minLen = 8,
		maxItems = 150,
	): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const t of items) {
			const s = t.replace(/\s+/g, " ").trim();
			if (s.length < minLen || s.length > 8000) continue;
			const key = s.slice(0, 200);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(s);
			if (out.length >= maxItems) break;
		}
		return out;
	}

	function collectTextBySelectors(selectors: string[]): string[] {
		const texts: string[] = [];
		for (const sel of selectors) {
			try {
				const nodes = document.querySelectorAll<HTMLElement>(sel);
				nodes.forEach((el) => {
					const t = el.innerText?.trim();
					if (t) texts.push(t);
				});
			} catch {
				/* invalid selector */
			}
		}
		return texts;
	}

	function collectFromMainFallback(): string[] {
		const main =
			document.querySelector("main") ??
			document.querySelector('[role="main"]') ??
			document.body;
		const texts: string[] = [];
		main.querySelectorAll("li, p, [role='listitem']").forEach((el) => {
			const t = (el as HTMLElement).innerText?.trim();
			if (t && t.length >= 12 && t.length < 4000) texts.push(t);
		});
		return texts;
	}

	function mountScanHost(onClick: () => void): void {
		if (document.getElementById(HOST_ID)?.isConnected) return;
		document.getElementById(HOST_ID)?.remove();

		const host = document.createElement("div");
		host.id = HOST_ID;
		host.setAttribute("data-mem-crawler-extension", "1");
		Object.assign(host.style, {
			position: "fixed",
			bottom: "88px",
			right: "20px",
			zIndex: "2147483647",
			pointerEvents: "none",
		});

		const btn = document.createElement("button");
		btn.type = "button";
		btn.textContent = "🕷️ Scan memory on this page";
		btn.setAttribute(
			"aria-label",
			"Mem Crawler: scan visible memory on this page",
		);
		Object.assign(btn.style, {
			pointerEvents: "auto",
			padding: "10px 14px",
			borderRadius: "8px",
			border: "2px solid #6c63ff",
			background: "#1a1a2e",
			color: "#e8e8ff",
			fontSize: "13px",
			fontWeight: "600",
			fontFamily: "system-ui, sans-serif",
			cursor: "pointer",
			boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
			minWidth: "200px",
		});
		btn.addEventListener("click", onClick);
		host.appendChild(btn);
		document.body.appendChild(host);
	}

	function startScanUiLifecycle(onClick: () => void): void {
		const ensure = (): void => {
			if (!document.body) return;
			if (!document.getElementById(HOST_ID)?.isConnected) {
				mountScanHost(onClick);
			}
		};

		ensure();
		const mo = new MutationObserver(() => {
			requestAnimationFrame(ensure);
		});
		mo.observe(document.documentElement, { childList: true, subtree: true });
		const iv = window.setInterval(ensure, 1500);
		window.setTimeout(() => window.clearInterval(iv), 180000);
	}

	function isClaudeMemoryContext(): boolean {
		const h = location.href.toLowerCase();
		return (
			h.includes("/memory") ||
			h.includes("/settings") ||
			h.includes("profile") ||
			h.includes("personalization")
		);
	}

	/**
	 * Claude’s DOM changes often. We try memory-specific selectors first, then
	 * list items in the main column (where memory rows usually render).
	 */
	function extractTexts(): string[] {
		const selectors = [
			'[data-testid*="memory"]',
			'[data-testid*="Memory"]',
			"[data-memory]",
			'[class*="MemoryItem" i]',
			'[class*="memory-item" i]',
			"main [role='listitem']",
			"main [role='row']",
			'[class*="ScrollArea"] li',
			"article p",
			'[class*="prose"] li',
		];
		let parts = collectTextBySelectors(selectors);
		if (parts.length < 2) {
			parts = [...parts, ...collectFromMainFallback()];
		}
		return uniqueStrings(parts, 8, 150);
	}

	function runScan(): void {
		const texts = extractTexts();
		if (texts.length === 0) {
			console.info(
				"[Mem Crawler] No memory text found on this Claude page. Open claude.ai → Settings → Memory (or your account memory page), wait for the list to load, then click “Scan memory on this page.”",
			);
			return;
		}
		const rawData = {
			memories: texts.map((content, i) => ({
				id: String(i),
				content,
			})),
		};
		chrome.runtime.sendMessage(
			{
				type: "RECORDS_FROM_PAGE",
				platform: "claude",
				rawData,
			},
			() => {
				if (chrome.runtime.lastError) {
					console.warn("[Mem Crawler]", chrome.runtime.lastError.message);
				}
			},
		);
	}

	function whenBody(cb: () => void): void {
		if (document.body) {
			cb();
			return;
		}
		const mo = new MutationObserver(() => {
			if (document.body) {
				mo.disconnect();
				cb();
			}
		});
		mo.observe(document.documentElement, { childList: true, subtree: true });
	}

	whenBody(() => {
		startScanUiLifecycle(runScan);
	});

	chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		if (msg?.type === MSG_SCAN) {
			runScan();
			sendResponse({ ok: true });
		}
		return false;
	});

	/** SPA often loads memory rows after first paint — retry a few times. */
	function scheduleAutoScans(): void {
		if (!isClaudeMemoryContext()) return;
		const delaysMs = [2500, 5500, 10000];
		for (const ms of delaysMs) {
			setTimeout(runScan, ms);
		}
	}

	scheduleAutoScans();
	window.addEventListener("popstate", () => {
		scheduleAutoScans();
	});
})();
