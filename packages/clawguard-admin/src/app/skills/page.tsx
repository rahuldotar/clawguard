"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { getAuth } from "@/lib/auth";
import { getPendingSkills, reviewSkill, getApprovedSkills } from "@/lib/api";
import type { SkillSubmission } from "@/lib/api";

export default function SkillsPage() {
  const router = useRouter();
  const [pending, setPending] = useState<SkillSubmission[]>([]);
  const [approved, setApproved] = useState<Array<{ skillName: string; skillKey: string; scope: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved">("pending");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    const auth = getAuth()!;
    const [pendingRes, approvedRes] = await Promise.allSettled([
      getPendingSkills(auth.orgId, auth.accessToken),
      getApprovedSkills(auth.orgId, auth.accessToken),
    ]);
    if (pendingRes.status === "fulfilled") setPending(pendingRes.value.submissions);
    if (approvedRes.status === "fulfilled") setApproved(approvedRes.value.skills);
    setLoading(false);
  }

  async function handleReview(id: string, status: string) {
    const auth = getAuth();
    if (!auth) return;

    setReviewingId(id);
    try {
      await reviewSkill(auth.orgId, id, auth.accessToken, { status });
      await loadData();
    } finally {
      setReviewingId(null);
    }
  }

  function renderScanResults(submission: SkillSubmission) {
    const scan = submission.scanResults;
    if (!scan) return <p className="text-sm text-muted-foreground">No scan results available.</p>;

    return (
      <div className="space-y-3">
        <div className="flex gap-4 text-sm">
          <span>Files scanned: {scan.scannedFiles}</span>
          <span className="text-red-600">Critical: {scan.critical}</span>
          <span className="text-amber-600">Warnings: {scan.warn}</span>
          <span className="text-blue-600">Info: {scan.info}</span>
        </div>
        {scan.findings.length > 0 && (
          <div className="space-y-2">
            {scan.findings.map((f, i) => (
              <div key={i} className="text-xs border border-border rounded p-2 bg-secondary/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={f.severity === "critical" ? "danger" : f.severity === "warn" ? "warning" : "info"}>
                    {f.severity}
                  </Badge>
                  <span className="font-medium">{f.ruleId}</span>
                  <span className="text-muted-foreground">{f.file}:{f.line}</span>
                </div>
                <p>{f.message}</p>
                <pre className="mt-1 text-muted-foreground overflow-x-auto">{f.evidence}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h2 className="text-2xl font-bold mb-6">Skill Review</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "pending"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("approved")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "approved"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Approved ({approved.length})
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : tab === "pending" ? (
          pending.length === 0 ? (
            <p className="text-muted-foreground">No pending skill submissions.</p>
          ) : (
            <div className="space-y-4">
              {pending.map((submission) => (
                <Card key={submission.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-base">{submission.skillName}</h3>
                      {submission.skillKey && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{submission.skillKey}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Submitted {new Date(submission.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
                        className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary"
                      >
                        {expandedId === submission.id ? "Hide Details" : "Details"}
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "approved-org")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve (Org)
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "approved-self")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Approve (Self)
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "rejected")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {expandedId === submission.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {submission.manifestContent && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">SKILL.md</h4>
                          <pre className="text-xs bg-secondary rounded p-3 overflow-x-auto whitespace-pre-wrap">
                            {submission.manifestContent}
                          </pre>
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-medium mb-1">Security Scan</h4>
                        {renderScanResults(submission)}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        ) : (
          approved.length === 0 ? (
            <p className="text-muted-foreground">No approved skills.</p>
          ) : (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Skill Name</th>
                    <th className="pb-2 font-medium">Key</th>
                    <th className="pb-2 font-medium">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((skill, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{skill.skillName}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{skill.skillKey}</td>
                      <td className="py-2">
                        <Badge variant={skill.scope === "org" ? "success" : "info"}>
                          {skill.scope}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        )}
      </main>
    </div>
  );
}
