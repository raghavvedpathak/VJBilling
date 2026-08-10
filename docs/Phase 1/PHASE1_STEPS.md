VJ BILLING  ·  PHASE 1  ·  v7.33 CURRENT        Foundation · Identity · Safety · Governance
PROJECT · VJ BILLING
PHASE 1 — FOUNDATION & CONSTITUTIONAL LAYER
Project Leader · Lead Developer · Project Architect · Project Tester
v7.34 CURRENT · 1 fix (FIX-V734-1). Full version-by-version history is authoritative in the Version History table below — see it for details. · Production Readiness 10/10 · Build-ready (Android device gate sign-off pending)
All 7 Critical Hardenings · 11 Architectural Review Items · v2.4–v7.8 Gap Resolutions Integrated
Foundation · Identity · Safety · Governance
React Native · NativeWind v4 · TypeScript Strict · expo-sqlite · Drizzle ORM
Production Readiness Score
10 / 10
All spec integrity gaps closed · v7.34 · Security hardened (with one owner-accepted, documented trade-off — see FIX-V729-1 — and one precision fix extending PIN length flexibility — see FIX-V729-2) · Build-ready (Android device gate sign-off pending separately)

STEP
0
	PHASE 1 CONTRACT
Mental Model — Read Before Building Anything
	

What Phase 1 Is
Phase 1 is the constitutional layer of VJ BILLING. Every decision made here constrains and protects every feature that comes after. It is intentionally over-engineered, defensive, and boring. Its sole purpose is to make corruption, data leaks, and illegal behavior structurally impossible — not just unlikely.


THE NON-NEGOTIABLE CONTRACT
THE NON-NEGOTIABLE CONTRACT


Phase 1 prevents future mistakes — it does not run accounting.
Phase 1 must survive crashes, corruption, and deliberate misuse.
✗ If a step touches money → it does not belong here.
✗ If a step touches stock → it does not belong here.
✗ If a step touches GST calculation → it does not belong here.
	

Core Philosophy — Locked Forever
* ◆  Accounting Truth > UI Convenience — This is a philosophy pillar, not a service class. The enforcement mechanism is the Dual Guard Pattern (see Step 1).
* ◆  No silent data mutation — ever
* ◆  Everything is auditable
* ◆  Offline-first, always
* ◆  Crash-safe in every operation
* ◆  Explainable to non-technical shop owners


🆕 NEW
v4.0 · G44 — Accounting Truth Clarification


"Accounting Truth" is a Core Philosophy pillar. It has no corresponding service class.


There is no AccountingTruthService in Phase 1, Phase 2, or any future phase.


Enforcement is structural: the Dual Guard Pattern (assertNoActiveLease + assertNotInSafeMode) is what makes writes safe.


Any developer who creates a class named AccountingTruthService has misread the spec.
	

Tech Stack
Layer
	Technology
	Framework
	Expo SDK 56 + React Native 0.85 (New Architecture / JSI — FIX-V715-1 + FIX-V716-1 + FIX-V732-4)
	Language
	TypeScript — strict: true, noImplicitAny: true, exactOptionalPropertyTypes: true
	Navigation
	Expo Router with typed routes
	UI
	NativeWind v4 (Tailwind CSS for React Native)
	Global State
	Zustand with auto-persisted slices
	Fast Storage
	react-native-mmkv v4 (production, requires react-native-nitro-modules peer dep + expo prebuild — FIX-V733-10) + AsyncStorage fallback
	Database
	expo-sqlite + Drizzle ORM with versioned migrations
	File Security
	expo-file-system + expo-crypto (SHA-256)
	File Sharing
	expo-document-picker + expo-sharing
	

⚠ ANDROID-ONLY TEST SCOPE (v2.7)
⚠  ANDROID-ONLY TEST SCOPE (v2.7)


iOS device testing is explicitly OUT OF SCOPE for Phase 1.
All tests in Step R run on Android (Jest + Android Detox).
iOS suspension / MMKV parity gate items (Review Item 4, items 1 & 2) are deferred to a future iOS phase.
The 0.3 gap that keeps the score at 9.7/10 now refers to item 3 only: safe_mode_state first-boot row must pass on real Android device.
Phase 2 may not begin until that one item passes on real Android. iOS is a separate milestone.
	

________________




STEP
1
	PROJECT & ARCHITECTURE SETUP
The skeleton every future file must obey
	

This step creates the project structure, enforces the architectural contract as living code, and installs every dependency Phase 1 requires. Nothing is built here — the rules are built here.


LAYER HIERARCHY
LAYER HIERARCHY


UI (NativeWind Screens) → ViewModel (Zustand Stores) → Domain Services (THE AUTHORITY)
→ Repository (Data Access) → Drizzle ORM → expo-sqlite


✗  UI layer never touches DAO or Repository directly
✗  ViewModel/Store never mutates the database
✗  Repository never decides business rules
✓  Services are the only authority for all writes
✓  Every write begins with assertNoActiveLease()

IMPORTANT — Firm Count Methods (G43): countFirms() counts ALL firms (active + archived). countActiveFirms() counts WHERE is_archived = 0. These are NOT interchangeable. See Step 7 for full disambiguation rule.
🆕 NEW v6.0 · G65 — ESLint Enforcement: Layer Hierarchy Is Machine-Enforced
The “UI never touches DB directly” rule must be machine-enforced, not just documented. Add this ESLint rule to .eslintrc.js so the CI pipeline catches violations automatically:
// ──────────────────────────────────────────────────────
// CANONICAL RULE — .eslintrc (JSON format)
// ──────────────────────────────────────────────────────
{
  "no-restricted-imports": [
    "error",
    {
      "paths": [
        {
          "name": "@/db",
          "message": "Use repository layer instead"
        }
      ]
    }
  ]
}
// ──────────────────────────────────────────────────────
// SCOPED VERSION — .eslintrc.js (screens + app dirs only)
// ──────────────────────────────────────────────────────
overrides: [
  {
    files: ["app/**/*.tsx", "app/**/*.ts", "screens/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        "paths": [
          {
            "name": "@/db",
            "message": "Use repository layer instead"
          }
        ]
      }]
    }
  }
]
// ──────────────────────────────────────────────────────
// WHAT THIS PREVENTS — this will now FAIL at lint time:
// ──────────────────────────────────────────────────────
// screens/BillingScreen.tsx  ←─ ESLint ERROR here
import db from '@/db';   // ❌ "Use repository layer instead"
// CORRECT PATTERN — this is what developers MUST do instead:
// screens/BillingScreen.tsx  ←─ ESLint PASSES
import { firmService } from '@/services/firmService';  // ✅ correct
CODE REVIEW GATE: PR pipelines MUST run ESLint. Any import of ‘@/db’ in app/ or screens/ directories fails the build. Repositories and services may import ‘@/db’ freely. This rule is file-scoped via overrides, not global. Without this gate, the layer architecture is documentation only. With it, the architecture is structurally enforced. This is the most important future-developer protection in Phase 1 after the Dual Guard Pattern.
	

Dual Guard Pattern — Mandatory Boilerplate
Every service method that writes to the database MUST begin with BOTH guards:
* await assertNoActiveLease(); — Prevents concurrent writes (throws LEASE_HELD)
* assertNotInSafeMode(); — Prevents writes during Safe Mode (throws SAFE_MODE_ACTIVE)
* bootstrapComplete.value must be true before assertNotInSafeMode() can succeed (G42). See Step 10.


This dual pattern prevents: (a) race conditions, (b) data corruption during Safe Mode.

🆕 NEW
v4.0 · G40 — Two Safe Mode Exceptions to Dual Guard


EXCEPTION 1 — restoreService.restore(): Must NOT call assertNotInSafeMode(). It is the PATH 2 Safe Mode resolution. Calling it would permanently trap the user.


EXCEPTION 2 — backupService.createBackup(): Must NOT call assertNotInSafeMode(). Backup is a READ operation. Reading your data during Safe Mode is explicitly allowed and necessary.


Both exceptions MUST still call assertNoActiveLease().


These are the ONLY two exceptions. No other service method may skip assertNotInSafeMode().


Both exceptions must be enforced at code review. Any developer who adds assertNotInSafeMode() to either service is introducing a bug.
	

G42 — bootstrapComplete Flag is MANDATORY
G42 — bootstrapComplete Flag is MANDATORY (not optional)


assertNotInSafeMode() reads from Zustand safeModeStore. Zustand is in initial state (isActive: false) until Step 5 loads it from DB.


Calling assertNotInSafeMode() before Step 5 produces a false negative — Safe Mode DB state is not yet reflected.


MANDATORY: The bootstrapComplete flag MUST be implemented. This is NOT optional and NOT a recommendation.


Implementation: export const bootstrapComplete = { value: false }; — in safeModeService.ts


Set bootstrapComplete.value = true at Step 7b in bootstrapDatabase(), after loadSafeModeState() and all store loading is complete.// ================================================================// v7.24 FIX-V724-1 — services/pinService.ts CANONICAL IMPLEMENTATION// PIN gate runs BEFORE bootstrapDatabase(). On first boot: show PIN setup screen with a// "Skip for now" option (v7.29 FIX-V729-1). If a PIN is set: show PIN entry screen on every// subsequent boot (mandatory, no bypass once set). If skipped: proceed straight to// bootstrapDatabase() with no gate until the user sets a PIN from Settings > Security.// ================================================================// import { storage } from '@/utils/storage'; import { ERR } from '@/constants/errorCodes';const PIN_HASH_KEY = 'vjbilling_pin_hash';const PIN_SALT_KEY = 'vjbilling_pin_salt';const PIN_FAILED_KEY = 'vjbilling_pin_failed_attempts';const PIN_LOCKOUT_KEY = 'vjbilling_pin_lockout_until';const PIN_LENGTH_KEY = 'vjbilling_pin_length'; // v7.29 FIX-V729-2: '4' or '6'const MAX_ATTEMPTS = 3;const BASE_LOCKOUT_MS = 30_000; // 30 seconds, doubles each subsequent lockoutasync function deriveKey(pin: string, saltHex: string): Promise<string> {  const enc = new TextEncoder();  // v7.33 FIX-V733-1: saltHex.match() can return null on corrupted/tampered MMKV data.  // The prior code used a non-null assertion (!), which is compile-time only and let a  // raw, unhandled TypeError escape at runtime on the boot-time PIN screen. Now fails  // closed with a typed, catchable error instead.  const saltHexPairs = saltHex.match(/.{2}/g);  if (!saltHexPairs) throw new Error(ERR.PIN_DATA_CORRUPTED + ': stored PIN salt is malformed');  const saltBytes = new Uint8Array(saltHexPairs.map(h => parseInt(h, 16)));  const km = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);  const key = await crypto.subtle.deriveKey(    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },    km, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign']  );  const raw = await crypto.subtle.exportKey('raw', key);  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('');}export function isPinSet(): boolean { return !!storage.getString(PIN_HASH_KEY); }export async function setPin(pin: string): Promise<void> {  // v7.29 FIX-V729-2: PIN length is now user's choice — 4 digits or 6 digits — not fixed at 6.  if (!/^\d{4}$/.test(pin) && !/^\d{6}$/.test(pin)) throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');  const saltBytes = crypto.getRandomValues(new Uint8Array(16));  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');  storage.set(PIN_HASH_KEY, await deriveKey(pin, saltHex));  storage.set(PIN_SALT_KEY, saltHex);  storage.set(PIN_LENGTH_KEY, String(pin.length)); // '4' or '6'}export function getPinLength(): 4 | 6 {  const len = storage.getString(PIN_LENGTH_KEY);  return len === '4' ? 4 : 6; // defaults to 6 if never set (pre-v7.29 installs, or unset)}export async function verifyPin(pin: string): Promise<boolean> {  const storedHash = storage.getString(PIN_HASH_KEY);  const storedSalt = storage.getString(PIN_SALT_KEY);  if (!storedHash || !storedSalt) return false;  return (await deriveKey(pin, storedSalt)) === storedHash;}export function getFailedAttempts(): number {  return parseInt(storage.getString(PIN_FAILED_KEY) ?? '0', 10);}export function incrementFailedAttempts(): void {  const attempts = getFailedAttempts() + 1;  storage.set(PIN_FAILED_KEY, String(attempts));  if (attempts >= MAX_ATTEMPTS) {    const ms = BASE_LOCKOUT_MS * Math.pow(2, Math.max(0, attempts - MAX_ATTEMPTS));    storage.set(PIN_LOCKOUT_KEY, new Date(Date.now() + ms).toISOString());  }}export function isLockedOut(): boolean {  const until = storage.getString(PIN_LOCKOUT_KEY);  return !!until && Date.now() < new Date(until).getTime();}export function resetFailedAttempts(): void {  storage.delete(PIN_FAILED_KEY);  storage.delete(PIN_LOCKOUT_KEY);}// v7.29 FIX-V729-1 [security downgrade — explicit product decision, see v7.29 version history]:// PIN setup is now skippable on first boot. isPinSkipped() / setPinSkipped() below track that// choice separately from isPinSet() so the two states (never asked vs. explicitly skipped)// are not conflated. changePin() adds an authenticated change flow for Settings > Security.const PIN_SKIPPED_KEY = 'vjbilling_pin_setup_skipped';export function isPinSkipped(): boolean {  return storage.getString(PIN_SKIPPED_KEY) === 'true';}export function setPinSkipped(): void {  storage.set(PIN_SKIPPED_KEY, 'true');}export async function changePin(currentPin: string, newPin: string): Promise<void> {  const ok = await verifyPin(currentPin);  if (!ok) throw new Error(ERR.PIN_INCORRECT + ': current PIN is incorrect');  // v7.29 FIX-V729-2: new PIN may be 4 or 6 digits, independent of the old PIN's length.  if (!/^\d{4}$/.test(newPin) && !/^\d{6}$/.test(newPin)) throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');  await setPin(newPin);  storage.delete(PIN_SKIPPED_KEY); // setting/changing a PIN always clears the skipped flag}


assertNotInSafeMode() MUST throw BOOTSTRAP_INCOMPLETE if called before Step 7b. Same enforcement level as Dual Guard. Code review gate item.
	

Transaction Context Pattern
Transaction Context Pattern


Services must NOT call other services inside a transaction.
Instead, services pass the transaction context (tx) down to repositories.
This prevents nested lease assertions, guard bypass, and makes failures deterministic.


CORRECT: firmService calls firmRepository.insert(tx, ...) and fyRepository.insertInitial(tx, ...)
WRONG: firmService calls fyService.createInitialFY(tx, ...) inside its own transaction


IMPORTANT: auditRepository.log() is a repository-layer call — it must NEVER call assertNoActiveLease() internally.
	

// CORRECT pattern — services pass tx to repositories directly
export async function createFirm(input: CreateFirmInput): Promise<Firm> {
  await assertNoActiveLease();
  assertNotInSafeMode();
  // v7.16 FIX-V716-3: JSI driver requires synchronous tx callback — async removed  return db.transaction((tx) => {
    const existing = firmRepository.countFirms(tx); // INSIDE transaction
    if (existing >= 3) throw new Error('MAX_FIRMS_REACHED');
    const firm = firmRepository.insert(tx, { ...input, id: uuid() });
    fyRepository.insertInitial(tx, firm.id); // NOT fyService
    auditRepository.log(tx, { eventType: 'FIRM_CREATED', firmId: firm.id });
    return firm;
  });
}
	

⚠ REPOSITORY SYNC CONTRACT (v7.18 FIX-V718-1) — CONSTITUTIONAL
All repository methods called within a db.transaction((tx) => { }) callback are SYNCHRONOUS in the drizzle-orm/expo-sqlite JSI driver.
This means: firmRepository.insert(tx, ...), firmRepository.findById(tx, ...), auditRepository.log(tx, ...), bisLogoRepository.archive(tx, ...), safeModeRepository.upsert(tx, ...), fyRepository.insertInitial(tx, ...) and ALL other repository calls that accept a tx handle return their values synchronously. The await keyword MUST NOT be used on these calls inside a db.transaction() callback. Using await inside a synchronous JSI tx callback does not raise an error — it silently resolves the awaited value on the next microtask tick, OUTSIDE the SQLite transaction boundary. This is a silent data-loss bug, not a thrown exception.
CORRECT (JSI, synchronous):
  const firm = firmRepository.insert(tx, { ...input, id: uuid() }); // ✔ synchronous, inside tx boundary
WRONG (silently breaks tx boundary):
  const firm = await firmRepository.insert(tx, { ...input, id: uuid() }); // ❌ await resolves outside tx
Repository method signatures within the tx context MUST declare their return type directly (not Promise-wrapped) and MUST NOT use async. Example: export function insert(tx: DrizzleTransaction, data: NewFirm): Firm { ... } not export async function insert(...): Promise<Firm> { ... }. The same rule applies to all tx.select(), tx.insert(), tx.update(), tx.delete() calls within the callback — no await.
SETSTATE-OUTSIDE-TX COROLLARY (v7.18 FIX-V718-5/6): Zustand setState calls (safeModeStore.setState, leaseStore.setState, firmStore.setState) MUST execute AFTER the db.transaction() call returns, never inside the tx callback. If the tx rolls back, a setState inside the callback has already mutated Zustand state — leaving UI state inconsistent with DB state. The only correct pattern: db.transaction((tx) => { /* DB ops only */ }); store.setState(...); // AFTER tx commits
	

________________




STEP
2
	DATABASE FOUNDATION
expo-sqlite + Drizzle. All 15 schemas complete. Migration zero defined.
	

This step creates the only tables that exist in Phase 1. No business tables. No invoices. No stock. Only identity, governance, safety, and audit.


Phase 1 Schema Tables
Table
	Purpose
	firms
	Legal entity identity. Root of all future records.
	financial_years
	FY boundaries per firm. Immutable once created.
	app_settings
	Date format, theme preference, audit retention. Single row (id=1).
	audit_logs
	Append-only accountability trail. Never editable. Deletable only via the gated monthly retention purge (v7.10) — see audit_delete_gate below.
	audit_delete_gate
	v7.10. Single-row (id=1) gate for the audit_logs DELETE trigger. gate_open=1 only inside purgeExpiredAuditLogs()'s own transaction; 0 at every other moment. No UI surface.
	schema_version
	v6.0 G64. Single-row (id=1) DB-side schema version marker. Read by verifyService to detect DB-vs-app schema mismatch at runtime. Not the same as the SCHEMA_VERSION TypeScript constant. (v7.13 FIX-V713-2: row added — this table previously listed only 14 of the 15 tables named in the Step 2 header.)
	writer_leases
	Concurrency guard. UUID-keyed, TTL-based, purged on restart.
	safe_mode_state
	HARDENING 2: Persisted Safe Mode state. Survives app restart. Single row (id=1).
	bis_logos
	BIS logo records per firm. Soft-delete only. v2.9 addition.
	tax_rates
	GST-TAXMASTER (v6.9): Individual CGST/SGST rate components. Stored in basis points. SCHEMA ONLY in Phase 1 — DORMANCY GATE applies. Phase 3 Step 0 implementation target.
	tax_groups
	GST-TAXMASTER (v6.9): Named GST slab bundles (e.g. “GST 3%”). Groups CGST + SGST rate components. SCHEMA ONLY in Phase 1 — DORMANCY GATE applies. Phase 3 Step 0 implementation target.
	tax_group_components
	GST-TAXMASTER (v6.9): Junction table — links tax_groups to tax_rates. FK references to both parent tables. SCHEMA ONLY in Phase 1 — DORMANCY GATE applies. Phase 3 Step 0 implementation target.
	sync_devices
	SYNC-FOUNDATION (v7.3): Device pairing registry. PRIMARY/SECONDARY roles. Dormant — Future Sync Phase only.
	sync_log
	SYNC-FOUNDATION (v7.3): Append-only sync event log. Mirrors audit_logs pattern. Dormant — Future Sync Phase only.
	audit_archive_index
	AUDIT-ARCHIVE (v7.4): FY-close audit archive metadata index. Append-only. One row per FY-close event per firm. Stores firmId, fyId, fyLabel, archiveDate, rowCount, storageRef for each closed FY’s audit batch.
	

HARDENING 2: SAFE MODE DB PERSISTENCE
Before v2.0: Safe Mode state lived only in Zustand.
Problem: If app crashed before Zustand persistence completed → Safe Mode state lost.
Solution: New table safe_mode_state with single row (id = 1).
On app bootstrap, this row is read BEFORE any screen renders.
If isActive = 1, Safe Mode activates immediately.
Safe Mode now survives: app crash, force quit, device reboot, app reinstall (if backup restored).
	

safe_mode_state Schema — v2.4 (clearedAt added)
// db/schema.ts — safe_mode_state (v2.4: clearedAt added)
export const safeModeState = sqliteTable('safe_mode_state', {
  id: integer('id').primaryKey().default(1), // Single row: id always = 1
  isActive: integer('is_active').notNull().default(0), // 0/1 boolean
  reason: text('reason'), // SafeModeTrigger enum
  activatedAt: text('activated_at'), // ISO-8601
  clearedAt: text('cleared_at'), // v2.4 NEW: ISO-8601, null while active
});
	

firms Schema — v7.0 (stateCode + stateName replace state)
🆕 NEW
v5.0 · G45+G46 — firms Schema Updated


Two new columns added:
  firmLogoRef: text('firm_logo_ref') — nullable, stores expo-file-system URI of the firm's own brand/company logo.
  phone3: text('phone3') — nullable, third optional contact number.


phone1 remains required (notNull). phone2 and phone3 are optional (nullable).
firmLogoRef has no archival logic — it is a simple file reference. Unlike bisLogoRef, it has no licence dependency.
	

// db/schema.ts (firms) — v5.0: firmLogoRef + phone3 added
export const firms = sqliteTable('firms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firmCode: text('firm_code').notNull().unique(),
  proprietor: text('proprietor').notNull(),
  gstin: text('gstin'),
  bisLicence: text('bis_licence'),
  bisLogoRef: text('bis_logo_ref'),
  firmLogoRef: text('firm_logo_ref'), // v5.0 G45: firm brand logo URI (nullable)
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  stateCode: text('state_code').notNull(), // v7.0 G70: 2-digit GST state code e.g. '27'  stateName: text('state_name').notNull(), // v7.0 G70: display name e.g. 'Maharashtra'
  pincode: text('pincode').notNull(),
  phone1: text('phone1').notNull(), // Required
  phone2: text('phone2'),           // Optional
  phone3: text('phone3'),           // v5.0 G46: Optional third contact number
  isArchived: integer('is_archived').default(0).notNull(),
  isActive: integer('is_active').default(0).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
	

FIRM CODE FIELD — IDENTITY LAYER
firmCode is user-assigned (max 10 chars, alphanumeric + hyphen/underscore).
Used for: Barcode tags (Phase 2), firm identification, audit display.
Rules: Required, unique, immutable after creation.
Immutability enforced at BOTH service layer AND database layer.
Service layer: no updateFirmCode() method exists in firmService.ts.
Database layer: a BEFORE UPDATE OF firm_code trigger (in migration zero — 0000_*.sql, added manually per post-generate-checklist.md ACTION 5 — v7.14 FIX-V714-2: stale 0001_add_firm_code_trigger.sql filename removed) raises FIRM_CODE_IMMUTABLE at the SQLite engine level.
A FIRM_CODE_SET audit event is written at firm creation inside the same transaction.
	

writer_leases Schema — v2.4 Gap Resolution G04
// db/schema.ts (writer_leases)
export const writerLeases = sqliteTable('writer_leases', {
  id: text('id').primaryKey(), // UUID — NOT an integer singleton
  leaseType: text('lease_type').notNull(), // LeaseType enum: RESTORE | BACKUP | WRITE
  firmId: text('firm_id'), // nullable — RESTORE leases are firm-agnostic
  acquiredAt: text('acquired_at').notNull(), // ISO-8601
  expiresAt: text('expires_at').notNull(), // ISO-8601 — extended by heartbeat
  deviceId: text('device_id').notNull(), // UUID from deviceId util
});


export const LeaseType = {
  RESTORE: 'RESTORE',
  BACKUP: 'BACKUP',
  WRITE: 'WRITE', // reserved for Phase 2 bulk-write operations — DO NOT ACQUIRE IN PHASE 1, no implementation exists
} as const;
	

financial_years Schema — v2.4 Gap Resolution G05
// db/schema.ts (financial_years)
export const financialYears = sqliteTable('financial_years', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id').notNull(), // FK → firms.id
  label: text('label').notNull(), // e.g. 'FY 2025-26'
  startDate: text('start_date').notNull(), // ISO date e.g. '2025-04-01'
  endDate: text('end_date').notNull(), // ISO date e.g. '2026-03-31'
  status: text('status').notNull(), // FYStatus enum: ACTIVE | CLOSED
  createdAt: text('created_at').notNull(), // ISO-8601
});


export const FYStatus = { ACTIVE: 'ACTIVE', CLOSED: 'CLOSED' } as const;


// v7.5 UQ-ACTIVE-FY-CONSTRAINT: Partial unique index — add to migration zero SQL.
// ⚠️ DEVELOPER ACTION REQUIRED: Drizzle ORM cannot generate partial unique indexes.
// After npx drizzle-kit generate, manually add this SQL to the migration file:
CREATE UNIQUE INDEX uq_one_active_fy_per_firm
ON financial_years(firm_id) WHERE status = 'ACTIVE';
// This is a CONSTITUTIONAL INVARIANT. Two simultaneously ACTIVE FYs per firm are
// structurally impossible with this index. The verifyService MULTIPLE_ACTIVE_FY check
// (G63) is detection. This index is prevention. Both layers are required. Verify at PR.

// v7.5 RESOLVE-TRANSACTION-FYID: Constitutional FY resolution function.// CANONICAL FILE: services/fyService.ts — import from '@/services/fyService'.// v7.8 FIX-V78-3: This code block is shown here in Step 2 for schema cross-reference only.// The authoritative implementation and canonical location is services/fyService.ts (see Step 5).// Do NOT implement this function in schema.ts or db/schema.ts. Do NOT import it from '@/db'.// v7.22 FIX-V722-2: resolveTransactionFyId() correctly uses await db.select() here because it is a// standalone async function called OUTSIDE any db.transaction() callback. This is NOT a violation// of the REPOSITORY SYNC CONTRACT (which applies only inside synchronous JSI tx callbacks).// The two patterns are distinct: outer async function (await ok) vs JSI tx callback (await forbidden).
// All Phase 3+ write services MUST use this — never getActiveFY() — for fyId assignment.
export async function resolveTransactionFyId(
  firmId: string, entryDate: string  // entryDate: ISO date 'YYYY-MM-DD'
): Promise<string> {  // returns fyId string
  const match = await db.select().from(financialYears).where(
    and(
      eq(financialYears.firmId, firmId),
      eq(financialYears.status, FYStatus.ACTIVE),
      lte(financialYears.startDate, entryDate),
      gte(financialYears.endDate, entryDate),
    )
  ).limit(1);
  if (!match.length) throw new Error('ENTRY_DATE_IN_CLOSED_FY');
  return match[0].id;
}
	

audit_logs Schema — v2.5 G12 + v3.0 G39 (entityId added)
IMMUTABILITY RULES
IMMUTABILITY RULES (v2.7 DB Trigger · v7.10 RETENTION-GATED)


✓ No UPDATE method exists on audit_logs table.
✓ No ad-hoc UPDATE/DELETE path exists. The ONLY DELETE on audit_logs is the gated monthly purgeExpiredAuditLogs() job (v7.10).
✓ Every write operation produces an audit entry inside the same transaction.
✓ Audit entries include: eventType, firmId, deviceId, timestamp, payload (JSON).
✗ Audit log cannot be cleared via any UI action.
⚠ v7.10: rows older than auditRetentionDays (default 30) are hard-deleted monthly by a gated background job. No user, screen, or button can invoke this directly or change the cutoff outside Settings.
✗ Audit log cannot be filtered out of backups.


v2.7 STRUCTURAL ENFORCEMENT: A SQLite trigger on audit_logs raises ABORT on any UPDATE, identical to the firmCode trigger pattern. v7.10: the DELETE trigger is now gated — it ABORTs unless audit_delete_gate.gate_open = 1, which only purgeExpiredAuditLogs() ever sets, and only for the duration of its own transaction. No UI action or other code path can open the gate.
	

// db/schema.ts (audit_logs)
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), // UUID
  eventType: text('event_type').notNull(), // e.g. 'FIRM_CREATED'
  firmId: text('firm_id'), // nullable: device-level events have no firm
  entityId: text('entity_id'), // nullable — traceability (v3.0 G39)
  deviceId: text('device_id').notNull(), // UUID from deviceId util
  payload: text('payload'), // JSON string — event-specific data, nullable
  createdAt: text('created_at').notNull(), // ISO-8601
});


