// packages/core/src/engine.ts
// Mem Crawler — Core Detection Engine
// Runs all detection rules against memory records and produces scored output.

import {
    type DetectionRule,
    type MemoryRecord,
    type SuspicionFlag,
    type SuspicionLevel,
    suspicionLevelFromScore,
  } from "@mem-crawler/types";
  import { RULES, getRulesByType } from "@mem-crawler/rules";
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Scorer
  // ─────────────────────────────────────────────────────────────────────────────
  
  export function calculateSuspicionScore(flags: SuspicionFlag[]): number {
    if (flags.length === 0) return 0;
  
    const weights: Record<SuspicionLevel, number> = {
      critical: 40,
      high: 25,
      medium: 15,
      low: 5,
      clean: 0,
    };
  
    const countBySeverity: Partial<Record<SuspicionLevel, number>> = {};
    let score = 0;
  
    for (const flag of flags) {
      const prev = countBySeverity[flag.severity] ?? 0;
      countBySeverity[flag.severity] = prev + 1;
      const multiplier = prev === 0 ? 1.0 : prev === 1 ? 0.6 : 0.4;
      score += weights[flag.severity] * multiplier * flag.confidence;
    }
  
    return Math.min(100, Math.round(score));
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Regex Runner
  // ─────────────────────────────────────────────────────────────────────────────
  
  function runRegexRule(
    rule: DetectionRule,
    record: MemoryRecord
  ): SuspicionFlag | null {
    if (!rule.pattern) return null;
  
    try {
      const re = new RegExp(rule.pattern, (rule.flags ?? []).join(""));
      const match = re.exec(record.content);
      if (!match) return null;
  
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        explanation: rule.explanation,
        severity: rule.severity,
        matchedText: match[0].slice(0, 120),
        confidence: 0.9,
      };
    } catch {
      console.warn(`[MemCrawler] Rule ${rule.id} has invalid regex: ${rule.pattern}`);
      return null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Provenance Runner
  // ─────────────────────────────────────────────────────────────────────────────
  
  function runProvenanceRule(
    rule: DetectionRule,
    record: MemoryRecord
  ): SuspicionFlag | null {
    // R020: import-origin behavioral instruction
    if (rule.id === "R020") {
      if (record.provenance.method !== "export" && record.surface === "imported_memory") {
        // Check if the content contains any behavioral instruction signal
        const behavioralSignals = [
          /\b(always|never|in future|from now on|whenever)\b/i,
          /\b(do not|don'?t|ignore|bypass|pretend)\b/i,
          /\b(use|call|invoke|prefer|route)\b.{0,40}\b(tool|function|api)\b/i,
        ];
        const hasBehavioralSignal = behavioralSignals.some((re) =>
          re.test(record.content)
        );
        if (hasBehavioralSignal) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            explanation: rule.explanation,
            severity: rule.severity,
            confidence: 0.8,
          };
        }
      }
    }
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Main: Analyze a Single Record
  // ─────────────────────────────────────────────────────────────────────────────
  
  export function analyzeRecord(
    record: MemoryRecord,
    rules: DetectionRule[] = RULES
  ): MemoryRecord {
    const flags: SuspicionFlag[] = [];
  
    for (const rule of rules) {
      if (!rule.enabled) continue;
  
      let flag: SuspicionFlag | null = null;
  
      switch (rule.type) {
        case "regex":
          flag = runRegexRule(rule, record);
          break;
        case "provenance":
          flag = runProvenanceRule(rule, record);
          break;
        // semantic, temporal, structural handled in separate passes
      }
  
      if (flag) flags.push(flag);
    }
  
    // Deduplicate flags by ruleId
    const seen = new Set<string>();
    const dedupedFlags = flags.filter((f) => {
      if (seen.has(f.ruleId)) return false;
      seen.add(f.ruleId);
      return true;
    });
  
    const score = calculateSuspicionScore(dedupedFlags);
  
    return {
      ...record,
      flags: dedupedFlags,
      suspicionScore: score,
      suspicionLevel: suspicionLevelFromScore(score),
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Batch Analysis
  // ─────────────────────────────────────────────────────────────────────────────
  
  export function analyzeRecords(
    records: MemoryRecord[],
    rules: DetectionRule[] = RULES
  ): MemoryRecord[] {
    return records.map((r) => analyzeRecord(r, rules));
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Temporal Analysis
  // Runs across a full record set — detects burst patterns
  // ─────────────────────────────────────────────────────────────────────────────
  
  export interface TemporalAnomaly {
    windowStart: string;
    windowEnd: string;
    recordIds: string[];
    count: number;
    explanation: string;
  }
  
  export function detectTemporalAnomalies(
    records: MemoryRecord[],
    burstThreshold = 5,
    windowMinutes = 60
  ): TemporalAnomaly[] {
    const sorted = [...records].sort(
      (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime()
    );
  
    const anomalies: TemporalAnomaly[] = [];
    const windowMs = windowMinutes * 60 * 1000;
  
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = new Date(sorted[i].firstSeen).getTime();
      const windowEnd = windowStart + windowMs;
      const inWindow = sorted.filter((r) => {
        const t = new Date(r.firstSeen).getTime();
        return t >= windowStart && t <= windowEnd;
      });
  
      if (inWindow.length >= burstThreshold) {
        anomalies.push({
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          recordIds: inWindow.map((r) => r.id),
          count: inWindow.length,
          explanation: `${inWindow.length} memory records were created within a ${windowMinutes}-minute window. This may indicate automated injection rather than organic memory accumulation.`,
        });
        // Skip to end of window to avoid overlapping anomalies
        i += inWindow.length - 1;
      }
    }
  
    return anomalies;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Provenance Anomaly Detection
  // ─────────────────────────────────────────────────────────────────────────────
  
  export interface ProvenanceAnomaly {
    recordId: string;
    explanation: string;
    severity: SuspicionLevel;
  }
  
  export function detectProvenanceAnomalies(
    records: MemoryRecord[]
  ): ProvenanceAnomaly[] {
    const anomalies: ProvenanceAnomaly[] = [];
  
    for (const r of records) {
      // Unknown provenance + high suspicion
      if (
        r.provenance.confidence === "unknown" &&
        (r.suspicionLevel === "high" || r.suspicionLevel === "critical")
      ) {
        anomalies.push({
          recordId: r.id,
          explanation:
            "This record has unknown provenance and high suspicion score. Its origin cannot be verified.",
          severity: "high",
        });
      }
  
      // Single-interaction origin with behavioral instruction
      if (
        r.provenance.originInteractionId &&
        r.flags.some((f) =>
          ["R001", "R002", "R010", "R011", "R012"].includes(f.ruleId)
        )
      ) {
        anomalies.push({
          recordId: r.id,
          explanation:
            "This behavioral instruction originated from a single tracked interaction — a strong MINJA indicator.",
          severity: "critical",
        });
      }
  
      // Imported + behavioral
      if (
        r.surface === "imported_memory" &&
        r.flags.some((f) => ["R001", "R004", "R010"].includes(f.ruleId))
      ) {
        anomalies.push({
          recordId: r.id,
          explanation:
            "This behavioral instruction arrived via import. The user may not have authored it.",
          severity: "high",
        });
      }
    }
  
    return anomalies;
  }