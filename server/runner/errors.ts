export class RunnerError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'RunnerError';
  }
}

export class ValidationError extends RunnerError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends RunnerError {
  constructor(message: string, details?: unknown) {
    super('EXECUTION_ERROR', message, details);
    this.name = 'ExecutionError';
  }
}
