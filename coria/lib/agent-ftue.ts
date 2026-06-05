const STORAGE_PREFIX = "coria:ftue:agent"

export function agentFtueStorageKey(
  workspaceId: string,
  memberId: string,
): string {
  return `${STORAGE_PREFIX}:${workspaceId}:${memberId}`
}

export function hasSeenAgentFtue(
  workspaceId: string,
  memberId: string,
): boolean {
  if (typeof window === "undefined") return true
  try {
    return (
      localStorage.getItem(agentFtueStorageKey(workspaceId, memberId)) === "1"
    )
  } catch {
    return true
  }
}

export function markAgentFtueSeen(
  workspaceId: string,
  memberId: string,
): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(agentFtueStorageKey(workspaceId, memberId), "1")
  } catch {
    /* ignore quota / private mode */
  }
}
