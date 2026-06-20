import { describe, expect, it } from "vitest";
import {
  defaultOnboardingRepositories,
  generateOnboardingScan,
} from "../src/shared/onboarding";
import { parseExecMarkdown, validateExecDocument } from "../src/shared/mvp";

describe("repository onboarding", () => {
  it("offers multiple Moriatz Labs repositories including Shelfmark", () => {
    expect(defaultOnboardingRepositories.length).toBeGreaterThanOrEqual(2);
    expect(defaultOnboardingRepositories.map((repository) => repository.repo)).toEqual(
      expect.arrayContaining(["moriatz-labs/shelfmark", "moriatz-labs/corvid"]),
    );
    expect(defaultOnboardingRepositories.every((repository) => repository.repo.startsWith("moriatz-labs/"))).toBe(true);
  });

  it("generates a valid AI-authored exec.md for Shelfmark during onboarding", () => {
    const shelfmark = defaultOnboardingRepositories.find((repository) => repository.id === "shelfmark");
    expect(shelfmark).toBeDefined();

    const scan = generateOnboardingScan(shelfmark!, "2026-06-20T00:00:00.000Z");
    const parsed = parseExecMarkdown(scan.execMarkdown);

    expect(scan.generatedBy).toBe("Corvin AI onboarding");
    expect(scan.steps.map((step) => step.id)).toEqual(["connect", "scan", "install"]);
    expect(scan.detected.envKeys).toEqual(
      expect.arrayContaining([
        "VITE_CLERK_PUBLISHABLE_KEY",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_NOVUS_PENDO_API_KEY",
      ]),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.document?.repositories[0]).toEqual(
      expect.objectContaining({
        id: "shelfmark",
        repo: "moriatz-labs/shelfmark",
        install: "npm install",
        dev: "npm run dev -- --host 0.0.0.0",
        health: "http://localhost:5175",
      }),
    );
    expect(validateExecDocument(parsed.document!, {}).ready).toBe(true);
    expect(scan.execMarkdown).toContain("Novus/Pendo analytics");
  });
});
