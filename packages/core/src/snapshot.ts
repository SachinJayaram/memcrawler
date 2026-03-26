// packages/core/src/snapshot.ts
// Mem Crawler — Snapshot System & Diff Engine

import {
    type MemoryRecord,
    type Snapshot,
    type SnapshotDiff,
    type DiffEntry,
  } from "@mem-crawler/types";
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Create Snapshot
  // ─────────────────────────────────────────────────────────────────────────────
  
  async function hashRecordSet(records: MemoryRecord[]): Promise<string> {
    const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
    const payload = sorted.map((r) => r.contentHash).join("|");
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  
  export async function createSnapshot(
    platform: string,
    records: MemoryRecord[],
    source: string,
    label?: string
  ): Promise<Snapshot> {
    const hash = await hashRecordSet(records);
    return {
      id: crypto.randomUUID(),
      platform,
      takenAt: new Date().toISOString(),
      recordCount: records.length,
      recordIds: records.map((r) => r.id),
      source,
      hash,
      label,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Diff Two Snapshots
  // ─────────────────────────────────────────────────────────────────────────────
  
  export function diffSnapshots(
    fromRecords: MemoryRecord[],
    toRecords: MemoryRecord[],
    fromSnapshotId: string,
    toSnapshotId: string,
    deletedRecordIds: string[] = []  // Records the user has reported deleting
  ): SnapshotDiff {
    const fromMap = new Map(fromRecords.map((r) => [r.contentHash, r]));
    const toMap = new Map(toRecords.map((r) => [r.contentHash, r]));
  
    const entries: DiffEntry[] = [];
  
    // Added: in 'to' but not 'from'
    for (const [hash, record] of toMap) {
      if (!fromMap.has(hash)) {
        entries.push({ type: "added", record });
      }
    }
  
    // Removed: in 'from' but not 'to'
    for (const [hash, record] of fromMap) {
      if (!toMap.has(hash)) {
        entries.push({ type: "removed", record });
      }
    }
  
    // Unchanged (matching by id, check content change)
    const fromById = new Map(fromRecords.map((r) => [r.id, r]));
    const toById = new Map(toRecords.map((r) => [r.id, r]));
  
    for (const [id, toRecord] of toById) {
      const fromRecord = fromById.get(id);
      if (fromRecord) {
        if (fromRecord.contentHash !== toRecord.contentHash) {
          entries.push({
            type: "modified",
            record: toRecord,
            previousContent: fromRecord.content,
            changeExplanation: `Content changed between snapshots.`,
          });
        } else {
          entries.push({ type: "unchanged", record: toRecord });
        }
      }
    }
  
    // Suspicious changes: added or modified records with suspicion
    const suspiciousChanges = entries.filter(
      (e) =>
        (e.type === "added" || e.type === "modified") &&
        (e.record.suspicionLevel === "high" || e.record.suspicionLevel === "critical")
    );
  
    // Deletion gaps: records user reported deleting but still present in 'to'
    const toIds = new Set(toRecords.map((r) => r.id));
    const deletionGaps = deletedRecordIds.filter((id) => toIds.has(id));
  
    return {
      fromSnapshotId,
      toSnapshotId,
      diffedAt: new Date().toISOString(),
      entries,
      suspiciousChanges,
      deletionGaps,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Deletion Gap Detection
  // Checks if records persist after the user has attempted deletion
  // ─────────────────────────────────────────────────────────────────────────────
  
  export interface DeletionGapResult {
    recordId: string;
    content: string;
    platform: string;
    surface: string;
    explanation: string;
  }
  
  export function detectDeletionGaps(
    currentRecords: MemoryRecord[],
    deletedIds: string[]
  ): DeletionGapResult[] {
    const currentIds = new Set(currentRecords.map((r) => r.id));
    const currentHashes = new Set(currentRecords.map((r) => r.contentHash));
  
    return deletedIds
      .filter((id) => currentIds.has(id))
      .map((id) => {
        const record = currentRecords.find((r) => r.id === id)!;
        return {
          recordId: id,
          content: record.content,
          platform: record.platform,
          surface: record.surface,
          explanation: `This record was reported as deleted but is still present in the latest scan. The platform may not have fully removed it, or it may have been re-created.`,
        };
      });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Report Generator
  // ─────────────────────────────────────────────────────────────────────────────
  
  import type { ExposureReport } from "@mem-crawler/types";
  
  export function generateReport(
    platform: string,
    records: MemoryRecord[],
    deletionGapIds: string[] = [],
    snapshotId?: string
  ): ExposureReport {
    const byLevel = { clean: 0, low: 0, medium: 0, high: 0, critical: 0 };
    const bySurface: Record<string, number> = {};
  
    for (const r of records) {
      byLevel[r.suspicionLevel]++;
      bySurface[r.surface] = (bySurface[r.surface] ?? 0) + 1;
    }
  
    const criticalFindings = records.filter(
      (r) => r.suspicionLevel === "critical" || r.suspicionLevel === "high"
    );
  
    const deletionGaps = records.filter((r) => deletionGapIds.includes(r.id));
  
    const recommendations: string[] = [];
  
    if (byLevel.critical > 0)
      recommendations.push(
        `Review and quarantine ${byLevel.critical} critical-severity record(s) immediately.`
      );
    if (byLevel.high > 0)
      recommendations.push(
        `Investigate ${byLevel.high} high-severity record(s) — they may indicate injection attempts.`
      );
    if (deletionGaps.length > 0)
      recommendations.push(
        `${deletionGaps.length} record(s) persist after attempted deletion. Consider revoking memory access and re-exporting.`
      );
    if (
      records.some(
        (r) => r.surface === "imported_memory" && r.suspicionLevel !== "clean"
      )
    )
      recommendations.push(
        "Suspicious imported memory detected. Review all import sources."
      );
    if (records.length === 0)
      recommendations.push(
        "No records found. Verify the export was complete and try re-exporting."
      );
  
    const honestLimitations: string[] = [
      "This scan covers only the data surfaces accessible via official exports and local files.",
      "Server-side retention after deletion cannot be verified by Mem Crawler.",
      "Chat history implicit memory is not analyzed unless explicitly exported.",
      "Provenance confidence reflects the data source, not absolute certainty.",
    ];
  
    return {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      platform,
      totalRecords: records.length,
      byLevel,
      bySurface,
      criticalFindings,
      deletionGaps,
      recommendations,
      honestLimitations,
      snapshotId,
    };
  }