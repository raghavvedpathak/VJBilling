import { View, ActivityIndicator, Text } from "react-native";
import { TwoToneWrapper } from "../components/TwoToneWrapper";

// ============================================================================
// app/index.tsx — LOADING SHELL ONLY
//
// ARCHITECTURAL RULE (Phase 1 constitutional): This file contains NO business
// logic, NO service calls, NO firmService, NO verifyService, NO routing logic.
//
// ALL routing is decided by bootstrapService.initApp() in _layout.tsx, which
// calls router.replace() directly before this screen ever renders. The only
// scenario where this screen appears to a user is the brief moment between
// AppMigratorAndRunner mounting and the router.replace() call completing.
//
// PREVIOUS VIOLATION (now fixed): This file previously called
// firmService.hasFirms() and verifyService.runVerify() — causing a
// double-bootstrap. verifyService had already run in bootstrapService Step 9.
// A second call is architecturally wrong and wastes the VERIFY-BOOT-CACHE
// (v7.7) that exists specifically to make the boot-path scan cheap.
//
// DO NOT add any useEffect with service calls to this file.
// DO NOT add any navigation logic to this file.
// If you need to add routing here, the correct fix is in _layout.tsx.
// ============================================================================
export default function Index() {
  return (
    <TwoToneWrapper title="">
      <View className="flex-1 justify-center items-center gap-4 py-20">
        <ActivityIndicator size="large" color="#B87333" />
        <Text className="text-vj-text/50 font-bold text-sm uppercase tracking-widest">
          Initializing VJ Billing...
        </Text>
      </View>
    </TwoToneWrapper>
  );
}