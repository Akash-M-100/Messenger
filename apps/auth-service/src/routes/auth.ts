import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type SignupRequest = z.infer<typeof signupSchema>;
type LoginRequest = z.infer<typeof loginSchema>;

async function sendEmail(
  server: FastifyInstance,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const config = server.config;
  
  try {
    const response = await fetch(`${config.apiGatewayUrl}/v1/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": config.apiKey,
  },
  body: JSON.stringify({
    channel: "EMAIL",
    to,
    subject,
    body,
  }),
});

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.statusText}`);
    }
  } catch (error) {
  console.error("EMAIL ERROR:", error);
  server.log.error({ error, to, subject }, "Failed to send email");
  throw error;
}
}

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: SignupRequest }>(
    "/signup",
    async (request: FastifyRequest<{ Body: SignupRequest }>, reply: FastifyReply) => {
      try {
        const { name, email, password } = signupSchema.parse(request.body);

        // Check if user already exists
        const existingUser = await server.db.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          return reply.code(409).send({
            statusCode: 409,
            message: "User with this email already exists",
            error: "EMAIL_EXISTS",
          });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await server.db.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
          },
        });

        // Send welcome email
        await sendEmail(
          server,
          user.email,
          "Welcome to our platform!",
          "Welcome! You have successfully signed up.",
        );

        return reply.code(201).send({
          statusCode: 201,
          message: "User created successfully",
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            statusCode: 400,
            message: "Validation error",
            error: "VALIDATION_ERROR",
            details: error.errors,
          });
        }

        server.log.error({ error }, "Signup error");
        return reply.code(500).send({
          statusCode: 500,
          message: "Internal server error",
          error: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  );

  server.post<{ Body: LoginRequest }>(
    "/login",
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      try {
        const { email, password } = loginSchema.parse(request.body);

        // Find user
        const user = await server.db.user.findUnique({
          where: { email },
        });

        if (!user) {
          return reply.code(401).send({
            statusCode: 401,
            message: "Invalid email or password",
            error: "UNAUTHORIZED",
          });
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          return reply.code(401).send({
            statusCode: 401,
            message: "Invalid email or password",
            error: "UNAUTHORIZED",
          });
        }

        // Send login email
        await sendEmail(
          server,
          user.email,
          "Login Successful",
          "You have successfully logged in!",
        );

        return reply.code(200).send({
          statusCode: 200,
          message: "Login successful",
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            statusCode: 400,
            message: "Validation error",
            error: "VALIDATION_ERROR",
            details: error.errors,
          });
        }

        server.log.error({ error }, "Login error");
        return reply.code(500).send({
          statusCode: 500,
          message: "Internal server error",
          error: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  );
}
