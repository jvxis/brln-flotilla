import {ParsedType, isLink, isText} from "@welshman/content"
import type {Parsed} from "@welshman/content"

// A link with no scheme is only a dotted word, and right after a "/" it is the name of a file:
// on 12/11/2026 a member pasted, in a direct message, commands with `/data/lnd/tls.cert`,
// `$A/lnbits.macaroon` and `/home/admin/lnbits-redin.tar.gz`, and each file name became a link
// (`tls.cert` reads as a domain). The link draws its icon and then a space, so a copy into a
// terminal came out as `/data/lnd/ tls.cert`. Welshman's parseLink means to skip "the end of a
// filepath" but asks the results so far, which do not hold the text it is still buffering, so the
// check never sees the slash.
//
// So a scheme-less link glued to the text before it goes back to being text. An opening bracket or
// quote is not glue: `(www.example.com)` stays a link, and anything with `https://` always does.
const isGluedWord = (link: string, before: string) =>
  !link.includes("://") && /[^\s([{<"'“‘]$/.test(before)

export const unlinkGluedWords = (parsed: Parsed[]) => {
  const result: Parsed[] = []

  for (const node of parsed) {
    const prev = result.at(-1)

    // The text after a link that went back to text is glued on as well. parse never puts two
    // texts in a row, so this is the only time it happens.
    if (
      prev &&
      isText(prev) &&
      (isText(node) || (isLink(node) && isGluedWord(node.raw, prev.value)))
    ) {
      const value = prev.value + node.raw

      result[result.length - 1] = {type: ParsedType.Text, value, raw: value}
    } else {
      result.push(node)
    }
  }

  return result
}
