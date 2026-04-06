export const ChromaClient = jest.fn().mockImplementation(() => ({
  getOrCreateCollection: jest.fn().mockResolvedValue({
    add: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({
      ids: [[]],
      documents: [[]],
      distances: [[]],
      metadatas: [[]],
    }),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  }),
}));
