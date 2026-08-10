// services/safeModeService.ts — Phase 2 v2.11 Canonical Implementation

import { db } from '../db/client';
import { safeModeRepository } from '../repositories/safeModeRepository';
import { auditRepository } from '../repositories/auditRepository';
import { safeModeStore, SafeModeTrigger } from '../store/safeModeStore';
import { now } from '../utils/now';
import { getDeviceId } from '../utils/deviceId';
import { ERR } from '../constants/errorCodes'; 

export const bootstrapComplete = { value: false };

export const safeModeService = { 
  async activate(reason: SafeModeTrigger, details?: object) { 
    const currentTime = now(); 
    const deviceId = await getDeviceId();

    await db.transaction((tx) => { 
      safeModeRepository.upsert(tx, { 
        isActive: 1,  
        reason: reason, 
        activatedAt: currentTime,
        clearedAt: null 
      }); 

      auditRepository.create({ 
        firmId: null, 
        eventType: 'SAFE_MODE_ACTIVATED', 
        payload: { reason, ...details }, 
        deviceId 
      }, tx); 
    }); 

    safeModeStore.getState().setState({ 
      isActive: true, 
      reason: reason, 
      activatedAt: currentTime 
    }); 
  }, 

  async clear() { 
    const currentTime = now();
    const deviceId = await getDeviceId();

    await db.transaction((tx) => { 
      safeModeRepository.upsert(tx, { 
        isActive: 0, 
        reason: null, 
        activatedAt: null,
        clearedAt: currentTime 
      }); 

      auditRepository.create({ 
        firmId: null, 
        eventType: 'SAFE_MODE_CLEARED', 
        payload: {}, 
        deviceId 
      }, tx); 
    }); 

    safeModeStore.getState().setState({  
      isActive: false,  
      reason: null,  
      activatedAt: null  
    }); 
  }, 

  async loadState() { 
    const state = await safeModeRepository.get(); 
      
    if (state && state.isActive === 1) { 
      safeModeStore.getState().setState({ 
        isActive: true, 
        reason: state.reason as SafeModeTrigger, 
        activatedAt: state.activatedAt 
      }); 
    } 
  }, 

  assertNotInSafeMode() { 
    if (!bootstrapComplete.value) {
      throw new Error('BOOTSTRAP_INCOMPLETE: assertNotInSafeMode called before bootstrap finished');
    }

    const { isActive } = safeModeStore.getState(); 
    if (isActive) { 
      throw new Error('SAFE_MODE_ACTIVE: Write operations are blocked to protect data integrity.'); 
    } 
  } 
};