/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm', // or other ESM presets
  testPathIgnorePatterns: ['dist'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  "coverageReporters": [
    "text",
    "cobertura"
  ],
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}"
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
}
