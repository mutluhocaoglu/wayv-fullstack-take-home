import { initTRPC } from "@trpc/server";
import { db } from "@/server/db";

export async function createTRPCContext() {
  return {
    db,
  };
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
