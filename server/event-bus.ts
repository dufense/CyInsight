import { EventEmitter } from "events";

export interface LiveSecurityEvent {
  id: number;
  tenantId: number;
  eventType: string;
  severity: string;
  threat: string | null;
  target: string | null;
  attacker: string | null;
  source: string | null;
  occurredAt: string;
  description: string | null;
}

class SecurityEventBus extends EventEmitter {
  private recentEvents: LiveSecurityEvent[] = [];
  private maxRecent = 200;

  emit(event: string, ...args: any[]): boolean {
    if (event === "security_event") {
      const evt = args[0] as LiveSecurityEvent;
      this.recentEvents.push(evt);
      if (this.recentEvents.length > this.maxRecent) {
        this.recentEvents = this.recentEvents.slice(-this.maxRecent);
      }
    }
    return super.emit(event, ...args);
  }

  getRecentEvents(tenantIds: number[], limit = 50): LiveSecurityEvent[] {
    return this.recentEvents
      .filter(e => tenantIds.includes(e.tenantId))
      .slice(-limit);
  }
}

export const securityEventBus = new SecurityEventBus();
securityEventBus.setMaxListeners(100);
