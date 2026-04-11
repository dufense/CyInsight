/**
 * server/predictive-attack-engine.ts
 * Retained for Task #145: AI Detection Engineering Feedback Loop.
 * All predictive engine logic lives in server/cyber-llm-engine.ts.
 */

import { createAIClient, getDefaultModel } from "./ai-provider";

/** AI quality grade for a Sigma detection rule (Task #145). */
export async function gradeSigmaRule(
  ruleYaml: string,
  ruleTitle: string
): Promise<{ grade: string; suggestion: string }> {
  const ai = createAIClient();
  const prompt = `You are a Sigma rule quality expert. Analyze this detection rule and provide:
1. A quality grade: A (excellent), B (good), C (needs improvement), D (poor), F (invalid)
2. A concise improvement suggestion (1-2 sentences)

Rule title: ${ruleTitle}
Rule YAML:
\`\`\`yaml
${ruleYaml.slice(0, 2000)}
\`\`\`

Respond with ONLY valid JSON: {"grade": "A|B|C|D|F", "suggestion": "..."}`;

  try {
    const res = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const parsed: Record<string, unknown> = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    return {
      grade: ["A", "B", "C", "D", "F"].includes(String(parsed.grade)) ? String(parsed.grade) : "C",
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "No suggestion available.",
    };
  } catch {
    return { grade: "C", suggestion: "AI grading temporarily unavailable." };
  }
}
