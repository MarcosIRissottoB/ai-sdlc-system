export const RecursiveCharacterTextSplitter = jest.fn().mockImplementation(() => ({
  createDocuments: jest
    .fn()
    .mockResolvedValue([{ pageContent: 'mock chunk content', metadata: {} }]),
}));
