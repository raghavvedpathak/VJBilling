// polyfills.ts (FIX-V741-3) - the app's first import.
// react-native-quick-crypto supplies crypto.subtle (AES-GCM, PBKDF2, HMAC) and getRandomValues on Hermes.
import { install } from 'react-native-quick-crypto';

install();

