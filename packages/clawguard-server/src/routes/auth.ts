/**
 * Auth routes – SSO token exchange.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { users, organizations } from "../db/schema.js";
import { exchangeCodeAtIdp, verifyIdToken } from "../services/oidc-service.js";

const ExchangeBodySchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("authorization_code"),
    code: z.string().min(1),
    codeVerifier: z.string().min(1),
    redirectUri: z.string().url(),
  }),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().min(1),
  }),
  z.object({
    grantType: z.literal("id_token"),
    idToken: z.string().min(1),
    orgId: z.string().uuid(),
  }),
]);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/exchange
   * Exchange an IdP token for a ClawGuard session token.
   *
   * Supports three grant types:
   * - authorization_code: Exchange code + PKCE verifier via the org's IdP, then validate the id_token
   * - id_token: Directly validate an id_token against the org's SSO config
   * - refresh_token: Refresh a ClawGuard session token
   */
  app.post("/api/v1/auth/exchange", async (request, reply) => {
    const parseResult = ExchangeBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const body = parseResult.data;
    const db = app.db;

    if (body.grantType === "authorization_code") {
      // 1. We need to identify which org this code belongs to.
      //    The client must have stored the orgId context. We look it up
      //    from a header or query param provided alongside the code exchange.
      //    For simplicity, require an X-ClawGuard-Org header.
      const orgId = (request.headers["x-clawguard-org"] as string) ?? "";
      if (!orgId) {
        return reply.code(400).send({
          error: "Missing X-ClawGuard-Org header. Include the orgId for code exchange.",
        });
      }

      // 2. Look up the org's SSO config.
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org?.ssoConfig) {
        return reply.code(404).send({
          error: "Organization not found or SSO not configured.",
        });
      }

      const ssoConfig = org.ssoConfig;

      try {
        // 3. Exchange the code at the IdP's token endpoint.
        const idpTokens = await exchangeCodeAtIdp({
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          code: body.code,
          codeVerifier: body.codeVerifier,
          redirectUri: body.redirectUri,
        });

        // 4. Verify the id_token.
        const claims = await verifyIdToken(idpTokens.id_token, {
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          audience: ssoConfig.audience,
        });

        // 5. Upsert user and issue ClawGuard JWTs.
        return await issueClawGuardTokens(app, db, orgId, claims);
      } catch (err) {
        return reply.code(401).send({
          error: `OIDC token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (body.grantType === "id_token") {
      // Direct id_token validation. The client already obtained the token
      // from their IdP and passes it directly.
      const orgId = body.orgId;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org?.ssoConfig) {
        return reply.code(404).send({
          error: "Organization not found or SSO not configured.",
        });
      }

      const ssoConfig = org.ssoConfig;

      try {
        const claims = await verifyIdToken(body.idToken, {
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          audience: ssoConfig.audience,
        });

        return await issueClawGuardTokens(app, db, orgId, claims);
      } catch (err) {
        return reply.code(401).send({
          error: `ID token validation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (body.grantType === "refresh_token") {
      try {
        const decoded = app.jwt.verify<{
          userId: string;
          orgId: string;
          email: string;
          role: string;
          type: string;
        }>(body.refreshToken);

        if (decoded.type !== "refresh") {
          return reply.code(400).send({ error: "Invalid refresh token" });
        }

        const accessToken = app.jwt.sign(
          {
            userId: decoded.userId,
            orgId: decoded.orgId,
            email: decoded.email,
            role: decoded.role,
          },
          { expiresIn: "1h" },
        );

        const refreshToken = app.jwt.sign(
          {
            userId: decoded.userId,
            orgId: decoded.orgId,
            email: decoded.email,
            role: decoded.role,
            type: "refresh",
          },
          { expiresIn: "30d" },
        );

        // Update last seen.
        await db
          .update(users)
          .set({ lastSeenAt: new Date() })
          .where(eq(users.id, decoded.userId));

        return reply.send({
          accessToken,
          refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000,
          userId: decoded.userId,
          orgId: decoded.orgId,
          email: decoded.email,
          roles: [decoded.role],
        });
      } catch {
        return reply.code(401).send({ error: "Invalid or expired refresh token" });
      }
    }
  });
}

/**
 * Upsert a user from OIDC claims and issue ClawGuard JWTs.
 */
async function issueClawGuardTokens(
  app: FastifyInstance,
  db: FastifyInstance["db"],
  orgId: string,
  claims: { sub: string; email?: string; name?: string },
) {
  const email = claims.email ?? `${claims.sub}@unknown`;

  // Upsert user record.
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.email, email)))
    .limit(1);

  let userId: string;
  let role: "admin" | "user";

  if (existing.length > 0) {
    userId = existing[0].id;
    role = existing[0].role as "admin" | "user";
    await db
      .update(users)
      .set({ lastSeenAt: new Date(), name: claims.name ?? existing[0].name })
      .where(eq(users.id, userId));
  } else {
    // First user in an org becomes admin, subsequent users are regular users.
    const userCount = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId))
      .limit(1);

    role = userCount.length === 0 ? "admin" : "user";

    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        email,
        name: claims.name,
        role,
        lastSeenAt: new Date(),
      })
      .returning();
    userId = newUser.id;
  }

  // Issue ClawGuard JWTs.
  const accessToken = app.jwt.sign(
    { userId, orgId, email, role },
    { expiresIn: "1h" },
  );

  const refreshToken = app.jwt.sign(
    { userId, orgId, email, role, type: "refresh" },
    { expiresIn: "30d" },
  );

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60 * 60 * 1000,
    userId,
    orgId,
    email,
    roles: [role],
  };
}
