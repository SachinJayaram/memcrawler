// packages/types/src/index.ts
// Mem Crawler — Shared Types & Zod Schemas
// All data flowing through the system is validated here at runtime.

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence Surfaces
// ─────────────────────────────────────────────────────────────────────────────

export const PersistenceSurface = z.enum([
  "saved_memory",       // Explicit, user-visible saved facts
  "chat_history_ref",   // Implicit memory via chat history retrieval
  "exported_data",      // From platform export
  "imported_memory",    // Imported by user or agent
  "local_agent_file",   // JSON/MD/SQLite file on disk
  "tool_memory_store",  // Agent framework memory (LangChain, MemGPT, etc.)
  "unknown_residual",   // Detected but surface unclear
]);
export type PersistenceSurface = z.infer<typeof PersistenceSurface>;

export const SURFACE_LABELS: Record<PersistenceSurface, string> = {
  saved_memory: "Saved Memory",
  chat_history_ref: "Chat History Reference",
  exported_data: "Exported Data",
  imported_memory: "Imported Memory",
  local_agent_file: "Local Agent File",
  tool_memory_store: "Tool Memory Store",
  unknown_residual: "Unknown / Residual",
};

// ─────────────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────────────

export const ProvenanceConfidence = z.enum([
  "confirmed",         // From official export or direct UI
  "strong_inference",  // Multiple corroborating signals
  "weak_inference",    // Single signal, uncertain
  "unknown",
]);
export type ProvenanceConfidence = z.infer<typeof ProvenanceConfidence>;

export const ProvenanceMethod = z.enum([
  "export",
  "ui_scrape",
  "file_scan",
  "probe",
  "inferred",
]);
export type ProvenanceMethod = z.infer<typeof ProvenanceMethod>;

export const Provenance = z.object({
  source: z.string(),
  confidence: ProvenanceConfidence,
  originInteractionId: z.string().optional(),
  importedFrom: z.string().optional(),
  detectedAt: z.string().datetime(),
  method: ProvenanceMethod,
});
export type Provenance = z.infer<typeof Provenance>;

// ─────────────────────────────────────────────────────────────────────────────
// Suspicion
// ─────────────────────────────────────────────────────────────────────────────

export const SuspicionLevel = z.enum([
  "clean",
  "low",
  "medium",
  "high",
  "critical",
]);
export type SuspicionLevel = z.infer<typeof SuspicionLevel>;

export const SUSPICION_COLORS: Record<SuspicionLevel, string> = {
  clean: "#22c55e",
  low: "#84cc16",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export const SuspicionFlag = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  explanation: z.string(),
  severity: SuspicionLevel,
  matchedText: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
export type SuspicionFlag = z.infer<typeof SuspicionFlag>;

// ─────────────────────────────────────────────────────────────────────────────
// Memory Record — Core Entity
// ─────────────────────────────────────────────────────────────────────────────

export const MemoryRecordStatus = z.enum([
  "active",
  "quarantined",
  "trusted",
  "removed",
  "unknown",
]);
export type MemoryRecordStatus = z.infer<typeof MemoryRecordStatus>;

export const MemoryRecord = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  surface: PersistenceSurface,
  content: z.string(),
  contentHash: z.string(),       // SHA-256 for dedup + diff
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  provenance: Provenance,
  suspicionScore: z.number().min(0).max(100),
  suspicionLevel: SuspicionLevel,
  flags: z.array(SuspicionFlag),
  status: MemoryRecordStatus,
  deletionAttempted: z.boolean().default(false),
  deletionConfirmed: z.boolean().default(false),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
});
export type MemoryRecord = z.infer<typeof MemoryRecord>;

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots & Diffs
// ─────────────────────────────────────────────────────────────────────────────

export const Snapshot = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  takenAt: z.string().datetime(),
  recordCount: z.number(),
  recordIds: z.array(z.string().uuid()),
  source: z.string(),
  hash: z.string(),
  label: z.string().optional(),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const DiffEntryType = z.enum(["added", "removed", "modified", "unchanged"]);