// v7.10 AUDIT-RETENTION-MONTHLY: canonical schema.ts export — referenced by purgeExpiredAuditLogs() (AUDIT-RETENTION-MONTHLY, v7.10).
export const auditDeleteGate = sqliteTable('audit_delete_gate', {
  id: integer('id').primaryKey().default(1),
  gateOpen: integer('gate_open').notNull().default(0),
});
// Seed row (migration zero, point 1 — v7.13 FIX-V713-3: corrected from 'point 3', which is the app_settings seed, not this table's): INSERT INTO audit_delete_gate (id, gate_open) VALUES (1, 0);


// IMMUTABILITY CONTRACT:
// auditRepository exposes exactly two methods:
// log(tx | null, entry): insert a new audit row.
// hasEvent(eventType): boolean read — used by Device ID Phase B bootstrap.
// tx = null is permitted ONLY for RESTORE_OLD_SCHEMA + DEVICE_ID_GENERATED + BACKUP_CREATED (see G41).


// v2.7 SQLite triggers:
// CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_logs
//   BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be changed'); END;
// v7.10 AUDIT-RETENTION-MONTHLY: prevent_audit_delete is now a GATED trigger, not a blanket ABORT.
// DELETE is permitted exactly once, via the gated purgeExpiredAuditLogs() job (AUDIT-RETENTION-MONTHLY, v7.10).
// No UI action and no other code path can ever delete a row. See audit_delete_gate table (Step 2).
// CREATE TABLE audit_delete_gate (id INTEGER PRIMARY KEY DEFAULT 1, gate_open INTEGER NOT NULL DEFAULT 0);
// CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_logs
// BEGIN SELECT CASE WHEN (SELECT gate_open FROM audit_delete_gate WHERE id = 1) = 0
//   THEN RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be deleted outside the retention job') END; END;
	

app_settings Schema — v2.5 Gap Resolution G13
// db/schema.ts (app_settings)
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey().default(1), // Single row
  theme: text('theme').notNull().default('system'),
  auditRetentionDays: integer('audit_retention_days').notNull().default(30), // v7.10: was 365
  auditRetentionLastRunAt: text('audit_retention_last_run_at'), // v7.10: nullable ISO-8601
  currency: text('currency').notNull().default('INR'),           // v6.2 G67: Indian Rupee — read-only, not user-changeable
  currencySymbol: text('currency_symbol').notNull().default('₹'), // v6.2 G67: ₹ symbol
  currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2), // v6.2 G67: paise = 2dp
  dateFormatToken: text('date_format_token').notNull().default('dd/MM/yyyy'), // v6.2 G68: replaces dateFormat — canonical date-fns v3 format token (lowercase dd/yyyy)
  warnUnsavedChanges: integer('warn_unsaved_changes').notNull().default(1), // v6.2 G69: 1=ON, 0=OFF
  updatedAt: text('updated_at').notNull(), // ISO-8601
});
	

bis_logos Table & bisLogoRepository — v2.9 Gap B Fix
Gap B Closed: bisLogoRepository Was Called But Never Defined


updateFirm() calls bisLogoRepository.archive(tx, bisLogoRef). No table schema or repository method existed.
v2.9 defines the bis_logos table, its Drizzle schema, and the archive() method contract.
bis_logos is a Phase 1 table — it must be added to migration zero CREATE TABLE order.
Updated migration zero table order: safe_mode_state, app_settings, firms, financial_years, writer_leases, audit_logs, bis_logos.
	

// db/schema.ts (bis_logos) — v2.9
export const bisLogos = sqliteTable('bis_logos', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id').notNull(), // FK → firms.id
  fileRef: text('file_ref').notNull(), // expo-file-system URI
  isArchived: integer('is_archived').notNull().default(0), // 0=active, 1=archived
  archivedAt: text('archived_at'), // ISO-8601, null while active
  archivedReason: text('archived_reason'), // e.g. 'licence_removed'
  createdAt: text('created_at').notNull(), // ISO-8601
});




// db/schema.ts — schemaVersion (v6.1 G66: Drizzle export added)
// Required by verifyService. Without this export, build fails under strict: true.
export const schemaVersion = sqliteTable('schema_version', {
  id:             integer('id').primaryKey().default(1), // Single row: id always = 1
  currentVersion: integer('current_version').notNull(),  // Must match SCHEMA_VERSION constant
});


// Import this export wherever verifyService calls db.select().from(schemaVersion)
// repositories/bisLogoRepository.ts — archive(): soft-delete a BIS logo.
// Called by firmService.updateFirm() when BIS licence is cleared.
// The file on disk is NOT deleted — only the DB record is marked archived.
export function archive(tx: DrizzleTransaction, bisLogoId: string, reason = 'licence_removed'): void {
  tx.update(bisLogos)
    .set({ isArchived: 1, archivedAt: new Date().toISOString(), archivedReason: reason })
    .where(eq(bisLogos.id, bisLogoId));
}
// v6.6 BUG FIX: findActiveByFirmId() added to bisLogoRepository.
// Required by updateFirm() to get the UUID id of the active bis_logo row
// before calling archive(). Passing bisLogoRef (URI) to archive() is WRONG.
export function findActiveByFirmId(
  tx: DrizzleTransaction, firmId: string
): typeof bisLogos.$inferSelect | undefined {
  const rows = tx.select().from(bisLogos)
    .where(and(eq(bisLogos.firmId, firmId), eq(bisLogos.isArchived, 0)))
    .limit(1);
  return rows[0];
}
	Migration Zero Contract (v5.0)
Migration Zero Contract (v5.0: firmLogoRef + phone3 added to firms)


(1) CREATE TABLE statements for all 15 Phase 1 tables in schema dependency order: safe_mode_state, app_settings, firms, financial_years, writer_leases, audit_logs, audit_delete_gate, bis_logos, schema_version, tax_rates, tax_groups, tax_group_components, sync_devices, sync_log, audit_archive_index. (tax_rates, tax_groups, tax_group_components added v6.9 GST-TAXMASTER — SCHEMA ONLY, Phase 3 boundary gate applies. sync_devices and sync_log added v7.3 SYNC-FOUNDATION. audit_archive_index added v7.4 AUDIT-ARCHIVE. audit_delete_gate added v7.10 AUDIT-RETENTION-MONTHLY — single-row gate table, no FK dependencies. Seed row (v7.13 FIX-V713-3: stated explicitly here — previously only cross-referenced, and incorrectly, as "point 3"): INSERT INTO audit_delete_gate (id, gate_open) VALUES (1, 0). No FK dependencies between sync/archive/gate tables and other Phase 1 tables — they append safely at end.)


(2) INSERT INTO safe_mode_state (id, is_active) VALUES (1, 0) — first-boot seed row.


(3) INSERT INTO app_settings (id, date_format_token, theme, audit_retention_days, audit_retention_last_run_at, currency, currency_symbol, currency_decimal_places, warn_unsaved_changes, updated_at) VALUES (1, 'dd/MM/yyyy', 'system', 30, NULL, 'INR', '₹', 2, 1, datetime('now')) — first-boot seed row. v6.2 G67+G68+G69: currency, date format token, and warn_unsaved_changes added. v7.10: audit_retention_days default 365→30; audit_retention_last_run_at added, seeded NULL so the first boot always triggers the initial purge check. NOTE: token is date-fns v3 casing (dd/MM/yyyy) — NOT moment.js style (DD/MM/YYYY).


(4) Drizzle auto-generates CREATE TABLE statements from schema.ts. Seed INSERTs must be hand-authored inside the migration file.


(5) The safe_mode_state seed row (id=1, is_active=0) is the first-boot contract that prevents a missing-row crash on initial bootstrap.


(6) bis_logos has no seed rows. It starts empty and is populated when users upload BIS logos.


(7) v5.0: firms table CREATE TABLE must include firm_logo_ref TEXT (nullable) and phone3 TEXT (nullable) columns.
(8) v6.0 G64: schema_version table added. Single-row (id=1, current_version=1). CREATE TABLE schema_version (id INTEGER PRIMARY KEY DEFAULT 1, current_version INTEGER NOT NULL); INSERT INTO schema_version (id, current_version) VALUES (1, 1). Updated table order: safe_mode_state, app_settings, firms, financial_years, writer_leases, audit_logs, bis_logos, schema_version. Read by verifyService to detect DB-vs-app schema mismatch at runtime. Do NOT confuse with the SCHEMA_VERSION TypeScript constant — that is the app-side expectation; this table stores the DB-side reality. v7.3 SYNC-FOUNDATION: Final table order is safe_mode_state, app_settings, firms, financial_years, writer_leases, audit_logs, bis_logos, schema_version, sync_devices, sync_log, audit_archive_index. sync_devices, sync_log, and audit_archive_index have no FK references to other Phase 1 tables and safely append at end. ⚠ v7.12 FIX-V712-2: this "Final table order" wording is historical (accurate as of v7.3, before audit_delete_gate existed) — the current authoritative 15-table order is point (1) above.
(9) v7.7 MIGRATION ZERO INDEX CHECKLIST — DEVELOPER ACTION REQUIRED: All indexes below must be manually added to the generated migration zero SQL file after npx drizzle-kit generate. Drizzle ORM does not auto-generate index DDL. Add to scripts/post-generate-checklist.md (v7.7). All indexes use CREATE INDEX IF NOT EXISTS.
-- writer_leases (every write in system — most-called query)CREATE INDEX IF NOT EXISTS idx_writer_leases_expires ON writer_leases(expires_at);-- audit_logs (every write + boot verify + audit screen)CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_date ON audit_logs(firm_id, created_at DESC);CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, firm_id);-- financial_years (resolveTransactionFyId + verify + FY_TRANSITION_BANNER)CREATE INDEX IF NOT EXISTS idx_financial_years_firm_status ON financial_years(firm_id, status);CREATE INDEX IF NOT EXISTS idx_financial_years_firm_dates ON financial_years(firm_id, start_date, end_date);-- firms (firm manager + countActiveFirms)CREATE INDEX IF NOT EXISTS idx_firms_archived ON firms(is_archived, firm_id);-- bis_logos (findActiveByFirmId — called inside updateFirm)CREATE INDEX IF NOT EXISTS idx_bis_logos_firm_active ON bis_logos(firm_id, is_archived);-- tax tables (Phase 3 calculateInvoice — define now, dormant until Phase 3)CREATE INDEX IF NOT EXISTS idx_tax_rates_firm_active ON tax_rates(firm_id, is_active);CREATE INDEX IF NOT EXISTS idx_tax_groups_firm_active ON tax_groups(firm_id, is_active);CREATE INDEX IF NOT EXISTS idx_tax_group_components_group ON tax_group_components(tax_group_id);CREATE INDEX IF NOT EXISTS idx_tax_group_components_rate ON tax_group_components(tax_rate_id);-- dormant sync/archive tables (Future Sync Phase + Phase 2 FY close)CREATE INDEX IF NOT EXISTS idx_sync_log_firm_date ON sync_log(firm_id, created_at DESC);CREATE INDEX IF NOT EXISTS idx_sync_devices_firm ON sync_devices(firm_id, is_enabled);CREATE INDEX IF NOT EXISTS idx_audit_archive_firm_fy ON audit_archive_index(firm_id, fy_id);
	

________________




STEP
3
	FIRM MASTER
Identity creation with Dual Guard + Race Condition Fix + FIRM_CODE_SET audit event
	

3-Firm Race Condition Fix
3-Firm Race Condition Fix
Problem: In v2.0, countFirms() was called BEFORE the transaction. Two simultaneous createFirm() calls could both read count=2 and both proceed → 4 firms created.


Fix: Move count check INSIDE db.transaction(). SQLite serializes transactions — now atomic.
The lease guard alone is insufficient: two sequential calls can each acquire their own lease.
	

FIRM_CODE_SET Idempotency — Why Double-Write is Structurally Impossible


createFirm() has NO retry logic. The entire function is wrapped in a single db.transaction(). If ANY step fails — including the audit write — the whole transaction rolls back atomically.


At the caller level, any retry after a transient failure ALWAYS generates a new firm UUID. This makes double-write structurally impossible: a second call creates a new firm with a new ID.
	

CreateFirmInput — v5.0 (phone3 added)
🆕 NEW
v5.0 · G46 — CreateFirmInput Updated


phone3: string (optional) added to CreateFirmInput.
firmLogoRef: string | null (optional) added to CreateFirmInput.
phone1 remains required. phone2 and phone3 are optional.
	

// types/firm.ts
export type CreateFirmInput = {
  name: string;
  firmCode: string;
  proprietor: string;
  gstin?: string;
  bisLicence?: string;
  bisLogoRef?: string | null;
  firmLogoRef?: string | null; // v5.0 G45: firm brand logo URI
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateCode: string; // v7.0 G70: 2-digit GST state code (from INDIAN_STATES)
  stateName: string; // v7.0 G70: display name e.g. ‘Maharashtra’
  pincode: string;
  phone1: string;           // Required
  phone2?: string | null;   // Optional
  phone3?: string | null;   // v5.0 G46: Optional third contact number
};
	

// services/firmService.ts
export async function createFirm(input: CreateFirmInput): Promise<Firm> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode(); // GUARD 2
  if (input.gstin) validateGSTIN(input.gstin);  // v7.0 G70: GSTIN ↔ stateCode cross-validation  if (input.gstin && input.gstin.substring(0, 2) !== input.stateCode) {    throw new Error(`GSTIN_STATE_MISMATCH: GSTIN state code ${input.gstin.substring(0,2)} does not match firm stateCode ${input.stateCode}`);  }  validatePincode(input.pincode); // v7.0 G70: 6-digit numeric
  validateFirmCode(input.firmCode); // max 10 chars, alphanumeric + hyphen/underscore  // v7.24 FIX-V724-2: sanitize all free-text string inputs before persistence (FIX-VSEC-7)  // import { sanitizeText } from '@/utils/sanitize';  const sanitizedName = sanitizeText(input.name);  const sanitizedProprietor = sanitizeText(input.proprietor);  const sanitizedAddressLine1 = sanitizeText(input.addressLine1);  const sanitizedCity = sanitizeText(input.city);  const sanitizedBisLicence = input.bisLicence ? sanitizeText(input.bisLicence) : input.bisLicence;
  // v7.16 FIX-V716-3: JSI driver requires synchronous tx callback — async removed  return db.transaction((tx) => {
    // RACE CONDITION FIX: count check is INSIDE the transaction (atomic)
    const existing = firmRepository.countFirms(tx);
    if (existing >= 3) throw new Error('MAX_FIRMS_REACHED');
    // v7.24 FIX-V724-2: use sanitized values for free-text fields (FIX-VSEC-7)    const firm = firmRepository.insert(tx, { ...input, name: sanitizedName, proprietor: sanitizedProprietor, addressLine1: sanitizedAddressLine1, city: sanitizedCity, bisLicence: sanitizedBisLicence, id: uuid() });
    fyRepository.insertInitial(tx, firm.id); // Repository, not service
    auditRepository.log(tx, { eventType: 'FIRM_CREATED', firmId: firm.id });
    // v2.4 G06 + Review Item 11: FIRM_CODE_SET — permanent record of firmCode assignment
    auditRepository.log(tx, {
      eventType: 'FIRM_CODE_SET', firmId: firm.id,
      payload: JSON.stringify({ firmCode: firm.firmCode, assignedAt: new Date().toISOString() }),
    });
    return firm;
  });
}
	

GSTIN Validation — Formal Specification
validateGSTIN() Definition


GSTIN is a 15-character string with a defined structure and Luhn-variant checksum.
Validation MUST check all of the following:
  1. Length: exactly 15 characters.
  2. State Code: chars 1-2 must be a valid GST state code — one of the 39 codes in VALID_STATE_CODE_SET (01–38 excluding unused code 25, plus 97 Other Territory and 99 Centre Jurisdiction).
  3. PAN Segment: chars 3-12 must match [A-Z]{5}[0-9]{4}[A-Z]{1}.
  4. Entity Number: char 13 must be 1-9 or A-Z.
  5. Default Z: char 14 is always 'Z' in standard GSTINs.
  6. Check Digit: char 15 is a Luhn mod-36 checksum over chars 1-14.
Throw INVALID_GSTIN with the specific failed rule for auditability.
	

// utils/validateGSTIN.ts
import { VALID_STATE_CODE_SET } from '@/utils/indianStates'; // v7.0 FIX: single source of truth — derived from INDIAN_STATES (39 codes: 01-38 excl. 25, plus 97 and 99)
// Deleted: hardcoded Set(['01',...,'25',...,'38']) — code 25 was never a GST code (TIN-era only).
// UPGRADE NOTE (v7.0 → v7.1): If upgrading from v7.0 code, delete the hardcoded VALID_STATE_CODES
// Set in validateGSTIN.ts — it is replaced by VALID_STATE_CODE_SET imported from indianStates.ts.
// Codes 97 (Other Territory) and 99 (Centre Jurisdiction) are now included via VALID_STATE_CODE_SET.

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;


export function validateGSTIN(gstin: string): void {
  if (!gstin || gstin.length !== 15) throw new Error('INVALID_GSTIN: must be 15 characters');
  const upper = gstin.toUpperCase();
  if (!VALID_STATE_CODE_SET.has(upper.slice(0,2)))
    throw new Error('INVALID_GSTIN: invalid state code');
  if (!GSTIN_PATTERN.test(upper))
    throw new Error('INVALID_GSTIN: format mismatch');
  if (!verifyGSTINChecksum(upper))
    throw new Error('INVALID_GSTIN: checksum mismatch');
}


// v5.1 G48: verifyGSTINChecksum() — Full canonical implementation (Luhn mod-36)
// Algorithm: chars '0'-'9' = values 0-9, 'A'-'Z' = values 10-35.
// Even positions (1-indexed 2,4,6...14) are doubled; if result >= 36, subtract 35.
// Sum all 14 values. Expected check digit = (36 - (sum mod 36)) mod 36.
// Verified: 27AAPFU0939F1ZV → sum=221 → (36-5)%36=31 → 'V'. ✓
export function verifyGSTINChecksum(gstin: string): boolean {
  const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let val = CHARSET.indexOf(gstin[i]);
    if (val === -1) return false;
    if ((i + 1) % 2 === 0) { // even position (1-indexed)
      val = val * 2;
      if (val >= 36) val -= 35;
    }
    sum += val;
  }
  const expectedVal = (36 - (sum % 36)) % 36;
  return CHARSET.indexOf(gstin[14]) === expectedVal;
}
	

INDIAN_STATES Constant — Full Implementation (v7.0 G70)// utils/indianStates.ts — v7.0 G70 canonical implementation// Source of truth for all GST state code ↔ name mappings.// UI uses this for the state picker. createFirm() validates stateCode against this set.export const INDIAN_STATES: { code: string; name: string }[] = [  { code: '01', name: 'Jammu & Kashmir' },  { code: '02', name: 'Himachal Pradesh' },  { code: '03', name: 'Punjab' },  { code: '04', name: 'Chandigarh' },  { code: '05', name: 'Uttarakhand' },  { code: '06', name: 'Haryana' },  { code: '07', name: 'Delhi' },  { code: '08', name: 'Rajasthan' },  { code: '09', name: 'Uttar Pradesh' },  { code: '10', name: 'Bihar' },  { code: '11', name: 'Sikkim' },  { code: '12', name: 'Arunachal Pradesh' },  { code: '13', name: 'Nagaland' },  { code: '14', name: 'Manipur' },  { code: '15', name: 'Mizoram' },  { code: '16', name: 'Tripura' },  { code: '17', name: 'Meghalaya' },  { code: '18', name: 'Assam' },  { code: '19', name: 'West Bengal' },  { code: '20', name: 'Jharkhand' },  { code: '21', name: 'Odisha' },  { code: '22', name: 'Chhattisgarh' },  { code: '23', name: 'Madhya Pradesh' },  { code: '24', name: 'Gujarat' },  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },  { code: '27', name: 'Maharashtra' },  { code: '28', name: 'Andhra Pradesh (new)' },  { code: '29', name: 'Karnataka' },  { code: '30', name: 'Goa' },  { code: '31', name: 'Lakshadweep' },  { code: '32', name: 'Kerala' },  { code: '33', name: 'Tamil Nadu' },  { code: '34', name: 'Puducherry' },  { code: '35', name: 'Andaman & Nicobar Islands' },  { code: '36', name: 'Telangana' },  { code: '37', name: 'Andhra Pradesh (residual)' },  { code: '38', name: 'Ladakh' },  { code: '97', name: 'Other Territory' },  { code: '99', name: 'Centre Jurisdiction' },];export const VALID_STATE_CODE_SET = new Set(INDIAN_STATES.map(s => s.code));validateFirmCode() — Full Implementation (v2.9 Gap C Fix)
Gap C Closed: validateFirmCode() Was Called But Never Defined


createFirm() calls validateFirmCode(input.firmCode) but no implementation existed.
Rules: max 10 chars, alphanumeric + hyphen + underscore. Required, non-empty.
Uniqueness is enforced at the DB layer (UNIQUE constraint on firms.firm_code).
validateFirmCode() enforces format only — not uniqueness. DB handles uniqueness.
	

// utils/validatePincode.ts — v7.0 G70 canonical implementation// Indian pincode: exactly 6 digits, numeric only.export function validatePincode(pincode: string): void {  if (!pincode || pincode.trim().length === 0)    throw new Error('INVALID_PINCODE: pincode is required');  if (!/^[0-9]{6}$/.test(pincode))    throw new Error('INVALID_PINCODE: must be exactly 6 digits, numeric only');}// utils/validateFirmCode.ts — v2.9 canonical implementation
const FIRM_CODE_REGEX = /^[A-Za-z0-9_-]{1,10}$/;


export function validateFirmCode(firmCode: string): void {
  if (!firmCode || firmCode.trim().length === 0)
    throw new Error('INVALID_FIRM_CODE: firmCode is required');
  if (firmCode.length > 10)
    throw new Error(`INVALID_FIRM_CODE: maximum 10 characters, got ${firmCode.length}`);
  if (!FIRM_CODE_REGEX.test(firmCode))
    throw new Error('INVALID_FIRM_CODE: only letters, digits, hyphen, underscore allowed');// ================================================================// v7.24 FIX-V724-2 — utils/sanitize.ts CANONICAL IMPLEMENTATION// Strips HTML tags and ASCII control characters from all free-text// service-layer string inputs before DB persistence (FIX-VSEC-7).// Called by: createFirm(), updateFirm(), updateSettings()// ================================================================import { ERR } from '@/constants/errorCodes';export function sanitizeText(input: string): string {  if (typeof input !== 'string') throw new Error(ERR.INVALID_TEXT_CONTENT + ': input must be a string');  const stripped = input    .replace(/<[^>]*>/g, '')          // strip HTML tags    .replace(/[\x00-\x1F\x7F]/g, '') // strip ASCII control characters    .trim();  if (stripped.length === 0 && input.trim().length > 0) {    throw new Error(ERR.INVALID_TEXT_CONTENT + ': input reduced to empty after sanitization');  }  return stripped;}
}
	

________________




STEP
4
	STATUTORY SIGNAL LOCKING
GSTIN presence determines invoice type forever
	

GST-registered firms (GSTIN present) must issue Tax Invoice. Unregistered firms (GSTIN absent) must issue Bill of Supply. This is locked at firm creation and cannot be toggled.


Condition
	Invoice Type
	GSTIN present at firm creation
	Tax Invoice — locked forever
	GSTIN absent at firm creation
	Bill of Supply — locked forever
	GSTIN added after creation
	NOT PERMITTED — statutory signal is immutable
	

BIS Logo State Transition on Firm Edit
BIS Logo State Transition on Firm Edit


1. The BIS logo is soft-deleted (archived, not permanently removed).
2. The BIS logo reference on the firm record is set to null.
3. An audit log entry is written: BIS_LOGO_ARCHIVED (reason: licence_removed).
4. UI shows confirmation dialog before proceeding.


Un-archive path: If the licence is re-added later, the user must re-upload the BIS logo. The archived logo is NOT automatically restored — logos must be re-verified.
	

________________




STEP
5
	FINANCIAL YEAR ENGINE
Indian FY logic with clock skew detection
	

FY auto-creation uses Indian FY boundaries (Apr 1 – Mar 31). Clock skew detection logs WARNING if device year < 2020 or > 2040 but does not block FY creation.


🆕 NEW v7.5 · FY-BOUNDARY-TRANSITION-RULE — Constitutional Rule
Rule: Device date crossing activeFY.endDate does NOT auto-close or auto-create a new FY.
getActiveFY() MUST return the existing ACTIVE FY regardless of the device date. The device clock is a display signal only — it is NOT an FY transition trigger.
When app bootstraps and device date > activeFY.endDate: show a non-blocking yellow dashboard banner: "Financial Year [label] has ended. Close it when ready." with CTA button linking to Settings > Utilities > Close Financial Year. This banner persists until closeFY() is explicitly called. It does NOT block any write operations.
All write operations (invoice, payment, stock, karigar, expense) remain OPEN against the existing ACTIVE FY until closeFY() is explicitly called. Users MAY create backdated entries against the still-ACTIVE old FY. This is the legally correct behaviour — the FY boundary is a business decision, not a calendar event.
⚠️ WHY THIS RULE EXISTS: If the app silently auto-created FY 2026-27 on April 1, a backdated sale for March 15 entered on April 2 would receive fyId = FY-2026-27 and invoice number VJ/26-27/0001 — a statutory GST compliance failure. GSTR-1 requires invoice date and FY prefix to match. Any silent auto-transition that misassigns fyId is a legally reportable error that cannot be undone without a reversal.
Implementation scope: Phase 2 implements the banner UI and closeFY() call. Phase 1 establishes this rule at the constitutional level so no Phase 2 developer can implement auto-transition without violating a named, documented constitutional rule.
	

🆕 NEW v7.5 · RESOLVE-TRANSACTION-FYID — Constitutional Function (Step 5 + Step 2)
resolveTransactionFyId(firmId, entryDate) is a new constitutional service function defined in services/fyService.ts. It finds the FY where entryDate falls within startDate–endDate AND status = 'ACTIVE'. Returns that fyId. If no ACTIVE FY covers the entryDate (entryDate falls in a CLOSED FY), throws ENTRY_DATE_IN_CLOSED_FY. CANONICAL FILE: services/fyService.ts. All Phase 3+ callers MUST import resolveTransactionFyId from '@/services/fyService'. The code block in Step 2 (financial_years schema section) is a cross-reference only — v7.8 FIX-V78-3.
MANDATORY RULE: All Phase 3+ write services (postSaleInvoice, postPurchaseInvoice, recordPayment, postExpense, postStockEntry, karigar issue/return) MUST call resolveTransactionFyId(firmId, input.entryDate) to derive fyId. They MUST NOT use getActiveFY().id for fyId assignment.
Invoice number sequence prefix MUST use the resolved fyId label (e.g. '25-26' from FY 2025-26), not the device-date-active FY. A backdated March 15 entry created on April 2 correctly receives VJ/25-26/XXXX, not VJ/26-27/0001. This is a GSTR-1 statutory compliance requirement.
Error handling: if resolveTransactionFyId throws ENTRY_DATE_IN_CLOSED_FY, the UI must show: "This date belongs to a closed financial year. You cannot add entries to a closed FY. Use a reversal entry to correct prior-period transactions." ENTRY_DATE_IN_CLOSED_FY is added to the constitutional error registry. See the canonical implementation in the financial_years schema section (Step 2).
	

