module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `jsxImportSource: "nativewind"` is what gives every RN component a working `className`.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-worklets/plugin"],
  };
};
