/* eslint-disable */
const config = {
  displayName: 'docx-to-vfile',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
      useESM: true,
    },
  },
  testEnvironment: 'node',
  transform: {
    '^.+.[tj]sx?$': ['@swc/jest', {
      swcrc: false,
      "module": {
        "type": "es6",
        "strict": true
      },
    }],
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../../coverage/libs/docx-to-vfile',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(.{1,2}/.*).js$': '$1',
  },
}

export default config
