#!/usr/bin/env node
// apps/cli/src/cli.ts
// Mem Crawler — CLI Tool
// Usage: crawler <command> [options]

import fs from "node:fs";
import path from "node:path";
import { ADAPTERS, detectAdapter } from "@mem-crawler/adapters";
import {
	analyzeRecords,
	detectTemporalAnomalies,
} from "@mem-crawler/core/engine";
import {
	createSnapshot,
	diffSnapshots,
	generateReport,
} from "@mem-crawler/core/snapshot";
import type { ExposureReport, MemoryRecord } from "@mem-crawler/types";
import { SURFACE_LABELS, SUSPICION_COLORS } from "@mem-crawler/types";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

const pkg = JSON.parse(
	fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

const program = new Command();

program
	.name("crawler")
	.description("🕷️  Mem Crawler — AI Memory Auditor")
	.version(pkg.version);

// ─────────────────────────────────────────────────────────────────────────────
// crawler scan
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("scan")
	.description("Scan a memory export or local file for suspicious records")
	.requiredOption(
		"-f, --file <path>",
		"Path to memory export file (JSON, ZIP, Markdown)",
	)
	.option(
		"-a, --adapter <id>",
		"Force a specific adapter ID (default: auto-detect)",
	)
	.option("-o, --output <path>", "Write report to file (default: stdout)")
	.option(
		"--format <fmt>",
		"Output format: json | html | table (default: table)",
		"table",
	)
	.option("--no-clean", "Hide clean records from output")
	.action(async (opts) => {
		const spinner = ora("Loading file…").start();

		try {
			const filePath = path.resolve(opts.file);
			if (!fs.existsSync(filePath)) {
				spinner.fail(`File not found: ${filePath}`);
				process.exit(1);
			}

			const raw = fs.readFileSync(filePath, "utf-8");
			let parsed: unknown;

			try {
				parsed = JSON.parse(raw);
			} catch {
				// Not JSON — try as Markdown string
				parsed = raw;
			}

			const adapter = opts.adapter
				? ADAPTERS.find((a) => a.id === opts.adapter)
				: detectAdapter(parsed);

			if (!adapter) {
				spinner.fail("No adapter could parse this file. Try --adapter <id>.");
				console.log("\nAvailable adapters:");
				ADAPTERS.forEach((a) =>
					console.log(`  ${chalk.cyan(a.id.padEnd(20))} ${a.name}`),
				);
				process.exit(1);
			}

			spinner.text = `Ingesting with ${adapter.name}…`;
			const raw_records = await adapter.ingest(parsed);

			spinner.text = `Running ${raw_records.length} records through detection engine…`;
			const analyzed = analyzeRecords(raw_records);

			const temporalAnomalies = detectTemporalAnomalies(analyzed);
			const report = generateReport(adapter.id.split("-")[0], analyzed);

			spinner.succeed(`Scan complete — ${analyzed.length} records analyzed`);

			if (opts.format === "table") {
				printTable(analyzed, opts.noClean, report, temporalAnomalies);
			} else if (opts.format === "json") {
				const out = JSON.stringify(
					{ records: analyzed, report, temporalAnomalies },
					null,
					2,
				);
				if (opts.output) {
					fs.writeFileSync(opts.output, out);
					console.log(chalk.green(`\n  Report saved: ${opts.output}`));
				} else {
					console.log(out);
				}
			} else if (opts.format === "html") {
				const html = generateHTMLReport(report, analyzed);
				const outPath = opts.output ?? `mem-crawler-report-${Date.now()}.html`;
				fs.writeFileSync(outPath, html);
				console.log(chalk.green(`\n  HTML report saved: ${outPath}`));
			}

			// Capability statement
			const cap = adapter.capabilityStatement();
			console.log(chalk.yellow("\n  ⚠ Honest Limitations (from adapter):"));
			cap.cannotSee.forEach((s) => console.log(chalk.dim(`    ✗ ${s}`)));
		} catch (err) {
			spinner.fail(`Scan failed: ${err}`);
			process.exit(1);
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// crawler diff
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("diff")
	.description("Compare two memory export files and highlight changes")
	.requiredOption("--from <path>", "Older export file")
	.requiredOption("--to <path>", "Newer export file")
	.option(
		"--deleted-ids <ids>",
		"Comma-separated IDs of records user reported deleting",
	)
	.action(async (opts) => {
		const spinner = ora("Loading snapshots…").start();

		try {
			const parseFile = async (filePath: string): Promise<MemoryRecord[]> => {
				const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
				const parsed = JSON.parse(raw);
				const adapter = detectAdapter(parsed);
				if (!adapter) throw new Error(`No adapter for ${filePath}`);
				const records = await adapter.ingest(parsed);
				return analyzeRecords(records);
			};

			const [fromRecords, toRecords] = await Promise.all([
				parseFile(opts.from),
				parseFile(opts.to),
			]);

			const fromSnap = await createSnapshot(
				"auto",
				fromRecords,
				opts.from,
				"from",
			);
			const toSnap = await createSnapshot("auto", toRecords, opts.to, "to");

			const deletedIds = opts.deletedIds
				? opts.deletedIds.split(",").map((s: string) => s.trim())
				: [];
			const diff = diffSnapshots(
				fromRecords,
				toRecords,
				fromSnap.id,
				toSnap.id,
				deletedIds,
			);

			spinner.succeed("Diff complete");

			const added = diff.entries.filter((e) => e.type === "added");
			const removed = diff.entries.filter((e) => e.type === "removed");
			const modified = diff.entries.filter((e) => e.type === "modified");

			console.log(
				`\n  ${chalk.green(`+ ${added.length} added`)}  ${chalk.red(`- ${removed.length} removed`)}  ${chalk.yellow(`~ ${modified.length} modified`)}\n`,
			);

			for (const e of added) {
				const lvl = e.record.suspicionLevel;
				const color = lvlColor(lvl);
				console.log(
					color(`  + [${lvl.toUpperCase()}] ${e.record.content.slice(0, 80)}`),
				);
				if (e.record.flags.length > 0) {
					e.record.flags.forEach((f) =>
						console.log(
							chalk.dim(`      ↳ ${f.ruleName}: ${f.explanation.slice(0, 70)}`),
						),
					);
				}
			}

			for (const e of removed) {
				console.log(
					chalk.dim(`  - [REMOVED] ${e.record.content.slice(0, 80)}`),
				);
			}

			if (diff.deletionGaps.length > 0) {
				console.log(
					chalk.red(
						`\n  ⚠ ${diff.deletionGaps.length} deletion gap(s) — records persist after reported deletion:`,
					),
				);
				diff.deletionGaps.forEach((id) =>
					console.log(chalk.red(`    ID: ${id}`)),
				);
			}

			if (diff.suspiciousChanges.length > 0) {
				console.log(
					chalk.yellow(
						`\n  ⚠ ${diff.suspiciousChanges.length} suspicious change(s) detected`,
					),
				);
			}
		} catch (err) {
			spinner.fail(`Diff failed: ${err}`);
			process.exit(1);
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// crawler adapters
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("adapters")
	.description("List all available adapters and their capabilities")
	.action(() => {
		console.log(chalk.bold("\n  🕷️  Mem Crawler — Available Adapters\n"));
		for (const a of ADAPTERS) {
			const cap = a.capabilityStatement();
			console.log(chalk.cyan(`  ${a.id}`), chalk.bold(a.name));
			console.log(chalk.dim(`    Confidence: ${cap.confidenceLevel}`));
			console.log(
				chalk.dim(`    Can see: ${cap.canSee.slice(0, 2).join(", ")}`),
			);
			console.log(
				chalk.dim(`    Cannot see: ${cap.cannotSee.slice(0, 1).join(", ")}`),
			);
			console.log();
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// crawler rules
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("rules")
	.description("List all active detection rules")
	.option("--severity <level>", "Filter by severity: critical|high|medium|low")
	.action(async (opts) => {
		const { RULES } = await import("@mem-crawler/rules");
		const filtered = opts.severity
			? RULES.filter((r) => r.severity === opts.severity)
			: RULES;

		console.log(
			chalk.bold(`\n  🕷️  Mem Crawler — Detection Rules (${filtered.length})\n`),
		);
		for (const r of filtered) {
			console.log(
				lvlColor(r.severity)(
					`  [${r.severity.toUpperCase().padEnd(8)}] ${r.id} — ${r.name}`,
				),
			);
			console.log(chalk.dim(`    ${r.description}`));
			console.log(chalk.dim(`    Ref: ${r.references[0] ?? "—"}`));
			console.log();
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function lvlColor(lvl: string) {
	switch (lvl) {
		case "critical":
			return chalk.red;
		case "high":
			return chalk.yellow;
		case "medium":
			return chalk.magenta;
		case "low":
			return chalk.blue;
		default:
			return chalk.green;
	}
}

function printTable(
	records: MemoryRecord[],
	hideClean: boolean,
	report: ExposureReport,
	anomalies: { count: number; explanation: string }[],
) {
	const show = hideClean
		? records.filter((r) => r.suspicionLevel !== "clean")
		: records;

	console.log(chalk.bold(`\n  🕷️  Mem Crawler Scan Results\n`));

	for (const r of show) {
		const lvl = r.suspicionLevel;
		const color = lvlColor(lvl);
		console.log(
			color(
				`  [${lvl.toUpperCase().padEnd(8)}] ${r.suspicionScore.toString().padStart(3)}/100  ${r.content.slice(0, 72)}`,
			),
		);
		console.log(
			chalk.dim(
				`             Surface: ${SURFACE_LABELS[r.surface]}  ·  Platform: ${r.platform}  ·  Confidence: ${r.provenance.confidence}`,
			),
		);
		for (const f of r.flags) {
			console.log(
				chalk.dim(
					`             ↳ ${f.ruleName}: ${f.explanation.slice(0, 72)}`,
				),
			);
		}
	}

	console.log(chalk.bold(`\n  ─────────────────────────────────────`));
	console.log(
		`  ${chalk.red(`${report.byLevel.critical} critical`)}  ${chalk.yellow(`${report.byLevel.high} high`)}  ${chalk.magenta(`${report.byLevel.medium} medium`)}  ${chalk.blue(`${report.byLevel.low} low`)}  ${chalk.green(`${report.byLevel.clean} clean`)}`,
	);

	if (report.recommendations.length > 0) {
		console.log(chalk.bold("\n  Recommendations:"));
		report.recommendations.forEach((r) => console.log(`  • ${r}`));
	}

	if (anomalies.length > 0) {
		console.log(chalk.yellow("\n  Temporal Anomalies:"));
		anomalies.forEach((a) => console.log(chalk.yellow(`  ⚠ ${a.explanation}`)));
	}
}

function generateHTMLReport(
	report: ExposureReport,
	records: MemoryRecord[],
): string {
	const critical = records.filter(
		(r) => r.suspicionLevel === "critical" || r.suspicionLevel === "high",
	);
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Mem Crawler Report</title>
<style>body{font-family:system-ui;background:#0a0a14;color:#e2e2f0;padding:2rem;max-width:900px;margin:0 auto}
h1{color:#6c63ff}h2{color:#00d4aa;margin-top:2rem}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
.critical{background:#ef444430;color:#ef4444}.high{background:#f97316;color:white}
.medium{background:#f59e0b30;color:#f59e0b}.low{background:#3b82f630;color:#3b82f6}
.clean{background:#22c55e30;color:#22c55e}
.record{border:1px solid #1e1e32;border-radius:8px;padding:1rem;margin:.75rem 0;background:#12121e}
.content{font-size:.9rem;margin-bottom:.5rem}
.meta{font-size:.75rem;color:#8888aa}
.flag{font-size:.8rem;color:#f59e0b;margin-top:.5rem}
.limitation{color:#f59e0b;font-size:.85rem;margin:.25rem 0}
</style></head><body>
<h1>🕷️ Mem Crawler — Exposure Report</h1>
<p>Generated: ${new Date(report.generatedAt).toLocaleString()} · Platform: ${report.platform} · Total records: ${report.totalRecords}</p>
<div>
  <span class="badge critical">${report.byLevel.critical} Critical</span>  
  <span class="badge high">${report.byLevel.high} High</span>  
  <span class="badge medium">${report.byLevel.medium} Medium</span>  
  <span class="badge low">${report.byLevel.low} Low</span>  
  <span class="badge clean">${report.byLevel.clean} Clean</span>
</div>
<h2>⚠ Critical & High Findings</h2>
${
	critical
		.map(
			(r) => `<div class="record">
  <span class="badge ${r.suspicionLevel}">${r.suspicionLevel.toUpperCase()} · ${r.suspicionScore}/100</span>
  <div class="content">${r.content}</div>
  <div class="meta">Surface: ${SURFACE_LABELS[r.surface]} · Confidence: ${r.provenance.confidence}</div>
  ${r.flags.map((f) => `<div class="flag">↳ ${f.ruleName}: ${f.explanation}</div>`).join("")}
</div>`,
		)
		.join("") || "<p>None found.</p>"
}
<h2>Recommendations</h2>
${report.recommendations.map((r) => `<p>• ${r}</p>`).join("")}
<h2>Honest Limitations</h2>
${report.honestLimitations.map((l) => `<p class="limitation">⚠ ${l}</p>`).join("")}
</body></html>`;
}

// npm/pnpm may insert `--` before subcommands or flags (`pnpm run crawler -- scan`, `pnpm crawler -- --help`).
// Commander does not treat a leading `--` like the shell; strip those tokens.
let userArgs = process.argv.slice(2);
while (userArgs[0] === "--") {
	userArgs = userArgs.slice(1);
}
program.parse(
	[process.argv[0] as string, process.argv[1] as string, ...userArgs],
	{
		from: "node",
	},
);
