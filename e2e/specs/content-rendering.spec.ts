import {neventEncode, npubEncode} from "nostr-tools/nip19"
import {HOUR, MINUTE} from "@welshman/lib"
import {MESSAGE, makeEvent} from "@welshman/util"
import {Article, Thread} from "@welshman/domain"
import type {Page} from "@playwright/test"
import {chatPath, expect, roomPath, spacePath, test, users} from "../harness"

// A handle to a seeded event, which only reads once seed() has drained its queue.
type Seeded = {readonly id: string}

// A bolt11 invoice as @welshman/content recognizes one: only behind a `lightning:` scheme, and
// what the chip renders and copies is what follows the scheme.
const INVOICE =
  "lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfq" +
  "ypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3" +
  "agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9"

// An event id no fixture publishes. A quote card is in its loading state until the quoted event
// arrives, and only one that never arrives holds it there long enough to assert: the relay is a
// container on loopback, so a quote it can answer resolves before a locator has resolved.
const UNKNOWN_EVENT_ID = "6f1ac4b0d2e37f5981c6ab4e2d0937fc85be1a2d3c4f5061728394a5b6c7d8e9"

// A cashu token keeps its own scheme in the value, and needs fifty-odd payload characters after
// it before the parser will take it.
const CASHU =
  "cashu:cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjIs" +
  "InNlY3JldCI6ImFhYSIsIkMiOiJiYmIifV0sIm1pbnQiOiJodHRwczovL21pbnQudGVzdCJ9XX0="

test("US-060 reveal a flagged sensitive message", async ({seed, as}) => {
  let flagged!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")
    space.message(user.alice, "general", "no spoilers please", at(45, MINUTE))

    flagged = space.event(
      user.bob,
      makeEvent(MESSAGE, {
        content: "the butler did it",
        tags: [
          ["h", "general"],
          ["content-warning", "spoilers"],
        ],
        created_at: at(30, MINUTE),
      }),
    )
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, "general"))

  // Scoped to bob's own message, so "in place of his text" is a claim about this message rather
  // than about the room as a whole.
  const message = page.locator(`[data-event="${flagged.id}"]`)
  const warning = message.getByText('flagged by the author as "spoilers"')

  await expect(warning).toBeVisible()
  await expect(message.getByText("the butler did it")).toHaveCount(0)

  await message.getByRole("button", {name: "Show anyway"}).click()

  await expect(message.getByText("the butler did it")).toBeVisible()
  await expect(warning).toHaveCount(0)
})

test("US-061 expand a long post", async ({seed, as}) => {
  // Twelve of these is several times the three hundred characters an article card shows.
  const paragraphs = Array.from(
    {length: 12},
    (_, i) => `Paragraph ${i} works through another part of the plan in some detail`,
  )

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.carol, "general")
    space.profile(user.carol, {name: "Carol Chen"})

    // No summary, so the card shows the body itself and truncating it is what the story is about.
    space.event(
      user.carol,
      () =>
        space
          .kind(Article)
          .writer()
          .setIdentifier("the-long-road")
          .setTitle("The Long Road")
          .setPublishedAt(at(3, HOUR))
          .setContent(paragraphs.join("\n\n"))
          .renderTemplate(),
      at(3, HOUR),
    )
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, `${spacePath(url)}/articles`)

  await expect(page.getByText("The Long Road")).toBeVisible()
  await expect(page.getByText(paragraphs[0])).toBeVisible()
  await expect(page.getByText(paragraphs[11])).toHaveCount(0)

  const before = page.url()

  await page.getByRole("button", {name: "Read more"}).click()

  await expect(page.getByText(paragraphs[11])).toBeVisible()

  // The whole card is a link into the article, so expanding in place means the click never
  // reached it.
  expect(page.url()).toBe(before)
})

