import type { FastifyInstance } from "fastify";
import { Prisma } from "@ums/db";
import { ZodError } from "zod";
import {
  CircuitBreakerError,
  RetryError,
} from "@ums/core";

import { AppError, ConflictError, ValidationError } from "./errors.js";

export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error, _request, reply) => {
    const appError = normalizeError(error);
    const errorDetails = extractErrorDetails(error);

    if (appError.statusCode >= 500) {
      server.log.error(
        {
          error: errorDetails,
          code: appError.code,
          statusCode: appError.statusCode,
        },
        appError.message,
      );
    } else {
      server.log.info(
        {
          error: errorDetails,
          code: appError.code,
          statusCode: appError.statusCode,
        },
        appError.message,
      );
    }

    return reply.status(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    });
  });
}

function extractErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    };
  }
  return {
    type: typeof error,
    value: error,
  };
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError("Invalid request", error);
  }

  if (error instanceof CircuitBreakerError) {
    return new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable - circuit breaker open",
    );
  }

  if (error instanceof RetryError) {
    return new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      `Operation failed after multiple retries: ${error.message}`,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError.code === "P2002") {
      return new ConflictError("Message already exists", {
        target: prismaError.meta?.target,
      });
    }
    if (prismaError.code === "P2025") {
      // Record not found
      return new AppError(404, "NOT_FOUND", "Message not found");
    }
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return new AppError(
      500,
      "DATABASE_ERROR",
      "Database connection error - please try again later",
    );
  }

  if (error instanceof Error && error.name === "PrismaClientInitializationError") {
    return new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "Database is currently unavailable",
    );
  }

  return new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
}
