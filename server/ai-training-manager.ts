import { pool } from "./db";
import type { AttackCategory } from "@shared/schema";
import { ATTACK_CATEGORIES } from "@shared/schema";

export interface FeedbackSubmission {
  tenantId: number;
  detectionId?: number;
  incidentId?: number;
  analystUserId: string;
  feedbackType: "true_positive" | "false_positive" | "benign";
  attackCategory?: string;
  originalConfidence?: number;
  notes?: string;
}

export interface ThresholdStats {
  category: AttackCategory;
  tpCount: number;
  fpCount: number;
  benignCount: number;
  precision: number;
  currentThreshold: number;
  recommendedThreshold: number;
}

export async function submitDetectionFeedback(submission: FeedbackSubmission): Promise<number> {
  const res = await pool.query(
    `INSERT INTO detection_feedback
     (tenant_id, detection_id, incident_id, analyst_user_id, feedback_type,
      attack_category, original_confidence, notes, used_for_training, training_weight)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,1.0)
     RETURNING id`,
    [
      submission.tenantId,
      submission.detectionId || null,
      submission.incidentId || null,
      submission.analystUserId,
      submission.feedbackType,
      submission.attackCategory || null,
      submission.originalConfidence || null,
      submission.notes || null,
    ]
  );

  const feedbackId = res.rows[0].id;

  if (submission.attackCategory) {
    await updateCategoryThreshold(submission.tenantId, submission.attackCategory as AttackCategory, submission.feedbackType);
  }

  if (submission.feedbackType === "true_positive" && submission.detectionId && submission.attackCategory) {
    await addFewShotExample(submission.tenantId, submission.detectionId, submission.attackCategory as AttackCategory, submission.originalConfidence || 70);
  }

  await pool.query(
    `UPDATE detection_feedback SET used_for_training = true WHERE id = $1`,
    [feedbackId]
  );

  console.log(`[TrainingManager] Feedback ${feedbackId} recorded (${submission.feedbackType}) for tenant ${submission.tenantId}`);
  return feedbackId;
}

async function updateCategoryThreshold(
  tenantId: number,
  category: AttackCategory,
  feedbackType: "true_positive" | "false_positive" | "benign"
): Promise<void> {
  const colMap = {
    true_positive: "tp_count = tp_count + 1",
    false_positive: "fp_count = fp_count + 1",
    benign: "benign_count = benign_count + 1",
  };

  await pool.query(
    `INSERT INTO category_confidence_thresholds
     (tenant_id, attack_category, min_confidence_threshold, tp_count, fp_count, benign_count, few_shot_examples)
     VALUES ($1, $2, 40, 0, 0, 0, '[]')
     ON CONFLICT (tenant_id, attack_category) DO UPDATE
     SET ${colMap[feedbackType]}, updated_at = NOW()`,
    [tenantId, category]
  );

  const statsRes = await pool.query(
    `SELECT tp_count, fp_count, benign_count, min_confidence_threshold
     FROM category_confidence_thresholds
     WHERE tenant_id = $1 AND attack_category = $2`,
    [tenantId, category]
  );

  const stats = statsRes.rows[0];
  if (!stats) return;

  const tp = parseInt(stats.tp_count) || 0;
  const fp = parseInt(stats.fp_count) || 0;
  const benign = parseInt(stats.benign_count) || 0;
  const total = tp + fp + benign;

  if (total < 5) return;

  const precision = total > 0 ? tp / (tp + fp + benign) : 0.5;
  let newThreshold = parseInt(stats.min_confidence_threshold) || 40;

  if (precision < 0.3) {
    newThreshold = Math.min(80, newThreshold + 10);
  } else if (precision < 0.5) {
    newThreshold = Math.min(70, newThreshold + 5);
  } else if (precision > 0.8 && total > 10) {
    newThreshold = Math.max(20, newThreshold - 5);
  } else if (precision > 0.9 && total > 20) {
    newThreshold = Math.max(15, newThreshold - 10);
  }

  await pool.query(
    `UPDATE category_confidence_thresholds SET min_confidence_threshold = $1, updated_at = NOW()
     WHERE tenant_id = $2 AND attack_category = $3`,
    [newThreshold, tenantId, category]
  );

  console.log(`[TrainingManager] Threshold for ${category} (tenant ${tenantId}): precision=${(precision * 100).toFixed(0)}%, new threshold=${newThreshold}`);
}