FY CLOSE — SCOPE BOUNDARY (Deferred to Phase 2)
FY CLOSE — SCOPE BOUNDARY (Deferred to Phase 2)
fyService.closeFY() is intentionally deferred to Phase 2.
FY close involves: immutability boundary, counter reset, reporting cutoff, archival.
Phase 1 only creates and opens FYs. Closing is Phase 2 responsibility.
The dual guard pattern (assertNoActiveLease + assertNotInSafeMode) MUST be applied to fyService.closeFY() when implemented. This note ensures Phase 2 cannot omit it.
🆕 v7.6 CLOSE-FY-FLOW: Constitutional UI and service flow for closeFY() (Phase 2 implementation target).
STEP 1 — FY SELECTION SCREEN:
Query: SELECT all financial_years WHERE firmId = activeFirmId AND status = 'ACTIVE'.
Normal case (exactly 1 active FY — guaranteed by uq_one_active_fy_per_firm index): Show the single active FY with its label (e.g. "FY 2025-26"), date range (Apr 1 2025 — Mar 31 2026), and a summary of its data (entry count, last entry date). User confirms "Yes, close FY 2025-26". No picker shown — there is only one option.
Recovery case (verifyService detects MULTIPLE_ACTIVE_FY — should be structurally impossible with the v7.5 index, but handled defensively): Show a list of all active FYs. Prompt: "Multiple active financial years detected. Select which year to close first." User selects one FY from the list. Only one FY may be closed per session. After close, verifyService re-runs automatically.
Zero active FYs case: Show error "No active financial year found. Run Verify My Data to diagnose." Close flow aborted. FY_INTEGRITY_BROKEN Safe Mode is activated.
STEP 2 — PRE-CLOSE CHECKLIST GATE:
Run verifyService.runVerify(firmId) against the selected FY. Result must be HEALTHY or WARNING. CRITICAL result BLOCKS close — user must resolve all CRITICAL findings before proceeding. Display findings in plain language.
STEP 3 — MANDATORY PRE-CLOSE BACKUP (Constitutional Rule):
Before closeFY() executes its immutability operations, createBackup() MUST be called and confirmed successful. This backup is triggered automatically — the user does not need to manually initiate it. The UI shows: "Creating safety backup before closing FY 2025-26..." with a progress indicator.
Backup scope: The .vjb backup file is always a full-DB snapshot (all firms, all FYs, all data). There is no FY-scoped partial backup — the existing createBackup() architecture is whole-DB by design. This is intentional: a partial backup would not capture inter-FY balances and party carry-forwards correctly.
If createBackup() fails: Show error "Backup failed. FY close has been cancelled for safety. Please retry or check available storage." closeFY() MUST NOT proceed. This is non-negotiable — closing without a backup is an irrecoverable data risk.
If createBackup() succeeds: Show backup confirmation with file location and size. If BackupResult.mirroredToPublicStorage is true, additionally show "Also copied to Documents/VJ Billing/backups/"; if false, show no mirror-related text — do not surface an error or warning, since the mirror is best-effort and its absence is not a failure (v7.33 FIX-V733-7). Then proceed to STEP 4.
STEP 4 — FINAL CONFIRMATION AND closeFY() EXECUTION:
Show final confirmation dialog: "FY 2025-26 is about to be permanently closed. This cannot be undone. Backup saved at [path]. Proceed?" with "Close FY" (destructive action button) and "Cancel". User must explicitly tap "Close FY".
On confirm: fyService.closeFY(firmId, fyId) executes with Dual Guard. Sets financial_years.status = 'CLOSED'. Writes FY_CLOSED audit event. Writes audit_archive_index row. Clears the FY-ended dashboard banner.
COMPLETE CLOSE-FY SEQUENCE SUMMARY:
User taps Close Financial Year
  → STEP 1: Query active FYs for firm
       Count = 0  →  FY_INTEGRITY_BROKEN Safe Mode, abort
       Count = 1  →  Show single FY confirmation card (normal path)
       Count > 1  →  Show FY selector list (recovery path)
  → STEP 2: Run verifyService.runVerify(firmId)
       CRITICAL  →  Block. Show findings. "Fix issues before closing."
       HEALTHY/WARNING  →  Proceed
  → STEP 3: createBackup()  [MANDATORY — cannot be skipped]
       FAIL  →  "Backup failed. FY close cancelled." Abort — no close.
       SUCCESS  →  Show backup file path + size. Proceed.
  → STEP 4: Final confirmation dialog → User taps "Close FY"
  → fyService.closeFY(firmId, fyId) [Dual Guard + transaction]
See Phase 2 Step 5.5 for the canonical closeFY() implementation.
🆕 v7.7 AUDIT-RETENTION-ENFORCE (v7.8 FIX-V78-6: per-firmId scope added): Constitutional rule added to Phase 2 closeFY() sequence. After the audit_archive_index row is written, delete audit_logs rows older than auditRetentionDays days (default 365 — stored in app_settings) that do NOT belong to the still-active financial year. MANDATORY SCOPE: deletion MUST be scoped to the firm whose FY is being closed — it MUST NOT delete rows from other firms. Canonical SQL: DELETE FROM audit_logs WHERE firm_id = :closingFirmId AND created_at < datetime('now', '-' || :auditRetentionDays || ' days') AND created_at NOT BETWEEN :activeFyStartDate AND :activeFyEndDate. Without per-firmId scoping, closing Firm A's FY would incorrectly delete eligible rows from Firms B and C that have not yet been closed — a data integrity violation in multi-firm configurations. The :closingFirmId, :activeFyStartDate, and :activeFyEndDate bind parameters are derived from the FY being closed in the same closeFY() transaction. Rows within any ACTIVE FY are never deleted regardless of age. This rule is declared here at Phase 1 constitutional level so Phase 2 cannot omit it. Without enforcement, audit_logs grows unboundedly — at 20 writes/day over 5 years the table reaches 36,500 rows. The IDX-AUDIT-LOGS indexes (added v7.7) make this deletion fast, but the deletion must still fire to keep the table bounded. ⚠ SUPERSEDED BY v7.10 AUDIT-RETENTION-MONTHLY (rule preserved above for history; current behavior below): cadence is no longer tied to closeFY() alone — a gated purgeExpiredAuditLogs() job (AUDIT-RETENTION-MONTHLY, v7.10) runs on app boot whenever ≥30 days have elapsed since auditRetentionLastRunAt, and closeFY() now simply calls the same function. auditRetentionDays default is now 30, not 365. The "never delete active-FY rows" carve-out is removed — deletion is purely time-based, because a 30-day window inside a FY that can stay open 12 months would otherwise almost never fire. The unconditional prevent_audit_delete ABORT trigger — which would have made even this original v7.7 DELETE statement impossible to execute — is replaced by the audit_delete_gate-gated trigger; see IMMUTABILITY RULES box and Step 2 schema.
	

AUDIT-RETENTION-MONTHLY (v7.10 Constitutional Addition): purgeExpiredAuditLogs() — declared inside CLOSE-FY-FLOW (Step 5), implementation target Phase 2 closeFY() Step 5.5
Canonical implementation. Location: services/auditRetentionService.ts. Called from two places only: (1) app bootstrap, non-blocking, after bootstrapComplete; (2) Phase 2 closeFY() Step 5.5, replacing its former bespoke DELETE statement.
import { subDays, differenceInDays, parseISO } from 'date-fns';
import { eq, lt } from 'drizzle-orm';
import db from '@/db';
import { auditLogs, auditDeleteGate, appSettings } from '@/db/schema';
import { assertNoActiveLease } from '@/services/leaseService';
import { assertNotInSafeMode } from '@/services/safeModeService';
import { auditRepository } from '@/repositories/auditRepository';
import { appSettingsStore } from '@/stores/appSettingsStore';


export async function purgeExpiredAuditLogs(): Promise<void> {
  await assertNoActiveLease();   // GUARD 1 — Dual Guard
  assertNotInSafeMode();         // GUARD 2 — Dual Guard
  const { auditRetentionDays } = appSettingsStore.getState();  // default 30
  const cutoff = subDays(new Date(), auditRetentionDays).toISOString();
  // No FY-active carve-out (removed v7.10 FIX-V710-3) — purely time-based.
  // v7.21 FIX-V721-1: `return` removed from db.transaction() — return made appSettingsStore.setState() unreachable dead code; SETSTATE-OUTSIDE-TX COROLLARY requires setState to execute AFTER tx returns  db.transaction((tx) => {
    tx.update(auditDeleteGate).set({ gateOpen: 1 }).where(eq(auditDeleteGate.id, 1));
    const result = tx.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
    tx.update(auditDeleteGate).set({ gateOpen: 0 }).where(eq(auditDeleteGate.id, 1));  // gate closes same tx
    // Purge event is an INSERT — unaffected by the DELETE trigger, stays permanent (G41-style tx=null not used here).
    auditRepository.log(tx, { eventType: 'AUDIT_RETENTION_PURGE_EXECUTED', firmId: null,
      payload: JSON.stringify({ deletedCount: result.changes ?? 0, auditRetentionDays, cutoff, executedAt: new Date().toISOString() }) });
    tx.update(appSettings).set({ auditRetentionLastRunAt: new Date().toISOString() }).where(eq(appSettings.id, 1));
  });
  // v7.20 FIX-V720-2: appSettingsStore.setState moved OUTSIDE db.transaction() callback — SETSTATE-OUTSIDE-TX COROLLARY
  appSettingsStore.setState({ auditRetentionLastRunAt: new Date().toISOString() });
}
Bootstrap integration (boot sequence, after bootstrapComplete.value = true, non-blocking — never delays dashboard render):
const last = appSettingsStore.getState().auditRetentionLastRunAt;
if (!last || differenceInDays(new Date(), parseISO(last)) >= 30) {
  purgeExpiredAuditLogs().catch(console.error);  // fire-and-forget; failures do not block boot
}
closeFY() Step 5.5 amendment: the bespoke per-firmId DELETE statement from v7.7/v7.8 is replaced by a single call to purgeExpiredAuditLogs() (no arguments — it is firm-agnostic by design, since the FY-active carve-out it used to need is gone). This is the fix for the build-blocker: the original statement would have thrown AUDIT_LOG_IMMUTABLE against the v2.7 trigger every time closeFY() ran.


________________




STEP
6
	FIRM ISOLATION
No data leaks across firms. Enforced at repository layer.
	

Every repository method requires firmId parameter. All queries inject WHERE firm_id = ? clause. Firm switch blocked if writer lease active.


ISOLATION ENFORCEMENT RULES
ISOLATION ENFORCEMENT RULES


✓  Repository layer injects WHERE firm_id = ? on every data query.
✓  Service layer passes firmId from the active firm store — never derives it independently.
✓  UI layer never constructs raw queries.
✗  Cross-firm queries are structurally impossible — no method signature allows them.
✗  firmId is never optional in any repository method.
	

________________




STEP
7
	FIRM MANAGER — IDENTITY GOVERNANCE
Central hub: View all firms, Add firm, Switch, Edit, Archive
Firm Manager Capabilities
✓ View All Firms — shows all firms with status badges (Active/Archived). Active firm highlighted.
✓ Add New Firm — create additional firms up to maximum of 3. Button disabled when limit reached.
✓ Switch Active Firm — tap any firm to make it active. Blocked if writer lease active.
✓ Edit Firm Details — name, proprietor, address, contact (phone1/2/3), firmLogoRef. Requires both guards, all changes audited.
✓ Update GSTIN — with re-validation via validateGSTIN() and BIS licence.
✓ Update Logos — firm logo (always available) and BIS logo (only if bisLicence is non-null). BIS logo auto-archived on licence removal.
✓ Archive Firm — soft delete, data preserved. Cannot archive if only 1 firm exists.


🆕 NEW
v5.0 · G47 — Update Logos Screen Rules (EXPLICIT SPECIFICATION)


The Update Logos screen manages TWO distinct logos with DIFFERENT rules:


SECTION 1 — FIRM LOGO:
  • Upload always available regardless of any licence status.
  • No archival logic — simple file reference update.
  • Stored as firmLogoRef on the firms record.
  • Used on: invoice headers, receipts, app display.
  • No BIS_LOGO_ARCHIVED event — firm logo changes write FIRM_UPDATED audit event only.


SECTION 2 — BIS LOGO:
  • Upload ONLY enabled when firm.bisLicence is non-null and non-empty.
  • If bisLicence is absent: BIS logo section shows disabled state with message: 'Add BIS licence number first to enable BIS logo upload.'
  • BIS logo removal triggers soft-delete archival (bisLogoRepository.archive()) + BIS_LOGO_ARCHIVED audit event.
  • BIS licence number displayed alongside BIS logo for verification.


This rule must be enforced at the UI layer: the BIS logo upload button/picker is conditionally disabled based on firm.bisLicence value.
	

🆕 NEW
v5.3 · G58 — Firm Logo Image Picker, Crop & Storage Specification
PICKER:
  • Use expo-image-picker. Both camera and gallery must be available as picker source options.
  • allowsEditing: true — enables in-app crop after image selection.
  • aspect: undefined — FREE crop. Aspect ratio is NOT locked. User can crop to any shape. Do NOT use [1,1] or any fixed ratio.
  • quality: 0.8 compression applied by picker.
  • Accepted MIME types: image/png and image/jpeg only. Reject other types with user-visible error: “Only PNG or JPEG images are accepted.”


POST-PICK PROCESSING (via expo-image-manipulator):
  • If image dimensions exceed 1024×1024: downscale to fit within 1024×1024 preserving aspect ratio. Do NOT upscale images smaller than 1024×1024.
  • Max file size: 2MB. Enforce AFTER manipulator processing. If result exceeds 2MB: reject with user-visible error “Image too large. Please choose a smaller image.” Do NOT silently drop.


STORAGE:
  • Save to: FileSystem.documentDirectory + ‘logos/firm_’ + firmId + ‘.jpg’
  • Path is DETERMINISTIC based on firmId — not a timestamp. On update: overwrite the existing file at the same path. No orphan files created.
  • Ensure logos/ subdirectory exists before write: FileSystem.makeDirectoryAsync(..., { intermediates: true }).
  • Store the resulting local URI in firmLogoRef via updateFirm(). Dual Guard applies. Writes FIRM_UPDATED audit event.
  • Logo file is device-local. It is NOT included in the .vjb backup payload (see G60+G61). Graceful restore handling is specified in G62.
	

🆕 NEW
v5.3 · G59 — Update Logos Screen: Current Logo Thumbnail Display
  • If firmLogoRef is non-null: display current logo as thumbnail (max display size 120×120, object-fit: contain) above the upload button in the FIRM LOGO section.
  • If firmLogoRef is null: show placeholder box with label “No logo uploaded”.
  • Same pattern applies to the BIS LOGO section: thumbnail shown when bisLogoRef is non-null, placeholder shown when null.
  • On image load error (dead URI, file missing): treat as null — show placeholder. Do NOT crash. Do NOT throw. Log console.warn only.
  • Upload button label: “Change Logo” when logo exists. “Upload Logo” when null.
	

Forbidden Actions
✗ Delete Firm — structurally prevented, no delete method exists
✗ Merge Firms — cross-firm data mutation, never in Phase 1
✗ Edit Counters Manually — invoice/receipt counters are sacred
✗ Modify Historical FYs — financial year data is immutable


countFirms() vs countActiveFirms() — Button State Rule (G43)
countFirms() vs countActiveFirms() — Button State Rule (G43)


createFirm() uses countFirms(tx) which counts ALL firms (active + archived). Maximum total = 3.


unarchiveFirm() uses countActiveFirms(tx) which counts WHERE is_archived = 0. Maximum active = 3.


UI 'Add Firm' button disable rule: use countFirms() total (not countActiveFirms()). The maximum is 3 total firms, not 3 active firms.


Example: 2 active + 1 archived = 3 total → Add Firm button is DISABLED.


This matches the createFirm() guard which also counts total. Consistent behavior.
The UI button state must use the same count function as the service guard to prevent UI/service mismatch.
	

Switch Firm Flow
Step
	Action
	1
	User opens Firm Manager screen
	2
	Screen displays all firms with active firm highlighted in gold
	3
	User taps a non-active firm
	4
	System checks: await assertNoActiveLease()
	5
	If lease active → show error: 'Cannot switch firms. [Operation] is in progress.'
	6
	If no lease → show confirmation dialog
	7
	User confirms → firmService.switchFirm(firmId) called (v7.14 FIX-V714-7: layer correction — firmStore.switchFirm() is the Zustand action; firmService.switchFirm() is the service that wraps it with Dual Guard + audit log. The store action is called by the service, not directly by the UI. See canonical implementation below.)
	8
	Audit log: FIRM_SWITCHED event written inside firmService.switchFirm() transaction (DB update sets is_active=1 on target firm, is_active=0 on all others; firmStore.switchFirm(firmId) called after commit; audit written inside tx). Canonical implementation: see firmService.switchFirm() below.
	9
	Zustand state updated: activeFirmId = newFirmId
	10
	Navigation.reset() → Dashboard reloads with new firm context
	v7.14 FIX-V714-7 — firmService.switchFirm() Canonical Implementation (services/firmService.ts)
// v7.14 FIX-V714-7: firmService.switchFirm() canonical implementation.
// Layer rule: stores must not be called by UI for DB+audit ops. Service wraps Dual Guard + tx + audit.
// Imports needed: db from '@/db'; firmsTable, eq from 'drizzle-orm' + schema; auditRepository; firmStore.
export async function switchFirm(firmId: string): Promise<void> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode(); // GUARD 2
  // v7.21 FIX-V721-2: `return` removed from db.transaction() — return made firmStore.getState().switchFirm() unreachable dead code; SETSTATE-OUTSIDE-TX COROLLARY requires store call to execute AFTER tx returns  db.transaction((tx) => {
    const target = tx.select().from(firmsTable).where(eq(firmsTable.id, firmId)).limit(1);
    if (!target.length || target[0].isArchived) throw new Error('FIRM_NOT_FOUND: ' + firmId);
    // Set all firms inactive, then activate target — atomic in one transaction
    tx.update(firmsTable).set({ isActive: 0 });
    tx.update(firmsTable).set({ isActive: 1 }).where(eq(firmsTable.id, firmId));
    auditRepository.log(tx, { eventType: 'FIRM_SWITCHED', firmId,
      payload: JSON.stringify({ switchedToFirmId: firmId, switchedAt: new Date().toISOString() }) });
  });
  // Zustand store updated AFTER transaction commits (setState-outside-tx pattern)
  firmStore.getState().switchFirm(firmId);
}


ARCHIVE FIRM RESTRICTIONS
ARCHIVE FIRM RESTRICTIONS


Cannot archive if only 1 firm exists (app must have at least 1 active firm)
Cannot archive the currently active firm (must switch first)
Archive is soft-delete (isArchived = 1) — data is preserved
Archived firms hidden from most UI but visible in Firm Manager
Un-archive allowed — can reactivate archived firm
firmService.archiveFirm() MUST begin with both guards.
firmService.unarchiveFirm() MUST also begin with both guards.
	

archiveFirm() — Canonical Implementation (v2.6 G19 + v2.7 Fix)
v2.7 Fix: activeFirmId Read from DB (was Zustand)


archiveFirm() previously checked firmStore.getState().activeFirmId from Zustand.
Risk: If Zustand is stale during bootstrap (Safe Mode active, partial load), the check could pass incorrectly.
v2.7 Fix: Read activeFirmId from DB inside the transaction using firmRepository.getActiveFirmId(tx).
This makes the guard fully atomic and immune to Zustand bootstrap timing.
// services/firmService.ts
export async function archiveFirm(firmId: string): Promise<void> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode(); // GUARD 2
  // v7.16 FIX-V716-3: JSI driver requires synchronous tx callback — async removed  return db.transaction((tx) => {
    const activeCount = firmRepository.countActiveFirms(tx);
    if (activeCount <= 1) throw new Error('LAST_FIRM: cannot archive the only active firm');
    const firm = firmRepository.findById(tx, firmId);
    if (!firm) throw new Error('FIRM_NOT_FOUND');
    // v2.7 FIX: Read activeFirmId from DB inside transaction, not from Zustand
    const activeFirmId = firmRepository.getActiveFirmId(tx);
    if (firmId === activeFirmId) throw new Error('CANNOT_ARCHIVE_ACTIVE_FIRM: switch first');
    firmRepository.archive(tx, firmId);
    auditRepository.log(tx, { eventType: 'FIRM_ARCHIVED', firmId,
      payload: JSON.stringify({ archivedAt: new Date().toISOString() }) });
  });
}
	

unarchiveFirm() — Canonical Implementation (v2.5 G15)
// services/firmService.ts
export async function unarchiveFirm(firmId: string): Promise<Firm> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode(); // GUARD 2
  // v7.16 FIX-V716-3: JSI driver requires synchronous tx callback — async removed  return db.transaction((tx) => {
    // v2.5 G15: 3-FIRM ACTIVE LIMIT CHECK — must be inside transaction (atomic)
    const activeCount = firmRepository.countActiveFirms(tx); // WHERE is_archived = 0
    if (activeCount >= 3) throw new Error('MAX_FIRMS_REACHED: unarchive would exceed 3 active firms');
    const updated = firmRepository.unarchive(tx, firmId);
    auditRepository.log(tx, { eventType: 'FIRM_UNARCHIVED', firmId,
      payload: JSON.stringify({ unarchivedAt: new Date().toISOString() }) });
    return updated;
  });
  // NOTE: countActiveFirms(tx) queries WHERE is_archived = 0.
  // countFirms(tx) used in createFirm() counts ALL firms.
  // These are DISTINCT queries — use countActiveFirms() here, not countFirms().
}
	

updateFirm() — Canonical Implementation v5.0 (phone3 + firmLogoRef)
🆕 NEW
v5.0 · G45+G46 — UpdateFirmInput Updated


phone3: string | null (optional) added — allows setting/clearing third contact number.
firmLogoRef: string | null (optional) added — allows setting/clearing firm brand logo.
Both are standard nullable fields — no special archival logic required.
firmCode and gstin remain EXCLUDED (immutable post-creation).
	

// types/firm.ts
export type UpdateFirmInput = {
  name?: string;
  proprietor?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateCode?: string; // v7.0 G70: 2-digit GST state code (from INDIAN_STATES)
  stateName?: string; // v7.0 G70: display name e.g. ‘Maharashtra’
  pincode?: string;
  phone1?: string;
  phone2?: string | null;
  phone3?: string | null;       // v5.0 G46: Optional third contact number
  bisLicence?: string | null;
  bisLogoRef?: string | null;   // v2.7: must be declared for BIS archival logic
  firmLogoRef?: string | null;  // v5.0 G45: firm brand logo URI
  // firmCode and gstin are EXCLUDED — they are immutable post-creation
  // v7.9 FIX-V79-5 — stateCode update behaviour:
  //   If firm has NO gstin (Bill of Supply): stateCode can be freely updated — no cross-validation runs.
  //   If firm HAS a gstin: stateCode cannot be updated independently.
  //   gstin is immutable; GSTIN-stateCode consistency was enforced at createFirm() time only.
  //   If stateCode is passed for a firm WITH a gstin, updateFirm() MUST throw GSTIN_STATE_UPDATE_BLOCKED.
};


// services/firmService.ts
export async function updateFirm(firmId: string, input: UpdateFirmInput): Promise<Firm> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode(); // GUARD 2
  if ('firmCode' in input) throw new Error('FIRM_CODE_IMMUTABLE: firmCode cannot be changed after creation');
  if ('gstin' in input) throw new Error('GSTIN_IMMUTABLE: GSTIN cannot be modified after creation');
  // v7.14 FIX-V714-3: stateCode guard — required by FIX-V79-5 specification but missing from canonical code.
  // FIX-V79-5 rule: if firm has a gstin, stateCode cannot be changed independently (GSTIN prefix already encodes it).
  if ('stateCode' in input) {
    const firmForStateCheck = await db.select().from(firmsTable).where(eq(firmsTable.id, firmId)).limit(1); // v7.22 FIX-V722-2: pre-tx read — TOCTOU window is safe in Phase 1 because firm deletion is structurally impossible (no delete method exists); Phase 2+ must re-fetch firm inside tx if delete semantics change
    if (firmForStateCheck.length === 0) throw new Error('FIRM_NOT_FOUND: ' + firmId);
    if (firmForStateCheck[0].gstin) throw new Error('GSTIN_STATE_UPDATE_BLOCKED: stateCode cannot be changed independently when firm has a GSTIN — GSTIN prefix already encodes stateCode');
  }
  // v7.16 FIX-V716-3: JSI driver requires synchronous tx callback — async removed  return db.transaction((tx) => {
    const existing = firmRepository.findById(tx, firmId);
    if (!existing) throw new Error('FIRM_NOT_FOUND');
    const clearingBisLicence = ('bisLicence' in input) &&
      (input.bisLicence === null || input.bisLicence === '') && !!existing.bisLogoRef; // v5.1 FIX: truthy check covers null AND empty string ''
    if (clearingBisLicence) {
      const bisLogoRow = bisLogoRepository.findActiveByFirmId(tx, firmId); // v6.6 FIX: fetch row to get id (UUID), not bisLogoRef (URI)
      if (bisLogoRow) bisLogoRepository.archive(tx, bisLogoRow.id); // v6.6 FIX: pass UUID id, not URI string
      input = { ...input, bisLogoRef: null };
      auditRepository.log(tx, { eventType: 'BIS_LOGO_ARCHIVED', firmId,
        payload: JSON.stringify({ reason: 'licence_removed' }) });
    }
    const updated = firmRepository.update(tx, firmId, { ...input, updatedAt: new Date().toISOString() });
    auditRepository.log(tx, { eventType: 'FIRM_UPDATED', firmId,
      payload: JSON.stringify({ changes: Object.keys(input) }) });
    return updated;
  });
}
	

________________




STEP
8
	WRITER LEASE — CONCURRENCY GUARD
HARDENING 3: Heartbeat. v2.4: assertNoActiveLease() formally specified.
	

HARDENING 3: LEASE HEARTBEAT MECHANISM
HARDENING 3: LEASE HEARTBEAT MECHANISM
Problem: A backup or restore operation can take longer than the initial TTL.
Solution: A background heartbeat timer extends the lease TTL every 30 seconds.
If app crashes mid-operation → lease expires naturally (no orphan lock).
On app restart → ALL leases are purged (DELETE FROM writer_leases, no WHERE clause).
	

assertNoActiveLease() — Formal Specification (v2.4 G01)


1. Query: SELECT * FROM writer_leases WHERE expires_at > datetime('now') LIMIT 1.
2. If row found: throw Error('LEASE_HELD: {leaseType} operation in progress').
3. If no row: return void (proceed).
4. This is always a DB read — Zustand state is NOT consulted. DB is source of truth for lease status.
5. On throw: the error message includes the leaseType so UI can show '[Backup/Restore] is in progress'.
	

v2.7 Fix: leaseRepository.extendTTL() Must Handle Missing Lease Gracefully


Scenario: App is backgrounded during an active lease. Heartbeat fires after the lease was purged on restart (or expired).
leaseRepository.extendTTL(leaseId, newExpiresAt) must execute UPDATE ... WHERE id = leaseId.
If no row matches (lease was purged), the UPDATE affects 0 rows. This is a NO-OP — do NOT throw.
v2.7 Fix: extendTTL() must check affected rows count. If 0, log a warning and stop the heartbeat timer.
Implementation: if (result.changes === 0) { stopLeaseHeartbeat(); console.warn('Lease gone — heartbeat stopped'); }
	

// services/leaseService.ts
let heartbeatTimer: ReturnType<typeof setInterval> | null = null; // MODULE-LEVEL singleton


export async function assertNoActiveLease(): Promise<void> {
  const activeLease = await db
    .select().from(writerLeases)
    .where(sql`${writerLeases.expiresAt} > datetime('now')`)
    .limit(1);
  if (activeLease.length > 0) {
    throw new Error(`LEASE_HELD: ${activeLease[0].leaseType} operation in progress`);
  }
}


// v2.8 FIX: Zustand setState moved OUTSIDE transaction
export async function acquireLease(type: LeaseType, firmId?: string): Promise<string> {
  // v6.5 GAP 5 FIX: Runtime guard — LeaseType.WRITE has no Phase 1 implementation
  if (type === LeaseType.WRITE) throw new Error('WRITE_LEASE_NOT_IMPLEMENTED: LeaseType.WRITE is reserved for Phase 2. Do not acquire in Phase 1.');
  await assertNoActiveLease();
  const leaseId = uuid();
  const expiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();
  // v7.16 FIX-V716-4: JSI driver requires synchronous tx callback — async removed  db.transaction((tx) => {
    leaseRepository.insert(tx, { id: leaseId, leaseType: type, firmId, // v7.20 FIX-V720-1: await stripped — REPOSITORY SYNC CONTRACT
      acquiredAt: now(), expiresAt, deviceId: getDeviceId() });
  });
  leaseStore.setState({ activeLease: { id: leaseId, type } }); // AFTER transaction commits
  startLeaseHeartbeat(leaseId);
  return leaseId;
}
	

Constants, Zustand Stores & Helper Functions — v5.1 (M1 + S2 + S3 Fixes)
v5.1 Gap Closures — M1: Constants | S3: Zustand Store Shapes | S2: Helper Function Bodies
M1: Five constants (LEASE_TTL_MINUTES, SCHEMA_VERSION, APP_VERSION, storage, addMinutes) are assigned their canonical values. S3: Three Zustand stores (leaseStore, safeModeStore, firmStore) are defined with full shape, initial state, and MMKV persist config. S2: Six helper functions (releaseLease, startLeaseHeartbeat, stopLeaseHeartbeat, now, loadSafeModeState, validateBackupSchema) have full implementation bodies. All implementations are placed in the code block below.
	

// ================================================================
// constants/leaseConfig.ts — v5.1 M1 Gap Resolution
// ================================================================
export const LEASE_TTL_MINUTES = 5; // Lease expires in 5 minutes; heartbeat extends it


// constants/appVersion.ts — v5.1 M1 Gap Resolution
export const SCHEMA_VERSION = 1;     // Increment when migration zero schema changes
export const APP_VERSION   = '1.0.0'; // Semver string; updated on each release