test("US-062 see images and video inline", async ({seed, as}) => {
  let picture!: Seeded
  let clip!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")

    picture = space.message(user.bob, "general", "https://images.test/sunset.png", at(40, MINUTE))
    clip = space.message(user.bob, "general", "https://media.test/clip.mp4", at(35, MINUTE))
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, "general"))

  const pictureMessage = page.locator(`[data-event="${picture.id}"]`)
  const clipMessage = page.locator(`[data-event="${clip.id}"]`)
  const inlineImage = pictureMessage.locator('img[src="https://images.test/sunset.png"]')

  await expect(inlineImage).toBeVisible()
  await expect(pictureMessage.getByText("images.test/sunset.png")).toHaveCount(0)

  await inlineImage.click()

  // The lightbox is a fullscreen modal holding nothing but the image.
  const preview = page.getByRole("dialog", {name: "Content preview"})
  const lightbox = preview.locator("img")

  await expect(preview).toBeVisible()
  await expect(lightbox).toBeVisible()

  await page.keyboard.press("Escape")

  await expect(page.locator(".dialog")).toHaveCount(0)
  await expect(inlineImage).toBeVisible()

  await inlineImage.click()

  await expect(lightbox).toBeVisible()

  await lightbox.click()

  await expect(page.locator(".dialog")).toHaveCount(0)
  await expect(inlineImage).toBeVisible()

  const video = clipMessage.locator("video")

  await expect(video).toBeVisible()
  await expect(video).toHaveJSProperty("controls", true)
})

test("US-063 preview a shared link", async ({seed, as}) => {
  const announcement = "https://example.test/announcement"
  const unreadable = "https://example.test/unreadable"

  let standalone!: Seeded
  let broken!: Seeded
  let sentence!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")

    standalone = space.message(user.bob, "general", announcement, at(40, MINUTE))
    broken = space.message(user.bob, "general", unreadable, at(35, MINUTE))
    sentence = space.message(
      user.bob,
      "general",
      `Have a look at ${announcement} before the call.`,
      at(30, MINUTE),
    )
  })

  const {url} = scenario.space("space")

  // The room is opened by hand below rather than by as(): a preview is fetched once per url and
  // memoized for the life of the page, so the backend has to be standing before the first render.
  const page = await as(users.alice, "/")

  let servePreview = () => {}

  const previewReleased = new Promise<void>(resolve => {
    servePreview = resolve
  })

  // Registered after as(), so it answers ahead of the harness's own dufflepud. Holding the one
  // preview open makes the loading state a fact rather than a race.
  await page.context().route(
    requestUrl => requestUrl.pathname === "/link/preview",
    async route => {
      const {url: target}: {url: string} = route.request().postDataJSON()

      if (target === announcement) {
        await previewReleased

        return route.fulfill({
          json: {
            title: "Flotilla ships v1",
            description: "Everything new in this release.",
            image: "https://images.test/preview.png",
          },
        })
      }

      // What dufflepud answers with for a url it could make nothing of.
      return route.fulfill({json: {}})
    },
  )

  await page.goto(roomPath(url, "general"))

  const card = page.locator(`[data-event="${standalone.id}"]`)
  const failed = page.locator(`[data-event="${broken.id}"]`)
  const inline = page.locator(`[data-event="${sentence.id}"]`)
  const previewImage = 'img[src="https://images.test/preview.png"]'

  await expect(card.locator(".spinner")).toBeVisible()
  await expect(failed.getByRole("link", {name: "example.test/unreadable"})).toBeVisible()

  servePreview()

  await expect(card.getByText("Flotilla ships v1")).toBeVisible()
  await expect(card.getByText("Everything new in this release.")).toBeVisible()
  await expect(card.locator(previewImage)).toBeVisible()

  // The same url mid-sentence, now that the preview it would have shown is known to resolve: a
  // compact link, and none of the card.
  await expect(inline.getByRole("link", {name: "example.test/announcement"})).toBeVisible()
  await expect(inline.getByText("Flotilla ships v1")).toHaveCount(0)
  await expect(inline.locator(previewImage)).toHaveCount(0)
})

