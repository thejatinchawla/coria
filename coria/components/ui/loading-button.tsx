"use client"

import { Button } from "@/components/ui/button"

/** @deprecated Use `<Button loading={…}>` — kept for existing imports. */
export function LoadingButton({
  loading,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return <Button loading={loading} {...props} />
}
