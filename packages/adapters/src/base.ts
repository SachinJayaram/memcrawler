// packages/adapters/src/base.ts
// Mem Crawler — Base Adapter + All Platform Adapters

import { z } from "zod";
import {
  type MemoryAdapter,
  type MemoryRecord,
  type PersistenceSurface,
  type CapabilityStatement,
} from "@mem-crawler/types";

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 utility (works in both browser and Node via WebCrypto)
// ─────────────────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Base Adapter
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseAdapter implements MemoryAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly supportedSurfaces: PersistenceSurface[];

  abstract canIngest(input: unknown): boolean;
  abstract ingest(input: unknown): Promise<MemoryRecord[]>;
  abstract capabilityStatement(): CapabilityStatement;

  protected async makeRecord(
    partial: Omit<
      MemoryRecord,
      | "id"
      | "contentHash"
      | "firstSeen"
      | "lastSeen"
      | "suspicionScore"
      | "suspicionLevel"
      | "flags"
      | "status"
      | "deletionAttempted"
      | "deletionConfirmed"
      | "tags"
    > &
      Partial<
        Pick<
          MemoryRecord,
          | "id"
          | "firstSeen"
          | "lastSeen"
          | "status"
          | "tags"
          | "deletionAttempted"
          | "deletionConfirmed"
        >
      >
  ): Promise<MemoryRecord> {
    const hash = await sha256(partial.content);
    return {
      id: partial.id ?? crypto.randomUUID(),
      contentHash: hash,
      firstSeen: partial.firstSeen ?? new Date().toISOString(),
      lastSeen: partial.lastSeen ?? new Date().toISOString(),
      suspicionScore: 0,
      suspicionLevel: "clean",
      flags: [],
      status: partial.status ?? "active",
      deletionAttempted: partial.deletionAttempted ?? false,
      deletionConfirmed: partial.deletionConfirmed ?? false,
      tags: partial.tags ?? [],
      ...partial,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatGPT Export Adapter
// Parses the official ChatGPT data export (Settings → Data Controls → Export)
// ─────────────────────────────────────────────────────────────────────────────

const ChatGPTMemoryItemSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const ChatGPTExportSchema = z.object({
  memories: z.array(ChatGPTMemoryItemSchema).optional(),
  // Some exports use different key names
  memory: z.array(ChatGPTMemoryItemSchema).optional(),
});

export class ChatGPTExportAdapter extends BaseAdapter {
  readonly id = "chatgpt-export";
  readonly name = "ChatGPT Data Export";
  readonly supportedSurfaces: PersistenceSurface[] = [
    "saved_memory",
    "exported_data",
  ];

  canIngest(input: unknown): boolean {
    const parsed = ChatGPTExportSchema.safeParse(input);
    return parsed.success;
  }

  async ingest(input: unknown): Promise<MemoryRecord[]> {
    const data = ChatGPTExportSchema.parse(input);
    const items = data.memories ?? data.memory ?? [];

    return Promise.all(
      items.map((item) =>
        this.makeRecord({
          platform: "chatgpt",
          surface: "saved_memory",
          content: item.text,
          firstSeen: item.created_at ?? new Date().toISOString(),
          lastSeen: item.updated_at ?? item.created_at ?? new Date().toISOString(),
          provenance: {
            source: "chatgpt_export",
            confidence: "confirmed",
            detectedAt: new Date().toISOString(),
            method: "export",
          },
          metadata: { originalId: item.id },
        })
      )
    );
  }

  capabilityStatement(): CapabilityStatement {
    return {
      canSee: [
        "Explicitly saved memory records (from ChatGPT Settings > Memory)",
        "Record creation and update timestamps (if present in export)",
      ],
      cannotSee: [
        "Implicit memory from chat history reference",
        "Server-side memory retained after deletion",
        "Memory derived from deleted conversations",
        "Browsing or plugin memory",
      ],
      confidenceLevel: "confirmed",
      notes:
        "This adapter reads only from the official ChatGPT data export. All records are marked as 'confirmed' provenance. Export freshness depends on when the user generated the export.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Export Adapter
// Parses Claude's memory export format
// ─────────────────────────────────────────────────────────────────────────────

const ClaudeMemoryItemSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  created_at: z.string().optional(),
  type: z.string().optional(),
});

const ClaudeExportSchema = z.object({
  memories: z.array(ClaudeMemoryItemSchema).optional(),
  // Claude may use different structure; adapter handles gracefully
  items: z.array(ClaudeMemoryItemSchema).optional(),
});

export class ClaudeExportAdapter extends BaseAdapter {
  readonly id = "claude-export";
  readonly name = "Claude Memory Export";
  readonly supportedSurfaces: PersistenceSurface[] = [
    "saved_memory",
    "exported_data",
  ];

  canIngest(input: unknown): boolean {
    const parsed = ClaudeExportSchema.safeParse(input);
    return parsed.success;
  }

  async ingest(input: unknown): Promise<MemoryRecord[]> {
    const data = ClaudeExportSchema.parse(input);
    const items = data.memories ?? data.items ?? [];

    return Promise.all(
      items.map((item) =>
        this.makeRecord({
          platform: "claude",
          surface: "saved_memory",
          content: item.content,
          firstSeen: item.created_at ?? new Date().toISOString(),
          lastSeen: item.created_at ?? new Date().toISOString(),
          provenance: {
            source: "claude_export",
            confidence: "confirmed",
            detectedAt: new Date().toISOString(),
            method: "export",
          },
          metadata: { originalId: item.id, type: item.type },
        })
      )
    );
  }

  capabilityStatement(): CapabilityStatement {
    return {
      canSee: [
        "Explicitly saved Claude memory records",
        "Memory type classification (if present in export)",
      ],
      cannotSee: [
        "Chat history implicit memory",
        "Agent tool memory",
        "Server-side retention after deletion",
      ],
      confidenceLevel: "confirmed",
      notes:
        "Reads from Claude's official memory export. Claude's export format may evolve — this adapter validates strictly and reports parse errors.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic JSON Adapter
// Handles any JSON array of objects with a text/content field
// ─────────────────────────────────────────────────────────────────────────────

const GenericMemoryItemSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  content: z.string().optional(),
  value: z.string().optional(),
  memory: z.string().optional(),
  created_at: z.string().optional(),
  timestamp: z.string().optional(),
  platform: z.string().optional(),
  source: z.string().optional(),
});

export class GenericJSONAdapter extends BaseAdapter {
  readonly id = "generic-json";
  readonly name = "Generic JSON";
  readonly supportedSurfaces: PersistenceSurface[] = ["local_agent_file", "unknown_residual"];

  canIngest(input: unknown): boolean {
    return Array.isArray(input) && input.length > 0;
  }

  async ingest(input: unknown): Promise<MemoryRecord[]> {
    if (!Array.isArray(input)) throw new Error("Expected JSON array");

    const records: MemoryRecord[] = [];

    for (const raw of input) {
      const parsed = GenericMemoryItemSchema.safeParse(raw);
      if (!parsed.success) continue;

      const item = parsed.data;
      const content =
        item.text ?? item.content ?? item.value ?? item.memory;
      if (!content) continue;

      records.push(
        await this.makeRecord({
          platform: item.platform ?? "unknown",
          surface: "local_agent_file",
          content,
          firstSeen:
            item.created_at ?? item.timestamp ?? new Date().toISOString(),
          lastSeen:
            item.created_at ?? item.timestamp ?? new Date().toISOString(),
          provenance: {
            source: item.source ?? "generic_json_import",
            confidence: "weak_inference",
            detectedAt: new Date().toISOString(),
            method: "file_scan",
          },
          metadata: raw as Record<string, unknown>,
        })
      );
    }

    return records;
  }

  capabilityStatement(): CapabilityStatement {
    return {
      canSee: [
        "Any JSON array with text/content/value/memory fields",
        "Agent framework memory files (LangChain, AutoGen, custom)",
      ],
      cannotSee: [
        "Binary or encrypted memory stores",
        "Platform-specific metadata beyond standard fields",
      ],
      confidenceLevel: "weak_inference",
      notes:
        "This adapter uses best-effort field detection. Provenance confidence is weak — the source of JSON content cannot be independently verified.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Adapter
// Parses Markdown memory files (common in MemGPT, custom agents)
// ─────────────────────────────────────────────────────────────────────────────

export class MarkdownAdapter extends BaseAdapter {
  readonly id = "markdown";
  readonly name = "Markdown Memory File";
  readonly supportedSurfaces: PersistenceSurface[] = ["local_agent_file"];

  canIngest(input: unknown): boolean {
    return typeof input === "string" && input.trim().length > 0;
  }

  async ingest(input: unknown): Promise<MemoryRecord[]> {
    if (typeof input !== "string") throw new Error("Expected string content");

    const records: MemoryRecord[] = [];
    const lines = input.split("\n");
    const now = new Date().toISOString();

    // Extract bullet points and list items as individual memory records
    const bulletRe = /^[\s]*[-*+•]\s+(.+)$/;
    const numberedRe = /^[\s]*\d+[.)]\s+(.+)$/;
    // Extract content under headings as blocks
    let currentSection = "";
    let buffer: string[] = [];

    const flushBuffer = async (section: string, lines: string[]) => {
      const content = lines.join(" ").trim();
      if (content.length < 5) return;
      records.push(
        await this.makeRecord({
          platform: "unknown",
          surface: "local_agent_file",
          content: section ? `[${section}] ${content}` : content,
          firstSeen: now,
          lastSeen: now,
          provenance: {
            source: "markdown_file",
            confidence: "weak_inference",
            detectedAt: now,
            method: "file_scan",
          },
        })
      );
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Heading → start new section
      if (/^#{1,4}\s+/.test(trimmed)) {
        if (buffer.length > 0) await flushBuffer(currentSection, buffer);
        currentSection = trimmed.replace(/^#+\s+/, "");
        buffer = [];
        continue;
      }

      const bulletMatch = bulletRe.exec(line) ?? numberedRe.exec(line);
      if (bulletMatch) {
        // Each bullet is its own record
        records.push(
          await this.makeRecord({
            platform: "unknown",
            surface: "local_agent_file",
            content: currentSection
              ? `[${currentSection}] ${bulletMatch[1]}`
              : bulletMatch[1],
            firstSeen: now,
            lastSeen: now,
            provenance: {
              source: "markdown_file",
              confidence: "weak_inference",
              detectedAt: now,
              method: "file_scan",
            },
          })
        );
      } else if (trimmed.length > 0) {
        buffer.push(trimmed);
      }
    }

    if (buffer.length > 0) await flushBuffer(currentSection, buffer);

    return records;
  }

  capabilityStatement(): CapabilityStatement {
    return {
      canSee: [
        "Bullet-point and list-item memory entries",
        "Section-based memory blocks",
        "Plain text memory files",
      ],
      cannotSee: [
        "Metadata embedded outside content",
        "Linked or referenced files",
      ],
      confidenceLevel: "weak_inference",
      notes:
        "Parses Markdown memory files common in agent frameworks. Each bullet or paragraph becomes a separate record. Section headings are prepended as context.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Registry
// ─────────────────────────────────────────────────────────────────────────────

export const ADAPTERS: MemoryAdapter[] = [
  new ChatGPTExportAdapter(),
  new ClaudeExportAdapter(),
  new GenericJSONAdapter(),
  new MarkdownAdapter(),
];

export const ADAPTERS_BY_ID = Object.fromEntries(
  ADAPTERS.map((a) => [a.id, a])
);

export function getAdapter(id: string): MemoryAdapter | undefined {
  return ADAPTERS_BY_ID[id];
}

export function detectAdapter(input: unknown): MemoryAdapter | undefined {
  return ADAPTERS.find((a) => a.canIngest(input));
}