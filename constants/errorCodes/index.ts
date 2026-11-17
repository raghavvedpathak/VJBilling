// constants/errorCodes/index.ts
// Unified Error Code Hub aggregating all phase-wise error registries

import { ERR_PHASE1 } from './phase1';
import { ERR_PHASE2 } from './phase2';
import { ERR_PHASE3 } from './phase3';
import { ERR_PHASE4 } from './phase4';

export * from './phase1';
export * from './phase2';
export * from './phase3';
export * from './phase4';

export const ERR = {
  ...ERR_PHASE1,
  ...ERR_PHASE2,
  ...ERR_PHASE3,
  ...ERR_PHASE4,
} as const;

export type ErrCode = (typeof ERR)[keyof typeof ERR];
export type ErrorCode = ErrCode;
export default ERR;