test("US-064 follow a link to another space", async ({seed, as}) => {
  let reference!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")
    const other = relay("other")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")

    other.room("lounge", {name: "Other Lounge"})
    other.join(user.alice, "lounge")

    // The second space's url only exists once seeding has run, so the message is rendered late.
    reference = space.event(
      user.bob,
      () => makeEvent(MESSAGE, {content: other.url, tags: [["h", "general"]]}),
      at(30, MINUTE),
    )
  })

  const {url} = scenario.space("space")
  const other = scenario.space("other")
  const page = await as(users.alice, roomPath(url, "general"))

  const message = page.locator(`[data-event="${reference.id}"]`)
  const spaceLink = message.getByRole("link", {name: "other.test"})

  await expect(spaceLink).toBeVisible()
  await expect(message.getByText(other.url)).toHaveCount(0)
  await expect(spaceLink).toHaveAttribute("href", spacePath(other.url))
  await expect(spaceLink).not.toHaveAttribute("target", "_blank")

  await spaceLink.click()

  await page.waitForURL(next => next.pathname.startsWith(spacePath(other.url)))

  await expect(
    page.locator(".secondary-nav").getByRole("link", {name: "Other Lounge"}),
  ).toBeVisible()

  expect(page.context().pages()).toHaveLength(1)
})

test("US-065 see quoted and embedded content", async ({seed, as}) => {
  let original!: Seeded
  let reply!: Seeded
  let thread!: Seeded
  let threadQuote!: Seeded
  let unresolvable!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")
    space.join(user.carol, "general")
    space.profile(user.alice, {name: "Alice Anders"})
    space.profile(user.bob, {name: "Bob Boberton"})
    space.profile(user.carol, {name: "Carol Chen"})

    const point = space.message(user.alice, "general", "the original point", at(6, HOUR))

    // Enough between the two that the original is well off screen when the room opens.
    for (let i = 0; i < 30; i++) {
      space.message(user.bob, "general", `filler message number ${i}`, at(300 - i * 5, MINUTE))
    }

    // Carol says something in the room too, so her profile is loaded by the time her name has to
    // render on a card quoting her thread.
    space.message(user.carol, "general", "posted a roadmap", at(140, MINUTE))

    const topic = space.event(
      user.carol,
      () =>
        space
          .kind(Thread)
          .writer()
          .setRoom(space.url, "general")
          .setTitle("Roadmap for Q3")
          .setContent("Here is what we are planning for the next quarter.")
          .renderTemplate(),
      at(3, HOUR),
    )

    original = point
    thread = topic
    reply = space.reply(user.bob, point, "totally agree with this", at(20, MINUTE))
    threadQuote = space.reply(user.bob, topic, "worth a read", at(15, MINUTE))
    unresolvable = space.message(
      user.bob,
      "general",
      `nostr:${neventEncode({id: UNKNOWN_EVENT_ID, relays: [space.url]})}\n\nand this one`,
      at(10, MINUTE),
    )
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, "general"))

  const threadMessage = page.locator(`[data-event="${threadQuote.id}"]`)

  // The state a quote card is in until the quoted event arrives. It is asserted on the quote
  // nothing can answer rather than on the thread below, which resolves off an open socket to
  // loopback and is as likely to be a card by the time this runs as a placeholder.
  const unresolvableMessage = page.locator(`[data-event="${unresolvable.id}"]`)

  await expect(unresolvableMessage.getByText("Loading event...")).toBeVisible()

  const replyMessage = page.locator(`[data-event="${reply.id}"]`)
  const quoteStrip = replyMessage.locator(".border-l-2")

  await expect(quoteStrip).toContainText("the original point")
  await expect(replyMessage).toContainText("totally agree with this")

  const originalMessage = page.locator(`[data-event="${original.id}"]`)

  await expect(originalMessage).toBeAttached()
  await expect(originalMessage).not.toBeInViewport()

  await quoteStrip.click()

  await expect(originalMessage).toBeInViewport()

  // The quoted thread's card, once it has loaded: the profile circle beside the message carries
  // the same border classes, so the title is what says which of them is meant.
  const quotedThread = threadMessage.locator(".border.border-solid").filter({
    hasText: "Roadmap for Q3",
  })

  await expect(quotedThread).toBeVisible()
  await expect(quotedThread).toContainText("Carol Chen")
  await expect(quotedThread).toContainText("Here is what we are planning for the next quarter.")

  await quotedThread.getByText("Roadmap for Q3").click()

  await page.waitForURL(next => next.pathname === `${spacePath(url)}/threads/${thread.id}`)

  await expect(page.getByRole("heading", {name: "Roadmap for Q3"})).toBeVisible()
})

