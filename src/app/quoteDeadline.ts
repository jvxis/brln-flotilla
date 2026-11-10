import {maybeGetTestEnv} from "@lib/test/env"

// How long a quote or a pin waits for the event it points to before saying it is not there.
// On 10/11/2026 Redin deleted a message (NIP-09) that two replies in the Suporte room quoted;
// every relay of the club dropped it, and both replies showed "Loading event..." for good, which
// read on Jaime's phone as the chat being slow. Past the deadline the spinner gives way to a
// plain line; if the event does arrive later, the card replaces it as usual.
// Test-only: VITE_TEST_QUOTE_DEADLINE shortens it; a production build strips the branch.
const testDeadline = import.meta.env.DEV ? Number(maybeGetTestEnv("VITE_TEST_QUOTE_DEADLINE")) : NaN

export const QUOTE_DEADLINE = testDeadline > 0 ? testDeadline : 10_000

export const QUOTE_UNAVAILABLE = "Message deleted or unavailable"
