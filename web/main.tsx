import { PasteAnalyzer } from "@desktop/PasteAnalyzer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const el = document.getElementById("analyzer-root");
if (el) {
	createRoot(el).render(
		<StrictMode>
			<PasteAnalyzer embedded />
		</StrictMode>,
	);
}
