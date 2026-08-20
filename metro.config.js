process.env.EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = '1';

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Allows Metro to recognize .sql files and pass them to Babel's inline-import plugin
if (!config.resolver.sourceExts.includes('sql')) {
  config.resolver.sourceExts.push('sql');
}
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'sql');

module.exports = withNativeWind(config, { input: "./app/global.css" });