// utils/now.ts — v5.1 M1 Gap Resolution
// Returns current time as ISO-8601 string. Centralised so tests can mock it.
export function now(): string { return new Date().toISOString(); }


// utils/storage.ts — v5.1 M1 Gap Resolution
// Hybrid MMKV/AsyncStorage adapter used by Zustand persist middleware.
// v7.33 FIX-V733-10 [build-blocker]: react-native-mmkv migrated to v4 (Nitro Module rewrite, project owner decision). Requires react-native-nitro-modules as a peer dependency (npx expo install react-native-mmkv react-native-nitro-modules) and npx expo prebuild — MMKV v4 is native and no longer works in a plain Expo Go managed workflow without a dev client. v4 renamed MMKV.delete() to MMKV.remove() (delete is a reserved keyword in C++); the wrapper below is fixed to call _mmkv.remove(key) internally. The app's own storage.delete(key) method name is intentionally left unchanged — every call site (resetFailedAttempts, PIN_SKIPPED_KEY, post-restore logo check flag) keeps calling storage.delete(...) exactly as before, insulated behind this one wrapper line; only utils/storage.ts itself needed to change.
import { MMKV } from 'react-native-mmkv';
const _mmkv = new MMKV();
export const storage = {
  getString: (key: string): string | undefined => _mmkv.getString(key),
  set:       (key: string, value: string): void  => _mmkv.set(key, value),
  delete:    (key: string): void                 => _mmkv.remove(key), // v7.33 FIX-V733-10: was _mmkv.delete(key) — renamed to .remove() in MMKV v4
};


// utils/addMinutes.ts — v5.1 M1 Gap Resolution
// Re-exports date-fns addMinutes so import source is unambiguous across the codebase.
export { addMinutes } from 'date-fns';


// ================================================================
// stores/leaseStore.ts — v5.1 S3 Gap Resolution
// activeLease is null when no lease is held.
// ================================================================
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
type LeaseSlice = { activeLease: { id: string; type: string } | null };
export const leaseStore = create<LeaseSlice>()(persist(
  () => ({ activeLease: null }),
  { name: 'lease-store', storage: createJSONStorage(() => storage) }
));


// stores/safeModeStore.ts — v5.1 S3 Gap Resolution
// isActive starts false until loadSafeModeState() runs at bootstrap step 5.
type SafeModeSlice = { isActive: boolean; reason: string | null; activatedAt: string | null };
export const safeModeStore = create<SafeModeSlice>()(persist(
  () => ({ isActive: false, reason: null, activatedAt: null }),
  { name: 'safe-mode-store', storage: createJSONStorage(() => storage) }
));


// stores/firmStore.ts — v5.1 S3 Gap Resolution
// activeFirmId: UUID of selected firm, null on first boot.
// switchFirm() persists the change via Zustand + MMKV.
type FirmSlice = { activeFirmId: string | null; switchFirm: (firmId: string) => void };
export const firmStore = create<FirmSlice>()(persist(
  (set) => ({
    activeFirmId: null,
    switchFirm: (firmId: string) => set({ activeFirmId: firmId }),
  }),
  { name: 'firm-store', storage: createJSONStorage(() => storage) }
));


// ================================================================
// stores/appSettingsStore.ts — v6.4 NEW: appSettingsStore defined (BLOCKER A fix)
// Used by: formatDate() (utils/formatDate.ts), getCurrencySymbol() (utils/currency.ts),
// useUnsavedChangesGuard() hook, and updateSettings() service.
// Loaded at bootstrap Step 6 via: appSettingsStore.setState(dbRow)
// ================================================================
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
 
type AppSettingsSlice = {
  theme: string;                 // 'system' | 'light' | 'dark'
  auditRetentionDays: number;    // v7.10: default 30 (was 365)
  auditRetentionLastRunAt: string | null;  // v7.10: ISO-8601, null until first purge runs
  currency: string;              // 'INR' — read-only, never user-changeable (G67)
  currencySymbol: string;        // '₹' (G67)
  currencyDecimalPlaces: number; // 2 — paise (G67)
  dateFormatToken: string;       // default 'dd/MM/yyyy' (G68) — date-fns v3 token
  warnUnsavedChanges: number;    // 1=ON (default), 0=OFF (G69)
  updatedAt: string;             // ISO-8601
};
 
export const appSettingsStore = create<AppSettingsSlice>()(persist(
  () => ({
    theme: 'system',
    auditRetentionDays: 30,   // v7.10: was 365
    auditRetentionLastRunAt: null,  // v7.10: matches DB seed
    currency: 'INR',
    currencySymbol: '₹',
    currencyDecimalPlaces: 2,
    dateFormatToken: 'dd/MM/yyyy', // date-fns v3 token
    warnUnsavedChanges: 1,
    updatedAt: '',
  }),
  { name: 'app-settings-store', storage: createJSONStorage(() => storage) }
));
 
// ================================================================
// services/leaseService.ts additions — v5.1 S2 Gap Resolution
// releaseLease(), startLeaseHeartbeat(), stopLeaseHeartbeat()
// ================================================================
export async function releaseLease(leaseId: string): Promise<void> {
  await db.delete(writerLeases).where(eq(writerLeases.id, leaseId));
  leaseStore.setState({ activeLease: null });
export function startLeaseHeartbeat(leaseId: string): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const intervalMs = Math.floor(LEASE_TTL_MINUTES * 60 * 1000 / 2); // fires at half-TTL
  heartbeatTimer = setInterval(async () => {
    const newExpiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();
    const result = await leaseRepository.extendTTL(leaseId, newExpiresAt);
    if (result.changes === 0) {
      stopLeaseHeartbeat();
      console.warn('Lease gone — heartbeat stopped');
    }
  }, intervalMs);
}


export function stopLeaseHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}


// ================================================================
// services/safeModeService.ts additions — v5.1 S2 Gap Resolution
// loadSafeModeState(): reads safe_mode_state row on bootstrap (step 5).
// Called before bootstrapComplete.value = true.
// ================================================================
export async function loadSafeModeState(): Promise<void> {
  const rows = await db.select().from(safeModeState).limit(1);
  if (rows.length === 0) return;
  const row = rows[0];
  safeModeStore.setState({
    isActive:    row.isActive === 1,
    reason:      row.reason ?? null,
    activatedAt: row.activatedAt ?? null,
  });
}


// ================================================================
// services/restoreService.ts additions — v5.1 S2 Gap Resolution
// validateBackupSchema(): validates envelope before restore begins.
// MUST be called OUTSIDE any transaction (G41 CALL SITE 1).
// ================================================================
export async function validateBackupSchema(backup: BackupEnvelope): Promise<{ warning?: string } | void> {
  // FUTURE schema: backup is newer than this app — block immediately
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `RESTORE_VALIDATION_FAILED: backup schema ${backup.schemaVersion} is newer than app ${SCHEMA_VERSION}. Update the app first.`
    );
  }
  // PAST schema: backup is older — log audit event and warn user, do NOT block
  if (backup.schemaVersion < SCHEMA_VERSION) {
    await auditRepository.log(null, {       // G41 CALL SITE 1: outside transaction
      eventType: 'RESTORE_OLD_SCHEMA',
      firmId: null,
      payload: JSON.stringify({
        backupSchema:  backup.schemaVersion,
        currentSchema: SCHEMA_VERSION,
      }),
    });
    // Warn user — old-schema restore proceeds with user warning


    return { warning: `RESTORE_OLD_SCHEMA: backup v${backup.schemaVersion} < app ${SCHEMA_VERSION}. Proceed with user acknowledgement.` };
  }
}
	________________




STEP
9
	ATOMIC TRANSACTIONS
Crash = rollback. No partial state. Ever.
	

Every critical multi-step operation wrapped in a single SQLite transaction. If any step throws → entire operation rolls back. Applies to: Firm creation, FY creation/close, Backup, Restore, Safe Mode activation.


TRANSACTION SCOPE RULES
TRANSACTION SCOPE RULES


✓  Each service method owns exactly one transaction.
✓  Repositories receive the transaction context (tx) as a parameter.
✓  No service calls another service inside a transaction (see Step 1 pattern).
✓  Guard checks run BEFORE the transaction opens.
✓  Audit log writes are always inside the same transaction as the primary operation.
✗  Transactions are never nested via service calls.
	

________________




STEP
10
	SAFE MODE — FAIL-SAFE SHIELD
HARDENING 2 (CRITICAL): DB persistence. Survives crashes. Locked resolution path.
	

Safe Mode is an app-wide read-only state triggered when a critical integrity check fails. Users can still view data, run backups, export. They cannot write new data until the integrity issue is resolved. Safe Mode cannot be dismissed by tapping — only through a defined resolution path.


Safe Mode Resolution Path — Locked
Safe Mode Resolution Path — Locked


clearSafeMode() is NOT publicly callable. It must NOT be wired to any button or user action.


PATH 1 — Verify Resolution: User triggers Verify My Data → all checks pass → result is HEALTHY → verifyService calls clearSafeMode() internally → Safe Mode clears.


PATH 2 — Restore Resolution: User completes a successful restore (all 11 steps pass) → restoreService calls clearSafeMode() internally after bootstrap.


Any other call to clearSafeMode() is a bug. No UI component, store action, or settings screen may call it directly.
	

Bootstrap Safety: bootstrapComplete Flag is MANDATORY
Bootstrap Safety: bootstrapComplete Flag is MANDATORY (v2.8 BUILD-BLOCKER FIX / G42)


assertNotInSafeMode() reads from Zustand safeModeStore. Zustand is in initial state (isActive: false) until Step 5 loads it from DB.


Calling assertNotInSafeMode() before Step 5 produces a false negative — Safe Mode DB state is not yet reflected.


MANDATORY (not a recommendation): The bootstrapComplete flag MUST be implemented. This is not optional.


Any developer who skips this flag creates a real corruption path: assertNotInSafeMode() silently passes during Steps 0-6.


Implementation: export const bootstrapComplete = { value: false }; — module-level, in safeModeService.ts.


assertNotInSafeMode() MUST check: if (!bootstrapComplete.value) throw new Error('BOOTSTRAP_INCOMPLETE')


This is the same enforcement level as the Dual Guard Pattern. It is a code review gate item.
	

// services/safeModeService.ts
export const bootstrapComplete = { value: false };


export async function activateSafeMode(reason: SafeModeTrigger): Promise<void> {
  // v7.16 FIX-V716-4: JSI driver requires synchronous tx callback — async removed  db.transaction((tx) => {
    safeModeRepository.upsert(tx, { id: 1, isActive: 1, reason,
      activatedAt: new Date().toISOString(), clearedAt: null });
    auditRepository.log(tx, { eventType: 'SAFE_MODE_ACTIVATED',
      payload: JSON.stringify({ reason }) });
  });
  // v7.18 FIX-V718-5: setState moved OUTSIDE tx — prevents Zustand mutation on tx rollback  safeModeStore.setState({ isActive: true, reason, activatedAt: now() });
}


// INTERNAL ONLY — called only by verifyService or restoreService
export async function clearSafeMode(): Promise<void> {
  // v7.16 FIX-V716-4: JSI driver requires synchronous tx callback — async removed  db.transaction((tx) => {
    safeModeRepository.upsert(tx, { id: 1, isActive: 0, reason: null,
      activatedAt: null, clearedAt: new Date().toISOString() });
    auditRepository.log(tx, { eventType: 'SAFE_MODE_CLEARED' });
  });
  // v7.18 FIX-V718-6: setState moved OUTSIDE tx — prevents Zustand mutation on tx rollback  safeModeStore.setState({ isActive: false, reason: null, activatedAt: null });
}


export function assertNotInSafeMode(): void {
  if (!bootstrapComplete.value) {
    throw new Error('BOOTSTRAP_INCOMPLETE: assertNotInSafeMode called before bootstrap finished');
  }
  const { isActive } = safeModeStore.getState();
  if (isActive) throw new Error('SAFE_MODE_ACTIVE: writes are blocked');
}
	

Safe Mode Trigger Conditions
Trigger
	Cause
	RESTORE_VALIDATION_FAILED
	Restore dry-run detected structural issues
	VERIFY_CRITICAL_ISSUE
	Verify My Data found orphaned records or broken references
	MIGRATION_FAILED
	Database schema migration threw on app start
	SCHEMA_VERSION_MISMATCH
	DB schema version ≠ app expected version
	CHECKSUM_MISMATCH
	AES-256-GCM decryption failed during restore — wrong password or tampered file (v7.25 FIX-V725-10)
	FY_INTEGRITY_BROKEN
	Firm has no active FY — data boundary violated
	STORAGE_CORRUPTION_DETECTED
	v7.8 FIX-V78-4 NEW TRIGGER: Critical DB table missing after confirmed migration zero — storage-layer corruption, not an FY problem. Reserved for SAFE-MODE-ROW-GUARD only. Payload: { missingTable: safe_mode_state, schemaVersionConfirmed: true }. FY_INTEGRITY_BROKEN remains reserved exclusively for firms with no active FY.
	________________




STEP
11
	VERIFY MY DATA
HARDENING 6: 3 new integrity checks. Bootstrap WARNING policy added.
	

Verify My Data is a manual integrity check the user can run from Settings, and an automatic check that runs before FY close and after restore. It speaks plain language — no error codes, no jargon.


Checks Performed (v2.0 Expanded)
Check
	What Is Detected
	Orphan FY check
	Financial years with firmId referencing non-existent firm
	Missing FY check
	Firms with no active financial year
	Counter integrity
	Invoice/receipt counters within reasonable bounds — NOTE: No counters exist in Phase 1. This check is a no-op in Phase 1 and becomes active in Phase 2 when invoice/receipt counters are introduced.
	Broken references
	Any foreign key pointing to deleted/missing row
	Firm isolation check
	Scan for any record whose firmId violates isolation
	Audit log continuity
	Audit log sequence has no impossible gaps (same session, same firm, timestamp order)
	Schema version check
	DB schema version matches app expectation
	Multiple active FY (NEW)
	HARDENING 6: Detect > 1 active FY for same firm
	Expired leases (NEW)
	HARDENING 6: Detect expired writer leases still in DB
	Orphan audit logs (NEW)
	HARDENING 6: Detect audit logs with invalid firmId
	

🆕 NEW v6.0 · G63 — verifyService Canonical Implementation
// services/verifyService.ts — v6.0 G63 canonical implementation
export type VerifyStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export interface VerifyFinding {
  check: string;  severity: VerifyStatus;  detail: string;  firmId?: string; // v7.8 FIX-V78-5: structural firmId field for safe filtering — replaces string-matching on detail text
}
export interface VerifyResult {
  status: VerifyStatus;  findings: VerifyFinding[];
}
// v6.7 FIX-V67-4: firmId param added (optional). When provided, filters findings to that firm only.// When absent (all existing Phase 1 call sites), runs globally across all firms.// Phase 2 passes firmId. All Phase 1 call sites (Settings screen, post-restore bootstrap, pre-FY-close gate) pass no firmId — unchanged.// Phase 2 wraps result into its own VerifyIssue[] shape via adapter (see Phase 2 verifyService.runVerify(firmId) wrapper).export async function runVerify(firmId?: string): Promise<VerifyResult> {
  const findings: VerifyFinding[] = [];  // firmId filter: when provided by Phase 2, findings are filtered to that firm at end of function.  // All Phase 1 call sites pass no firmId — global run, all findings returned.
  // 1. Orphan FY check
  const allFirmIds = (await db.select({ id: firms.id }).from(firms)).map(r => r.id);
  const orphanFYs = await db.select().from(financialYears)
    .where(notInArray(financialYears.firmId, allFirmIds));
  if (orphanFYs.length) findings.push({ check: 'ORPHAN_FY', severity: 'CRITICAL',
    detail: `${orphanFYs.length} financial year(s) reference non-existent firms` });
  // 2. Missing FY check
  const activeFirmIds = (await db.select({ id: firms.id }).from(firms)
    .where(eq(firms.isArchived, 0))).map(r => r.id);
  for (const fid of activeFirmIds) {
    const activeFY = await db.select().from(financialYears)
      .where(and(eq(financialYears.firmId, fid), eq(financialYears.status, 'ACTIVE')));
    if (!activeFY.length) findings.push({ check: 'MISSING_FY', severity: 'CRITICAL',
      detail: `Firm ${fid} has no active financial year` });
    if (activeFY.length > 1) findings.push({ check: 'MULTIPLE_ACTIVE_FY', severity: 'CRITICAL',
      detail: `Firm ${fid} has ${activeFY.length} active FYs (max 1)` });
  }
  // 3. Broken references — foreign key audit (firmId on financialYears, auditLogs must reference existing firms)  // Already covered by checks 1 + orphan audit log check. Phase 1 has no additional FK relations beyond these.  // NOTE: This check is structurally satisfied by checks 1 and 6 (orphan FY + orphan audit logs cover all Phase 1 FKs).  // 4. Firm isolation check — scan for any record whose firmId violates isolation  // In Phase 1, all data tables carry firmId. Check: no financialYear row has a firmId not in the active firms list.  const fyFirmIds = (await db.select({ firmId: financialYears.firmId }).from(financialYears)).map(r => r.firmId);  const knownFirmIds = new Set(allFirmIds);  const isolationViolations = fyFirmIds.filter(fid => fid && !knownFirmIds.has(fid));  if (isolationViolations.length) findings.push({    check: 'FIRM_ISOLATION_VIOLATION',    severity: 'CRITICAL',    detail: `${isolationViolations.length} record(s) reference unknown firmId — firm isolation violated`  });  // 5. Audit log continuity — detect impossible timestamp gaps within same firm+session  // Flags WARNING when audit entries for the same firmId have timestamps out of order within a continuous insert run.  // Device-level events (firmId = null) are excluded from gap detection.  const auditRows = await db.select({    firmId: auditLogs.firmId,    createdAt: auditLogs.createdAt,  }).from(auditLogs)    .where(isNotNull(auditLogs.firmId))    .orderBy(auditLogs.firmId, auditLogs.createdAt);  let prevFirmId: string | null = null;  let prevTs: string | null = null;  let continuityViolations = 0;  for (const row of auditRows) {    if (row.firmId === prevFirmId && prevTs && row.createdAt < prevTs) {      continuityViolations++;    }    prevFirmId = row.firmId;    prevTs = row.createdAt;  }  if (continuityViolations > 0) findings.push({    check: 'AUDIT_LOG_CONTINUITY',    severity: 'WARNING',    detail: `${continuityViolations} audit log timestamp inversion(s) detected`  });  // 6. Orphan audit logs (firmId not in firms table)
  const orphanAudit = await db.select().from(auditLogs)
    .where(and(isNotNull(auditLogs.firmId), notInArray(auditLogs.firmId, allFirmIds)));
  if (orphanAudit.length) findings.push({ check: 'ORPHAN_AUDIT_LOGS', severity: 'WARNING',
    detail: `${orphanAudit.length} audit log(s) reference non-existent firms` });
  // 7. Expired writer leases still in DB
  const expired = await db.select().from(writerLeases)
    .where(lt(writerLeases.expiresAt, new Date().toISOString()));
  if (expired.length) findings.push({ check: 'EXPIRED_LEASES', severity: 'WARNING',
    detail: `${expired.length} expired writer lease(s) still present in DB` });
  // 8. Schema version check (DB vs app constant)
  const svRow = await db.select().from(schemaVersion).limit(1);
  if (!svRow.length || svRow[0].currentVersion !== SCHEMA_VERSION) {
    findings.push({ check: 'SCHEMA_VERSION_MISMATCH', severity: 'CRITICAL',
      detail: `DB version ${svRow[0]?.currentVersion ?? 'missing'} !== app ${SCHEMA_VERSION}` });
  }
  // 9. Counter integrity (no-op Phase 1 — activates Phase 2)
  // No invoice/receipt counters in Phase 1. Check is a verified no-op.
  // Determine overall status
  const status: VerifyStatus = findings.some(f => f.severity === 'CRITICAL') ? 'CRITICAL'
    : findings.some(f => f.severity === 'WARNING') ? 'WARNING' : 'HEALTHY';
  if (status === 'CRITICAL') await activateSafeMode('VERIFY_CRITICAL_ISSUE');
  if (status === 'HEALTHY') await clearSafeMode(); // PATH 1 Safe Mode resolution
  // firmId filter applied here — v7.8 FIX-V78-5: uses structural VerifyFinding.firmId field (NOT string-matching on detail text).  // Firm-scoped findings have firmId set at point of creation. Device-level findings (schema version, expired leases) leave firmId undefined.  // Filter: include finding if (a) no firmId filter requested, OR (b) finding.firmId is undefined (device-level), OR (c) finding.firmId matches requested firmId.  // This is immune to wording changes in detail messages — the previous string-matching approach was fragile and could silently break.  const filteredFindings = firmId    ? findings.filter(f => f.firmId === undefined || f.firmId === firmId) // v7.8 FIX-V78-5: structural field — immune to detail text wording changes    : findings;  return { status, findings: filteredFindings };
}
CALL SITES: Settings screen (manual trigger) → runVerify(). Post-restore bootstrap (Step 13 Step 11) → runVerify(). Pre-FY-close gate (Phase 2) → runVerify(). verifyService does NOT call assertNotInSafeMode() — verify must be runnable when Safe Mode is active (it is how you exit it). verifyService does NOT call assertNoActiveLease() — it is read-only.
	

Bootstrap WARNING Display Policy
Bootstrap WARNING Display Policy


HEALTHY → Proceed to Dashboard. No notification. Silent pass.


WARNING → Proceed to Dashboard + show persistent amber banner: 'Data check found a minor issue. Tap to view details.' Banner remains until user views details. WARNING issues are logged to audit trail.


CRITICAL → Activate Safe Mode (persisted to DB). Show Safe Mode overlay.


WARNING issues must NEVER silently disappear. This is a governance requirement.


Audit Log Continuity Definition: A gap is flagged as WARNING when audit log entries from the same session and same firm have timestamps out of order or are missing sequential IDs within a continuous insert run. Device-level events (firmId = null) are excluded from gap detection.
	

________________




STEP
12
	BACKUP SYSTEM
SHA-256 checksummed. Includes safe_mode_state (v2.0) + bisLogos (v5.1). Logo image binaries excluded by design (v5.3 G60+G61).
	

Backup File Format (v5.3)
File extension: .vjb. MIME type: application/json. expo-document-picker must filter for this type. The file picker must not show all file types.


{
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2025-04-01T10:30:00.000Z",
  "deviceId": "...",
  "encryptionVersion": 1,  "iv": "base64-encoded-12-byte-iv",  "salt": "base64-encoded-16-byte-salt",  "ciphertext": "base64-encoded-AES-GCM-ciphertext",  // v7.24 FIX-V724-3: checksum field REMOVED — AES-GCM authentication tag provides integrity.  // BackupEnvelope no longer contains raw JSON payload or checksum.  // The entire payload is encrypted; encryptionVersion+iv+salt+ciphertext replace it.
  "payload": {
    "firms": [...],         // includes firmLogoRef URI string — image binary NOT in payload (G60)
    "financialYears": [...],
    "settings": [...],
    "auditLogs": [...],
    "bisLogos": [...],      // v5.1 G49: DB records included — fileRef URI string only, image binary NOT in payload (G61)
    "safeModeState": {...}, // HARDENING 2: NEW in v2.0
    "writerLeases": [],     // always empty — leases do not survive backup
    // schema_version NOT in payload — intentional. It is structural migration
    // metadata, not user data. After restore the DB always holds the current
    // app migration state. Do NOT delete or restore schema_version in restore().
    // NOTE: logo image binaries are NEVER in this payload.
    // URI strings are backed up. Files are device-local. See G60+G61+G62.
    // v7.14 FIX-V714-5: audit_archive_index NOT in payload — accepted architectural gap, documented here.
    // Phase 1 creates zero rows (closeFY() is Phase 2 scope) so this is not a Phase 1 blocker.
    // Phase 2+ implication: after restore, audit_archive_index will be empty even if FYs were previously closed.
    // Phase 2 closeFY() will re-populate it on the next close. Safe: FY status (CLOSED/ACTIVE) lives in
    // financial_years which IS in the payload. Same exclusion pattern as schema_version (see GAP 2 above).
    // CODE REVIEW GATE: do NOT backup or restore audit_archive_index rows here.
  }
}
	

Gap A Closed: BACKUP_CREATED Audit Event Was Never Written


BACKUP_CREATED appeared in the audit log display table but no code in Phase 1 ever wrote it.
v2.9 defines the canonical backupService.createBackup() including the BACKUP_CREATED audit write.
Backup itself is not a DB write operation — it is a READ + file write.


IMPORTANT: backupService.createBackup() does NOT need assertNotInSafeMode(). Backup is a read operation — it is ALLOWED in Safe Mode. Only assertNoActiveLease() is required.
This is the SECOND exception to assertNotInSafeMode() (alongside restoreService). See Step 1 G40 for full list.
	

