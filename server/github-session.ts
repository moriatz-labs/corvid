export function shouldRestoreGitHubSession(env: Record<string, string | undefined>): boolean {
  return env.CORVIN_GITHUB_RESTORE_SESSION === "true";
}
