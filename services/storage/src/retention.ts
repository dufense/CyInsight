export interface RetentionConfig {
  hotDays: number;
  warmDays: number;
  coldDays: number;
}

export interface RetentionStats {
  hotEvents: number;
  warmCandidates: number;
  coldCandidates: number;
  deleteCandidates: number;
  lastRunAt: string | null;
}

const DEFAULT_CONFIG: RetentionConfig = {
  hotDays: 90,
  warmDays: 365,
  coldDays: 2555,
};

export class RetentionManager {
  private pool: any;
  private config: RetentionConfig;
  private lastRunAt: Date | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(pool: any, config?: Partial<RetentionConfig>) {
    this.pool = pool;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  startSchedule(intervalHours: number = 24): void {
    if (this.intervalHandle) return;
    console.log(`[RetentionManager] Starting retention schedule every ${intervalHours}h`);
    this.intervalHandle = setInterval(() => {
      this.runRetention().catch(err => {
        console.error(`[RetentionManager] Scheduled retention failed: ${err.message}`);
      });
    }, intervalHours * 60 * 60 * 1000);
  }

  stopSchedule(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runRetention(): Promise<RetentionStats> {
    console.log("[RetentionManager] Running retention lifecycle...");

    const now = new Date();
    const hotCutoff = new Date(now.getTime() - this.config.hotDays * 86400000);
    const warmCutoff = new Date(now.getTime() - this.config.warmDays * 86400000);
    const coldCutoff = new Date(now.getTime() - this.config.coldDays * 86400000);

    let hotEvents = 0;
    let warmCandidates = 0;
    let coldCandidates = 0;
    let deleteCandidates = 0;

    try {
      const hotResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at >= $1`,
        [hotCutoff]
      );
      hotEvents = parseInt(hotResult.rows[0]?.cnt || "0");

      const warmResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1 AND occurred_at >= $2`,
        [hotCutoff, warmCutoff]
      );
      warmCandidates = parseInt(warmResult.rows[0]?.cnt || "0");

      const coldResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1 AND occurred_at >= $2`,
        [warmCutoff, coldCutoff]
      );
      coldCandidates = parseInt(coldResult.rows[0]?.cnt || "0");

      const deleteResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1`,
        [coldCutoff]
      );
      deleteCandidates = parseInt(deleteResult.rows[0]?.cnt || "0");

      if (warmCandidates > 0) {
        console.log(`[RetentionManager] ${warmCandidates} events past hot tier (${this.config.hotDays}d) — candidates for Parquet export`);
      }

      if (deleteCandidates > 0) {
        console.log(`[RetentionManager] ${deleteCandidates} events past cold tier (${this.config.coldDays}d) — candidates for deletion`);
      }
    } catch (err: any) {
      console.error(`[RetentionManager] Retention analysis error: ${err.message}`);
    }

    this.lastRunAt = now;

    return {
      hotEvents,
      warmCandidates,
      coldCandidates,
      deleteCandidates,
      lastRunAt: now.toISOString(),
    };
  }

  async getStats(): Promise<RetentionStats> {
    return this.runRetention();
  }

  getConfig(): RetentionConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[RetentionManager] Config updated: hot=${this.config.hotDays}d, warm=${this.config.warmDays}d, cold=${this.config.coldDays}d`);
  }
}
