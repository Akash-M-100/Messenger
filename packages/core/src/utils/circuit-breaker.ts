export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // default 5 consecutive failures
  successThreshold?: number; // default 2 successes to close, default 1
  timeout?: number; // milliseconds before moving from OPEN to HALF_OPEN, default 60000
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public state: CircuitState,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number | null = null;

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private timeout: number = 60000,
  ) {}

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.nextAttemptTime) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
    }
    return this.state;
  }

  async execute<T>(executor: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      throw new CircuitBreakerError(
        "Circuit breaker is OPEN",
        currentState,
      );
    }

    try {
      const result = await executor();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery attempt, back to OPEN
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  getMetrics() {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}
