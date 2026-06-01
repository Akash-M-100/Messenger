export const serviceName = "unified-messaging-service";

// Re-export core interfaces and errors
export * from "./interfaces/IChannelProvider.js";
export * from "./errors/ProviderError.js";

// Re-export resilience utilities
export * from "./utils/cache.js";
export * from "./utils/retry.js";
export * from "./utils/circuit-breaker.js";
