import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { setDevelopmentAuthCookie } from "@/server/auth/cookie";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { users } from "@/server/db/schema";

const userIdSchema = z.string().uuid();

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Development user switching is disabled.",
    });
  }
}

export const authRouter = createTRPCRouter({
  currentUser: protectedProcedure.query(({ ctx }) => ctx.user),

  devUsers: publicProcedure.query(async ({ ctx }) => {
    assertDevelopmentOnly();

    return ctx.db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .orderBy(asc(users.email));
  }),

  switchUser: publicProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      assertDevelopmentOnly();

      const [user] = await ctx.db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      await setDevelopmentAuthCookie(user.id);
      return user;
    }),
});