export type DiffEntryType = z.infer<typeof DiffEntryType>;

export const DiffEntry = z.object({
  type: DiffEntryType,
  record: MemoryRecord,
  previousContent: z.string().optional(),
  changeExplanation: z.string().optional(),
});
export type DiffEntry = z.infer<typeof DiffEntry>;

export const SnapshotDiff = z.object({
  fromSnapshotId: z.string(),
  toSnapshotId: z.string(),
  diffedAt: z.string().datetime(),
  entries: z.array(DiffEntry),
  suspiciousChanges: z.array(DiffEntry),
  deletionGaps: z.array(z.string().uuid()),
});
export type SnapshotDiff = z.infer<typeof SnapshotDiff>;

// ─────────────────────────────────────────────────────────────────────────────
// Detection Rules
// ─────────────────────────────────────────────────────────────────────────────

export const RuleType = z.enum([
  "regex",
  "semantic",
  "temporal",
  "provenance",
  "structural",
]);
export type RuleType = z.infer<typeof RuleType>;

export const DetectionRule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: RuleType,
  severity: SuspicionLevel,
  enabled: z.boolean().default(true),
  pattern: z.string().optional(),
  flags: z.array(z.string()).optional(), // regex flags
  config: z.record(z.unknown()).optional(),
  explanation: z.string(),
  references: z.array(z.string()),
});
export type DetectionRule = z.infer<typeof DetectionRule>;

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedSurfaces: PersistenceSurface[];
  canIngest(input: unknown): boolean;
  ingest(input: unknown): Promise<MemoryRecord[]>;
  capabilityStatement(): CapabilityStatement;
}

export interface CapabilityStatement {
  canSee: string[];
  cannotSee: string[];
  confidenceLevel: ProvenanceConfidence;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exposure Report
// ─────────────────────────────────────────────────────────────────────────────

export const ExposureReport = z.object({
  id: z.string().uuid(),
  generatedAt: z.string().datetime(),
  platform: z.string(),
  totalRecords: z.number(),
  byLevel: z.object({
    clean: z.number(),
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical: z.number(),
  }),
  bySurface: z.record(z.string(), z.number()),
  criticalFindings: z.array(MemoryRecord),
  deletionGaps: z.array(MemoryRecord),
  recommendations: z.array(z.string()),
  honestLimitations: z.array(z.string()),
  snapshotId: z.string().optional(),
});
export type ExposureReport = z.infer<typeof ExposureReport>;

// ─────────────────────────────────────────────────────────────────────────────
// Probe Results (Deletion Gap Testing)
// ─────────────────────────────────────────────────────────────────────────────

export const ProbeResult = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  prompt: z.string(),
  response: z.string(),
  recordedAt: z.string().datetime(),
  phase: z.enum(["before_deletion", "after_deletion", "no_memory_mode"]),
  memorySnapshotId: z.string().optional(),
});
export type ProbeResult = z.infer<typeof ProbeResult>;

// ─────────────────────────────────────────────────────────────────────────────
// Developer Mode — Policy Lint
// ─────────────────────────────────────────────────────────────────────────────

export const LintSeverity = z.enum(["error", "warning", "info"]);
export type LintSeverity = z.infer<typeof LintSeverity>;

export const LintFinding = z.object({
  ruleId: z.string(),
  severity: LintSeverity,
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  recommendation: z.string(),
});
export type LintFinding = z.infer<typeof LintFinding>;

export const LintReport = z.object({
  id: z.string().uuid(),
  scannedAt: z.string().datetime(),
  targetPath: z.string(),
  findings: z.array(LintFinding),
  errorCount: z.number(),
  warningCount: z.number(),
});
export type LintReport = z.infer<typeof LintReport>;

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

export type Platform = "chatgpt" | "claude" | "gemini" | "custom";

export const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  custom: "Custom",
};

export function suspicionLevelFromScore(score: number): SuspicionLevel {
  if (score === 0) return "clean";
  if (score < 20) return "low";
  if (score < 45) return "medium";
  if (score < 70) return "high";
  return "critical";
}