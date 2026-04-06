export class InsufficientInformationError extends Error {
  constructor(message: string = 'No hay suficiente información en las lecturas') {
    super(message);
    this.name = 'InsufficientInformationError';
  }
}

export class VectorStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorStoreError';
  }
}

export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

export class ReasoningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReasoningError';
  }
}
