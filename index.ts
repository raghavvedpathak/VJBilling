// index.ts (FIX-V741-3, FIX-V746-2, FIX-V747-2)
// ES imports are hoisted and evaluated in order, so polyfills runs install() BEFORE the app tree loads.
import './polyfills';
import './tasks/autoBackupTask';
import 'expo-router/entry';
