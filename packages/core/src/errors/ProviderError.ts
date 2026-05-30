export class ProviderError extends Error {
  readonly retriable: boolean;
  readonly providerId: string | undefined;

  constructor(message: string, options?: { retriable?: boolean; providerId?: string }) {
    super(message);
    this.name = "ProviderError";
    this.retriable = options?.retriable ?? false;
    this.providerId = options?.providerId;
    // Ensure prototype chain for instanceof checks
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}