// v7.14 FIX-V714-6: Canonical error constants file — constants/errorCodes.ts// v7.24 FIX-V724-5: count corrected 28→36; 8 new security error codes added (FIX-VSEC-1/2/3/8/11/12).// v7.33 FIX-V733-1: count corrected 36→37; PIN_DATA_CORRUPTED added.// All error code strings thrown throughout Phase 1 must be imported from this file, not inlined.// Phase 1 error codes — 37 total (add more per phase):// export const ERR = {//   LEASE_HELD: 'LEASE_HELD', SAFE_MODE_ACTIVE: 'SAFE_MODE_ACTIVE',//   MAX_FIRMS_REACHED: 'MAX_FIRMS_REACHED', FIRM_CODE_IMMUTABLE: 'FIRM_CODE_IMMUTABLE',//   GSTIN_IMMUTABLE: 'GSTIN_IMMUTABLE', GSTIN_STATE_MISMATCH: 'GSTIN_STATE_MISMATCH',//   GSTIN_STATE_UPDATE_BLOCKED: 'GSTIN_STATE_UPDATE_BLOCKED', FIRM_NOT_FOUND: 'FIRM_NOT_FOUND',//   CANNOT_ARCHIVE_ACTIVE_FIRM: 'CANNOT_ARCHIVE_ACTIVE_FIRM', LAST_FIRM: 'LAST_FIRM',//   AUDIT_LOG_IMMUTABLE: 'AUDIT_LOG_IMMUTABLE', RESTORE_VALIDATION_FAILED: 'RESTORE_VALIDATION_FAILED',//   RESTORE_OLD_SCHEMA: 'RESTORE_OLD_SCHEMA', STORAGE_CORRUPTION_DETECTED: 'STORAGE_CORRUPTION_DETECTED',//   FY_INTEGRITY_BROKEN: 'FY_INTEGRITY_BROKEN', SCHEMA_VERSION_MISMATCH: 'SCHEMA_VERSION_MISMATCH',//   AMOUNT_NOT_INTEGER: 'AMOUNT_NOT_INTEGER', AMOUNT_NEGATIVE: 'AMOUNT_NEGATIVE',//   AMOUNT_TOO_LARGE: 'AMOUNT_TOO_LARGE', INVALID_GSTIN: 'INVALID_GSTIN',//   INVALID_PINCODE: 'INVALID_PINCODE', INVALID_FIRM_CODE: 'INVALID_FIRM_CODE',//   WRITE_LEASE_NOT_IMPLEMENTED: 'WRITE_LEASE_NOT_IMPLEMENTED', BOOTSTRAP_INCOMPLETE: 'BOOTSTRAP_INCOMPLETE',//   ENTRY_DATE_IN_CLOSED_FY: 'ENTRY_DATE_IN_CLOSED_FY', CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',//   MIGRATION_FAILED: 'MIGRATION_FAILED', DEVICE_ID_NOT_INITIALIZED: 'DEVICE_ID_NOT_INITIALIZED',//   // v7.23 FIX-VSEC-1: backup encryption//   BACKUP_PASSWORD_REQUIRED: 'BACKUP_PASSWORD_REQUIRED',//   // v7.23 FIX-VSEC-2: MMKV cache tamper detection//   MMKV_CACHE_TAMPERED: 'MMKV_CACHE_TAMPERED',//   // v7.23 FIX-VSEC-3: PIN gate//   PIN_INCORRECT: 'PIN_INCORRECT',//   PIN_LOCKED: 'PIN_LOCKED',//   // v7.33 FIX-V733-1: corrupted/tampered PIN salt fails closed instead of throwing raw TypeError//   PIN_DATA_CORRUPTED: 'PIN_DATA_CORRUPTED',//   // v7.23 FIX-VSEC-7: input sanitization//   INVALID_TEXT_CONTENT: 'INVALID_TEXT_CONTENT',//   // v7.23 FIX-VSEC-8: device ID audit chain//   DEVICE_ID_CHANGED: 'DEVICE_ID_CHANGED',//   // v7.23 FIX-VSEC-11: checksum envelope coverage//   CHECKSUM_ENVELOPE_MISMATCH: 'CHECKSUM_ENVELOPE_MISMATCH',//   // v7.23 FIX-VSEC-12: factory reset//   FACTORY_RESET_EXECUTED: 'FACTORY_RESET_EXECUTED',// } as const;// Usage: throw new Error(ERR.GSTIN_STATE_UPDATE_BLOCKED + ':' + detail);// G65 LINT ALLOWLIST: add 'constants/errorCodes' to the no-restricted-imports exceptions.// -------// services/backupService.ts — v2.9 canonical implementation
// NOTE: createBackup() does NOT call assertNotInSafeMode().
// Backup is a READ operation — reading data during Safe Mode is explicitly allowed.
// v7.14 FIX-V714-1: Added imports to backupService.ts header — import * as FileSystem from 'expo-file-system'; import * as Sharing from 'expo-sharing';// v7.33 FIX-V733-6 [build-blocker]: backupService.ts header also needs — import { StorageAccessFramework } from 'expo-file-system'; import { storage } from '@/utils/storage'; (FIX-V733-5's mirror logic referenced both without declaring them; storage is the same wrapper used everywhere else in the spec for MMKV reads, e.g. PIN_HASH_KEY, PIN_SALT_KEY — a bare mmkv identifier does not exist in scope, see FIX-V733-6 below for the corrected call site.)// v7.33 FIX-V733-9 [build-blocker]: FIX-V714-1's plain `import * as FileSystem from 'expo-file-system'` is no longer safe — current Expo has made a new File/Directory class-based API the default export of 'expo-file-system' and moved every method this spec relies on (writeAsStringAsync, getInfoAsync, makeDirectoryAsync) plus the entire StorageAccessFramework namespace to 'expo-file-system/legacy'; under the new default they throw at runtime instead of working, the same class of break FIX-V715-9 caught for expo-crypto and FIX-V715-12 caught for expo-image-manipulator. Corrected canonical imports for backupService.ts:// import * as FileSystem from 'expo-file-system/legacy';// import { StorageAccessFramework } from 'expo-file-system/legacy';// import * as Sharing from 'expo-sharing';// import { storage } from '@/utils/storage';// No call-site text changes needed in createBackup() below — all references use the `FileSystem.` / `StorageAccessFramework.` namespace prefixes, which resolve correctly once the import path above is corrected. NOT SCOPED TO THIS FILE: the same `import * as FileSystem from 'expo-file-system'` risk applies wherever else the app imports FileSystem directly — specifically G58/G62 (Step 7 Firm Logo Picker: FileSystem.makeDirectoryAsync for logos/, and Step 13 FileSystem.getInfoAsync() restore-logo check) — those call sites are description-level in this spec with no printed import block to correct here, but MUST use the same 'expo-file-system/legacy' import when implemented.// BACKUP_DIR constant: export const BACKUP_DIR = FileSystem.documentDirectory + 'backups/';// Return type changed from Promise<string> to Promise<BackupResult> (interface below):// (historical note, v7.14–v7.25) BackupResult originally sketched here as a comment only; v7.33 FIX-V733-5 promoted it to a live export interface directly above createBackup() — see there for the current canonical shape, which now also includes mirroredToPublicStorage.// v7.28 FIX-V728-1 [build-blocker]: BackupEnvelope type used as a type annotation/cast throughout restoreService.ts (restore(), validateBackupSchema()) but never declared anywhere in the spec — TypeScript would fail to compile with "Cannot find name 'BackupEnvelope'" at every usage site. Canonical declaration added below.// export interface BackupEnvelope { schemaVersion: number; appVersion: string; exportedAt: string; deviceId: string; encryptionVersion: 1; passwordProtected: boolean; iv: string; salt: string; ciphertext: string; payload: { firms: any[]; financialYears: any[]; settings: any[]; auditLogs: any[]; bisLogos: any[]; safeModeState: any │ null; writerLeases: any[] }; }// NOTE: payload sub-fields are typed any[] here only because their row shapes are the Drizzle-inferred table types from schema.ts (firmsTable, financialYearsTable, etc.) — replace with those inferred row types at implementation time, do not leave as any[] in the real codebase.// v7.26 FIX-V726-1 [build-blocker]: createBackup() referenced `password` with no parameter declaring it — added optional password?: string parameter (FIX-V726-4: optional, with device-derived-key fallback for automated/non-interactive callers).// v7.33 FIX-V733-5 [build-blocker]: BackupResult was declared only inside a comment line above ("// export interface BackupResult {...}") and never printed as live code — the identical "declared but no code body" defect FIX-V728-1 caught for BackupEnvelope in v7.28, just never caught here since no field had been added to BackupResult since v7.14 until FIX-V733-4's mirroredToPublicStorage. Canonical declaration promoted to live code below.export interface BackupResult { fileName: string; filePath: string; fileSizeBytes: number; mirroredToPublicStorage: boolean; }// v7.33 FIX-V733-6 [build-blocker]: getOrCreateSafFolder() was described in prose only (FIX-V733-4) but never declared as code — createBackup() called it below with no definition in scope. Canonical implementation added here.async function getOrCreateSafFolder(parentUri: string, name: string): Promise<string> {  const children = await StorageAccessFramework.readDirectoryAsync(parentUri);  for (const childUri of children) {    const decodedName = decodeURIComponent(childUri.split('/').pop() ?? '');    if (decodedName === name || decodedName.endsWith(`:${name}`)) return childUri; // reuse existing folder, avoid SAF's duplicate-folder behavior  }  return await StorageAccessFramework.makeDirectoryAsync(parentUri, name);}export async function createBackup(password?: string): Promise<BackupResult> {
  await assertNoActiveLease(); // GUARD 1 only — no Safe Mode guard (see G40)
  const leaseId = await acquireLease(LeaseType.BACKUP);
  try {
    // v7.16 FIX-V716-5: JSI driver requires synchronous tx callback — async removed; Promise.all() inside replaced with sequential calls    const payload = db.transaction((tx) => {
      // v7.17 FIX-V717-1 [build-blocker]: Promise.all() is async — not valid inside JSI synchronous tx callback (FIX-V715-4 + FIX-V716-5).      // Replaced with 6 sequential synchronous tx.select().from().all() calls.      // tx.select().from(table).all() with drizzle-orm/expo-sqlite JSI driver returns a plain array synchronously.      const firms = tx.select().from(firmsTable).all(); // v5.1 renamed to avoid shadowing schema imports
      const financialYears = tx.select().from(financialYearsTable).all();
      const settings = tx.select().from(appSettingsTable).all();
      const auditLogs = tx.select().from(auditLogsTable).all();
      const safeModeStateRows = tx.select().from(safeModeStateTable).all();
      const bisLogos = tx.select().from(bisLogosTable).all(); // v5.1 G49: C1 fix
      // Sequential calls complete — all 6 tables read synchronously within tx boundary.
      // (Promise.all closing ]) removed — v7.17 FIX-V717-1)
      return { firms, financialYears, settings, auditLogs, safeModeState: safeModeStateRows, bisLogos, writerLeases: [] }; // v5.1 FIX
    });
    const envelope = { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
      // v7.24 FIX-V724-3: BackupEnvelope now uses AES-256-GCM encryption — checksum field removed.      // v7.26 FIX-V726-4 [build-blocker]: password is now optional. CLOSE-FY-FLOW STEP 3 calls createBackup() automatically with no user interaction (user cannot cancel/pause) — it cannot prompt for a password. When password is omitted, derive the key from the same device-derived secret used for the encrypted pre-migration snapshot (FIX-VSEC-14), not from user input. User-initiated exports from Settings > Backup/Restore MUST collect and pass a real password (Backup Password field — see Restore Preview Screen FIX-V726-3 for the matching restore-side field).      // password: string | undefined — if provided, used directly; if absent, getDeviceDerivedKeyMaterial() (FIX-VSEC-14 utility) is used instead. BACKUP_PASSWORD_REQUIRED is never thrown from this path now — see code below.      exportedAt: new Date().toISOString(), deviceId: getDeviceId(), encryptionVersion: 1, passwordProtected: !!password };    const payloadStr = JSON.stringify(payload);    const enc = new TextEncoder();    const keySourceMaterial = password ? enc.encode(password) : await getDeviceDerivedKeyMaterial(); // v7.26 FIX-V726-4: device-key fallback for automated backups    const saltBytes = crypto.getRandomValues(new Uint8Array(16));    const ivBytes = crypto.getRandomValues(new Uint8Array(12));    const keyMaterial = await crypto.subtle.importKey('raw', keySourceMaterial, 'PBKDF2', false, ['deriveKey']);    const key = await crypto.subtle.deriveKey(      { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']    );    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, enc.encode(payloadStr));    const toBase64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));    const encryptedBlob = JSON.stringify({      ...envelope,      iv: toBase64(ivBytes.buffer),      salt: toBase64(saltBytes.buffer),      ciphertext: toBase64(cipherBuffer),    });    // Write encrypted blob to .vjb file (replaces JSON.stringify(envelope) from v7.14)
    // [REMOVED v7.25 FIX-V725-10: duplicate unencrypted payloadStr/checksum block deleted — superseded by AES-256-GCM block above]
    // [REMOVED v7.25 FIX-V725-10: stale v7.16 SHA-256 checksum block deleted — superseded by v7.24 FIX-V724-3 AES-256-GCM encryption block above. envelope.checksum no longer exists on BackupEnvelope.]
    // v7.14 FIX-V714-1: Write .vjb file to DocumentDirectory/backups/, share via system share sheet,
    // then log BACKUP_CREATED audit event OUTSIDE any transaction (G41 Contract — see Call Site 3).
    // IMPORTANT: Never move the audit write inside the transaction — that violates G41 + G40. See v7.4 BACKUP-CREATED-KNOWN-LIMITATION.
    const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const fileName = `vjbilling_${timestamp}.vjb`;
    const filePath = BACKUP_DIR + fileName; // BACKUP_DIR = FileSystem.documentDirectory + 'backups/'
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    // v7.24 FIX-V724-3: write encrypted blob, not raw JSON    await FileSystem.writeAsStringAsync(filePath, encryptedBlob, { encoding: FileSystem.EncodingType.UTF8 });
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const fileSizeBytes = (fileInfo.exists && 'size' in fileInfo) ? (fileInfo as any).size ?? 0 : 0;
    await Sharing.shareAsync(filePath, { mimeType: 'application/octet-stream', dialogTitle: 'Save VJ Billing Backup' });
    await auditRepository.log(null, { eventType: 'BACKUP_CREATED', firmId: null,
      payload: JSON.stringify({ exportedAt: envelope.exportedAt, fileName, fileSizeBytes }) });
// v7.33 FIX-V733-5: best-effort public storage mirror — never throws, never blocks the backup (see FIX-V733-4)
let mirroredToPublicStorage = false;
try {
  const publicDirUri = storage.getString('vjbilling_public_backup_dir_uri'); // v7.33 FIX-V733-6: was mmkv.getString() — no such identifier in scope; corrected to the storage wrapper used everywhere else
  if (publicDirUri) {
    await StorageAccessFramework.readDirectoryAsync(publicDirUri); // throws if permission was revoked
    const appFolderUri = await getOrCreateSafFolder(publicDirUri, 'VJ Billing');
    const backupsFolderUri = await getOrCreateSafFolder(appFolderUri, 'backups');
    const mirrorUri = await StorageAccessFramework.createFileAsync(backupsFolderUri, fileName, 'application/octet-stream');
    await FileSystem.writeAsStringAsync(mirrorUri, encryptedBlob, { encoding: FileSystem.EncodingType.UTF8 });
    mirroredToPublicStorage = true;
  }
} catch { mirroredToPublicStorage = false; } // permission missing/revoked/write failed — silent by design
    return { fileName, filePath, fileSizeBytes, mirroredToPublicStorage }; // v7.25 FIX-V725-10: checksum removed — encryption auth tag (in ciphertext) provides integrity instead; v7.33 FIX-V733-5: mirroredToPublicStorage added
  } finally {
    await releaseLease(leaseId).catch(console.error);
  }
}
	

________________


⚠️ v7.4 KNOWN LIMITATION — BACKUP_CREATED Audit Gap (Accepted Architectural Design)
The BACKUP_CREATED audit event is written OUTSIDE the backup transaction by design (G41 Call Site 3). This means: if the app crashes between the file write and the BACKUP_CREATED audit write, the backup file exists on device storage but BACKUP_CREATED is never logged in audit_logs.
WHY THIS IS ACCEPTABLE: The backup .vjb file itself contains the full audit log inside it — the data is safe. The missing BACKUP_CREATED entry is a minor traceability gap, not a corruption or data-loss risk. A CA examining the .vjb file can see all audit events directly.
WHY THIS MUST NOT BE “FIXED”: Moving BACKUP_CREATED inside the backup transaction would violate the G41 contract (exactly 3 permitted null-tx call sites, all documented). Wrapping it in a separate transaction would introduce write semantics inside a read-only operation, breaking the createBackup() Safe Mode exemption (G40). Both “fixes” create worse problems than the gap they close.
CODE REVIEW GATE: Any developer who attempts to move BACKUP_CREATED inside the transaction, or wrap it in a separate transaction, is introducing a regression. This known limitation is permanent, intentional, and documented here so it cannot be misread as an oversight.
	

v7.33 · FIX-V733-4 — Public Storage Backup Mirror (Documents/VJ Billing/backups/)
PROBLEM (project owner): BACKUP_DIR is FileSystem.documentDirectory + 'backups/' — Android app-sandboxed internal storage, invisible to any file manager. The only route out is Sharing.shareAsync(), which just opens the OS share sheet for the user to manually pick a destination each time. There is no fixed, browsable location a backup is guaranteed to land in.
DECISION (Option 1, project owner): backups are ALSO mirrored to the device's public Documents/VJ Billing/backups/ folder using the Android Storage Access Framework (SAF) via expo-file-system's StorageAccessFramework module. Android-only — consistent with the existing ANDROID-ONLY TEST SCOPE (v2.7) boundary; no iOS path added.
PERMISSION — one-time, user-initiated only: Settings > Backup/Restore gains a 'Grant public backup folder access' row that calls StorageAccessFramework.requestDirectoryPermissionsAsync(). The returned persistable directory URI is stored in MMKV as vjbilling_public_backup_dir_uri. This request MUST NOT be triggered from the automatic CLOSE-FY-FLOW STEP 3 backup — that step runs with no user interaction and cannot show a permission dialog mid-close.
FOLDER CREATION — getOrCreateSafFolder(parentUri, name): SAF has no makeDirectoryAsync intermediates:true equivalent; calling it against a folder that already exists creates a duplicate 'VJ Billing (1)' instead of reusing it. The helper MUST call StorageAccessFramework.readDirectoryAsync(parentUri), match a child by its decoded display name, and only call makeDirectoryAsync() when no match is found. Used to resolve Documents/VJ Billing/backups/ idempotently on every backup.
createBackup() behavior: the primary write to BACKUP_DIR (internal documentDirectory) is UNCHANGED — this is what CLOSE-FY-FLOW STEP 3 depends on, so the existing hard-block-on-failure guarantee holds regardless of SAF permission state. AFTER that write succeeds, createBackup() attempts a best-effort mirror: if vjbilling_public_backup_dir_uri is present and StorageAccessFramework.readDirectoryAsync() confirms the grant is still valid, the identical encrypted bytes are additionally written via StorageAccessFramework.createFileAsync() into Documents/VJ Billing/backups/. If the permission was never granted, was revoked, or the mirror write throws for any reason, the mirror step is skipped silently — it MUST NOT throw, block, or fail the backup. BackupResult gains mirroredToPublicStorage: boolean so the STEP 3 success dialog and Settings screen can indicate whether the public copy was also written.
Restore side — unchanged: RESTORE FLOW Step 1 already uses expo-document-picker, which opens the OS-wide file picker and can already select a .vjb from any location on the device, including the new public mirror folder — no restore-side change was required for this fix.
	



STEP
13
	RESTORE SYSTEM
11-step validation pipeline. Safe Mode exemption. Nav guard.
	

RESTORE FLOW — 11 Steps
RESTORE FLOW — 11 Steps


Step 1: User picks .vjb file via expo-document-picker
Step 2: Parse JSON — validate envelope structure
Step 3: Decrypt payload using AES-256-GCM (password-derived key via PBKDF2) — auth tag failure throws CHECKSUM_MISMATCH (v7.25 FIX-V725-10)
Step 4: Check schemaVersion — future version: block (RESTORE_VALIDATION_FAILED) | past version: log RESTORE_OLD_SCHEMA + warn user
Step 5: Show Preview Screen (see below) — user must explicitly confirm
Step 6: Dry-run validation — scan payload for broken refs, orphaned FYs
Step 7: If dry-run fails → activate Safe Mode (RESTORE_VALIDATION_FAILED)
Step 8: Acquire RESTORE lease
Step 9: Transaction: delete all + insert all (atomic)
Step 10: App reload (Updates.reloadAsync())
Step 11: Post-restore bootstrap runs full Verify My Data silently
	

CRITICAL: restoreService Must NOT Call assertNotInSafeMode()
CRITICAL: restoreService Must NOT Call assertNotInSafeMode()


restoreService.restore() is PATH 2 of Safe Mode resolution.
If it called assertNotInSafeMode(), a user in Safe Mode could never restore — they would be permanently locked.
restoreService MUST call assertNoActiveLease() — no concurrent operations during restore.
Any developer who adds assertNotInSafeMode() to restoreService is introducing a critical bug. This must be a code review gate item.
	

Restore Preview Screen — Required Content


Step 5 (Preview Mode) is NOT a rubber stamp. User must see a structured summary:


BACKUP INFORMATION: Date/time created · App version · Device ID (last 8 chars) · Schema version
FIRMS IN BACKUP: List of firm names and firm codes · FY count per firm
RECORD COUNTS: Total audit log entries · Settings entries
SAFE MODE STATUS: If Safe Mode was active in backup → amber warning: 'This backup was created while Safe Mode was active. Restoring it will re-activate Safe Mode.'
CURRENT DATA WARNING (always): 'Restoring will permanently replace all current data.'


v7.26 FIX-V726-3 [build-blocker]: BACKUP PASSWORD FIELD (Conditional) — if the previewed backup's passwordProtected flag (read from the unencrypted envelope wrapper, no decryption needed) is true, Step 5 MUST present a masked password text input with label 'Backup Password' before the final confirm button is enabled; the confirm button stays disabled until the field is non-empty. If passwordProtected is false (an automated FY-close safety backup — FIX-V726-4), no password field is shown and restore() is called with password omitted. On confirm, any entered string is passed as the `password` argument to restore(encryptedFileContent, password) — restore() cannot decrypt a password-protected payload without it. On CHECKSUM_MISMATCH (wrong password or tampered file), the screen MUST remain on Step 5 and show inline error: 'Incorrect password or corrupted backup file.' — it MUST NOT proceed to delete-then-insert until decryption succeeds.


Screen must display watermark: 'PREVIEW — NOT RESTORED YET' — mandatory acceptance criterion.
	

// services/restoreService.ts — restore() canonical skeleton (v2.9)
// NOTE: restore() does NOT call assertNotInSafeMode() — see Step 1 G40 + Step 10
// v7.13 FIX-V713-1: add auditDeleteGate (aliased auditDeleteGateTable, matching this file's existing Table-suffix import convention) to the '@/db/schema' import and eq to the 'drizzle-orm' import in this file — required by the gate guard below
// v7.26 FIX-V726-2 [build-blocker]: restore() signature was unchanged since v2.9 (backup: BackupEnvelope) — never updated when v7.24 FIX-V724-3 rewrote the body to decrypt an AES-256-GCM blob; body referenced undeclared `encryptedFileContent` and `password`, and the old `backup` parameter was never used. Signature corrected below.export async function restore(encryptedFileContent: string, password?: string): Promise<void> {
  await assertNoActiveLease(); // GUARD: lease only, no Safe Mode guard
  const leaseId = await acquireLease(LeaseType.RESTORE);
  try {
    // v7.16 FIX-V716-4: JSI driver requires synchronous tx callback — async removed     // v7.26 FIX-V726-2: restore() now correctly declares (encryptedFileContent: string, password?: string) — see signature above.     // v7.26 FIX-V726-5: password is optional to mirror createBackup() (FIX-V726-4) — a backup may be password-protected (user export) or device-key-protected (automated FY-close safety backup, passwordProtected:false). Restore Preview Screen (FIX-V726-3) only shows the password field when the previewed envelope's passwordProtected flag is true.     // v7.27 FIX-V727-1 [precision]: guard rewritten from `passwordProtected !== false` to `passwordProtected === true` — the old form treated a missing/undefined passwordProtected field (e.g. a hand-built test fixture, or any future envelope shape that omits the field) as password-required by default; the explicit form only demands a password when the envelope positively declares itself protected, matching the createBackup() encryption decision exactly.     const parsedBlob = JSON.parse(encryptedFileContent) as { iv: string; salt: string; ciphertext: string; passwordProtected?: boolean };     if (parsedBlob.passwordProtected === true && !password) throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');     const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));     const saltBytes = fromBase64(parsedBlob.salt);     const ivBytes = fromBase64(parsedBlob.iv);     const cipherBytes = fromBase64(parsedBlob.ciphertext);     // v7.27 FIX-V727-1: branch flipped to match the === true guard above — only an explicitly-true passwordProtected flag uses the supplied password; everything else (false, or a missing field on a legacy/foreign envelope) derives the device key.     const keySourceMaterial = parsedBlob.passwordProtected === true ? new TextEncoder().encode(password) : await getDeviceDerivedKeyMaterial();     const keyMaterial = await crypto.subtle.importKey('raw', keySourceMaterial, 'PBKDF2', false, ['deriveKey']);     const key = await crypto.subtle.deriveKey(       { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },       keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']     );     let backup: BackupEnvelope;     try {       const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);       backup = JSON.parse(new TextDecoder().decode(decrypted)) as BackupEnvelope;     } catch {       throw new Error(ERR.CHECKSUM_MISMATCH + ': AES-GCM decryption failed — wrong password or tampered file');     }     // backup is now decrypted and validated — proceed with existing restore logic    db.transaction((tx) => {
      // NOTE: RESTORE_COMPLETED audit is written AFTER all INSERTs complete (see below)
      //
      //
      //
      // DELETE existing data in reverse dependency order
      // v7.13 FIX-V713-1: gate MUST be opened before this delete — v7.10's prevent_audit_delete trigger ABORTs otherwise
      tx.update(auditDeleteGateTable).set({ gateOpen: 1 }).where(eq(auditDeleteGateTable.id, 1));
      tx.delete(auditLogsTable);
      tx.update(auditDeleteGateTable).set({ gateOpen: 0 }).where(eq(auditDeleteGateTable.id, 1)); // gate closes same tx
      tx.delete(bisLogosTable);
      tx.delete(financialYearsTable);
      tx.delete(writerLeasesTable); // Step 9: invalidate leases
      tx.delete(firmsTable);
      tx.delete(appSettingsTable);
      tx.delete(safeModeStateTable);
      // INSERT backup data
      if (backup.payload.firms.length) tx.insert(firmsTable).values(backup.payload.firms);
      if (backup.payload.financialYears.length) tx.insert(financialYearsTable).values(backup.payload.financialYears);
      if (backup.payload.settings.length) tx.insert(appSettingsTable).values(backup.payload.settings);
      if (backup.payload.auditLogs.length) tx.insert(auditLogsTable).values(backup.payload.auditLogs);
      if (backup.payload.bisLogos?.length) tx.insert(bisLogosTable).values(backup.payload.bisLogos); // v5.1 G49: C1 fix
      if (backup.payload.safeModeState) {
        tx.insert(safeModeStateTable).values(backup.payload.safeModeState)
          .onConflictDoUpdate({ target: safeModeStateTable.id, set: backup.payload.safeModeState });
      }
      // RESTORE_COMPLETED written here — AFTER all data inserted (architecturally correct)
      auditRepository.log(tx, { eventType: 'RESTORE_COMPLETED', firmId: null,
        payload: JSON.stringify({ backupSchema: backup.schemaVersion,
          backupDate: backup.exportedAt, firmCount: backup.payload.firms.length,
          restoredAt: new Date().toISOString() }) });
    });
    leaseStore.setState({ activeLease: null }); // Step 9: clear Zustand lease state
    await clearSafeMode(); // PATH 2 Safe Mode resolution — intentionally OUTSIDE transaction: if reloadAsync throws, clearSafeMode has already committed. Accepted architectural risk: Safe Mode clears before reload. On next boot, post-restore verify will re-activate Safe Mode if data is corrupt.
    await Updates.reloadAsync(); // Step 10: full app restart
  } finally {
    await releaseLease(leaseId).catch(console.error);
  }
}
	

🆕 NEW
v5.3 · G60+G61 — Logo Files Are Device-Local: Not Included in Backup Payload
firmLogoRef URI (firms table) and bis_logos.fileRef URI are device-local file references. They follow the same architectural precedent as Phase 5 invoice signatures (D3/D4):
  • Never base64-encoded in the backup payload. Never remote URLs. Keeps .vjb file size bounded.
  • The URI string in the firms row and bis_logos rows IS backed up (DB records are preserved in the payload).
  • The actual image binary is NOT in the .vjb file. This is by architectural design.
  • Same-device restore: URI still valid — works correctly. Cross-device or post-reinstall restore: URI is a dead reference. G62 handles gracefully.
  • Restore Preview Screen (Step 5) MUST include: “Logo images are not included in backups and will need to be re-uploaded after restoring on a new device.”
	

v5.3 · G62 — Dead Logo URI Handling on Restore (MANDATORY)
After Updates.reloadAsync() and post-restore bootstrap (Step 11 Verify), execute logo integrity check before any screen renders:
FIRM LOGO CHECK (each firm where firmLogoRef non-null): call FileSystem.getInfoAsync(). If exists: false → updateFirm({ firmLogoRef: null }), write FIRM_UPDATED audit { reason: ‘LOGO_NOT_FOUND_ON_DEVICE’ }, set logosWereMissing = true.
BIS LOGO CHECK (each bis_logos row where isArchived=0 and fileRef non-null): call FileSystem.getInfoAsync(). If exists: false → bisLogoRepository.archive(‘FILE_NOT_FOUND_ON_DEVICE’), write BIS_LOGO_ARCHIVED audit, set logosWereMissing = true.
UI BANNER: If logosWereMissing = true → show persistent amber banner on Dashboard: “Firm logos could not be restored — please re-upload your logos in Firm Manager.” Dismisses on explicit user tap only. Does NOT auto-dismiss. Coexists with Safe Mode banner.
HARD RULES: Never crash on missing logo. Never block app load. Check runs once per restore cycle via post-restore MMKV flag. Skipping this check on restore is a code review gate violation.
v6.5 — G62 MMKV FLAG SPEC (GAP 4 FIX): Post-Restore Logo Check MMKV Key
The G62 logo integrity check runs exactly once per restore cycle, gated by a named MMKV flag. Without the flag, the check would re-run on every app launch after restore, not just the first boot.
MMKV KEY: vjbilling_post_restore_logo_check_pending
SET: Inside restoreService.restore(), immediately before calling Updates.reloadAsync(). Call storage.set('vjbilling_post_restore_logo_check_pending', 'true').
CLEAR: After the logo integrity check completes (whether or not any logos were missing). Call storage.delete('vjbilling_post_restore_logo_check_pending') before any screen renders.
CHECK GATE: In bootstrapDatabase() post-restore bootstrap path (Step 11): read storage.getString('vjbilling_post_restore_logo_check_pending'). If value is 'true', run G62 logo integrity check. If absent or any other value, skip. This ensures the check fires exactly once per restore cycle regardless of how many times the app restarts. ⚠️ IMPLEMENTATION NOTE: bootstrapDatabase() must have a DISTINCT post-restore code path to read this flag. The app restarts via Updates.reloadAsync() after a successful restore — on that restart, bootstrapDatabase() runs as normal but MUST check this MMKV flag at Step 11 (after Verify My Data) to determine if the logo integrity check should execute. Do NOT gate this check on any other condition. The flag is the sole trigger. The post-restore path is: flag present and 'true' → run G62 logo check → clear flag → proceed. Normal boot path: flag absent or not 'true' → skip G62 check entirely.
CODE REVIEW GATE: Any implementation that calls the G62 logo integrity check unconditionally on every boot (without reading this MMKV flag) is incorrect. Must be caught in PR review.
	

________________




STEP
14
	AUDIT LOGGING
Append-only. DEVICE_ID_GENERATED event added in v2.0.
	