test("US-066 see distinctive inline tokens", async ({seed, as}) => {
  const mention = `nostr:${npubEncode(users.bob.pubkey)}`
  const content = [
    "Shipping #nostr today :partyparrot:",
    `Run \`npm install\` first, then ping ${mention} or email team@example.test`,
    "```",
    "const answer = 42",
    "```",
  ].join("\n")

  let tokens!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")
    space.join(user.carol, "general")
    space.profile(user.bob, {name: "Bob Boberton"})
    space.profile(user.carol, {name: "Carol Chen"})

    // Bob posts too, so his profile is loaded against this space before he is mentioned.
    space.message(user.bob, "general", "morning all", at(50, MINUTE))

    // The shortcode's image comes off the message's own emoji tag, which is what a client writes
    // when someone picks a custom emoji.
    tokens = space.event(
      user.carol,
      makeEvent(MESSAGE, {
        content,
        tags: [
          ["h", "general"],
          ["emoji", "partyparrot", "https://images.test/partyparrot.png"],
        ],
        created_at: at(40, MINUTE),
      }),
    )
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, "general"))

  const message = page.locator(`[data-event="${tokens.id}"]`)

  await expect(message.getByText("#nostr", {exact: true})).toHaveClass(/link-content/)
  await expect(message.getByAltText(":partyparrot:")).toBeVisible()
  // An img contributes no text, so this is the "instead of the raw text" half of the story: with
  // no emoji tag to resolve, the shortcode is rendered verbatim.
  await expect(message.getByText(":partyparrot:")).toHaveCount(0)

  const inlineCode = message.locator("code").filter({hasText: "npm install"})
  const blockCode = message.locator("code").filter({hasText: "const answer = 42"})

  await expect(inlineCode).toBeVisible()
  await expect(inlineCode).not.toHaveClass(/(^|\s)block(\s|$)/)
  await expect(blockCode).toBeVisible()
  await expect(blockCode).toHaveClass(/(^|\s)block(\s|$)/)

  await expect(message.getByRole("link", {name: "team@example.test"})).toHaveAttribute(
    "href",
    "mailto:team@example.test",
  )

  await message.getByRole("button", {name: "@Bob Boberton"}).click()

  // Dialog wraps its content in a second element of its own, so the inner one is the modal.
  const profile = page.locator(".dialog").last()

  await expect(profile.getByText("Bob Boberton", {exact: true})).toBeVisible()
  await expect(profile.getByRole("button", {name: "View Full Profile"})).toBeVisible()
})

test("US-067 copy a shared invoice or token", async ({seed, as}) => {
  let invoice!: Seeded
  let token!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")

    invoice = space.message(user.bob, "general", `lightning:${INVOICE}`, at(40, MINUTE))
    token = space.message(user.bob, "general", CASHU, at(35, MINUTE))
  })

  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, "general"), {
    context: {permissions: ["clipboard-read", "clipboard-write"]},
  })

  const toast = page.getByRole("alert")
  const invoiceChip = page
    .locator(`[data-event="${invoice.id}"]`)
    .getByRole("button", {name: INVOICE.slice(0, 16)})

  await expect(invoiceChip).toBeVisible()
  await expect(page.getByText(INVOICE)).toHaveCount(0)

  await invoiceChip.click()

  await expect(toast).toContainText("Copied to clipboard!")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INVOICE)

  // Both copies raise the same toast, so this one is dismissed rather than waited out — otherwise
  // the second assertion would pass on the first toast.
  await toast.getByRole("button").click()

  await expect(toast).toHaveCount(0)

  const tokenChip = page
    .locator(`[data-event="${token.id}"]`)
    .getByRole("button", {name: CASHU.slice(0, 16)})

  await expect(tokenChip).toBeVisible()
  await expect(page.getByText(CASHU)).toHaveCount(0)

  await tokenChip.click()

  await expect(toast).toContainText("Copied to clipboard!")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CASHU)
})

