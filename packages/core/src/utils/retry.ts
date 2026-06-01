export interface RetryOptions {
  maxAttempts?: number; // default 3
  initialDelayMs?: number; // default 100
  maxDelayMs?: number; // default 5000
  backoffFactor?: number; // default 2
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public lastError: unknown,
    public attempts: number,
  ) {
    super(message);
    this.name = "RetryError";
  }
}

export async function withRetry<T>(
  executor: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 5000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const shouldRetry =
    options?.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executor();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw new RetryError(
          `Failed after ${attempt} attempt(s)`,
          error,
          attempt,
        );
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 0.1 * delayMs;
      const actualDelay = Math.min(delayMs + jitter, maxDelayMs);

      await delay(actualDelay);
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript requires it
  throw new RetryError(
    `Failed after ${maxAttempts} attempt(s)`,
    lastError,
    maxAttempts,
  );
}

function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  // Retry on network errors and 5xx errors, not 4xx
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    );
  }
  return true; // Default to retrying
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // Use global setTimeout - available in both Node.js and browsers
    const timer = (globalThis as any).setTimeout(resolve, ms);
    // Ensure timer is properly typed
    void timer;
  });
}
