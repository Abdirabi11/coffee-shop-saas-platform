import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
  // Query logs print raw SQL with parameters (PII) on every call: dev only
  log: process.env.NODE_ENV === "production"
    ? ["warn", "error"]
    : ["query", "info", "warn", "error"],
});

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

export default prisma;