The audit log is append-only at the application layer — no update/delete methods exist in auditRepository, and no UI action can ever remove a row. The ONLY two code paths permitted to delete rows are the gated monthly purgeExpiredAuditLogs() job and restoreService.restore() (full-DB replace), both of which open the audit_delete_gate for the duration of their own transaction only (v7.10 AUDIT-RETENTION-MONTHLY, v7.12 FIX-V712-1). Included in every backup. New in v2.0: DEVICE_ID_GENERATED event logged when device ID first created.


🆕 NEW
v4.0 · G41 — auditRepository.log(null, ...) Contract — Exactly Three Permitted Call Sites


tx = null means the log write executes OUTSIDE any transaction wrapper.
CALL SITE 1: RESTORE_OLD_SCHEMA — logged in validateBackupSchema() before any restore transaction opens.
CALL SITE 2: DEVICE_ID_GENERATED — logged in auditDeviceIdIfNew() during bootstrap Phase B.
CALL SITE 3: BACKUP_CREATED — logged in backupService.createBackup() after the snapshot transaction closes.


ALL OTHER calls to auditRepository.log() must pass a live tx from the caller's transaction.
Any developer who calls log(null, ...) for any other event type is introducing a bug.
Code review must verify: only these three call sites pass null. Everything else passes tx.// ================================================================// v7.24 FIX-V724-4 / v7.25 FIX-V725-6 — types/audit.ts CANONICAL IMPLEMENTATION// AuditPayload discriminated union covering all 22 Phase 1 event types.// TypeScript strict mode rejects unknown eventType at compile time.// ================================================================export type AuditPayload =  | { eventType: 'FIRM_CREATED';                  firmCode: string; name: string }  | { eventType: 'FIRM_UPDATED';                  changes: string[] }  | { eventType: 'FIRM_SWITCHED';                 switchedToFirmId: string; switchedAt: string }  | { eventType: 'FIRM_ARCHIVED';                 archivedAt: string }  | { eventType: 'FIRM_UNARCHIVED';               unarchivedAt: string }  | { eventType: 'FIRM_CODE_SET';                 firmCode: string; assignedAt: string }  | { eventType: 'SAFE_MODE_ACTIVATED';           reason: string }  | { eventType: 'SAFE_MODE_CLEARED' }  | { eventType: 'BACKUP_CREATED';                exportedAt: string; fileName: string; fileSizeBytes: number }  | { eventType: 'RESTORE_COMPLETED';             backupSchema: number; backupDate: string; firmCount: number; restoredAt: string }  | { eventType: 'RESTORE_OLD_SCHEMA';            backupSchema: number; currentSchema: number }  | { eventType: 'FY_CLOSED';                     fyId: string; fyLabel: string; closedAt: string }  | { eventType: 'SETTINGS_CHANGED';              fields: string[]; oldValues: Record<string, unknown>; newValues: Record<string, unknown> }  | { eventType: 'DEVICE_ID_GENERATED';           deviceId: string }  | { eventType: 'BIS_LOGO_ARCHIVED';             reason: string }  | { eventType: 'PRE_MIGRATION_SNAPSHOT_FAILED'; error: string }  | { eventType: 'AUDIT_RETENTION_PURGE_EXECUTED'; deletedCount: number; auditRetentionDays: number; cutoff: string; executedAt: string }  | { eventType: 'DEVICE_ID_CHANGED';             oldDeviceId: string; newDeviceId: string; reason: 'reinstall_or_new_device' }  | { eventType: 'FACTORY_RESET_EXECUTED';        confirmedFirmCode: string; executedAt: string }  | { eventType: 'PIN_SET';                       pinLength: 4 | 6; setAt: string }  | { eventType: 'PIN_CHANGED';                   oldPinLength: 4 | 6; newPinLength: 4 | 6; changedAt: string }  | { eventType: 'PIN_SKIPPED';                   skippedAt: string };// auditRepository.log() accepts typed payload:// log(tx: DrizzleTransaction | null, entry: { eventType: AuditPayload['eventType']; firmId?: string | null; entityId?: string | null; payload: AuditPayload }): void
	

________________




STEP
15
	SETTINGS
Phase 1 scope only. All changes audited. Dual guard on all writes.
	

Allowed in Phase 1 Settings
✓ Firm Manager
✓ Date Format
✓ Theme (structure only)
✓ Backup / Restore
✅ Devices (schema + navigation slot reserved. Future Sync Phase implements full UI and transport layer)
✓ Verify My Data
✓ FY Close (Phase 2 — boundary noted)
✓ Audit Log Screen
✓ Utilities (Phase 6 — boundary noted: Verify My Data, Export Parties, Export Items, Close Financial Year)
✓ GST — Tax List (schema + navigation slot reserved. Phase 3 Step 0 implements full UI and wires calculateInvoice())


🆕 NEW v6.7 — Settings > Utilities (Phase 6 Boundary)
The Utilities section is introduced in Phase 6 (Step 7). Phase 1 documents its existence and boundary so developers know it is a planned section and do NOT implement it prematurely. The Settings screen in Phase 1 MUST reserve a Utilities section slot in its navigation structure (screen exists, items are gated behind a Phase 6 feature flag or TODO marker). No logic is implemented in Phase 1.
UTILITIES SECTION — ITEMS (Phase 6 Implementation)
Verify My Data      Promoted to top-level utility in Phase 6. Runs full VMD suite.
Export Parties      All party ledgers as Excel. FY filter. (Phase 6)
Export Items        Full stock CSV. Item ID, Name, Category, Weights, Qty. (Phase 6)
Close Financial Year  Constitutional 4-step close flow (v7.6 CLOSE-FY-FLOW). Implementation target: Phase 2 Step 5.5. Phase 1 defines the constitutional flow here so Phase 2 cannot deviate. (Phase 2 Step 5.5 — see v7.6 constitutional flow spec above)
🆕 NEW v7.6 — Close Financial Year: Constitutional Flow Spec
Implementation target: Phase 2 (Step 5.5). Phase 1 defines the constitutional flow here so Phase 2 cannot deviate.
STEP 1 — FY SELECTION SCREEN (which year to close):
Query all financial_years WHERE firmId = activeFirmId AND status = 'ACTIVE'. Branch on count:
Count = 0: Error screen. "No active financial year found. Run Verify My Data to diagnose." Activate FY_INTEGRITY_BROKEN Safe Mode. Close flow aborted.
Count = 1 (normal path — guaranteed by uq_one_active_fy_per_firm): Show a confirmation card for the single active FY. Display: label (e.g. "FY 2025-26"), date range ("Apr 1, 2025 — Mar 31, 2026"), last entry date, total transaction count. No picker needed.
Count > 1 (recovery path — only possible if uq index was absent in legacy data): Show banner "Multiple active financial years detected (data integrity issue)." Display a scrollable list of all active FYs showing label and date range. User must select which one to close. Only one FY may be selected per session. After the close completes, the flow returns to Step 1 so user can close the remaining active FYs one at a time.
STEP 2 — PRE-CLOSE VERIFY GATE:
Run verifyService.runVerify(firmId) automatically. CRITICAL result blocks close — user must resolve all critical findings before proceeding. HEALTHY or WARNING allows continue. Show findings in plain language.
STEP 3 — MANDATORY PRE-CLOSE BACKUP (cannot be skipped, cannot be waived):
createBackup() is called automatically before any closeFY() operations execute. The user does not initiate this manually — it is triggered by the close flow. UI shows: "Creating safety backup before closing [label]..." with a progress indicator. The user cannot cancel this step.
Backup scope is full-DB (.vjb file = all firms, all FYs, all data). There is no FY-scoped partial backup — the existing createBackup() architecture is intentionally whole-DB. A partial backup would not capture inter-FY party balances and carry-forwards correctly. This is by design.
If createBackup() fails: "Backup failed. FY close cancelled for safety. Check storage and retry." closeFY() MUST NOT proceed under any circumstances — a failed backup is a hard block, not a warning.
If createBackup() succeeds: Display "Backup saved: [filename] ([size])"; if BackupResult.mirroredToPublicStorage is true, additionally display "Also copied to Documents/VJ Billing/backups/" (no mirror-related text and no error/warning when false — the mirror is best-effort, v7.33 FIX-V733-7) and proceed to Step 4.
STEP 4 — FINAL CONFIRMATION AND EXECUTION:
Show final confirmation dialog: "[FY label] is about to be permanently closed. This action cannot be undone. Your data has been backed up at [backup filename]. Proceed?" Two buttons: "Close Financial Year" (destructive, red) and "Cancel" (safe). User MUST explicitly tap "Close Financial Year" — no default action.
On confirm: fyService.closeFY(firmId, fyId) executes under Dual Guard (assertNoActiveLease + assertNotInSafeMode) inside a transaction. Sets financial_years.status = 'CLOSED' for the selected FY. Writes FY_CLOSED audit event with fyId and fyLabel in payload. Writes audit_archive_index row. Clears the FY-ended dashboard banner. Navigates user to dashboard.
	🆕 NEW v6.9 — Settings > GST — Tax List (Tax Master Foundation)
⚠️ FUTURE REFERENCE — SCHEMA FOUNDATION ONLY (Phase 1)
Phase 1 creates the database tables (tax_rates, tax_groups, tax_group_components) and reserves the Settings > GST navigation slot. NO UI is implemented in Phase 1. NO invoice logic reads from these tables in Phase 1. Phase 3 Step 0 is the implementation target — it adds the full Tax List screen, wires calculateInvoice() to resolve rates from tax_groups, and retires the hardcoded gst_config bps values. Developers must NOT implement Tax List UI or invoice-rate resolution before Phase 3 Step 0.
Cross-phase amendment required: Phase 3 v5.7 (retire hardcoded bps, wire calculateInvoice()), Phase 5 v2.0 (update Cannot Change lock list), Phase 6 v1.1 (gst_config superseded by tax_groups). These amendments are tracked and MUST be applied before Phase 3 build begins.
	

Purpose and Business Rationale
Indian GST rates are set by the GST Council and change periodically (e.g., jewellery metal was 3%, making charges 5% — rates the government can revise). Hardcoding these values inside calculateInvoice() means every government rate change requires a code deployment. The Tax Master system replaces hardcoded bps values with a user-maintainable table: when the GST Council changes a rate, the firm owner updates one row in Tax Rates and every subsequent invoice reflects the new rate automatically. Historical invoices are never altered — amounts are stored in paise at the time of posting.
Additionally, if a firm has no GSTIN (unregistered), the system issues a Bill of Supply with 0% GST regardless of what tax groups exist. The Tax Master does not override the firm’s GST registration status — it only supplies the rates used when a Tax Invoice is generated.
Architecture — Two-Level Tax Master
Level 1 — Tax Rates: Individual tax components. Each rate has a name, a rate value (stored in basis points, bps), and a tax type (CGST or SGST). Example: "CGST 1.5%" at 150 bps, type CGST. Both CGST and SGST components must always be added separately and symmetrically (CGST rate = SGST rate for intra-state GST compliance).
Level 2 — Tax Groups: A named bundle of Tax Rates that represents a complete GST slab. Example: "GST 3%" groups "CGST 1.5%" + "SGST 1.5%". calculateInvoice() resolves the tax group by name and splits CGST/SGST from its components. No component may call bps directly — all rate resolution MUST go through the tax group lookup.
Worked Example — Setting Up GST 3%
Step 1 — Add Tax Rate: Tax Name = "CGST 1.5%", Tax Rate = 1.5%, Tax Type = CGST. Save.
Step 2 — Add Tax Rate: Tax Name = "SGST 1.5%", Tax Rate = 1.5%, Tax Type = SGST. Save.
Step 3 — Create Tax Group: Group Name = "GST 3%". Select components: "CGST 1.5%" + "SGST 1.5%". The system shows a combined preview: CGST 1.5% + SGST 1.5% = 3.00% total GST. Save.
Result: calculateInvoice() receives taxGroupId for "GST 3%" → resolves CGST component (150 bps) + SGST component (150 bps) → computes cgstPaise and sgstPaise on taxable amount → grandTotal. If the government raises metal GST to 5%: update "CGST 1.5%" → "CGST 2.5%" and "SGST 1.5%" → "SGST 2.5%". All future invoices use 5%. All past invoices remain at their posted paise values. No data corruption.
Database Schema — Three New Tables (Phase 1 Migration)
// db/schema.ts — Tax Master tables (Phase 1 schema foundation)
	// TABLE 1: tax_rates
export const taxRates = sqliteTable('tax_rates', {
  id:        text('id').primaryKey(),           // UUID
  firmId:    text('firm_id').notNull(),          // FK → firms.id
  taxName:   text('tax_name').notNull(),         // e.g. "CGST 1.5%"
  rateBps:   integer('rate_bps').notNull(),      // basis points: 150 = 1.50%
  taxType:   text('tax_type').notNull(),         // ENUM: 'CGST' | 'SGST'
  isActive:  integer('is_active').notNull().default(1), // 1=active, 0=inactive
  createdAt: text('created_at').notNull(),       // ISO-8601
  updatedAt: text('updated_at').notNull(),       // ISO-8601
});
// TABLE 2: tax_groups
export const taxGroups = sqliteTable('tax_groups', {
  id:          text('id').primaryKey(),         // UUID
  firmId:      text('firm_id').notNull(),       // FK → firms.id
  groupName:   text('group_name').notNull(),    // e.g. "GST 3%"
  isActive:    integer('is_active').notNull().default(1),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});
// TABLE 3: tax_group_components (junction: tax_groups ↔ tax_rates)
export const taxGroupComponents = sqliteTable('tax_group_components', {
  id:          text('id').primaryKey(),         // UUID
  taxGroupId:  text('tax_group_id').notNull(),  // FK → tax_groups.id
  taxRateId:   text('tax_rate_id').notNull(),   // FK → tax_rates.id
});
	

Migration — Added to Migration Zero
All three tables are added to migration zero alongside the existing Phase 1 tables. Table creation order in migration zero must respect foreign key dependencies: tax_rates before tax_group_components, tax_groups before tax_group_components. Migration zero table order (v7.12 FIX-V712-2: corrected to match the Step 2 Migration Zero Contract canonical order exactly — this paragraph previously placed audit_delete_gate at the end, contradicting Step 2): safe_mode_state, app_settings, firms, financial_years, writer_leases, audit_logs, audit_delete_gate, bis_logos, schema_version, tax_rates, tax_groups, tax_group_components, sync_devices, sync_log, audit_archive_index. ⚠️ DEVELOPER ACTION REQUIRED: Drizzle ORM may reorder tables during auto-generation. After running npx drizzle-kit generate, you MUST manually open the generated migration SQL file and verify this exact table order. tax_group_components references both tax_rates.id and tax_groups.id — if either parent table appears after tax_group_components in the SQL file, SQLite will throw a foreign key constraint error on first boot. audit_delete_gate, sync_devices, sync_log, and audit_archive_index have no FK dependencies — audit_delete_gate is placed immediately after audit_logs (its functional pair) per Step 2; sync_devices, sync_log, and audit_archive_index append at the very end. Hand-verify the SQL file before committing.
DORMANCY GATE (v7.1): tax_rates, tax_groups, and tax_group_components are SCHEMA-ONLY in Phase 1. Developers MUST add the following TODO comment at the top of every migration zero CREATE TABLE block for these three tables: "-- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation." This is a second safety layer beyond the documentation gate. ESLint cannot enforce cross-table import boundaries automatically — the comment is the fallback human guard. ⚠️ DEVELOPER ACTION REQUIRED: Drizzle ORM will NOT auto-generate this comment. After running npx drizzle-kit generate, you MUST manually open the generated migration SQL file and add this TODO comment as the first line inside each of the three CREATE TABLE blocks (tax_rates, tax_groups, tax_group_components). This manual edit must be verified at PR review before merge.
No seed data is inserted in Phase 1. Tables are created empty. Phase 3 Step 0 seeds default rates (CGST 1.5%, SGST 1.5% → GST 3%; CGST 2.5%, SGST 2.5% → GST 5%) on first run after Phase 3 migration. Seed is idempotent — INSERT OR IGNORE on known UUIDs.
Business Rules — Non-Negotiable (Phase 3 Enforcement)
RULE 1 — taxType is CGST or SGST only. No IGST. VJ Billing is intra-state only. Any attempt to create a taxRate with taxType = 'IGST' must be rejected at service layer with error TAX_IGST_NOT_SUPPORTED.
RULE 2 — Every Tax Group must contain exactly one CGST component and exactly one SGST component. Saving a group with 0 or 2+ CGST or 0 or 2+ SGST components is rejected at service layer with error TAX_GROUP_INVALID_COMPONENTS. Enforced in Phase 3 createTaxGroup() service.
RULE 3 — CGST rateBps must equal SGST rateBps within the same Tax Group. Asymmetric CGST/SGST within a single group violates GST law. Rejected with TAX_GROUP_ASYMMETRIC_RATES. Enforced in Phase 3 createTaxGroup() and updateTaxGroup().
RULE 4 — A Tax Rate that belongs to any Tax Group cannot be deleted. It can be deactivated (isActive = 0) which hides it from new group creation. Enforced in Phase 3 deleteTaxRate() — checks tax_group_components for references. Throws TAX_RATE_IN_USE if any exist.
RULE 5 — A Tax Group used by any posted invoice cannot be deleted or have its components changed. Historical integrity is non-negotiable. The groupName can be renamed but the rate components are frozen. Enforced in Phase 3 by checking sale_invoice_items for taxGroupId references.
RULE 6 — Firm with no GSTIN always issues Bill of Supply (0% GST). calculateInvoice() checks firm.gstin first. If absent → cgstPaise = 0, sgstPaise = 0 regardless of the taxGroupId passed. The Tax Master does not override the firm’s registration status. This rule is Phase 3 calculateInvoice() scope, but is documented here so developers understand the full system behaviour from Phase 1.
Phase 1 Navigation Slot — Settings > GST
The Settings screen in Phase 1 MUST reserve a GST section slot in its navigation structure. The slot is visible but all items inside are gated behind a Phase 3 feature flag or TODO marker. No logic is implemented. Tapping the GST section shows a placeholder screen: "GST settings are configured in the full setup. Available after Phase 3." This follows the same pattern as the Utilities section (Phase 6 boundary).
GST SECTION — ITEMS (Phase 3 Step 0 Implementation): Tax Rates (add/edit/deactivate individual CGST and SGST rates). Tax Groups (create named bundles — select CGST rate + SGST rate → give group a name like "GST 3%"). Both sub-screens are STUB ONLY in Phase 1 — no service calls, no DB reads.


🆕 NEW v7.3 — Settings > Devices (Sync Foundation)
⚠️ FUTURE REFERENCE — SCHEMA FOUNDATION ONLY (Phase 1 v7.3)
Phase 1 creates two dormant database tables (sync_devices, sync_log) and reserves the Settings > Devices navigation slot. NO UI is implemented in Phase 1. NO network transport, device discovery, socket, or HTTP server is implemented in any of Phases 1–7. The Future Sync Phase spec is the implementation target. Developers MUST NOT implement any sync transport, mDNS discovery, or data transmission logic before that spec is written and approved. writer_leases is left completely untouched — it remains a single-device local concurrency guard only.
	SYNC-FOUNDATION — Sync Philosophy Boundary (v7.3)
The following decisions are locked at Phase 1 level. Every future developer working on the sync feature must read and obey these before writing a single line of sync code.
SYNC RULE 1 — Sync Model Is Full Snapshot Only (Not Delta): The sync protocol MUST use Full Snapshot transfer — primary calls createBackup() to serialise the full DB payload, transmits it to the secondary, secondary calls restore() then validateBackupSchema(). Delta sync (sending only changed rows) is permanently prohibited for VJ Billing. Reason: audit_logs, ledger_entries, and other append-only tables were never designed with updated_at or change_sequence columns required for delta tracking. A delta sync engine would require retrofitting every table across all phases. The existing createBackup()/restore()/validateBackupSchema() chain is already hardened, crash-safe, and schema-version-aware — the sync engine inherits this for free. No developer may implement a custom delta sync protocol.
SYNC RULE 2 — Primary Is Always Truth. Secondary Is Always Read-Only: Secondary devices NEVER write to any business table (firms, financial_years, invoices, karigar_ledger, ledger_entries, or any Phase 2–7 table). Secondary devices display data received from the primary only. This is non-negotiable for a legally accountable GST billing system: sequential invoice numbers, stock accuracy, and GST accountability require exactly one write authority. A secondary device that writes creates an irreconcilable data conflict. The sync_devices.deviceRole column (PRIMARY | SECONDARY) encodes this. Any code that allows a SECONDARY device to call a service write function is a hard build violation.
SYNC RULE 3 — writer_leases Is Not Involved in Sync Coordination: writer_leases is a single-device, single-SQLite local concurrency guard. Its assertNoActiveLease() queries THIS device’s own SQLite only. It has no network layer, no broadcast mechanism, and no cross-device awareness. The LeaseType enum (RESTORE | BACKUP | WRITE) must not be extended with a SYNC value — doing so would cause assertNoActiveLease() to block all write operations (createFirm, archiveFirm, closeFY, etc.) whenever a sync lease is held, with catastrophic blast radius. Sync coordination uses sync_devices and sync_log tables exclusively.
SYNC RULE 4 — Primary Controls Secondary Enable/Disable. Not the Reverse: The PRIMARY device holds a Settings > Devices screen with per-secondary enable/disable toggles. These toggles write to sync_devices.isEnabled. Only the PRIMARY device writes to sync_devices. Secondary devices read their own sync_devices row to determine if they are enabled, but never write to it. sync_devices.lastSeenAt is updated only by the primary device when it completes a successful push to that secondary — never by the secondary itself.
SYNC RULE 5 — Offline-First Is Not Violated. WiFi Is Optional, Not Required: VJ Billing operates fully offline on the primary device at all times. Sync to secondary devices is an optional enhancement that occurs only when both devices are on the same LAN/WiFi. If WiFi is unavailable: primary device continues operating normally, secondary devices show the last synced snapshot with a staleness indicator. No write operation on the primary is gated on WiFi availability. The offline-first constitutional pillar is never compromised by the sync layer.
SYNC-FOUNDATION — Database Schema (v7.3)
// db/schema.ts — sync_devices (v7.3 SYNC-FOUNDATION)
export const syncDevices = sqliteTable('sync_devices', {
  id:           text('id').primaryKey(),          // UUID
  deviceId:     text('device_id').notNull(),      // from getDeviceId() — links to deviceId util
  deviceName:   text('device_name').notNull(),    // user-assigned name e.g. "Owner Phone"
  deviceRole:   text('device_role').notNull(),    // 'PRIMARY' | 'SECONDARY' — never mixed
  isEnabled:    integer('is_enabled').notNull().default(0), // 0=disabled 1=enabled
  pairedAt:     text('paired_at').notNull(),      // ISO-8601
  lastSeenAt:   text('last_seen_at'),             // ISO-8601, nullable. Written by PRIMARY only.
  pairingCode:  text('pairing_code'),             // nullable. 6-digit code, cleared after pairing.
});
// db/schema.ts — sync_log (v7.3 SYNC-FOUNDATION)
// APPEND-ONLY. Mirror of audit_logs pattern. Never update or delete rows.
export const syncLog = sqliteTable('sync_log', {
  id:             text('id').primaryKey(),         // UUID
  eventType:      text('event_type').notNull(),    // SyncEventType enum below
  deviceId:       text('device_id').notNull(),     // device that generated this event
  targetDeviceId: text('target_device_id'),        // nullable — the secondary being acted on
  occurredAt:     text('occurred_at').notNull(),   // ISO-8601
  payload:        text('payload'),                 // nullable JSON — event-specific detail
});
// SyncEventType enum — all events that sync_log records
export const SyncEventType = {
  DEVICE_PAIRED:        'DEVICE_PAIRED',       // new secondary paired with primary
  DEVICE_UNPAIRED:      'DEVICE_UNPAIRED',     // secondary removed by primary
  SECONDARY_ENABLED:    'SECONDARY_ENABLED',   // primary toggled secondary ON
  SECONDARY_DISABLED:   'SECONDARY_DISABLED',  // primary toggled secondary OFF
  SYNC_STARTED:         'SYNC_STARTED',        // primary began sending snapshot
  SYNC_COMPLETED:       'SYNC_COMPLETED',      // secondary confirmed restore success
  SYNC_FAILED:          'SYNC_FAILED',         // transport or restore error
} as const;
// db/schema.ts — audit_archive_index (v7.4 AUDIT-ARCHIVE)
// APPEND-ONLY. One row per FY-close per firm. Never update or delete rows.
// Archive trigger: FY_CLOSED audit event in fyService.closeFY() (Phase 2 scope).
export const auditArchiveIndex = sqliteTable('audit_archive_index', {
  id:          text('id').primaryKey(),                         // UUID
  firmId:      text('firm_id').notNull(),                        // FK → firms.id
  fyId:        text('fy_id').notNull(),                          // FK → financial_years.id
  fyLabel:     text('fy_label').notNull(),                       // e.g. 'FY 2024-25'
  archiveDate: text('archive_date').notNull(),                   // ISO-8601 — when FY_CLOSED fired
  rowCount:    integer('row_count').notNull(),                   // # of audit_logs rows for this FY
  storageRef:  text('storage_ref'),                             // nullable — future: file URI for external archive
});
// ARCHIVING RULE (v7.4): audit_logs rows are NEVER deleted. Append-only immutability is preserved.
// Archive trigger: FY_CLOSED event → fyService.closeFY() writes one audit_archive_index row.
// Active logs = current FY only (queryable via WHERE createdAt BETWEEN fy.startDate AND fy.endDate).
// storageRef is reserved for Phase 6+ where archived FYs may be offloaded to external file storage.
	SYNC-FOUNDATION — Migration Zero Dormancy Gate (v7.3)
DORMANCY GATE (v7.3) — sync_devices and sync_log
sync_devices and sync_log are SCHEMA-ONLY in Phase 1. Developers MUST add the following TODO comment at the top of every migration zero CREATE TABLE block for these two tables: "-- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation." This is a second safety layer beyond this documentation gate. ESLint cannot enforce cross-table import boundaries automatically — the comment is the fallback human guard.
⚠️ DEVELOPER ACTION REQUIRED: Drizzle ORM will NOT auto-generate this comment. After running npx drizzle-kit generate, you MUST manually open the generated migration SQL file and add this TODO comment as the first line inside each of the two CREATE TABLE blocks (sync_devices, sync_log). This manual edit must be verified at PR review before merge.
	SYNC-FOUNDATION — Phase 1 Navigation Slot (Settings > Devices)
The Settings screen in Phase 1 MUST reserve a Devices section slot in its navigation structure, positioned between Backup/Restore and Verify My Data. The slot is visible but ALL items inside are gated behind a Future Sync Phase feature flag or TODO marker. No logic is implemented. Tapping the Devices section shows a placeholder screen: "Device sync is available in a future update." This follows the same pattern as Utilities (Phase 6 boundary) and GST (Phase 3 boundary).
DEVICES SECTION — ITEMS (Future Sync Phase Implementation): Device List (all paired devices with role, enabled status, last seen). Enable/Disable toggle per secondary device (PRIMARY only). Pair New Device (shows pairing code QR). Remove Device. All items STUB ONLY in Phase 1 — no service calls, no DB reads, no network.
🔴 PR REVIEW GATE 3 — SYNC-FOUNDATION (v7.3)
PR GATE 3 — No sync transport in Phase 1. Reviewer MUST grep the PR diff for: mDNS, Bonjour, zeroconf, socket, WebSocket, HttpServer, fetch.*secondary, syncTransport, syncService, syncEngine, sendSnapshot, receiveSnapshot. Any match in Phase 1 service, repository, store, or UI code is a hard rejection. Additionally: no write call (createFirm, updateFirm, archiveFirm, unarchiveFirm, closeFY, or any Phase 2–7 service write) may be conditional on deviceRole === 'SECONDARY'. Secondary devices are structurally read-only — no exceptions.
	

🔴 CROSS-PHASE AMENDMENTS REQUIRED — Must Be Applied Before Phase 3 Build
Phase 3 v5.7 — Three amendments required:
(1) Retire gst_config hardcoded metalGstBps and makingGstBps. Replace with tax group lookups: metalTaxGroupId and makingTaxGroupId reference tax_groups.id. calculateInvoice() resolves bps from the group’s components rather than reading from gst_config directly.
(2) Remove "GST RATES — CANNOT BE CHANGED BY USER" lock. Replace with "GST rates are managed via Settings > GST > Tax List. Rates are user-maintainable to accommodate government GST Council revisions."
(3) Add taxGroupId column to sale_invoice_items: the group active at time of invoice posting is recorded for immutable historical reference (even if the group is later updated).
Phase 5 v2.0 — One amendment required:
Remove "GST rate — 3% CGST + 3% SGST fixed in Phase 3. Never exposed to settings." from the Cannot Change lock list. Replace with "GST rates — managed via Settings > GST > Tax List (Phase 3 Step 0). Rate engine config and split logic remain in Phase 3 calculateInvoice() — Phase 5 does not expose the rate engine."
Phase 6 v1.1 — One amendment required:
gst_config table (metalGstBps, makingGstBps) is superseded by the tax_groups / tax_group_components tables introduced in Phase 1 and wired in Phase 3. Phase 6 migration 0008 must not re-declare gst_config with hardcoded bps defaults. GST report queries in Phase 6 read cgstPaise/sgstPaise stored at invoice time — they do not re-resolve from tax groups. No change to GSTR-1/2/3B computation logic — those read from invoice paise columns directly.
	

