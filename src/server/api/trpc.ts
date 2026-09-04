import { TRPCError, initTRPC } from "@trpc/server";
import { db } from "@/server/db";
import { getAuthenticatedUser } from "@/server/auth/current-user";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: "admin" | "creator";
};

export async function createTRPCContext() {
  return {
    db,
    user: await getAuthenticatedUser(db),
  };
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const requireAuthenticatedUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireAuthenticatedUser);

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access is required.",
    });
  }

  return next();
});

export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Creator access is required.",
    });
  }

  return next();
});
