/**
 * Audit service for ingesting and querying audit events.
 */

import { eq, and, gte, lte, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvents } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type AuditEventInput = {
  userId: string;
  orgId: string;
  eventType: string;
  toolName?: string;
  outcome: string;
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

export type AuditQueryParams = {
  orgId: string;
  userId?: string;
  eventType?: string;
  toolName?: string;
  outcome?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export class AuditService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  async ingestEvents(events: AuditEventInput[]) {
    if (events.length === 0) return;

    await this.db.insert(auditEvents).values(
      events.map((e) => ({
        orgId: e.orgId,
        userId: e.userId,
        eventType: e.eventType,
        toolName: e.toolName,
        outcome: e.outcome,
        agentId: e.agentId,
        sessionKey: e.sessionKey,
        metadata: e.metadata,
        timestamp: new Date(e.timestamp),
      })),
    );
  }

  async queryEvents(params: AuditQueryParams) {
    const conditions = [eq(auditEvents.orgId, params.orgId)];

    if (params.userId) {
      conditions.push(eq(auditEvents.userId, params.userId));
    }
    if (params.eventType) {
      conditions.push(eq(auditEvents.eventType, params.eventType));
    }
    if (params.toolName) {
      conditions.push(eq(auditEvents.toolName, params.toolName));
    }
    if (params.outcome) {
      conditions.push(eq(auditEvents.outcome, params.outcome));
    }
    if (params.from) {
      conditions.push(gte(auditEvents.timestamp, params.from));
    }
    if (params.to) {
      conditions.push(lte(auditEvents.timestamp, params.to));
    }

    return this.db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.timestamp))
      .limit(params.limit ?? 100)
      .offset(params.offset ?? 0);
  }
}
