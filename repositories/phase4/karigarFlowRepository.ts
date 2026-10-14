// repositories/phase4/karigarFlowRepository.ts
// Phase 4: Gold Intelligence — Karigar Flow Data Access Layer
// Manages karigar_issues and karigar_returns

import { eq, and, desc, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import {
  karigarIssues,
  karigarReturns,
} from '@/db/schema/phase4_gold_intelligence';
import type { DrizzleTransaction } from '@/types/phase2/phase2.types';
import type {
  KarigarIssue,
  NewKarigarIssue,
  KarigarReturn,
  NewKarigarReturn,
} from '@/types/phase4/phase4.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const karigarFlowRepository = {
  // ─── KARIGAR ISSUES ──────────────────────────────────────────────────────────

  insertIssue(
    tx: DrizzleTransaction,
    data: Omit<NewKarigarIssue, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): KarigarIssue {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(karigarIssues)
      .values({
        ...data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as NewKarigarIssue)
      .run();

    return conn
      .select()
      .from(karigarIssues)
      .where(eq(karigarIssues.id, id))
      .get() as KarigarIssue;
  },

  getIssueById(first: DrizzleTransaction | string, second?: string, third?: string): any {
    if (typeof first === 'string') {
      const id = first;
      const firmId = second;
      const conn = getDb();
      if (firmId) {
        return (
          conn
            .select()
            .from(karigarIssues)
            .where(and(eq(karigarIssues.id, id), eq(karigarIssues.firmId, firmId)))
            .get() || null
        );
      }
      return conn.select().from(karigarIssues).where(eq(karigarIssues.id, id)).get() || null;
    }

    const tx = first as DrizzleTransaction;
    const id = second!;
    const firmId = third;
    const conn = getDb(tx);
    if (firmId) {
      return (
        conn
          .select()
          .from(karigarIssues)
          .where(and(eq(karigarIssues.id, id), eq(karigarIssues.firmId, firmId)))
          .get() || null
      );
    }
    return conn.select().from(karigarIssues).where(eq(karigarIssues.id, id)).get() || null;
  },

  updateIssue(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewKarigarIssue>): void {
    const conn = getDb(tx);
    conn
      .update(karigarIssues)
      .set({
        ...data,
        updatedAt: now(),
      })
      .where(and(eq(karigarIssues.id, id), eq(karigarIssues.firmId, firmId)))
      .run();
  },

  listIssuesByFirm(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const firmId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(karigarIssues)
          .where(eq(karigarIssues.firmId, firmId))
          .orderBy(desc(karigarIssues.createdAt))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const firmId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(karigarIssues)
        .where(eq(karigarIssues.firmId, firmId))
        .orderBy(desc(karigarIssues.createdAt))
        .all() || []
    );
  },

  listIssuesByKarigar(first: DrizzleTransaction | string, second: string, third?: string): any {
    if (typeof first === 'string') {
      const firmId = first;
      const karigarId = second;
      const conn = getDb();
      return (
        conn
          .select()
          .from(karigarIssues)
          .where(and(eq(karigarIssues.firmId, firmId), eq(karigarIssues.karigarId, karigarId)))
          .orderBy(desc(karigarIssues.createdAt))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const firmId = second;
    const karigarId = third!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(karigarIssues)
        .where(and(eq(karigarIssues.firmId, firmId), eq(karigarIssues.karigarId, karigarId)))
        .orderBy(desc(karigarIssues.createdAt))
        .all() || []
    );
  },

  // ─── KARIGAR RETURNS ─────────────────────────────────────────────────────────

  insertReturn(
    tx: DrizzleTransaction,
    data: Omit<NewKarigarReturn, 'id' | 'createdAt'> & { id?: string }
  ): KarigarReturn {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(karigarReturns)
      .values({
        ...data,
        id,
        createdAt: timestamp,
      } as NewKarigarReturn)
      .run();

    return conn
      .select()
      .from(karigarReturns)
      .where(eq(karigarReturns.id, id))
      .get() as KarigarReturn;
  },

  getReturnsByIssueId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const issueId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(karigarReturns)
          .where(eq(karigarReturns.issueId, issueId))
          .orderBy(desc(karigarReturns.createdAt))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const issueId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(karigarReturns)
        .where(eq(karigarReturns.issueId, issueId))
        .orderBy(desc(karigarReturns.createdAt))
        .all() || []
    );
  },

  /**
   * GAP-KARIGAR-LOOP (v1.8):
   * Counts karigar_returns across ALL issues for this karigar+lot lifetime within firm.
   * Query: SELECT COUNT(*) FROM karigar_returns kr JOIN karigar_issues ki ON kr.issue_id = ki.id
   *        WHERE ki.karigar_id = ? AND ki.source_lot_id = ? AND ki.firm_id = ?
   */
  countLifetimeReturns(
    first: DrizzleTransaction | string,
    second: string,
    third?: string,
    fourth?: string
  ): number {
    let conn: any;
    let karigarId: string;
    let sourceLotId: string;
    let firmId: string;

    if (typeof first === 'string') {
      conn = getDb();
      karigarId = first;
      sourceLotId = second;
      firmId = third!;
    } else {
      conn = getDb(first);
      karigarId = second;
      sourceLotId = third!;
      firmId = fourth!;
    }

    const rows = conn
      .select({ count: sql<number>`count(*)` })
      .from(karigarReturns)
      .innerJoin(karigarIssues, eq(karigarReturns.issueId, karigarIssues.id))
      .where(
        and(
          eq(karigarIssues.karigarId, karigarId),
          eq(karigarIssues.sourceLotId, sourceLotId),
          eq(karigarIssues.firmId, firmId)
        )
      )
      .all();

    const countVal = rows?.[0]?.count ?? 0;
    return Number(countVal);
  },
};