🆕 NEW v6.2 — Settings > General (G67 + G68 + G69)
Settings > General — Full Screen Specification
The General section is the first section under Settings. It contains app-wide preferences that affect every screen. All changes go through Dual Guard and write a SETTINGS_CHANGED audit event.
GENERAL SECTION — SCREEN LAYOUT
Currency           INR — Indian Rupee (₹)   [read-only label, no tap, no picker]
Date Format        [selector — 6 options, live preview shown]
Warn Unsaved Changes  [toggle: ON (default) / OFF]
Theme              System / Light / Dark  [existing]Security           App PIN  [v7.29: Set Up PIN (if skipped/not set) or Change PIN (if set)]
Invoice            [structure only — screen scaffold, no logic in Phase 1]
Audit Log Retention  30 days  [v7.10: was 365]
G67 — CURRENCY (v6.2) — READ-ONLY, NOT USER-CONFIGURABLE
Currency is a constitutional default. VJ Billing is an Indian GST billing app — the currency is INR (₹) and is NEVER user-changeable. Changing currency mid-operation would corrupt all historical monetary records. The Settings > General screen displays Currency as a read-only informational row only — no picker, no tap target.
Schema fields added to app_settings:
currency: text('currency').notNull().default('INR')
currencySymbol: text('currency_symbol').notNull().default('₹')
currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2) // paise
All monetary display throughout the app MUST read currencySymbol from appSettingsStore. Never hardcode ₹ in any component. Utility: getCurrencySymbol() in utils/currency.ts reads from the store and returns the symbol string.
G67-UI — CURRENCY ROW EXACT COMPONENT SPEC (v6.8)
The Settings > General currency row MUST be rendered as a permanently disabled, visually distinct informational row. The following spec is binding and must not be interpreted loosely by developers:
Layout:    [Icon: ₹]  "Currency"    [Value: "INR — Indian Rupee (₹)"]
Subtitle:  "Fixed for Indian GST compliance" (below value, smaller font)
Style:     opacity: 0.5, pointerEvents: 'none', no onPress, no chevron, no ripple
a11y:      accessibilityRole="text", accessibilityLabel="Currency: Indian Rupee, fixed"
Test:      Tap on row MUST produce no action, no navigation, no modal
G67-LINT — ESLINT RULE: NO HARDCODED ₹ SYMBOL (v6.8) — CI-ENFORCED
The "never hardcode ₹" rule is architectural law but was previously only documentation. As of v6.8 it is machine-enforced by ESLint no-restricted-syntax. The rule flags any string literal containing the ₹ character or the text 'INR' outside of utils/currency.ts and the DB seed file. This prevents accidental monetary display bugs across Phases 2–7 where dozens of components render money values.
Add to .eslintrc.js (alongside existing G65 no-restricted-imports rule):
// .eslintrc.js — add inside overrides for app/**/*.{ts,tsx} and screens/**/*.{ts,tsx}
"no-restricted-syntax": [
  "error",
  {
    // Selector targets string literals containing ₹ or standalone 'INR'
    selector: "Literal[value=/\u20B9|\\bINR\\b/]",
    message: "CURRENCY_HARDCODE: Never hardcode ₹ or 'INR'. Use getCurrencySymbol() from utils/currency.ts (G67)",
  }
]
ALLOWLIST (files excluded from this rule via overrides):
utils/currency.ts              ← canonical source of truth (getCurrencySymbol())
db/seed.ts                     ← DB seed INSERT is allowed to contain 'INR' and '₹'
migrations/                    ← SQL migration files exempt (raw SQL strings)
CI GATE: This rule runs in the same ESLint pass as G65 no-restricted-imports. Any phase build that contains a hardcoded ₹ or 'INR' string in app/ or screens/ FAILS the build. This gate must be verified at the end of every phase before merging. Run: npx eslint --ext .ts,.tsx app/ screens/ to check.
PHASE COUPLING NOTE (Phases 3–7): Phase 3 stores money as moneyOutstandingPaise (integer). All display of paise values MUST use getCurrencySymbol() + divide by currencyDecimalPlaces (100). Pattern: `${getCurrencySymbol()}${(paise / 100).toFixed(2)}`. No component in any phase may shortcut this.
G67-AMOUNTTOWORDS — amountToWords() CANONICAL IMPLEMENTATION (v7.6) — INDIAN RUPEE DENOMINATION
utils/currency.ts MUST export amountToWords(paise: number): string. This function converts an integer paise value into Indian-denomination words for use on payment vouchers, URD purchase bills, and receipts. Callers: Phase 2 URD purchase bill (URD-AMOUNT-WORDS v1.54), Phase 3 payment receipts. Rules: (1) Input is always integer paise. (2) Denominations: Rupees and Paise (Indian system — lakh/crore grouping, NOT million/billion). (3) Suffix: always append “Only”. (4) Zero paise remainder omitted — e.g. ₹6500.00 → “Rupees Six Thousand Five Hundred Only”. (5) Non-zero paise remainder appended — e.g. ₹6500.50 → “Rupees Six Thousand Five Hundred and Paise Fifty Only”. (6) MAX value: 99,99,999 paise (₹99,99,999.99 = 999999999 paise). Values above this MUST throw AMOUNT_TOO_LARGE. ⚠️ v7.9 FIX-V79-4: The guard is if (paise > 999999999) — 9 digits, not 10. ₹99,99,999.99 = 9,99,99,999 paise = 999999999 paise (9 digits). The previous guard value 9999999999 (10 digits = ₹9,99,99,999.99 ≈ 10 crore) was wrong for a sub-crore jewellery billing context. Corrected in v7.9. (7) Negative input MUST throw AMOUNT_NEGATIVE. (8) Non-integer input MUST throw AMOUNT_NOT_INTEGER.
Canonical implementation — add to utils/currency.ts:
// utils/currency.ts — G67-AMOUNTTOWORDS (v7.6)
// Converts integer paise to Indian-denomination words for bills/vouchers.
// Example: 650000 → "Rupees Six Thousand Five Hundred Only"
// Example: 650050 → "Rupees Six Thousand Five Hundred and Paise Fifty Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
             'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
             'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
             'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty',
             'Seventy', 'Eighty', 'Ninety'];
function wordsUpTo999(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)]! + ' Hundred'
       + (n % 100 ? ' ' + wordsUpTo999(n % 100) : '');
}
export function amountToWords(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error('AMOUNT_NOT_INTEGER');
  if (paise < 0)           throw new Error('AMOUNT_NEGATIVE');
  if (paise > 999999999)  throw new Error('AMOUNT_TOO_LARGE'); // max ₹99,99,999.99 = 999999999 paise (v7.9 FIX-V79-4: was 9999999999, corrected to 9 digits)
  if (paise === 0)          return 'Rupees Zero Only';
  const totalRupees = Math.floor(paise / 100);
  const remainPaise = paise % 100;
  // Indian grouping: crore (10M), lakh (100K), thousands, hundreds
  const parts: string[] = [];
  const crore    = Math.floor(totalRupees / 10000000);
  const lakh     = Math.floor((totalRupees % 10000000) / 100000);
  const thousand = Math.floor((totalRupees % 100000) / 1000);
  const remainder = totalRupees % 1000;
  if (crore)    parts.push(wordsUpTo999(crore)    + ' Crore');
  if (lakh)     parts.push(wordsUpTo999(lakh)     + ' Lakh');
  if (thousand) parts.push(wordsUpTo999(thousand) + ' Thousand');
  if (remainder) parts.push(wordsUpTo999(remainder));
  let result = ('Rupees ' + parts.join(' ')).trim(); // v7.8 FIX-V78-2: .trim() prevents trailing space when parts produces empty string for exact-lakh/crore boundaries
  if (remainPaise) result += ' and Paise ' + wordsUpTo999(remainPaise);
  return result + ' Only';
}
PHASE COUPLING NOTE: amountToWords() is consumed by Phase 2 URD purchase bill (URD-AMOUNT-WORDS v1.54) and Phase 3 payment receipts. Input is ALWAYS integer paise — callers MUST NOT divide before passing. The function handles the paise→rupees split internally. G67-LINT allowlist already covers utils/currency.ts — this function is exempt from the no-₹-hardcode rule because it produces Rupees/Paise denomination words, not ₹ symbols.
🆕 v7.7 AMOUNTTOWORDS-TESTS — STEP R TEST MATRIX (Phase 2 gate): All 7 tests below MUST pass on the real Android device before Phase 2 begins. amountToWords() is called in Phase 2 URD bills and Phase 3 receipts with no fallback — a broken implementation produces wrong legal tender amounts.
// __tests__/utils/currency.test.ts — amountToWords() canonical test suite (v7.7)import { amountToWords } from '@/utils/currency';// --- HAPPY PATH ---test('whole rupees — no paise', () =>  expect(amountToWords(650000)).toBe('Rupees Six Thousand Five Hundred Only'));test('rupees and paise', () =>  expect(amountToWords(650050)).toBe('Rupees Six Thousand Five Hundred and Paise Fifty Only'));test('zero amount', () =>  expect(amountToWords(0)).toBe('Rupees Zero Only'));// v7.9 FIX-V79-4: max is 999999999 paise (₹99,99,999.99), corrected from 9999999999test('max valid amount — boundary', () =>  expect(() => amountToWords(999999999)).not.toThrow());// --- ERROR GUARDS ---test('negative input throws AMOUNT_NEGATIVE', () =>  expect(() => amountToWords(-1)).toThrow('AMOUNT_NEGATIVE'));// v7.9 FIX-V79-4: first value above corrected max (1000000000 = ₹1,00,00,000.00)test('above max throws AMOUNT_TOO_LARGE', () =>  expect(() => amountToWords(1000000000)).toThrow('AMOUNT_TOO_LARGE'));test('non-integer input throws AMOUNT_NOT_INTEGER', () =>  expect(() => amountToWords(1.5)).toThrow('AMOUNT_NOT_INTEGER'));// v7.8 FIX-V78-2: trim() fix regression test — exact-lakh value must have no double spacetest('exact lakh boundary has no trailing space before Only', () =>  expect(amountToWords(10000000)).toBe('Rupees One Lakh Only'));
PHASE 2 GATE: These 8 tests are added to the Step R gate checklist alongside the existing Phase 1 real-device tests. Phase 2 MUST NOT begin until all 8 pass. Add to scripts/post-generate-checklist.md as a Step R pre-flight item.
 
The existing dateFormat field is renamed to dateFormatToken (migration required: ALTER TABLE app_settings RENAME COLUMN date_format TO date_format_token). The user selects from 6 canonical format options. The selected format applies to every date displayed in the app — invoice dates, FY labels, audit log timestamps, dashboard, backup preview screens. No component may hardcode a date format.
Canonical Date Format Options (date-fns tokens): ⚠️ CRITICAL — date-fns v3 uses lowercase tokens. Use EXACTLY the tokens in the Token column below. Do NOT use moment.js-style uppercase tokens (e.g. DD/MM/YYYY is WRONG in date-fns — the correct token is dd/MM/yyyy).
Token           Example (4 Mar 2026)    Notes
dd/MM/yyyy      04/03/2026              DEFAULT — most common in India
d MMM yyyy      4 Mar 2026              Readable long form (user-requested)
dd-MM-yyyy      04-03-2026              Hyphen variant (user-requested)
dd MMM yyyy     04 Mar 2026             Formal padded long form
yyyy-MM-dd      2026-03-04              ISO 8601 — for CA/accountant exports
d/M/yyyy        4/3/2026                Compact Indian style
UI Rules for Date Format Picker:
• Display a live preview line below the picker showing today’s date in the selected format: e.g. “Preview: 4 Mar 2026”. Updates instantly on selection change.
• Selecting a format saves immediately to DB via updateSettings() with Dual Guard. Writes SETTINGS_CHANGED audit event with payload { field: 'dateFormatToken', oldValue, newValue }.
• App-wide propagation: ALL date rendering MUST call formatDate(isoString) from utils/formatDate.ts. This utility reads dateFormatToken from appSettingsStore via Zustand and applies date-fns format(). No component may hardcode a date format string.
• Changing date format does NOT affect stored ISO-8601 values in the DB. It is purely a display transformation. No migration of data is required on format change.
• Surfaces that MUST use formatDate(): invoice dates, FY labels (start/end), audit log timestamps, dashboard date display, backup preview screen dates, restore preview screen dates, Firm Manager dates.
// utils/formatDate.ts
import { format, parseISO } from 'date-fns';
import { appSettingsStore } from '@/stores/appSettingsStore';
export function formatDate(isoString: string): string {
  const token = appSettingsStore.getState().dateFormatToken ?? 'dd/MM/yyyy'; // date-fns v3 token — lowercase dd and yyyy
  return format(parseISO(isoString), token);
}
G69 — WARN UNSAVED CHANGES (v6.2) — TOGGLE ON/OFF
When ON (default), navigating away from any screen with unsaved edits shows a confirmation dialog: “You have unsaved changes. Leave anyway?” with options Stay and Leave. When OFF, navigation proceeds silently without warning.
Schema field added to app_settings:
warnUnsavedChanges: integer('warn_unsaved_changes').notNull().default(1) // 1=ON, 0=OFF
Implementation — useUnsavedChangesGuard hook:
// hooks/useUnsavedChangesGuard.ts
import { useEffect } from 'react';                              // v6.4 BLOCKER B fix
import { Alert } from 'react-native';                           // v6.4 BLOCKER B fix
import { appSettingsStore } from '@/stores/appSettingsStore';   // v6.4 BLOCKER B fix
import { useNavigation } from '@react-navigation/native';
export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation(); // required: Expo Router navigation instance
  const warnEnabled = appSettingsStore.getState().warnUnsavedChanges === 1;
  useEffect(() => {
    if (!warnEnabled || !isDirty) return;
    // Intercept Expo Router back navigation
    const sub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?',
        [{ text: 'Stay' }, { text: 'Leave', onPress: () => navigation.dispatch(e.data.action) }]);
    }); return () => sub();
  }, [isDirty, warnEnabled]); }
Phase 1 screens that MUST apply useUnsavedChangesGuard:
• Firm creation screen (createFirm form)
• Firm edit screen (updateFirm form)
• Settings edit screen (updateSettings form) — Phase 2+ applies to invoice/receipt creation forms.
Toggle change saves immediately to DB via updateSettings() with Dual Guard. Writes SETTINGS_CHANGED audit event with payload { field: 'warnUnsavedChanges', oldValue, newValue }.
	G71 — SECURITY / APP PIN (v7.29) — SET UP OR CHANGE PIN FROM SETTINGS
Introduced by FIX-V729-1 (skippable setup) and FIX-V729-2 (4-or-6-digit choice). This row's label and behavior are conditional on pinService.isPinSet():
• If isPinSet() is false (never set, or skipped at first boot): row label reads "Set Up PIN", subtitle "Not set — tap to secure your app". Tapping opens the PIN Setup screen (same component used at first boot), which calls pinService.setPin(pin) on confirmation. On success, clears the skipped flag and writes a PIN_SET audit event.
• If isPinSet() is true: row label reads "Change PIN", subtitle "PIN is set". Tapping opens the Change PIN screen: current PIN field, new PIN field, confirm-new-PIN field. Confirmation calls pinService.changePin(currentPin, newPin), which throws PIN_INCORRECT if the current PIN is wrong (same 3-attempt/lockout counters as the boot-time PIN entry screen apply here too). On success, writes a PIN_CHANGED audit event.
First-boot skip flow (FIX-V729-1):
The first-boot PIN Setup screen now shows a secondary "Skip for now" text action below the primary "Set PIN" button. Tapping it calls pinService.setPinSkipped(), writes a PIN_SKIPPED audit event, and proceeds directly to bootstrapDatabase() with no gate. On every later app open, if isPinSkipped() is true and isPinSet() is false, the app opens straight to bootstrapDatabase() — the PIN Setup screen is NOT shown again automatically. The only re-entry point is this G71 Settings row.
Recommended (non-blocking) UX: a one-time dismissible banner or a Settings row badge indicating "PIN not set" while isPinSkipped() is true and isPinSet() is false. This is a UI recommendation, not a functional gate — no build-blocker if omitted, but the G71 row itself is mandatory.
PIN length choice and getPinLength() call sites (FIX-V729-2):
The PIN Setup screen (first boot, and Settings > General > Security > Set Up PIN) shows a segmented control — "4-digit PIN" / "6-digit PIN" — above the entry field, defaulting to "6-digit PIN". Selecting a segment sets the number of dot indicators rendered by the entry field; the user cannot submit until exactly that many digits are entered. On confirmation the screen calls pinService.setPin(pin), which independently re-validates the length (4 or 6) before hashing — the segmented control is a UX convenience, not the source of truth for validation. The Change PIN screen's "new PIN" field uses the same segmented control (independent of the current PIN's length, per FIX-V729-2's "new PIN may be 4 or 6 digits, independent of the old PIN's length" rule); its "current PIN" field is NOT a segmented-control field — it calls pinService.getPinLength() on screen mount and renders that many dot indicators directly, since the length of the existing PIN is already fixed. The boot-time PIN entry screen (shown on every subsequent boot once isPinSet() is true) likewise calls pinService.getPinLength() on mount to render the correct number of dot indicators before the user starts typing.
Schema / storage — no new SQLite table required (PIN state lives in MMKV, consistent with FIX-VSEC-3 original design):
vjbilling_pin_setup_skipped: 'true' | undefined  // MMKV key, see pinService.ts isPinSkipped()/setPinSkipped()
PIN_SET, PIN_CHANGED, and PIN_SKIPPED added to the Event Type Display Mapping table and to the AuditPayload discriminated union in types/audit.ts (event count 19→22). No new errorCodes.ts entries required — PIN_INCORRECT and PIN_LOCKED (from FIX-VSEC-3) are reused by changePin() and the boot-time entry screen alike.
	

v6.4 — updateSettings() Canonical Implementation (BLOCKER C Fix)
updateSettings() is the ONLY method that may mutate app_settings. It applies the full Dual Guard, writes to the DB inside a transaction, writes a SETTINGS_CHANGED audit event, then syncs appSettingsStore. Currency fields are blocked — they are read-only by constitutional design (G67). All G67/G68/G69 user-configurable fields pass through this single method.
// types/settings.ts
export type UpdateSettingsInput = {
  theme?: string;              // 'system' | 'light' | 'dark'
  auditRetentionDays?: number;
  dateFormatToken?: string;    // one of the 6 canonical tokens (G68)
  warnUnsavedChanges?: number; // 1=ON, 0=OFF (G69)
  // currency fields EXCLUDED — read-only, never user-changeable (G67)
};
 
// services/settingsService.ts
export async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await assertNoActiveLease(); // GUARD 1
  assertNotInSafeMode();       // GUARD 2
  if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input)
    throw new Error('CURRENCY_IMMUTABLE: currency fields are read-only (G67)');
  const existing = appSettingsStore.getState();
  const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
  // v7.16 FIX-V716-4: JSI driver requires synchronous tx callback — async removed  db.transaction((tx) => {
    tx.update(appSettings).set(updated).where(eq(appSettings.id, 1));
    auditRepository.log(tx, {
      eventType: 'SETTINGS_CHANGED',
      firmId: null, // device-level event — settings are not firm-scoped
      payload: JSON.stringify({
        fields: Object.keys(input),
        oldValues: Object.fromEntries(Object.keys(input).map(k => [k, (existing as any)[k]])),
        newValues: input,
      }),
    });
  });
  appSettingsStore.setState(updated); // sync Zustand after DB commit
}
	

Blocked in Phase 1 Settings
✗ GST Tax List UI (schema tables created in Phase 1; full UI + calculateInvoice() wiring implemented in Phase 3 Step 0 — see Settings > GST section above)
✗ Invoice templates
✗ Payment modes
✗ Automation rules


________________




STEP
16
	UI & BOOTSTRAP
HARDENING 2: loadSafeModeState(). HARDENING 5: Device ID. v2.4: Purge-all + write order.
	

App Entry Flow (v2.7 Updated)
Step
	Action
	PIN
	PIN gate (v7.23 FIX-VSEC-3, v7.29 FIX-V729-1) — runs BEFORE this sequence begins, before Step 0. isPinSet() true → mandatory PIN entry screen shown, no bypass; 3 failed attempts triggers a 30-second lockout doubling on each subsequent failure (pinService.ts, Step 16). isPinSet() false and isPinSkipped() false → PIN Setup screen shown with a primary “Set PIN” button and a secondary “Skip for now” action; tapping Skip calls setPinSkipped() and falls through to Step 0 with no gate. isPinSet() false and isPinSkipped() true → falls straight through to Step 0, no gate shown. Once past this gate (PIN verified, PIN set for the first time, or skipped), Step 0 begins. PIN can always be set up later from Settings > General > Security > “Set Up PIN.”
	0
	Pre-migration raw snapshot → v7.24 FIX-VSEC-14: write ENCRYPTED snapshot to BACKUP_DIR (same directory as .vjb files), NOT DocumentDirectory. Filename: vjbilling_premigration_snapshot.enc. Encrypted with AES-256-GCM using a device-derived key (no user password — device-local emergency file). DatabaseErrorScreen OPTION 1 reads and decrypts using the same device-derived key. If write throws: console.error only — audit log NOT available yet. (Non-blocking.)
v7.26 FIX-V726-6 [build-blocker]: FIX-VSEC-14 referenced a “device-derived key” for this snapshot but never printed a canonical implementation — the same gap pattern FIX-V724-1/2/3/4 caught elsewhere in v7.24. Canonical utils/deviceKey.ts added, now reused by createBackup()/restore() (FIX-V726-4/5) for password-less automated backups: export async function getDeviceDerivedKeyMaterial(): Promise<Uint8Array> { const deviceId = getDeviceId(); const enc = new TextEncoder(); const raw = await crypto.subtle.digest('SHA-256', enc.encode('vjbilling_device_key_v1:' + deviceId)); return new Uint8Array(raw); } — deterministic per-device, per-install material (re-derivable on the same device without storing the key itself); NOT a substitute for a user password — it only protects content from being read after copying the file off the device, not from another process on the same device.
	1
	App opens → bootstrapDatabase() runs. Comment at top: "Steps 0-4 must not call any service method that invokes assertNotInSafeMode(). Zustand is not yet loaded."
	2
	Migration check → fail = DatabaseErrorScreen (see escape path below)
🆕 v7.7 WAL-PRAGMA — ADD IMMEDIATELY AFTER MIGRATION SUCCEEDS, BEFORE ANY REPOSITORY CALL:
// v7.16 FIX-V716-2 [build-blocker]: await db.run(sql`PRAGMA...`) targets the legacy async Drizzle driver.// With drizzle-orm/expo-sqlite JSI driver, PRAGMAs MUST be set on the underlying SQLiteDatabase handle// BEFORE Drizzle wraps it. Pattern (FIX-V715-3 canonical):const sqlite = SQLite.openDatabaseSync('vjbilling.db');sqlite.execSync("PRAGMA journal_mode = WAL");sqlite.execSync("PRAGMA synchronous = NORMAL");sqlite.execSync("PRAGMA cache_size = -8000");sqlite.execSync("PRAGMA temp_store = MEMORY");sqlite.execSync("PRAGMA mmap_size = 30000000");const db = drizzle(sqlite); // Drizzle wraps sqlite AFTER PRAGMAs are set// ⚠️ NEVER use: await db.run(sql`PRAGMA...`) with JSI driver — it targets bridge-based async driver only.
WAL mode eliminates full-file locks on every write. Without it the entire DB file is locked on every assertNoActiveLease(), createFirm(), auditRepository.log(), closeFY(), and createBackup() call. This is the highest-impact single configuration change in the entire spec. CONSTITUTIONAL RULE: PRAGMA settings are non-optional and must execute before the first repository call in every bootstrapDatabase() run.
	3
	PURGE ALL writer leases (v2.4 G10: DELETE FROM writer_leases — no WHERE clause — leases are session-scoped)
	4
	HARDENING 5: Initialize device ID Phase A (generate + persist to MMKV, no audit log yet)
	5
	HARDENING 2: Load Safe Mode state from DB → if isActive, activate in Zustand. (bootstrapComplete.value is still false here.)
🆕 v7.7 SAFE-MODE-ROW-GUARD (v7.8 FIX-V78-4: trigger corrected): If db.select().from(safeModeState).limit(1) returns rows.length === 0, do NOT assume Safe Mode is off. First confirm that migration zero ran successfully (schema_version row exists). If migration zero is confirmed and the safe_mode_state row is still missing, this is a database storage corruption event — activate Safe Mode with trigger STORAGE_CORRUPTION_DETECTED (v7.8: previously incorrectly specified as FY_INTEGRITY_BROKEN, which is reserved for firms with no active FY — a completely different problem) and abort bootstrap. A missing safe_mode_state row after a confirmed successful migration is structurally impossible under normal operation and indicates storage-layer corruption. Audit event payload must include { missingTable: 'safe_mode_state', schemaVersionConfirmed: true } for triage. STORAGE_CORRUPTION_DETECTED is a new SafeModeTrigger enum value added in v7.8 — see Safe Mode Trigger table in Step 10.
	6
	Load other Zustand stores from MMKV
	7
	Device ID Phase B: write DEVICE_ID_GENERATED audit event if not yet logged
	7b
	Set bootstrapComplete.value = true. assertNotInSafeMode() is now safe to call.
	8
	Check if any firm exists → No firm: show Setup/Restore choice screen
	9
	Firm exists → run Verify My Data (silent)
🆕 v7.7 VERIFY-BOOT-CACHE: Before running verifyService.runVerify(), check MMKV cache. If vjbilling_last_verify_status = 'HEALTHY' AND vjbilling_last_verify_at is within the last 30 minutes AND vjbilling_boot_was_interrupted = false → skip full verify, use cached HEALTHY result. (v7.14 FIX-V714-4: crash flag named. This MMKV boolean key is written true at the very start of bootstrapDatabase(), cleared false only after bootstrapComplete.value = true is set. A crash or force-quit between those two points leaves it true, forcing a full verify on next boot. Third MMKV key alongside the existing two.) Always run full verify after: restore, FY close, Safe Mode activation or clearance. Always run full verify if last_verify_status was WARNING or CRITICAL. After every full verify completes: write vjbilling_last_verify_status and vjbilling_last_verify_at to MMKV. This eliminates 9 full-table-scans from every normal app open while preserving all safety guarantees.
	10
	CRITICAL → activate Safe Mode (persisted to DB), go to Dashboard with overlay
	11
	WARNING → go to Dashboard + show persistent amber banner
	12
	HEALTHY → go to Dashboard normally
	

APP ENTRY FLOW — FORMAL DECISION TREE (v2.7 Hardened)
This is the canonical decision tree that governs what the user sees the moment the app finishes bootstrapping. Every developer must implement EXACTLY this logic — no shortcuts, no combined paths.
App Opens → PIN Gate (v7.23 FIX-VSEC-3 / v7.29 FIX-V729-1 — runs BEFORE bootstrapDatabase())
  ├─ isPinSet() true → mandatory PIN entry screen, no bypass → verified → continue below
  ├─ isPinSet() false, isPinSkipped() false → PIN Setup screen ("Set PIN" / "Skip for now") → continue below
  └─ isPinSet() false, isPinSkipped() true → continue below, no gate shown
      │ (PIN verified, set for the first time, or skipped — Settings > General > Security > "Set Up PIN" always available later)
      ▼
App Opens → bootstrapDatabase() completes Step 7b
  └─ Does any firm exist in the DB? (countActiveFirms check)
       ├─ NO FIRM EXISTS → Show Setup/Restore Choice Screen
       │   ├─ BACKUP DETECTED (.vjb file on device) → Show [Restore from Backup] FIRST, then [Set Up New Firm]
       │   └─ NO BACKUP  → Show only [Set Up New Firm] (no clutter)
       └─ FIRM EXISTS → Run Verify My Data (silent)
           ├─ HEALTHY  → Dashboard (normal)
           ├─ WARNING  → Dashboard + persistent amber banner
           └─ CRITICAL → Safe Mode activated → Dashboard with Safe Mode overlay
