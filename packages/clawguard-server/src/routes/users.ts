/**
 * User management routes.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { requireAdmin, requireOrg } from "../middleware/auth.js";
import { users } from "../db/schema.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/users/:orgId
   * List org users (admin only).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/users/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const orgUsers = await app.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          lastSeenAt: users.lastSeenAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.orgId, orgId))
        .orderBy(users.email);

      return reply.send({ users: orgUsers });
    },
  );
}
