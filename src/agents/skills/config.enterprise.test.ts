import { describe, it, expect } from "vitest";
import { shouldIncludeSkill } from "./config.js";
import type { SkillEntry } from "./types.js";
import type { OpenClawConfig } from "../../config/config.js";

function makeEntry(overrides?: {
  name?: string;
  skillKey?: string;
  source?: string;
}): SkillEntry {
  return {
    skill: {
      name: overrides?.name ?? "test-skill",
      source: overrides?.source ?? "user",
      content: "# Test Skill\nDoes nothing.",
    },
    frontmatter: {
      raw: {},
    },
    metadata: overrides?.skillKey
      ? { skillKey: overrides.skillKey }
      : undefined,
  } as SkillEntry;
}

function makeConfig(enterprise?: {
  requireApproval?: boolean;
  approvedSkills?: string[];
}): OpenClawConfig {
  return {
    skills: {
      enterprise,
    },
  } as OpenClawConfig;
}

describe("shouldIncludeSkill - enterprise governance", () => {
  it("includes all skills when enterprise is not configured", () => {
    const entry = makeEntry({ name: "my-skill" });
    const result = shouldIncludeSkill({ entry, config: {} as OpenClawConfig });
    expect(result).toBe(true);
  });

  it("includes all skills when requireApproval is false", () => {
    const entry = makeEntry({ name: "my-skill" });
    const config = makeConfig({ requireApproval: false });
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(true);
  });

  it("includes approved skills by name when requireApproval is true", () => {
    const entry = makeEntry({ name: "approved-skill" });
    const config = makeConfig({
      requireApproval: true,
      approvedSkills: ["approved-skill", "other-skill"],
    });
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(true);
  });

  it("includes approved skills by skillKey when requireApproval is true", () => {
    const entry = makeEntry({ name: "my-skill", skillKey: "custom-key" });
    const config = makeConfig({
      requireApproval: true,
      approvedSkills: ["custom-key"],
    });
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(true);
  });

  it("excludes unapproved skills when requireApproval is true", () => {
    const entry = makeEntry({ name: "unapproved-skill" });
    const config = makeConfig({
      requireApproval: true,
      approvedSkills: ["only-this-skill"],
    });
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(false);
  });

  it("excludes skills when requireApproval is true and approvedSkills is empty", () => {
    const entry = makeEntry({ name: "any-skill" });
    const config = makeConfig({
      requireApproval: true,
      approvedSkills: [],
    });
    // Empty array normalizes to undefined, so no allowlist -> include
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(true);
  });

  it("includes skills when requireApproval is true but no approvedSkills list", () => {
    const entry = makeEntry({ name: "any-skill" });
    const config = makeConfig({
      requireApproval: true,
    });
    // No approvedSkills -> normalizes to undefined -> no restriction
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(true);
  });

  it("still respects enabled=false even if skill is approved", () => {
    const entry = makeEntry({ name: "disabled-skill", skillKey: "disabled-skill" });
    const config: OpenClawConfig = {
      skills: {
        enterprise: {
          requireApproval: true,
          approvedSkills: ["disabled-skill"],
        },
        entries: {
          "disabled-skill": { enabled: false },
        },
      },
    } as OpenClawConfig;
    const result = shouldIncludeSkill({ entry, config });
    expect(result).toBe(false);
  });
});
