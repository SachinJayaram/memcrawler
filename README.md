# Mem Crawler

Audit and defend your AI memory. Detect injection attacks. Know what persists.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io/workspaces)

Mem Crawler is an open-source AI memory auditing toolkit. It helps you understand what AI systems remember about you, detect suspicious or injected memory records (including MINJA-style attacks), verify that deletions actually work, and generate exposure reports.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What Mem Crawler can see](#what-mem-crawler-can-see)
- [Run from a cloned repo](#run-from-a-cloned-repo)
  - [Prerequisites](#prerequisites)
  - [Install and build](#install-and-build)
  - [Option A — CLI](#option-a--cli)
  - [Option B — Web page (landing + in-browser analyzer)](#option-b--web-page-landing--in-browser-analyzer)
  - [Option C — Desktop app (Vite UI)](#option-c--desktop-app-vite-ui)
  - [Chrome extension (development)](#chrome-extension-development)
- [Verify your setup (tests & QA)](#verify-your-setup-tests--qa)
- [Publishing / global CLI install](#publishing--global-cli-install)
- [Quick start (CLI examples)](#quick-start-cli-examples)
- [CLI reference](#cli-reference)
- [Detection rules](#detection-rules)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why this exists

Researchers have demonstrated **Memory INJection Attacks (MINJA)**, where malicious content can plant persistent instructions into an AI agent’s memory through normal interactions — silently shaping future responses without user awareness.

AI platforms also accumulate memory across multiple surfaces (saved memory, chat history references, imports, local agent files) with inconsistent deletion behavior and no unified audit trail. Mem Crawler is meant to give you a clear, honest picture of what is there.

---

## What Mem Crawler can see

| Surface | Status |
| --- | --- |
| ChatGPT saved memory (via official export) | Supported |
| Claude memory (via official export) | Supported |
| Local agent memory files (JSON, Markdown, SQLite) | Supported |
| User-visible memory UI (with Chrome extension) | Supported |
| Snapshot diffs between two exports | Supported |
| Server-side data not included in exports | Not accessible |
| Model weights or training influence | Not accessible |
| Private API internals | Not accessible |

Confidence levels and capability limits are always surfaced in results where applicable.

---

## Run from a cloned repo

Use these steps after you clone the repository to your machine.

### Prerequisites

- **Node.js** 20+ (recommended)
- **pnpm** 9+ ([install pnpm](https://pnpm.io/installation))

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

### Install and build

From the repository root:

```bash
git clone <your-fork-or-upstream-url> memcrawler
cd memcrawler
pnpm install
pnpm build
```

`pnpm build` runs Turborepo and compiles workspace packages (`packages/*`) and apps (`apps/*`) so the CLI and other entry points have `dist/` outputs.

### Option A — CLI

The root `package.json` exposes a script `crawler` that runs the built CLI. You can invoke it as **`pnpm crawler`** (same as **`pnpm run crawler`**).

**Help**

```bash
pnpm crawler --help
node ./apps/cli/dist/cli.js --help
```

**List adapters and rules**

```bash
pnpm crawler adapters
pnpm crawler rules
```

**Scan a file** (sample data in the repo):

```bash
pnpm crawler scan -f ./tests/test-memories.json --format table
```

Other equivalent forms (all valid):

```bash
pnpm run crawler scan -f ./tests/test-memories.json --format table
pnpm run crawler -- scan -f ./tests/test-memories.json --format table
```

**Direct binary** (after `pnpm build`):

```bash
node ./apps/cli/dist/cli.js scan -f ./tests/test-memories.json --format table
```

> **pnpm note:** You may see `pnpm run crawler -- <args>` in some docs — the `--` is only needed when your shell would otherwise swallow flags. For subcommands like `scan`, you can usually run **`pnpm crawler scan ...`** with no extra `--`. If you do use `--`, the CLI strips stray `--` tokens so arguments still reach Commander correctly.

### Option B — Web page (landing + in-browser analyzer)

The repo root [`index.html`](index.html) is the marketing landing page. A Vite setup hydrates the **Try it** section with the same paste → analyze UI used in the desktop app.

**Development (hot reload):**

```bash
pnpm dev:landing
```

Open the URL Vite prints (typically `http://localhost:5173`). Scroll to **Try it**, paste JSON or supported text (e.g. copy from `tests/test-memories.json`), and click **Analyze**. Nothing is sent to a server; analysis runs locally in the browser.

**Production build (static files):**

```bash
pnpm build:landing
```

Output goes to `dist-landing/`. Serve that folder with any static file server, for example:

```bash
npx --yes serve dist-landing
```

### Option C — Desktop app (Vite UI)

The `apps/desktop` package hosts a full-page paste/analyze UI (useful for larger pastes or a dedicated window):

```bash
pnpm --filter @mem-crawler/desktop dev
```

Build:

```bash
pnpm exec turbo run build --filter=@mem-crawler/desktop
```

### Chrome extension (development)

After a full workspace build, load the extension from the built output (path may vary by build; check `apps/extension` and Turbo outputs). A Web Store package is not assumed in this README.

---

## Verify your setup (tests & QA)

After `pnpm install` and `pnpm build`, from the repo root:

| Command | Purpose |
| --- | --- |
| `pnpm test` | Runs Vitest across packages (e.g. `packages/core` unit tests). |
| `pnpm typecheck` | TypeScript `--noEmit` for workspace apps/packages. |
| `pnpm lint` | Biome lint on `packages/` and `apps/`. |
| `pnpm crawler scan -f ./tests/test-memories.json --format table` | End-to-end smoke test of the CLI on bundled sample JSON. |
| `pnpm dev:landing` | Manual test of the landing page + in-browser analyzer (browser). |
| `pnpm build:landing` | Ensures the static marketing bundle builds. |

---

## Publishing / global CLI install

If `@mem-crawler/cli` is published to npm, you can install globally:

```bash
npm install -g @mem-crawler/cli
crawler --help
```

When developing from this repo, prefer `pnpm install` + `pnpm build` + `pnpm crawler` so you always run the workspace version.

---

## Quick start (CLI examples)

**Import an official export**

1. Export your ChatGPT data (Settings → Data Controls → Export), or use a JSON/Markdown file your adapter supports.
2. Run a scan and optionally write HTML:

   ```bash
   pnpm crawler scan -f ./chatgpt-export.zip --format html -o report.html
   ```

**Scan a local file**

```bash
pnpm crawler scan -f ~/.agent-memory/memory.json --adapter generic-json
```

**Diff two snapshots**

```bash
pnpm crawler diff --from export-nov1.zip --to export-nov15.zip
```

---

## CLI reference

```text
crawler scan -f <file> [--adapter <id>] [--format table|json|html] [-o <output>]
crawler diff --from <file> --to <file> [--deleted-ids id1,id2,...]
crawler adapters
crawler rules [--severity critical|high|medium|low]
```

From the cloned repo, prefix with **`pnpm crawler`** (see [Option A — CLI](#option-a--cli)).

---

## Detection rules

Mem Crawler ships with detection rules targeting MINJA and related patterns. Every rule is intended to have cited references in the codebase. See `packages/rules` and `pnpm crawler rules` for the live list and severities.

---

## Repository layout

```text
memcrawler/
├── index.html              # Landing page (Vite entry for dev:landing)
├── vite.landing.config.ts  # Root Vite config for landing + web/main.tsx
├── web/
│   └── main.tsx            # Mounts paste analyzer into #analyzer-root
├── apps/
│   ├── extension/          # Chrome MV3 extension
│   ├── desktop/            # Vite + React desktop UI
│   └── cli/                # Node.js CLI (command: crawler)
└── packages/
    ├── types/
    ├── rules/
    ├── core/
    └── adapters/
```

**Tooling:** TypeScript · React 19 · pnpm · Turborepo · Vitest · Biome · Vite

For a deeper architecture and threat-model notes, see [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

---

## Contributing

1. Detection rules should include references (papers, advisories, documented patterns).
2. Adapters must implement honest `capabilityStatement()` behavior.
3. Run `pnpm lint`, `pnpm test`, and `pnpm typecheck` before opening a PR.

---

## Security

Do not use public issues for undisclosed vulnerabilities. Use [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories) for your fork or upstream when available.

---

## License

Apache 2.0 — see [`LICENSE`](LICENSE) in this repository and the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0) text.
