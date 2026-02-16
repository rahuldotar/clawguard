"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // In production this would go through the full OIDC flow.
      // For development, exchange a mock id_token.
      const res = await fetch(`${API_BASE}/api/v1/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantType: "id_token",
          idToken: "dev-token",
          orgId,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Login failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      setAuth({
        accessToken: data.accessToken,
        orgId: data.orgId ?? orgId,
        userId: data.userId,
        email: data.email ?? email,
        role: data.role ?? "admin",
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-lg border border-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-primary mb-1">ClawGuard</h1>
          <p className="text-sm text-muted-foreground mb-6">Admin Console</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="orgId" className="block text-sm font-medium mb-1">
                Organization ID
              </label>
              <input
                id="orgId"
                type="text"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="org-123"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@example.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Signing in..." : "Sign in with SSO"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
