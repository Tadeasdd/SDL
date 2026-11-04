import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "coverage/**", "playwright-report/**", "next-env.d.ts"] },
  ...next,
];

export default config;
