const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// ✅ FIXED: Removed sql from assetExts and sourceExts filter.
// babel-preset inline-import handles .sql files as inlined strings.
// Moving sql to assetExts conflicts with inline-import and breaks useMigrations().

module.exports = withNativeWind(config, { input: "./app/global.css" });