// A node's address is one word of ninety-odd characters. On a phone a bubble sized itself to it:
// it grew wider than the screen and, being right-aligned, the user's own message lost the start
// of every line off the left edge (09/11/2026).
const NODE_URI =
  "03884d30a18627e7d1db6899c5c43f42f31274560966d2422b7e2cd50a55db0124@154.38.181.197:10100"

test("a long unbroken word stays inside the bubble on a phone", async ({seed, as}) => {
  let own!: Seeded
  let other!: Seeded
  let posted!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")
    space.relayList(user.alice)
    space.relayList(user.bob)
    space.messagingRelayList(user.alice)
    space.messagingRelayList(user.bob)
    other = space.dm(user.bob, [user.alice], `Abra o canal para ${NODE_URI} hoje`, at(40, MINUTE))
    own = space.dm(user.alice, [user.bob], `Conecte em ${NODE_URI} antes`, at(30, MINUTE))

    posted = space.message(user.alice, "general", `No grupo: ${NODE_URI}`, at(20, MINUTE))
  })

  const width = 390
  const phone = {context: {viewport: {width, height: 844}, hasTouch: true}}
  const insideTheScreen = async (page: Page, selector: string) => {
    const element = page.locator(selector)

    await expect(element).toContainText(NODE_URI.slice(0, 20))

    const box = (await element.boundingBox())!

    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }

  // The direct message: a bubble per message, the user's own on the right.
  const chat = await as(users.alice, chatPath(users.bob.pubkey), phone)

  await insideTheScreen(chat, `[data-event="${own.id}"] .chat-bubble`)
  await insideTheScreen(chat, `[data-event="${other.id}"] .chat-bubble`)

  // A room lays messages out as a list rather than bubbles, and must not overflow either.
  const room = await as(users.alice, roomPath(scenario.space("space").url, "general"), phone)

  await insideTheScreen(room, `[data-event="${posted.id}"]`)
})

// 09/11/2026, Jaime: the newest message sat flush against the box to write in, on the phone and
// on the desktop. The list now keeps a little room above the composer.
test("the newest message keeps a gap above the composer", async ({seed, as}) => {
  let last!: Seeded
  let posted!: Seeded

  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")

    space.room("general", {name: "General"})
    space.join(user.alice, "general")
    space.join(user.bob, "general")
    space.relayList(user.alice)
    space.relayList(user.bob)
    space.messagingRelayList(user.alice)
    space.messagingRelayList(user.bob)
    last = space.dm(user.bob, [user.alice], "okay, sem problema", at(5, MINUTE))
    posted = space.message(user.bob, "general", "a última da sala", at(5, MINUTE))
  })

  const phone = {context: {viewport: {width: 390, height: 844}, hasTouch: true}}
  const gap = async (page: Page, message: string) => {
    await expect(page.locator(message)).toBeVisible()

    const bottom = (await page.locator(message).boundingBox())!
    const compose = (await page.locator(".room__compose").first().boundingBox())!

    return compose.y - (bottom.y + bottom.height)
  }

  const chat = await as(users.alice, chatPath(users.bob.pubkey), phone)

  expect(await gap(chat, `[data-event="${last.id}"] .chat-bubble`)).toBeGreaterThanOrEqual(12)

  const room = await as(users.alice, roomPath(scenario.space("space").url, "general"), phone)

  expect(await gap(room, `[data-event="${posted.id}"]`)).toBeGreaterThanOrEqual(8)
})
