import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/*
  eslint-config-next 16 publishes flat configs directly, so they are imported
  rather than wrapped in FlatCompat. Running them through the compat layer
  throws "Converting circular structure to JSON": the compat layer serialises
  the config to validate it, and the flat config holds plugin objects that
  reference themselves.
*/
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "public/**",
      ".data/**",
      "AGENTS.md",
      "CLAUDE.md",
    ],
  },

  ...coreWebVitals,
  ...typescript,

  {
    rules: {
      // Leading underscore marks a binding that is deliberately unused, such as
      // the previous-state argument every Server Action receives from
      // useActionState.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  {
    /*
      three.js objects are mutated every animation frame; that is the entire
      programming model of a render loop, and those objects are WebGL resources
      that live outside React. The immutability rule exists to protect React
      state from exactly this pattern, and it has no purchase here: the values
      being written are materials, not props or memo output that React will
      compare. Restructuring around it produced worse code, so it is switched
      off for the viewer alone rather than suppressed line by line.
    */
    files: ["components/three/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },

  {
    // Scripts and tests run in Node, outside the app, so the rules about
    // Next.js images and links do not apply to them.
    files: ["scripts/**/*.mts", "tests/**/*.ts", "*.mts", "*.mjs"],
    rules: {
      "@next/next/no-img-element": "off",
      "no-console": "off",
    },
  },
];

export default config;
