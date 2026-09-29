/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|image-size|property-graph|@gltf-transform)/)',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { useESM: false }],
    // ESM-only deps pulled in by @gltf-transform/core (property-graph, and any further
    // ESM-only packages the import chain reveals) ship .mjs with bare import/export syntax.
    // ts-jest only transpiles TS/JS for our own CommonJS-targeted source; babel-jest with
    // just the CJS-module plugin converts these to require()/module.exports instead.
    '^.+\\.mjs$': ['babel-jest', { plugins: ['@babel/plugin-transform-modules-commonjs'] }],
  },
};
