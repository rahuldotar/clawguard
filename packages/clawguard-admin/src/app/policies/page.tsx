"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { getAuth } from "@/lib/auth";
import { getPolicy, updatePolicy } from "@/lib/api";

const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["read", "write", "edit", "apply_patch", "glob", "grep"],
  "group:exec": ["bash", "exec"],
  "group:web": ["web_fetch", "web_search"],
  "group:mcp": ["mcp"],
};

export default function PoliciesPage() {
  const router = useRouter();
  const [denyList, setDenyList] = useState<string[]>([]);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [auditLevel, setAuditLevel] = useState("metadata");
  const [profile, setProfile] = useState("");
  const [newDeny, setNewDeny] = useState("");
  const [newAllow, setNewAllow] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    getPolicy(auth.orgId, auth.accessToken).then((policy) => {
      setDenyList(policy.tools.deny ?? []);
      setAllowList(policy.tools.allow ?? []);
      setProfile(policy.tools.profile ?? "");
      setAuditLevel(policy.auditLevel);
      setVersion(policy.version);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  function addItem(list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  }

  function removeItem(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  function expandGroup(name: string): string[] {
    return TOOL_GROUPS[name] ?? [name];
  }

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;

    setSaving(true);
    setMessage("");

    try {
      await updatePolicy(auth.orgId, auth.accessToken, {
        tools: {
          deny: denyList.length > 0 ? denyList : undefined,
          allow: allowList.length > 0 ? allowList : undefined,
          profile: profile || undefined,
        },
        auditLevel,
      });
      setVersion((v) => v + 1);
      setMessage("Policy saved successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Policy Editor</h2>
          <Badge>v{version}</Badge>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-6">
            {/* Deny List */}
            <Card>
              <CardTitle>Denied Tools</CardTitle>
              <p className="text-sm text-muted-foreground mb-3">
                Tools in this list will be blocked for all users. Supports group names (e.g. group:fs).
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newDeny}
                  onChange={(e) => setNewDeny(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(denyList, setDenyList, newDeny, setNewDeny))}
                  placeholder="e.g. bash, group:exec"
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => addItem(denyList, setDenyList, newDeny, setNewDeny)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {denyList.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-800 text-xs font-medium">
                    {item}
                    {TOOL_GROUPS[item] && (
                      <span className="text-red-500 ml-1">({expandGroup(item).join(", ")})</span>
                    )}
                    <button onClick={() => removeItem(denyList, setDenyList, i)} className="ml-1 hover:text-red-600">&times;</button>
                  </span>
                ))}
                {denyList.length === 0 && <span className="text-sm text-muted-foreground">No denied tools</span>}
              </div>
            </Card>

            {/* Allow List */}
            <Card>
              <CardTitle>Allowed Tools</CardTitle>
              <p className="text-sm text-muted-foreground mb-3">
                If set, only these tools will be permitted. Leave empty to allow all (except denied).
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newAllow}
                  onChange={(e) => setNewAllow(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(allowList, setAllowList, newAllow, setNewAllow))}
                  placeholder="e.g. read, write, group:fs"
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => addItem(allowList, setAllowList, newAllow, setNewAllow)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowList.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 text-green-800 text-xs font-medium">
                    {item}
                    {TOOL_GROUPS[item] && (
                      <span className="text-green-500 ml-1">({expandGroup(item).join(", ")})</span>
                    )}
                    <button onClick={() => removeItem(allowList, setAllowList, i)} className="ml-1 hover:text-green-600">&times;</button>
                  </span>
                ))}
                {allowList.length === 0 && <span className="text-sm text-muted-foreground">All tools allowed (except denied)</span>}
              </div>
            </Card>

            {/* Audit Level & Profile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardTitle>Audit Level</CardTitle>
                <select
                  value={auditLevel}
                  onChange={(e) => setAuditLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="full">Full (all events + LLM I/O)</option>
                  <option value="metadata">Metadata (events only)</option>
                  <option value="off">Off</option>
                </select>
              </Card>

              <Card>
                <CardTitle>Tool Profile</CardTitle>
                <input
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="e.g. developer, readonly"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Card>
            </div>

            {/* Save */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Policy"}
              </button>
              {message && (
                <p className={`text-sm ${message.includes("success") ? "text-green-600" : "text-red-600"}`}>
                  {message}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
