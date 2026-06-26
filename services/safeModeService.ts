import { db } from '../db/client';
import { safeModeRepository } from '../repositories/safeModeRepository';
import { auditRepository } from '../repositories/auditRepository';
import { useSafeModeStore, SafeModeTrigger } from '../store/safeModeStore';
import { now } from '../utils/now';
import { getDeviceId } from '../utils/deviceId'; 

// v2.8 G31 MANDATORY: bootstrapComplete flag object reference
export const bootstrapComplete = { value: false };

export const safeModeService = { 
  
  async activate(reason: SafeModeTrigger, details?: object) { 
    const currentTime = now(); 
    const deviceId = await getDeviceId();

    // 1. ATOMIC DB WRITE 
    await db.transaction(async (tx) => { 
      await safeModeRepository.upsert({ 
        isActive: 1,  
        reason: reason, 
        activatedAt: currentTime,
        clearedAt: null 
      }, tx); 

      await auditRepository.create({ 
        firmId: null, 
        eventType: 'SAFE_MODE_ACTIVATED', 
        payload: JSON.stringify({ reason, ...details }), 
        deviceId 
      }, tx); 
    }); 

    // 2. Mirror to UI Store AFTER commit
    useSafeModeStore.getState().setState({ 
      isActive: true, 
      reason: reason, 
      activatedAt: currentTime 
    }); 
  }, 

  // INTERNAL ONLY — called only by verifyService or restoreService
  async clear() { 
    const currentTime = now();
    const deviceId = await getDeviceId();

    await db.transaction(async (tx) => { 
      await safeModeRepository.upsert({ 
        isActive: 0, 
        reason: null, 
        activatedAt: null,
        clearedAt: currentTime 
      }, tx); 

      await auditRepository.create({ 
        firmId: null, 
        eventType: 'SAFE_MODE_CLEARED', 
        payload: JSON.stringify({}), 
        deviceId 
      }, tx); 
    }); 

    useSafeModeStore.getState().setState({  
      isActive: false,  
      reason: null,  
      activatedAt: null  
    }); 
  }, 

  async loadState() { 
    const state = await safeModeRepository.get(); 
      
    if (state && state.isActive === 1) { 
      useSafeModeStore.getState().setState({ 
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

    const { isActive } = useSafeModeStore.getState(); 
    if (isActive) { 
      throw new Error('SAFE_MODE_ACTIVE: Write operations are blocked to protect data integrity.'); 
    } 
  } 
};