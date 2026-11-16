import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { NativeSignalsSnapshot, SabyrSignalsEvents } from './SabyrSignals.types';

declare class SabyrSignalsNativeModule extends NativeModule<SabyrSignalsEvents> {
  isCallActive(): boolean;
  isScreenShared(): boolean;
  getSignals(): NativeSignalsSnapshot;
}

// На web и iOS (и в Expo Go) нативного модуля нет — вернётся null, обёртка ответит 'unknown'.
export default requireOptionalNativeModule<SabyrSignalsNativeModule>('SabyrSignals');
