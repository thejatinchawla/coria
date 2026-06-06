import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi

function normalizeHref(raw: string): string {
  return raw.startsWith("www.") ? `https://${raw}` : raw
}

function stripTrailingFromUrl(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ""
  while (url.endsWith(")")) {
    const opens = (url.match(/\(/g) ?? []).length
    const closes = (url.match(/\)/g) ?? []).length
    if (closes <= opens) break
    trailing = ")" + trailing
    url = url.slice(0, -1)
  }
  const punct = url.match(/[.,;:!?]+$/)?.[0]
  if (punct) {
    trailing = punct + trailing
    url = url.slice(0, -punct.length)
  }
  return { url, trailing }
}

export function linkifyText(text: string, linkClassName?: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  const re = new RegExp(URL_PATTERN.source, URL_PATTERN.flags)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const index = match.index
    const raw = match[0]
    if (index > last) nodes.push(text.slice(last, index))
    const { url, trailing } = stripTrailingFromUrl(raw)
    if (url) {
      nodes.push(
        <a
          key={`${index}-${url}`}
          href={normalizeHref(url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "underline underline-offset-2 hover:opacity-80",
            linkClassName,
          )}
        >
          {url}
        </a>,
      )
    } else {
      nodes.push(raw)
    }
    if (trailing) nodes.push(trailing)
    last = index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length > 0 ? nodes : [text]
}

export function LinkifiedText({
  text,
  linkClassName,
}: {
  text: string
  linkClassName?: string
}) {
  return <>{linkifyText(text, linkClassName)}</>
}
