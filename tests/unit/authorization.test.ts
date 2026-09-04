import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import {
  adminProcedure,
  createTRPCRouter,
  creatorProcedure,
  protectedProcedure,
  type AuthenticatedUser,
} from "@/server/api/trpc";

const testRouter = createTRPCRouter({
  protected: protectedProcedure.query(({ ctx }) => ctx.user.role),
  admin: adminProcedure.query(({ ctx }) => ctx.user.role),
  creator: creatorProcedure.query(({ ctx }) => ctx.user.role),
});

function createCaller(user: AuthenticatedUser | null, clientRole?: string) {
  return testRouter.createCaller({
    db: {} as never,
    user,
    // This property simulates untrusted client data. Procedure guards ignore it.
    ...(clientRole ? { clientRole } : {}),
  });
}

const admin: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@local.test",
  role: "admin",
};

const creator: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "creator@local.test",
  role: "creator",
};

function expectTRPCError(error: unknown, code: "UNAUTHORIZED" | "FORBIDDEN") {
  expect(error).toBeInstanceOf(TRPCError);
  expect((error as TRPCError).code).toBe(code);
}

describe("tRPC authorization procedures", () => {
  it("rejects unauthenticated callers from protected procedures", async () => {
    await expect(createCaller(null).protected()).rejects.toSatisfy((error: unknown) => {
      expectTRPCError(error, "UNAUTHORIZED");
      return true;
    });
  });

  it("rejects creators from admin procedures", async () => {
    await expect(createCaller(creator).admin()).rejects.toSatisfy((error: unknown) => {
      expectTRPCError(error, "FORBIDDEN");
      return true;
    });
  });

  it("rejects admins from creator procedures", async () => {
    await expect(createCaller(admin).creator()).rejects.toSatisfy((error: unknown) => {
      expectTRPCError(error, "FORBIDDEN");
      return true;
    });
  });

  it("allows admins to use admin procedures", async () => {
    await expect(createCaller(admin).admin()).resolves.toBe("admin");
  });

  it("allows creators to use creator procedures", async () => {
    await expect(createCaller(creator).creator()).resolves.toBe("creator");
  });

  it("derives role from the server context instead of client-supplied data", async () => {
    await expect(createCaller(creator, "admin").admin()).rejects.toSatisfy(
      (error: unknown) => {
        expectTRPCError(error, "FORBIDDEN");
        return true;
      },
    );
  });
});