CRITICAL RULES — App Entry Flow
✗ NEVER show Dashboard if no firm exists. Always route to Setup/Restore choice first.
✗ NEVER skip Verify My Data when a firm exists. Corruption must be caught at boot, not on first write.
✓ Restore option is shown BEFORE firm setup when a backup is detected. This prevents a user accidentally creating a duplicate firm and then restoring on top.
✓ Firm Setup screen collects: Firm Name, Proprietor Name (required — notNull in schema, shown on invoice headers and in Firm Manager), Firm Code, GSTIN (optional), Address, Phone(s), BIS Licence (optional). No firm can be created without a proprietor name.
DatabaseErrorScreen Escape Path


If migrations fail, the user is NOT shown a dead-end error screen.


OPTION 1 — Export Raw Data: Reads pre-migration snapshot from DocumentDirectory. If absent → button shows as DISABLED: 'No snapshot available — pre-migration backup did not complete'. This is raw data, not a valid .vjb backup file.


OPTION 2 — Contact Support: Opens support contact flow. Shows the migration error message for the user to share.


OPTION 3 — Factory Reset: Shown last, with explicit data-loss warning. Requires user to type 'DELETE' to confirm. Deletes the SQLite database file and restarts bootstrap.
	

________________




STEP
17
	AUDIT LOG SCREEN
Read-only governance visibility. Every critical action visible to users.
	

Audit Log screen exposes audit_logs table in a read-only, human-friendly format. Access: Settings → Audit Log.


Event Type Display Mapping (v2.6 G16: FIRM_UNARCHIVED + FIRM_ARCHIVED added)
Event Type
	Human-Readable Label
	FIRM_CREATED
	Firm Created
	FIRM_UPDATED
	Firm Updated
	FIRM_SWITCHED
	Switched Active Firm
	FIRM_ARCHIVED
	Firm Archived
	FIRM_UNARCHIVED
	Firm Reactivated
	FIRM_CODE_SET
	Firm Code Assigned
	SAFE_MODE_ACTIVATED
	Safe Mode Activated
	SAFE_MODE_CLEARED
	Safe Mode Cleared
	BACKUP_CREATED
	Backup Created
	RESTORE_COMPLETED
	Data Restored
	RESTORE_OLD_SCHEMA
	Old Backup Restored
	FY_CLOSED
	Financial Year Closed
	SETTINGS_CHANGED
	Settings Modified
	DEVICE_ID_GENERATED
	New Device Registered
	BIS_LOGO_ARCHIVED
	BIS Logo Removed
	PRE_MIGRATION_SNAPSHOT_FAILED
	Pre-Migration Snapshot Failed
	AUDIT_RETENTION_PURGE_EXECUTED
	Audit Log Retention Purge Ran (v7.12 FIX-V712-4)
	DEVICE_ID_CHANGED
	Device ID Changed (Reinstall / New Device) (v7.23 FIX-VSEC-8)
	FACTORY_RESET_EXECUTED
	Factory Reset Executed (v7.23 FIX-VSEC-12)
	PIN_SET
	PIN Set (First Time) (v7.29 FIX-V729-1)
	PIN_CHANGED
	PIN Changed (v7.29 FIX-V729-1)
	PIN_SKIPPED
	PIN Setup Skipped At First Boot (v7.29 FIX-V729-1)
	

________________




STEP
18
	DASHBOARD STATUS INDICATOR
v2.4 G09: Assigned step number. Real-time writer lease display.
The Dashboard shows a real-time indicator of the current system state: whether a writer lease is active, and how long the operation has been running. This is the user-visible surface of the lease governance system.


Dashboard Query — CORRECTED (v2.4 G03)


Previous spec had: WHERE id = 1 — this is wrong. writer_leases uses UUID keys, not integer id = 1.
Correct query: WHERE expires_at > datetime('now') — finds any non-expired active lease.
	

Example Dashboard States
Scenario
	Dashboard Shows
	Idle — no operation running
	🟢  System free — No lease row in DB
	Backup running (1 min elapsed)
	🔴  Backup running — 01:00 — Heartbeat extending expiresAt
	Restore running (2 min 14 sec)
	🔴  Restore running — 02:14 — Guards blocking all writes
	App crashed mid-operation (recovery)
	🟢  System free — All leases purged on restart
	

________________




STEP
A
	HYBRID STORAGE ENGINE
MMKV (production) + AsyncStorage fallback (Expo Go)
	

Abstracts MMKV vs AsyncStorage behind a single interface. MMKV for production (30x faster), AsyncStorage for Expo Go. Developer never thinks about which is running.


MMKV vs AsyncStorage Crash Parity (Android)


MMKV writes are synchronous and atomic at the native layer — either commits or does not.
AsyncStorage writes are async promise-based — a crash during setItem may leave the key absent.


All MMKV/AsyncStorage-written state must be inventoried for crash-safe semantics:
  - deviceId: protected — Phase A re-generates if absent on next boot.
  - Zustand persisted slices: must be designed to handle missing/partial state gracefully.


Android Detox tests must include a crash-during-write scenario for AsyncStorage to verify recovery behavior.
	

________________




STEP
B
	DEVICE ID MANAGEMENT
HARDENING 5: Stable persistence. Two-phase bootstrap to break circular dependency.
	

Device ID is logged in the audit trail with every critical event. Stable across app restarts. Intentionally regenerates on app reinstall.


// utils/deviceId.ts
const DEVICE_ID_KEY = 'vjbilling_device_id';


export function getOrGenerateDeviceId(): string {
  const existing = storage.getString(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = uuid();
  storage.set(DEVICE_ID_KEY, newId);
  return newId;
}


export function getDeviceId(): string {
  const id = storage.getString(DEVICE_ID_KEY);
  if (!id) throw new Error('DEVICE_ID_NOT_INITIALIZED');
  return id;
}
	

________________




STEP
R
	ARCHITECTURAL REVIEW ITEMS
11 items. Phase 2 blocked until all pass.
	

Review Item 1 — GSTIN Format Validation
REVIEW: validateGSTIN() Must Fully Implement All 6 Rules
Resolution: Full implementation provided in Step 3. validateGSTIN() calls verifyGSTINChecksum() as rule 6.
	

Review Item 2 — Pre-Migration Snapshot Must Run First
REVIEW: Pre-Migration Snapshot is Step 0 (not Step 1)
Resolution (v2.7 extended): bootstrapDatabase() MUST attempt a raw JSON snapshot of all existing tables BEFORE running any migration. Failure is non-blocking (console.error). Audit event is deferred to post-migration.
	

Review Item 3 — Archive Firm Lease Guard
REVIEW: firmService.archiveFirm() Must Use Dual Guard
Resolution: firmService.archiveFirm() MUST begin with both guards in sequence: await assertNoActiveLease() then assertNotInSafeMode() before any restriction checks or database writes. No exception.
	

Review Item 4 — Naming the 0.5 Gap (Updated for Android-Only Scope)
REVIEW: Production Readiness Score — The 0.5 Gap (v2.7 Updated)


(1) iOS background suspension — DEFERRED. Not in scope for Phase 1.
(2) MMKV vs AsyncStorage parity — Android only. Crash-during-write in AsyncStorage (Expo Go) must be tested on Android. See Step A.
(3) safe_mode_state first-boot row — The single-row table (id = 1) must be seeded in migration zero. Requires an integration test simulating first-boot with missing row. Must run on real Android device.


Phase 1 closes at 10/10 when item 3 (safe_mode_state first-boot row) has passing automated tests on real Android device. Phase 2 may not begin until this item is verified.
	

Review Item 5 — Phase 1 Test Strategy (Android)
Phase 2 must not begin until this test suite passes.
v6.5 — DETOX SETUP PREREQUISITE (GAP 6 FIX)
Android Detox is a dev-environment prerequisite for Phase 1. Phase 2 is blocked until Detox tests pass on a real Android device. The following setup must be completed before any Step R test can run. Without this, a developer will reach Step R with no test infrastructure and block Phase 2 indefinitely.
Minimum Detox Setup (Android):
npm install --save-dev detox @config-plugins/detox
npx detox init -r jest
Minimum .detoxrc.js stub:
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' }, jest: { setupTimeout: 120000 } },
  apps: { 'android.debug': { type: 'android.apk', binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk', build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug' } },
  devices: { 'android.device': { type: 'android.real', device: { adbName: 'VJBilling_Test_Device' } } },
  configurations: { 'android.real': { device: 'android.device', app: 'android.debug' } },
};
Run command:
npx detox test --configuration android.real
🆕 v7.8 FIX-V78-7 — LAYER 2 RESTORE TESTS: Updates.reloadAsync() Mock (MANDATORY)
restoreService.restore() calls Updates.reloadAsync() from expo-updates. In debug/development Detox builds, this throws "Updates.reloadAsync() is not supported in development builds" — ALL Layer 2 restore tests fail with an unhandled native module error before any assertion runs. Add this mandatory mock to e2e/setup.ts (global Detox setup file):
⚠️ v7.9 FIX-V79-6 — VERIFY SETUP FILENAME BEFORE ADDING MOCK: The filename e2e/setup.ts is Detox’s conventional default but it is not guaranteed. After running npx detox init -r jest, open the generated e2e/jest.config.js (or e2e/jest.config.ts) and check the setupFilesAfterFramework or globalSetup path. Use THAT filename — not a hardcoded e2e/setup.ts. If the actual filename differs and you add the mock to the wrong file, reloadAsync() throws in production and all Layer 2 restore tests silently pass without the guard running.
// e2e/setup.ts — add at top of file
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn().mockResolvedValue(undefined),
}));
Because reloadAsync() is now a no-op mock, Layer 2 restore tests MUST manually re-run bootstrapDatabase() after calling restore() to simulate the post-reload bootstrap. Use this helper in restore test files:
// e2e/helpers/restoreAndBootstrap.ts
// POST-V726 FIX [build-blocker]: this helper still declared restoreAndBootstrap(backup: BackupEnvelope) and called restoreService.restore(backup) — the dead v2.9 signature, never updated when FIX-V726-2 rewrote restore() to (encryptedFileContent: string, password?: string). Every Layer 2 restore test using this helper (the document's own mandated pattern) would fail to compile. Signature and call site corrected below to match restore()'s current signature.
export async function restoreAndBootstrap(encryptedFileContent: string, password?: string): Promise<void> {
  await restoreService.restore(encryptedFileContent, password); // reloadAsync() is mocked — no actual reload
  await bootstrapDatabase(); // manually simulate the post-reload bootstrap
}
CODE REVIEW GATE: Any Layer 2 restore test that calls restoreService.restore() directly without using restoreAndBootstrap() is incorrect — it skips the post-restore bootstrap verification. This is the only correct testing pattern for restore in a Detox debug build.
🆕 v7.9 FIX-V79-2 — scripts/verify-migration-zero.ts CANONICAL IMPLEMENTATION
The script body was specified in v7.8 FIX-V78-1 by what it checks, but the canonical implementation was never printed. A developer cannot implement it from a description alone. The full implementation is below. Run with: npx ts-node scripts/verify-migration-zero.ts. Add to CI pipeline (exits non-zero on any failure).
// scripts/verify-migration-zero.ts
// Validates migration zero SQL before committing. Run in CI: npx ts-node scripts/verify-migration-zero.ts
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
 
const MIGRATIONS_DIR = path.join(__dirname, '..', 'drizzle', 'migrations');
 
// Required indexes (v7.7 IDX-* additions)
const REQUIRED_INDEXES = [
  'idx_writer_leases_expires', 'idx_audit_logs_firm_date', 'idx_audit_logs_event_type',
  'idx_financial_years_firm_status', 'idx_financial_years_firm_dates',
  'idx_firms_archived', 'idx_bis_logos_firm_active',
  'idx_tax_rates_firm_active', 'idx_tax_groups_firm_active', 'idx_tax_group_components_group',
  'idx_tax_group_components_rate', 'idx_sync_log_firm_date', 'idx_sync_devices_firm',
  'idx_audit_archive_firm_fy',
];
 
// Required triggers
const REQUIRED_TRIGGERS = [
  'prevent_audit_update', 'prevent_audit_delete', 'prevent_firm_code_update',
];
 
// Required dormancy TODO comments (Phase 3 and Sync Phase boundaries)
const REQUIRED_COMMENTS = [
  'PHASE 3 STEP 0 BOUNDARY',   // tax_rates, tax_groups, tax_group_components
  'FUTURE SYNC PHASE BOUNDARY', // sync_devices, sync_log
  'uq_one_active_fy_per_firm',  // partial unique index (v7.5)
];
 
// v7.12 FIX-V712-3: audit_delete_gate table + seed row were never checked by this script — added here
const REQUIRED_TABLE_AND_SEED = [{ table: 'audit_delete_gate', seed: 'INSERT INTO audit_delete_gate' }, { table: 'schema_version', seed: 'INSERT INTO schema_version' }]; // v7.22 FIX-V722-4: schema_version seed row was never checked — added
 
function findMigrationZero(): string {
  const files = glob.sync('**/0000_*.sql', { cwd: MIGRATIONS_DIR });
  if (!files.length) throw new Error('Migration zero SQL file not found in ' + MIGRATIONS_DIR);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf-8');
}
 
function verify(): void {
  const sql = findMigrationZero();
  const failures: string[] = [];
  for (const idx of REQUIRED_INDEXES) {
    if (!sql.includes(idx)) failures.push('MISSING INDEX: ' + idx);
  }
  for (const trigger of REQUIRED_TRIGGERS) {
    if (!sql.includes(trigger)) failures.push('MISSING TRIGGER: ' + trigger);
  }
  for (const comment of REQUIRED_COMMENTS) {
    if (!sql.includes(comment)) failures.push('MISSING BOUNDARY COMMENT: ' + comment);
  }
  for (const { table, seed } of REQUIRED_TABLE_AND_SEED) { // v7.12 FIX-V712-3
    if (!sql.toLowerCase().includes('create table ' + table)) failures.push('MISSING TABLE: ' + table);
    if (!sql.includes(seed)) failures.push('MISSING SEED ROW: ' + table);
  }
  if (failures.length) {
    console.error('verify-migration-zero FAILED:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('verify-migration-zero PASSED (' + REQUIRED_INDEXES.length + ' indexes, ' + REQUIRED_TRIGGERS.length + ' triggers, ' + REQUIRED_COMMENTS.length + ' boundary comments, ' + REQUIRED_TABLE_AND_SEED.length + ' table+seed checks verified).');
}
verify();
🆕 v7.9 FIX-V79-3 — scripts/post-generate-checklist.md CANONICAL CONTENT
The file scripts/post-generate-checklist.md was committed per v7.7 POST-GENERATE-CHECKLIST but its content was never printed in the spec. It was referenced from 6 locations with no single authoritative list. A developer must complete every item below before committing any migration SQL. Verify each with scripts/verify-migration-zero.ts where indicated.
# scripts/post-generate-checklist.md
# Run after EVERY `npx drizzle-kit generate`. Do not commit migration SQL without completing all items.
 
## ACTION 1 — Table Order Verification (FIX-V72-3 / v7.5 UQ)
Open generated migration zero SQL. Verify table order EXACTLY matches:
safe_mode_state, app_settings, firms, financial_years, writer_leases,
audit_logs, audit_delete_gate, bis_logos, schema_version,
tax_rates, tax_groups, tax_group_components,
sync_devices, sync_log, audit_archive_index. (v7.12 FIX-V712-2: audit_delete_gate moved up — see line above — to match Step 2's canonical order)
[ ] Table order verified. tax_group_components appears AFTER both tax_rates and tax_groups.
 
## ACTION 2 — DORMANCY GATE Comments (FIX-V72-2 / v7.1)
Add as FIRST line inside each CREATE TABLE block for these 5 dormant tables:
tax_rates / tax_groups / tax_group_components:
  -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query from Phase 1 service code.
sync_devices / sync_log:
  -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query before Future Sync Phase spec approved.
[ ] All 5 DORMANCY GATE comments added manually to generated SQL.
 
## ACTION 3 — Partial Unique Index (v7.5 UQ-ACTIVE-FY-CONSTRAINT)
Drizzle cannot generate partial unique indexes. Manually add after CREATE TABLE financial_years:
  CREATE UNIQUE INDEX uq_one_active_fy_per_firm ON financial_years(firm_id) WHERE status = 'ACTIVE';
[ ] uq_one_active_fy_per_firm partial unique index present in generated SQL.
 
## ACTION 4 — All v7.7 Indexes (IDX-* additions)
Drizzle does not auto-generate index DDL. Add all 14 CREATE INDEX IF NOT EXISTS statements
from Step 2 Migration Zero Index Checklist (point 9) to the generated SQL file.
[ ] All 14 indexes present. Verified by: npx ts-node scripts/verify-migration-zero.ts
 
## ACTION 5 — Immutability Triggers
Drizzle does not generate triggers. Add all 3 manually from their canonical Step 2/Step 3/Step 7
spec sections: prevent_audit_update, prevent_audit_delete, prevent_firm_code_update.
[ ] All 3 triggers present. Verified by: npx ts-node scripts/verify-migration-zero.ts
DEVICE NAME SETUP — Required Before Running Tests (v6.6 GAP 7 FIX)
The adbName value ‘VJBilling_Test_Device’ in .detoxrc.js is a placeholder. Detox will fail with a device-not-found error if this is not replaced with your real device serial before running tests. This is a one-time setup step per development machine.
Step 1 — Connect your Android device via USB with USB debugging enabled (Developer Options must be on).
Step 2 — Run: adb devices
Step 3 — Copy the device serial from the output (e.g. R3CN60BQXXX or 192.168.1.5:5555 for wireless ADB).
Step 4 — In .detoxrc.js, replace VJBilling_Test_Device with the real serial from Step 3. Without this, Detox fails before any test runs. CODE REVIEW GATE: .detoxrc.js must never be committed with the placeholder value.
PR Review Checklist — Phase 1 Additional Gates (v7.1)
GATE 1 — .detoxrc.js placeholder: Reviewer MUST confirm .detoxrc.js does not contain ‘VJBilling_Test_Device’ placeholder. Add an explicit checkbox to the PR template: “.detoxrc.js does not contain VJBilling_Test_Device placeholder.” This is a human process gate — it cannot be automated by ESLint or CI without committing a real device serial.
GATE 2 — supplyType / IGST boundary: PR GATE: No supplyType determination, no intra/inter-state logic, no IGST calculation anywhere in Phase 1 code. stateCode is stored in the firms table from v7.0 — this is for GST compliance and GSTIN cross-validation ONLY. A developer seeing stateCode may be tempted to write a hasStateCode() guard or intra-state branch early. This is a Phase 3 calculateInvoice() responsibility. Reviewer MUST grep the PR diff for: supplyType, IGST, intra-state, inter-state, hasStateCode. Any match in Phase 1 service, repository, or UI code is a hard rejection. The Phase 3 spec owns this boundary.
Area
	Required Tests
	GSTIN Validation
	Valid GSTIN passes all 6 checks · Invalid state code throws · Invalid PAN segment throws · Bad checksum throws · Empty string throws · 14-char string throws · validateGSTIN('27AAPFU0939F1ZV') does not throw · validateGSTIN('27AAPFU0939F1ZX') throws checksum mismatch
	Lease Guard
	assertNoActiveLease throws when held · Expired lease clears on restart · Heartbeat extends TTL · extendTTL no-ops on missing lease · Concurrent createFirm produces exactly 1 firm · archiveFirm blocked when lease active · unarchiveFirm blocked in Safe Mode
	Safe Mode
	Persists across restart · Writes blocked · clearSafeMode not callable from UI · Verify resolution clears · Restore resolution clears · First-boot missing row succeeds · BOOTSTRAP_INCOMPLETE thrown before Step 7b
	Restore Flow — Layer 1
	Tampered checksum blocked · Future schemaVersion blocked · Past schemaVersion logged · Dry-run detects broken refs
	Restore Flow — Layer 2
	Nav guard blocks restore with open form · Full file picker invocation · expo-file-system read/write · Post-restore bootstrap runs full verify
	Firm Isolation
	FY created for correct firm · Firm A query never returns firm B records · firmId never optional in any repo method · 3-firm limit atomic under concurrency
	PIN Security / App Lock (FIX-VSEC-3, FIX-V729-1, FIX-V729-2 — added v7.29, closing prior zero-coverage gap)
	setPin('1234') succeeds and getPinLength() returns 4 · setPin('123456') succeeds and getPinLength() returns 6 · setPin('12345') throws PIN_INCORRECT (5 digits) · setPin('abcd') throws PIN_INCORRECT (non-numeric) · verifyPin() with correct PIN returns true · verifyPin() with incorrect PIN returns false and increments failed-attempt counter · 3rd consecutive failure triggers isLockedOut() = true for 30s · 4th consecutive failure doubles lockout to 60s · isLockedOut() = false and counters cleared after resetFailedAttempts() · isPinSet() = false and isPinSkipped() = false on first-ever boot (PIN Setup screen shown, no Skip yet actioned) · tapping "Skip for now" calls setPinSkipped(), writes PIN_SKIPPED, and isPinSet() remains false · on relaunch after skip, app proceeds straight to bootstrapDatabase() with no PIN screen shown · Settings > General > Security row reads "Set Up PIN" while isPinSet() is false (including post-skip) and "Change PIN" once isPinSet() is true · setPin() from the Settings row after a skip clears the skipped flag and writes PIN_SET · changePin(currentPin, newPin) with wrong currentPin throws PIN_INCORRECT and does not alter the stored PIN · changePin() with a valid newPin of a different length than the old PIN succeeds and getPinLength() reflects the new length · changePin() success writes PIN_CHANGED with correct oldPinLength/newPinLength · boot-time PIN entry screen and Change PIN screen's current-PIN field each render the digit-dot count returned by getPinLength() on mount
	stateCode & validatePincode (v7.0 G70)
	v5.0: createFirm() with phone3 stores correctly · updateFirm() sets/clears phone3 and firmLogoRef without affecting BIS archival logic · phone3 and firmLogoRef present in backup payload · createFirm() with GSTIN state code mismatch throws GSTIN_STATE_MISMATCH · createFirm() with matching GSTIN stateCode succeeds · validatePincode(‘123456’) passes · validatePincode(‘12345’) throws INVALID_PINCODE · validatePincode(‘ABCDEF’) throws INVALID_PINCODE · state picker only accepts codes from INDIAN_STATES · free-text state entry is structurally prohibited in Firm Setup UI · INDIAN_STATES contains exactly 39 entries (codes 01–38 excluding unused GST code 25, plus 97 and 99)
	firmCode DB Enforcement
	Direct UPDATE of firm_code via raw driver throws FIRM_CODE_IMMUTABLE · FIRM_CODE_SET event written exactly once per firm (COUNT = 1) · firm_id and deviceId on FIRM_CODE_SET row are both non-null
	audit_logs DB Enforcement
	Direct UPDATE on audit_logs throws AUDIT_LOG_IMMUTABLE (always) · Direct DELETE on audit_logs throws AUDIT_LOG_IMMUTABLE unless issued inside purgeExpiredAuditLogs() (v7.10 gated retention job — see AUDIT-RETENTION-MONTHLY, CLOSE-FY-FLOW section)
	auditRepository.log(null) Contract (G41)
	log(null) for RESTORE_OLD_SCHEMA: passes · log(null) for DEVICE_ID_GENERATED: passes · log(null) for BACKUP_CREATED: passes · log(null) for any other event type: fails with code-review flag
	MMKV/AsyncStorage Parity
	Crash during AsyncStorage write produces same recovery as MMKV write · deviceId regenerated on next boot if key absent
	Settings Utilities slot + Invoice scaffold (v6.7 FIX-V67-1, FIX-V67-2)
	✓ CLOSED
	Utilities section (VMD, Export Parties, Export Items, Close FY) boundary-noted as Phase 6 with screen slot reserved. Invoice added to General as structure-only scaffold. No premature implementation risk in Phase 1.
	verifyService G63 check count contradiction (v6.7 FIX-V67-3)
	✓ CLOSED
	G63 “9 checks” vs 6 implemented contradiction resolved. Broken references (ch.3), firm isolation (ch.4), audit log continuity (ch.5) now fully implemented. 9 active checks + 1 no-op counter integrity = 10 items. Guarantee register count corrected to 9 active.
	runVerify() Phase 2 type mismatch (v6.7 FIX-V67-4)
	✓ CLOSED
	Phase 1 runVerify(): Promise<VerifyResult> incompatible with Phase 2 runVerify(firmId): Promise<VerifyIssue[]>. Resolved: optional firmId param added. Phase 2 adapts VerifyResult to VerifyIssue[]. All Phase 1 call sites unaffected. TypeScript strict compile error closed.
	

Review Item 6 — GSTIN Test Vector Required
REVIEW: verifyGSTINChecksum() — Worked Example Required


Resolution: The unit test suite MUST include:
  validateGSTIN('27AAPFU0939F1ZV') does not throw.
  validateGSTIN('27AAPFU0939F1ZX') throws INVALID_GSTIN: checksum mismatch.
	

Review Item 7 — unarchiveFirm() Dual Guard
REVIEW: firmService.unarchiveFirm() Must Use Dual Guard
Resolution: firmService.unarchiveFirm() MUST begin with both guards in sequence: await assertNoActiveLease() then assertNotInSafeMode() before any restriction checks or database writes.
	

Review Item 8 — Test Environment Column Split
REVIEW: Test Matrix Environment Column
Resolution: The Restore Flow row is split into Layer 1 (Jest unit — pure functions) and Layer 2 (real Android device Detox — file-system flows). See test matrix in Review Item 5.
	

Review Item 9 — GSTIN Luhn Mod-36 Algorithm
REVIEW: GSTIN Luhn Mod-36 Algorithm — Unambiguous Specification


CORRECTED ALGORITHM: Character set is '0-9' (values 0-9) followed by 'A-Z' (values 10-35). For each of the 14 characters (1-indexed positions 1-14): find its numeric value. If the position is even (2,4,6...14), multiply the value by 2. If the result is >= 36, subtract 35. Sum all 14 values. Expected check digit value = (36 − (sum mod 36)) mod 36.


WORKED EXAMPLE — 27AAPFU0939F1ZV:
Char values: 2,7,10,10,25,15,30,0,9,3,9,15,1,35
Even positions (2,4,6,8,10,12,14) doubled: 14,20,30,0,6,30,35
Odd positions unchanged: 2,10,25,30,9,9,1
Sum = 2+14+10+20+25+30+30+0+9+6+9+30+1+35 = 221
221 mod 36 = 5. Expected digit = (36−5) mod 36 = 31 = 'V'. Character 15 is V. ✓ VALID
	

Review Item 10 — Pre-Migration Snapshot Write Failure Path
REVIEW: Pre-Migration Snapshot — 4 Mandatory Rules (v2.7 Updated)


RULE 1 — WRITE PATH: Snapshot MUST be written to DocumentDirectory at: vjbilling_premigration_snapshot.json. Path defined as constant in constants/storagePaths.ts.


RULE 2 — WRITE FAILURE IS NON-BLOCKING (v2.7 Updated): If snapshot write throws at Step 0, bootstrapDatabase() logs console.error and continues. The PRE_MIGRATION_SNAPSHOT_FAILED audit event is deferred to after migrations complete.


RULE 3 — DATABASEERRORSCREEN READS GRACEFULLY: Option 1 checks file existence via getInfoAsync(). If absent → button is DISABLED with label 'No snapshot available — pre-migration backup did not complete'.


RULE 4 — SUCCESSFUL BOOTSTRAP CLEANS UP: After migrations pass and full bootstrap completes, delete vjbilling_premigration_snapshot.json if it exists. Prevents stale data from a previous failed migration.
	

Review Item 11 — firmCode Immutability: DB-Level Trigger Required
REVIEW: firmCode SQLite Trigger + FIRM_CODE_SET Audit Event
TRIGGER SQL (in migration zero — drizzle/migrations/0000_*.sql, added manually per post-generate-checklist.md ACTION 5. v7.14 FIX-V714-2: stale reference to 0001_add_firm_code_trigger.sql removed — that file was a historical artifact and was never canonical; verify-migration-zero.ts REQUIRED_TRIGGERS and post-generate-checklist.md ACTION 5 both expect all three triggers — prevent_audit_update, prevent_audit_delete, prevent_firm_code_update — in migration zero (0000):
  CREATE TRIGGER prevent_firm_code_update BEFORE UPDATE OF firm_code ON firms
  BEGIN SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firmCode cannot be changed after creation'); END;


ADDITION 2 — FIRM_CODE_SET AUDIT EVENT: firmService.createFirm() MUST write FIRM_CODE_SET inside the same transaction as the firm insert. Payload: { firmId, firmCode, assignedAt (ISO-8601) }.


ADDITION 3 — TRIGGER INTEGRATION TESTS: (a) Direct UPDATE of firm_code throws FIRM_CODE_IMMUTABLE. (b) createFirm() writes exactly one FIRM_CODE_SET event. (c) COUNT(*) assertion = 1, not existence check.
	

________________
