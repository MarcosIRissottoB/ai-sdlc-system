import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(langchain|@langchain|chromadb|openai))',
  ],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@prompts/(.*)$': '<rootDir>/prompts/$1',
    '^@vector-store/(.*)$': '<rootDir>/vector-store/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@langchain/openai$': '<rootDir>/__mocks__/@langchain/openai.mock.ts',
    '^langchain/text_splitter$': '<rootDir>/__mocks__/langchain/text_splitter.mock.ts',
    '^chromadb$': '<rootDir>/__mocks__/chromadb.mock.ts',
  },
};

export default config;