async function addFewShotExample(
  tenantId: number,
  detectionId: number,
  category: AttackCategory,
  confidence: number
): Promise<void> {
  const detRes = await pool.query(
    `SELECT ad.explanation, se.description, se.threat, se.event_type
     FROM attack_detections ad
     LEFT JOIN security_events se ON se.id = ad.event_id
     WHERE ad.id = $1`,
    [detectionId]
  );

  const det = detRes.rows[0];
  if (!det) return;

  const eventSummary = [det.event_type, det.threat, det.description]
    .filter(Boolean).join(" | ").substring(0, 300);

  if (!eventSummary) return;

  const newExample = {
    event: eventSummary,
    category,
    confidence,
    explanation: (det.explanation || "").substring(0, 200),
  };

  const existingRes = await pool.query(
    `SELECT few_shot_examples FROM category_confidence_thresholds WHERE tenant_id = $1 AND attack_category = $2`,
    [tenantId, category]
  );

  const existing: any[] = Array.isArray(existingRes.rows[0]?.few_shot_examples)
    ? existingRes.rows[0].few_shot_examples
    : [];

  const updated = [...existing, newExample].slice(-10);

  await pool.query(
    `INSERT INTO category_confidence_thresholds
     (tenant_id, attack_category, min_confidence_threshold, tp_count, fp_count, benign_count, few_shot_examples)
     VALUES ($1, $2, 40, 1, 0, 0, $3::jsonb)
     ON CONFLICT (tenant_id, attack_category) DO UPDATE
     SET few_shot_examples = $3::jsonb, updated_at = NOW()`,
    [tenantId, category, JSON.stringify(updated)]
  );
}

export async function getThresholdStats(tenantId: number): Promise<ThresholdStats[]> {
  const res = await pool.query(
    `SELECT attack_category, tp_count, fp_count, benign_count, min_confidence_threshold
     FROM category_confidence_thresholds
     WHERE tenant_id = $1
     ORDER BY attack_category`,
    [tenantId]
  );

  return res.rows.map((row: any) => {
    const tp = parseInt(row.tp_count) || 0;
    const fp = parseInt(row.fp_count) || 0;
    const benign = parseInt(row.benign_count) || 0;
    const total = tp + fp + benign;
    const precision = total > 0 ? tp / total : 0;
    const currentThreshold = parseInt(row.min_confidence_threshold) || 40;

    let recommended = currentThreshold;
    if (precision < 0.3 && total >= 5) recommended = Math.min(80, currentThreshold + 10);
    else if (precision > 0.8 && total >= 10) recommended = Math.max(20, currentThreshold - 5);

    return {
      category: row.attack_category as AttackCategory,
      tpCount: tp,
      fpCount: fp,
      benignCount: benign,
      precision: Math.round(precision * 100) / 100,
      currentThreshold,
      recommendedThreshold: recommended,
    };
  });
}

export async function getFeedbackHistory(tenantId: number, limit = 50): Promise<any[]> {
  const res = await pool.query(
    `SELECT df.*, ad.attack_category, ad.confidence, ad.severity
     FROM detection_feedback df
     LEFT JOIN attack_detections ad ON ad.id = df.detection_id
     WHERE df.tenant_id = $1
     ORDER BY df.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return res.rows;
}

export async function runTrainingReview(tenantId: number): Promise<{ reviewed: number; thresholdsUpdated: number }> {
  const unprocessedRes = await pool.query(
    `SELECT id, attack_category, feedback_type, detection_id, original_confidence
     FROM detection_feedback
     WHERE tenant_id = $1 AND used_for_training = false
     ORDER BY created_at ASC
     LIMIT 100`,
    [tenantId]
  );

  let reviewed = 0;
  let thresholdsUpdated = 0;
  const processedIds: number[] = [];

  for (const row of unprocessedRes.rows) {
    if (!row.attack_category || !ATTACK_CATEGORIES.includes(row.attack_category)) continue;
    await updateCategoryThreshold(tenantId, row.attack_category as AttackCategory, row.feedback_type);
    if (row.feedback_type === "true_positive" && row.detection_id) {
      await addFewShotExample(tenantId, row.detection_id, row.attack_category as AttackCategory, row.original_confidence || 70);
    }
    processedIds.push(row.id);
    reviewed++;
    thresholdsUpdated++;
  }

  if (processedIds.length > 0) {
    await pool.query(
      `UPDATE detection_feedback SET used_for_training = true WHERE id = ANY($1)`,
      [processedIds]
    );
  }

  return { reviewed, thresholdsUpdated };
}

export function startTrainingReviewJob(): void {
  setInterval(async () => {
    try {
      const tenantRes = await pool.query(`SELECT id FROM tenants WHERE is_active = true LIMIT 500`);
      for (const t of tenantRes.rows) {
        const result = await runTrainingReview(t.id);
        if (result.reviewed > 0) {
          console.log(`[TrainingManager] Tenant ${t.id}: reviewed=${result.reviewed}, updated=${result.thresholdsUpdated}`);
        }
      }
    } catch (err: any) {
      console.error("[TrainingManager] Periodic review error:", err.message);
    }
  }, 30 * 60 * 1000);
}
