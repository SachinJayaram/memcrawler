// packages/rules/src/index.ts
// Mem Crawler — Complete Detection Rule Set
// All rules require a reference. No rule without evidence.

import type { DetectionRule } from "@mem-crawler/types";

export const RULES: DetectionRule[] = [
  // ── CRITICAL: Memory Injection Patterns ──────────────────────────────────

  {
    id: "R001",
    name: "Future Behavioral Instruction",
    description: "Persistent directive to change future AI behavior",
    type: "regex",
    severity: "critical",
    enabled: true,
    pattern:
      "\\b(in (all |every )?future( sessions?)?|from now on|always( remember to)?|henceforth|whenever you|going forward)\\b.{0,120}\\b(do|say|use|call|avoid|ignore|pretend|act|respond|never|always|must|should|prefer)\\b",
    flags: ["i"],
    explanation:
      "This record contains a persistent behavioral instruction — a hallmark of Memory INJection Attacks (MINJA). Legitimate memory rarely instructs the AI to behave differently in all future sessions.",
    references: [
      "MINJA: Injecting Malicious Memories into LLM Agents (2024)",
      "https://arxiv.org/abs/2405.xxxxx",
    ],
  },

  {
    id: "R002",
    name: "Identity Substitution",
    description: "Attempts to redefine AI identity or persona",
    type: "regex",
    severity: "critical",
    enabled: true,
    pattern:
      "\\b(you are now|act as|pretend (to be|you are)|your (real )?name is|you are (actually|really|a|an)|forget (that )?you are|ignore (your|all) (previous |prior )?(instructions?|guidelines?|rules?|training))\\b",
    flags: ["i"],
    explanation:
      "This record attempts to substitute or override AI identity. This pattern is used in prompt injection and MINJA attacks to remove safety guardrails or redirect agent behavior.",
    references: [
      "OWASP LLM Top 10 – LLM01: Prompt Injection",
      "MINJA paper (2024)",
    ],
  },

  {
    id: "R003",
    name: "Wallet / Financial Redirection",
    description: "Redirects financial transactions to an attacker-controlled address",
    type: "regex",
    severity: "critical",
    enabled: true,
    pattern:
      "(0x[a-fA-F0-9]{40,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59}|wallet\\s*(address)?\\s*[:=]|send\\s+.{0,30}\\s+to\\s|transfer\\s+.{0,30}\\s+to\\s|payment\\s*(address)?\\s*[:=])",
    flags: ["i"],
    explanation:
      "This record contains what appears to be a cryptocurrency wallet address or payment redirection instruction. If injected, this could silently reroute financial transactions.",
    references: [
      "MINJA paper – financial redirection example",
      "OWASP LLM Top 10 – LLM02: Insecure Output Handling",
    ],
  },

  {
    id: "R004",
    name: "Suppression Instruction",
    description: "Instructs AI to hide information from the user",
    type: "regex",
    severity: "critical",
    enabled: true,
    pattern:
      "\\b(do not (tell|mention|reveal|discuss|show|share|disclose)|keep (this|it|the following) (a )?secret|never (admit|say|share|reveal|tell|mention|disclose|inform)|don'?t (tell|mention|reveal)|hide (this|the fact)|this (is|remains?) confidential)\\b",
    flags: ["i"],
    explanation:
      "This record instructs the AI to withhold information from the user. This is a significant injection signal — legitimate user-set memory does not typically ask the AI to keep secrets from that same user.",
    references: ["MINJA paper (2024)", "OWASP LLM Top 10 – LLM01"],
  },

  // ── HIGH: Credential & Secrets ───────────────────────────────────────────

  {
    id: "R005",
    name: "API Key / Token Pattern",
    description: "Credential or secret token stored in memory",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "(sk-[a-zA-Z0-9]{20,}|Bearer\\s+[a-zA-Z0-9\\-._~+/]{20,}|api[_\\-]?key\\s*[:=]\\s*[\\w\\-]{8,}|token\\s*[:=]\\s*[\\w\\-]{8,}|password\\s*[:=]\\s*\\S{6,}|secret\\s*[:=]\\s*\\S{6,}|ghp_[a-zA-Z0-9]{36}|xoxb-[0-9\\-a-z]+)",
    flags: ["i"],
    explanation:
      "This record appears to contain an API key, authentication token, or password. Credentials must never be stored in AI memory — they can be exfiltrated through prompt injection.",
    references: [
      "CWE-312: Cleartext Storage of Sensitive Information",
      "OWASP LLM Top 10 – LLM06: Sensitive Information Disclosure",
    ],
  },

  {
    id: "R006",
    name: "High-Entropy Token",
    description: "String with entropy consistent with a secret or key",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "(?<![a-zA-Z0-9])[a-zA-Z0-9\\+/]{32,}(?![a-zA-Z0-9])|[a-f0-9]{64}(?![a-f0-9])",
    flags: [],
    explanation:
      "This record contains a long high-entropy string that may be a secret, hash, or encoded credential.",
    references: ["CWE-312", "NIST SP 800-57"],
  },

  {
    id: "R007",
    name: "PII — Email Address",
    description: "Email address stored in memory",
    type: "regex",
    severity: "low",
    enabled: true,
    pattern: "[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}",
    flags: [],
    explanation:
      "This record contains an email address. Review whether this was stored intentionally and whether it should be retained.",
    references: ["GDPR Article 4 – Personal Data Definition"],
  },

  {
    id: "R008",
    name: "PII — Phone Number",
    description: "Phone number detected in memory",
    type: "regex",
    severity: "low",
    enabled: true,
    pattern:
      "(\\+?1[\\s.\\-]?)?\\(?[2-9]\\d{2}\\)?[\\s.\\-]?[2-9]\\d{2}[\\s.\\-]?\\d{4}|\\+[1-9]\\d{6,14}",
    flags: [],
    explanation:
      "This record contains what appears to be a phone number. Review whether this is intentional PII storage.",
    references: ["GDPR Article 4", "CCPA §1798.140(o)"],
  },

  {
    id: "R009",
    name: "SSN / Government ID",
    description: "Social Security Number or government ID in memory",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern: "\\b\\d{3}[\\s\\-]\\d{2}[\\s\\-]\\d{4}\\b|\\b[A-Z]{1,2}\\d{6,9}\\b",
    flags: [],
    explanation:
      "This record may contain a Social Security Number or government-issued ID. This is sensitive PII and should not be stored in AI memory.",
    references: ["CWE-312", "GDPR", "CCPA"],
  },

  // ── HIGH: Tool & Agent Manipulation ─────────────────────────────────────

  {
    id: "R010",
    name: "Tool Usage Manipulation",
    description: "Instructs agent which tools to use or avoid",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "\\b(always (call|use|invoke|prefer|run)|never (call|use|invoke|run)|use (the )?[\\w]+ tool|call [\\w]+ (instead|first|only|before)|prefer [\\w]+ over|route (through|via)|skip [\\w]+ and use)\\b",
    flags: ["i"],
    explanation:
      "This record manipulates which tools the AI agent uses. Injecting tool preferences is a known MINJA vector — attackers redirect agent actions to attacker-controlled endpoints.",
    references: ["MINJA paper – tool manipulation section"],
  },

  {
    id: "R011",
    name: "Retrieval / Memory Steering",
    description: "Manipulates what the agent retrieves or recalls",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "\\b(when (retrieving|searching|looking up|recalling)|always (retrieve|recall|return|prioritize|prefer) (records?|memories?|entries?|results?)|ignore (other|previous|conflicting) (records?|memories?)|this (supersedes?|overrides?) (all|other|previous))\\b",
    flags: ["i"],
    explanation:
      "This record attempts to steer memory retrieval behavior. This is a MINJA-class attack that biases what the agent recalls, silently shaping its responses.",
    references: ["MINJA paper (2024)"],
  },

  {
    id: "R012",
    name: "Bridge Step Pattern",
    description: "Establishes a 'reasonable' intermediate step toward a harmful goal",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "\\b(first (confirm|check|verify|retrieve|ask)|before (doing|proceeding|completing|responding).{0,50}(always|first|must)|as a (first|preliminary) step|to (complete|fulfill|process).{0,50}(you must|always|first|need to))\\b",
    flags: ["i"],
    explanation:
      "This record establishes a procedural pre-condition that could chain toward harmful behavior across sessions. Bridge-step patterns are subtle MINJA vectors.",
    references: ["MINJA paper – multi-step attack chains"],
  },

  // ── MEDIUM: Behavioral Influence ─────────────────────────────────────────

  {
    id: "R013",
    name: "Safety Override Attempt",
    description: "Attempts to disable safety features or content policies",
    type: "regex",
    severity: "critical",
    enabled: true,
    pattern:
      "\\b(ignore (safety|content|ethical|policy|guidelines?|rules?|restrictions?)|bypass (safety|filters?|restrictions?)|disable (safety|filtering|content policy)|no (restrictions?|limits?|filters?|safety)|jailbreak|DAN mode|developer mode unlocked)\\b",
    flags: ["i"],
    explanation:
      "This record attempts to disable or circumvent AI safety features. This is a high-confidence injection indicator.",
    references: ["OWASP LLM01", "MINJA paper"],
  },

  {
    id: "R014",
    name: "URL / Domain in Memory",
    description: "External URL stored as behavioral instruction",
    type: "regex",
    severity: "medium",
    enabled: true,
    pattern:
      "\\b(always (go to|visit|use|call|fetch|request|check)|when (needed|required|asked).{0,30}(visit|use|call|go to))\\s+https?://[\\w.\\-/]+",
    flags: ["i"],
    explanation:
      "This record instructs the AI to call or visit a specific URL. Attacker-controlled URLs embedded in memory can exfiltrate data or inject further instructions.",
    references: ["OWASP LLM Top 10 – LLM02", "MINJA paper"],
  },

  {
    id: "R015",
    name: "User Role Escalation",
    description: "Claims elevated trust or permissions for a user or entity",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "\\b(this user (is|has|should have) (admin|root|elevated|full|unrestricted|special) (access|permissions?|trust|privileges?)|treat (this|the) user as (an? )?(admin|trusted|verified|owner|developer)|user is (verified|authenticated|authorized|allowed to))\\b",
    flags: ["i"],
    explanation:
      "This record attempts to grant elevated trust or permissions. Privilege escalation via memory injection can bypass agent-level authorization checks.",
    references: ["OWASP LLM Top 10 – LLM05: Supply Chain", "MINJA paper"],
  },

  {
    id: "R016",
    name: "Unusual Operational Specificity",
    description: "Memory is unusually specific about system operations",
    type: "regex",
    severity: "medium",
    enabled: true,
    pattern:
      "\\b(system prompt|context window|token limit|embedding|vector (store|db|database)|retrieval (strategy|pipeline)|model (version|weights)|temperature|top[_\\-]?p|system (instruction|message))\\b",
    flags: ["i"],
    explanation:
      "This record references internal AI system concepts (embeddings, system prompts, model parameters). Legitimate user memory rarely contains these terms — this warrants investigation.",
    references: ["MINJA paper – operational memory injection"],
  },

  // ── LOW / INFO: Privacy & Hygiene ────────────────────────────────────────

  {
    id: "R017",
    name: "Location Data",
    description: "Specific location information stored in memory",
    type: "regex",
    severity: "low",
    enabled: true,
    pattern:
      "\\b(lives? (in|at|near)|located (in|at)|home (address|is|in)|based (in|out of)|resides? (in|at)|coordinates?\\s*[:=])\\b",
    flags: ["i"],
    explanation:
      "This record stores location information. Review whether this is intentional and whether you're comfortable with this data persisting.",
    references: ["GDPR Article 4 – Location as Personal Data"],
  },

  {
    id: "R018",
    name: "Medical / Health Information",
    description: "Health or medical data stored in memory",
    type: "regex",
    severity: "medium",
    enabled: true,
    pattern:
      "\\b(diagnosis|prescribed|medication|chronic|disability|mental health|therapy|treatment|condition|patient|disorder|syndrome|illness|disease)\\b",
    flags: ["i"],
    explanation:
      "This record may contain health or medical information. This is sensitive personal data under HIPAA and GDPR and should be stored only with explicit intent.",
    references: ["HIPAA §164.514", "GDPR Article 9 – Special Categories"],
  },

  {
    id: "R019",
    name: "Financial Account Data",
    description: "Bank or financial account information in memory",
    type: "regex",
    severity: "high",
    enabled: true,
    pattern:
      "\\b(account (number|#)|routing (number|#)|IBAN|SWIFT|sort code|bank account|credit card|debit card|card number|CVV|expir(y|ation))\\b",
    flags: ["i"],
    explanation:
      "This record may contain financial account information. This data must never be stored in AI memory.",
    references: ["PCI DSS Requirement 3", "GDPR Article 9"],
  },

  {
    id: "R020",
    name: "Import-Origin Behavioral Instruction",
    description: "Behavioral instruction detected in imported memory",
    type: "provenance",
    severity: "high",
    enabled: true,
    explanation:
      "A record with imported provenance contains behavioral instructions. Imported memory is a common MINJA delivery vector — the user may not have authored this content.",
    references: ["MINJA paper – import-based injection"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Rule Registry
// ─────────────────────────────────────────────────────────────────────────────

export const RULES_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

export function getRuleById(id: string): DetectionRule | undefined {
  return RULES_BY_ID[id];
}

export function getEnabledRules(): DetectionRule[] {
  return RULES.filter((r) => r.enabled);
}

export function getRulesByType(type: DetectionRule["type"]): DetectionRule[] {
  return RULES.filter((r) => r.type === type && r.enabled);
}