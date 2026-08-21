// drizzle.config.ts — Canonical Phase 1 Configuration (FIX-V715-8, FIX-V719-2)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});