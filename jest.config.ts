import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js", "cjs", "mjs", "json", "node"],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@nexusai360/webhook-routing$":
      "<rootDir>/node_modules/@nexusai360/webhook-routing/dist/index.cjs",
    "^@nexusai360/webhook-routing/(.*)$":
      "<rootDir>/node_modules/@nexusai360/webhook-routing/dist/$1.cjs",
    "^server-only$": "<rootDir>/src/lib/__mocks__/server-only.ts",
  },
  collectCoverageFrom: [
    "src/lib/permissions.ts",
    "src/lib/chatwoot/filters.ts",
    "src/lib/reports/**/*.ts",
    "src/lib/utils/format-*.ts",
    "!src/lib/reports/active-account.ts",
  ],
  coverageThreshold: {
    global: { branches: 60, statements: 70 },
    "./src/lib/permissions.ts": { branches: 70, statements: 80 },
    "./src/lib/chatwoot/filters.ts": { branches: 70, statements: 80 },
    "./src/lib/reports/": { branches: 70, statements: 80 },
    "./src/lib/utils/": { branches: 60, statements: 70 },
  },
};

export default config;
