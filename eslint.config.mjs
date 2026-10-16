import antfu from "@antfu/eslint-config";
import prettier from "eslint-config-prettier/flat";

// Code correctness belongs to ESLint; formatting belongs to Prettier.
export default antfu(
  {
    stylistic: false,
    typescript: true,
    vue: true,
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "coverage/**",
      "scratch/**",
      "xyzw_data/**",
      "**/Private/**",
      "**/*.d.ts",
      "src/xyzw/**",
      "src/utils/apexStageMap.js",
      "src/utils/readable-xyzw-ws.js",
      "public/game/{assets,src}/**",
      "public/game/{cocos2d-*,game-defines.*,main.*,patch*,sh1*,xh.js}",
      "**/*.md",
      "pnpm-lock.yaml",
    ],
    rules: {
      "no-console": "off",
      // Callbacks in setup and protocol modules intentionally close over later declarations.
      "no-use-before-define": "off",
      "ts/no-use-before-define": "off",
      // Attribute and block layout are presentation choices handled by Prettier.
      "vue/attributes-order": "off",
      "vue/block-order": "off",
      "vue/first-attribute-linebreak": "off",
      "unused-imports/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "unused-imports/no-unused-imports": "error",
      "vue/component-name-in-template-casing": [
        "error",
        "PascalCase",
        { registeredComponentsOnly: true },
      ],
      "vue/component-definition-name-casing": ["error", "PascalCase"],
    },
  },
  // The storage bridge is maintained here, unlike the bundled game client.
  {
    name: "project/game-storage-bridge",
    files: ["public/game/multi-game-storage-bridge.js"],
  },
  {
    name: "project/node-tests",
    files: ["test/**/*.test.js"],
    rules: { "test/no-import-node-test": "off" },
  },
  prettier,
);
