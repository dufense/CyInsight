#!/usr/bin/env tsx
/**
 * MITRE Classification Regression Tests
 *
 * Validates correct ATT&CK mappings by calling the real exported
 * classifyMITREThreat() from server/enrichment-pipeline.ts.
 *
 * Run: npx tsx tests/mitre/mitre-classification-regression.ts
 */

import { classifyMITREThreat } from "../../server/enrichment-pipeline";

let passed = 0;
let failed = 0;

function assert(
  label: string,
  threat: string,
  description: string,
  expectedTactic: string,
  expectedTechnique: string | null,
) {
  const result = classifyMITREThreat(threat, description);
  const tacticOk = result.tactic === expectedTactic;
  const techniqueOk = expectedTechnique === null || result.technique === expectedTechnique;
  if (tacticOk && techniqueOk) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        Expected: tactic="${expectedTactic}" technique="${expectedTechnique}"`);
    console.error(`        Got:      tactic="${result.tactic}" technique="${result.technique}"`);
    failed++;
  }
}

function assertNotTechnique(
  label: string,
  threat: string,
  description: string,
  forbiddenTechnique: string,
) {
  const result = classifyMITREThreat(threat, description);
  if (result.technique !== forbiddenTechnique) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        Expected technique to NOT be "${forbiddenTechnique}"`);
    console.error(`        Got: tactic="${result.tactic}" technique="${result.technique}"`);
    failed++;
  }
}

console.log("\nMITRE Classification Regression Tests (production classifyMITREThreat)");
console.log("========================================================================\n");

console.log("Removable Storage / USB Events (must map to T1091 or T1052, never T1566):");
assert(
  "USB device inserted → Lateral Movement / T1091",
  "storage device", "insertion of storage device detected on workstation",
  "Lateral Movement", "T1091",
);
assert(
  "USB mass storage connected → Lateral Movement / T1091",
  "usb mass storage", "USB mass storage device connected to endpoint",
  "Lateral Movement", "T1091",
);
assert(
  "Removable media connected → Lateral Movement / T1091",
  "removable media", "removable media connected on workstation",
  "Lateral Movement", "T1091",
);
assert(
  "USB exfiltration → Exfiltration / T1052",
  "data exfiltration", "sensitive data copy to usb drive detected",
  "Exfiltration", "T1052",
);
assert(
  "Removable exfil transfer → Exfiltration / T1052",
  "data exfiltration", "file transfer to removable media",
  "Exfiltration", "T1052",
);
assertNotTechnique(
  "USB device event MUST NOT be T1566 (Phishing)",
  "storage device", "usb device inserted on endpoint",
  "T1566",
);
assertNotTechnique(
  "Removable media event MUST NOT be T1566 (Phishing)",
  "removable media", "removable drive connected",
  "T1566",
);

console.log("\nBrute Force Events (must map to Credential Access / T1110):");
assert(
  "Brute force keyword → Credential Access / T1110",
  "brute force", "multiple failed SSH login attempts detected",
  "Credential Access", "T1110",
);
assert(
  "Brute_force underscore → Credential Access / T1110",
  "brute_force", "SSH brute_force attack detected",
  "Credential Access", "T1110",
);

console.log("\nPhishing Events (must require email/link context for T1566):");
assert(
  "Phishing with email context → Initial Access / T1566",
  "phishing", "phishing email with malicious attachment detected targeting user",
  "Initial Access", "T1566",
);
assert(
  "Phishing with link context → Initial Access / T1566",
  "phishing", "suspicious phishing link clicked by user",
  "Initial Access", "T1566",
);
assert(
  "Phishing with attachment context → Initial Access / T1566",
  "phishing", "phishing message with malicious attachment",
  "Initial Access", "T1566",
);

console.log("\nPhishing False Positive Prevention (bare phishing keyword without context):");
const barePhishing = classifyMITREThreat("phishing", "suspicious activity on network endpoint");
if (!barePhishing.technique || barePhishing.technique !== "T1566") {
  console.log(`  PASS  Bare "phishing" without email/link context is NOT classified as T1566`);
  console.log(`        (Got: tactic="${barePhishing.tactic}" technique="${barePhishing.technique}")`);
  passed++;
} else {
  console.error(`  FAIL  Bare "phishing" without context was incorrectly classified as T1566`);
  console.error(`        Got: tactic="${barePhishing.tactic}" technique="${barePhishing.technique}"`);
  failed++;
}

console.log(`\n========================================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nSome MITRE classification tests FAILED — review enrichment logic.`);
  process.exit(1);
} else {
  console.log(`\nAll MITRE classification tests PASSED.`);
}
