# scripts/post-generate-checklist.md
# Run after EVERY `npx drizzle-kit generate`. Do not commit migration SQL without completing all items.
# PR REVIEW GATE: This checklist must be completed and signed off before any migration SQL is committed.
# CI validation: npx ts-node scripts/verify-migration-zero.ts

---

## ACTION 1 — Table Order Verification (FIX-V72-3 / v7.5 UQ)

Open generated migration zero SQL. Verify table CREATE order EXACTLY matches:

```
safe_mode_state
app_settings
firms
financial_years
writer_leases
audit_logs
bis_logos
schema_version
tax_rates
tax_groups
tax_group_components
sync_devices
sync_log
audit_archive_index
```

**Rules:**
- `tax_group_components` MUST appear AFTER both `tax_rates` AND `tax_groups` (FK dependency).
- `sync_devices`, `sync_log`, `audit_archive_index` have no FK references to other Phase 1 tables — they safely append at end.

- [ ] Table order verified. `tax_group_components` appears AFTER both `tax_rates` and `tax_groups`.

---

## ACTION 2 — DORMANCY GATE Comments (FIX-V72-2 / v7.1)

Drizzle does NOT auto-generate SQL comments. These must be added manually as the FIRST line
inside each CREATE TABLE block for the 5 dormant tables listed below.

**For `tax_rates`, `tax_groups`, `tax_group_components`:**
```sql
-- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query from Phase 1 service code.
```

**For `sync_devices`, `sync_log`:**
```sql
-- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query before Future Sync Phase spec approved.
```

- [ ] All 5 DORMANCY GATE comments added manually to the generated SQL.

---

## ACTION 3 — Partial Unique Index (v7.5 UQ-ACTIVE-FY-CONSTRAINT)

Drizzle CANNOT generate partial unique indexes. Manually add this line IMMEDIATELY after
the `CREATE TABLE financial_years` block:

```sql
CREATE UNIQUE INDEX uq_one_active_fy_per_firm ON financial_years(firm_id) WHERE status = 'ACTIVE';
```

This DB-level constraint prevents two ACTIVE FYs per firm — it complements verifyService
`MULTIPLE_ACTIVE_FY` detection and makes the violation structurally impossible, not just detectable.

- [ ] `uq_one_active_fy_per_firm` partial unique index present in generated SQL.

---

## ACTION 4 — All v7.7 Indexes (IDX-* additions)

Drizzle does NOT auto-generate index DDL. Manually add ALL 14 `CREATE INDEX IF NOT EXISTS`
statements below to the generated SQL file (after all CREATE TABLE statements).

```sql
-- writer_leases (assertNoActiveLease — most-called query in system)
CREATE INDEX IF NOT EXISTS idx_writer_leases_expires ON writer_leases(expires_at);

-- audit_logs (every write + boot verify + audit screen)
CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_date ON audit_logs(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, firm_id);

-- financial_years (resolveTransactionFyId + verify + FY_TRANSITION_BANNER)
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_status ON financial_years(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_dates ON financial_years(firm_id, start_date, end_date);

-- firms (firm manager + countActiveFirms + getActiveFirmId)
CREATE INDEX IF NOT EXISTS idx_firms_archived ON firms(is_archived, firm_id);

-- bis_logos (findActiveByFirmId — called inside updateFirm)
CREATE INDEX IF NOT EXISTS idx_bis_logos_firm_active ON bis_logos(firm_id, is_archived);

-- tax tables (Phase 3 calculateInvoice — dormant until Phase 3, zero cost to define now)
CREATE INDEX IF NOT EXISTS idx_tax_rates_firm_active ON tax_rates(firm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tax_groups_firm_active ON tax_groups(firm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tax_group_components_group ON tax_group_components(tax_group_id);
CREATE INDEX IF NOT EXISTS idx_tax_group_components_rate ON tax_group_components(tax_rate_id);

-- dormant sync/archive tables (Future Sync Phase + Phase 2 FY close)
CREATE INDEX IF NOT EXISTS idx_sync_log_firm_date ON sync_log(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_devices_firm ON sync_devices(firm_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_audit_archive_firm_fy ON audit_archive_index(firm_id, fy_id);
```

- [ ] All 14 indexes present. Verified by: `npx ts-node scripts/verify-migration-zero.ts`

---

## ACTION 5 — Immutability Triggers

Drizzle does NOT generate triggers. Manually add all 3 triggers below to the generated SQL.
These are constitutional constraints — removing them is a hard PR rejection.

```sql
-- Audit log immutability (G41: audit logs can never be modified or deleted)
CREATE TRIGGER prevent_audit_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit_logs rows cannot be updated');
END;

CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit_logs rows cannot be deleted');
END;

-- Firm code immutability (FIRM_CODE_SET is a permanent record — firm_code cannot change after assignment)
CREATE TRIGGER prevent_firm_code_update
BEFORE UPDATE OF firm_code ON firms
BEGIN
  SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firm_code cannot be changed after assignment');
END;
```

- [ ] All 3 immutability triggers present. Verified by: `npx ts-node scripts/verify-migration-zero.ts`

---

## SIGN-OFF

**Developer:** _________________________

**Date:** _________________________

**CI script result:** `npx ts-node scripts/verify-migration-zero.ts` → PASSED ✓

**PR reviewer confirmed checklist complete:** _________________________