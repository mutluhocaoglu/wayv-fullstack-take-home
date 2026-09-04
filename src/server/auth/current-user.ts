import { eq } from "drizzle-orm";
import { getDevelopmentAuthUserId } from "@/server/auth/cookie";
import type { AuthenticatedUser } from "@/server/api/trpc";
import type { Database } from "@/server/db";
import { users } from "@/server/db/schema";

export async function getAuthenticatedUser(
  database: Database,
): Promise<AuthenticatedUser | null> {
  const userId = await getDevelopmentAuthUserId();

  if (!userId) {
    return null;
  }

  const [user] = await database
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}
