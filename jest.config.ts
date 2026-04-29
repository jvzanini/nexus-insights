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
  },
};

export default config;
