module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // This allows importing the 'drizzle/migrations' folder directly
      ["inline-import", { extensions: [".sql"] }], 
      "react-native-reanimated/plugin",
    ],
  };
};