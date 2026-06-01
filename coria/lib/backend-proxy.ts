export function backendHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const invokeSecret = process.env.INVOKE_SECRET
  if (invokeSecret) {
    headers["X-Invoke-Secret"] = invokeSecret
  }
  return headers
}

export function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL || "http://localhost:8000"
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}
