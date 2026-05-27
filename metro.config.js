const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// 1. Remove 'sql' from sourceExts (Stop treating it as code)
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'sql');

// 2. Add 'sql' to assetExts (Treat it like an image/text file for Drizzle)
config.resolver.assetExts.push('sql');

module.exports = withNativeWind(config, { input: "./app/global.css" });