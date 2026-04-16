/** Shared error type for all encoders (Canvas + WASM). */
export class ConversionError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConversionError';
    if (cause !== undefined) this.cause = cause;
  }
}
