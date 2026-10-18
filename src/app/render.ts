import {ParsedType, parse, renderAsText, summarize} from "@welshman/content"
import type {Parsed, SummaryName} from "@welshman/content"
import type {TrustedEvent} from "@welshman/util"
import {profiles} from "@app/core"

// BR⚡LN: text pasted on Windows ends its lines in "\r\n", and renderAsHtml turns the "\r" into a
// <br> of its own, so every line break of the message showed twice (Jaime, 18/10/2026: a pasted
// announcement came out with double spacing until it was edited, since editing drops the "\r").
// The composer no longer keeps it (src/app/editor/index.ts); this is for what is already stored
// and what other clients send.
export const parseEvent = (event: Parameters<typeof parse>[0]) =>
  parse(
    event.content?.includes("\r")
      ? {...event, content: event.content.replace(/\r\n?/g, "\n")}
      : event,
  )

const summaryName: SummaryName = parsed =>
  parsed.type === ParsedType.Profile ? profiles.get().display(parsed.value.pubkey).get() : undefined

const renderSummary = (parsed: Parsed[]) =>
  renderAsText(summarize(parsed, summaryName)).toString().trim()

export const renderEventAsText = (event: TrustedEvent) => renderSummary(parseEvent(event))

const splitLines = (parsed: Parsed[]) => {
  const lines: Parsed[][] = [[]]

  for (const node of parsed) {
    if (node.type === ParsedType.Newline) {
      lines.push([])
    } else {
      lines[lines.length - 1].push(node)
    }
  }

  return lines.filter(line => line.length > 0)
}

const hasProse = (line: Parsed[]) =>
  line.some(node => node.type === ParsedType.Text && node.value.trim().length > 0)

// A reply prepends the message it answers, so the first line of one describes the quote and says
// nothing about the reply. The first line carrying words of its own is what the message is about.
export const renderEventAsSummary = (event: TrustedEvent) => {
  const lines = splitLines(parseEvent(event))

  return renderSummary(lines.find(hasProse) || lines[0] || [])
}
