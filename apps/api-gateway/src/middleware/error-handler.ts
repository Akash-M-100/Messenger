import type { FastifyInstance } from "fastify";
import { Prisma } from "@ums/db";
import { ZodError } from "zod";

import { AppError, ConflictError, ValidationError } from "./errors.js";

export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error, _request, reply) => {
    const appError = normalizeError(error);

    if (appError.statusCode >= 500) {
      server.log.error({ error }, appError.message);
    } else {
      server.log.info({ error }, appError.message);
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

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError("Invalid request", error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new ConflictError("Message already exists", {
        target: error.meta?.target,
      });
    }
  }

  return new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
}
