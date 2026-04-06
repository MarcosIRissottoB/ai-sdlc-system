export const OpenAIEmbeddings = jest.fn().mockImplementation(() => ({
  embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

export const ChatOpenAI = jest.fn().mockImplementation(() => ({
  invoke: jest
    .fn()
    .mockResolvedValue({
      content:
        '{"topics":[{"topic":"General","chunkIds":["CHUNK_0"]}],"hasContradictions":false,"details":""}',
    }),
}));
