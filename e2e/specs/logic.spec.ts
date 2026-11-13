import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {runInNewContext} from "node:vm"
import {expect, test} from "@playwright/test"
import {HOUR, MINUTE, ago} from "@welshman/lib"
import {isLink, parse} from "@welshman/content"
import type {Parsed} from "@welshman/content"
import {unlinkGluedWords} from "../../src/app/gluedLinks"
import {lookUpZapper} from "../../src/app/zapperLookup"

// Decisions that need neither a relay nor a browser, run against the code itself. They live with
// the suite because playwright is the project's only test runner.

const rendered = (content: string) => {
  const parsed: Parsed[] = unlinkGluedWords(parse({content}))

  return {text: parsed.map(p => p.raw).join(""), links: parsed.filter(isLink).map(p => p.raw)}
}

test.describe("a file name after a slash is not a link (jvxis/brln-flotilla#4)", () => {
  // Commands with the file names a member pasted on 13/11/2026, and the line the issue reproduces
  // it with. Each one copied into a terminal with a space after the "/".
  for (const content of [
    "openssl x509 -in /data/lnd/tls.cert -noout -text",
    'curl --cacert /data/lnd/tls.cert -H "X-Api-Key: $(xxd -p $A/lnbits.macaroon)"',
    "lncli --macaroonpath $A/lnbits.macaroon getinfo",
    "tar -xzf /home/admin/lnbits-redin.tar.gz -C /var/lib/lightningos/apps-data/lnbits/lnd",
    "ls ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
    `sudo bash -c 'for f in /data/lnd/tls.cert /data/lnd/data/chain/bitcoin/mainnet/admin.macaroon; do stat -c "%n" "$f"; done'`,
  ]) {
    test(content, () => {
      expect(rendered(content)).toEqual({text: content, links: []})
    })
  }

  test("a real link still is one", () => {
    const content = "guia em https://br-ln.com/guias/tls.cert, ou www.example.com (br-ln.com)"

    expect(rendered(content)).toEqual({
      text: content,
      links: ["https://br-ln.com/guias/tls.cert", "www.example.com", "br-ln.com"],
    })
  })

  test("a link at the start of a line still is one", () => {
    expect(rendered("veja\nbr-ln.com/guias").links).toEqual(["br-ln.com/guias"])
  })
})

test.describe("a zap looks the address up again when the first answer was empty (#2)", () => {
  const zapper = {allowsNostr: true}
  const never = new Promise<undefined>(() => {})

  test("a good answer is used without asking again", async () => {
    let asked = 0

    const reload = async () => {
      asked += 1
      return undefined
    }

    expect(await lookUpZapper(Promise.resolve(zapper), reload)).toBe(zapper)
    expect(asked).toBe(0)
  })

  test("an empty answer is asked again", async () => {
    expect(await lookUpZapper(Promise.resolve(undefined), async () => zapper)).toBe(zapper)
    expect(await lookUpZapper(Promise.resolve(undefined), async () => undefined)).toBeUndefined()
  })

  test("either lookup is bounded", async () => {
    expect(await lookUpZapper(never, async () => zapper, 50)).toBe("timeout")
    expect(await lookUpZapper(Promise.resolve(undefined), () => never, 50)).toBe("timeout")
  })
})

test.describe("a push that arrives hours late is not shown as new (#3)", () => {
  type Shown = {title: string; options: NotificationOptions & {renotify?: boolean}}

  // The club's push handlers, as the service worker imports them, with a registration that records
  // what it is asked to show.
  const push = async (payload: Record<string, unknown>) => {
    const shown: Shown[] = []
    const listeners: Record<string, (event: unknown) => void> = {}
    const waits: Promise<unknown>[] = []
    const self = {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener
      },
      registration: {
        showNotification: async (title: string, options: Shown["options"]) => {
          shown.push({title, options})
        },
        getNotifications: async () => [],
      },
      navigator: {},
    }
    const source = fileURLToPath(new URL("../../static/brln-push-sw.js", import.meta.url))

    runInNewContext(readFileSync(source, "utf8"), {self, Date})
    listeners.push({
      data: {json: () => payload},
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    })
    await Promise.all(waits)

    return shown
  }

  const room = {title: "Naghust em Suporte", body: "reinicia o LND", tag: "sala-suporte"}
  const mention = {
    title: "Naghust mencionou você em Suporte",
    body: "oi",
    tag: "msg-0123456789abcdef",
  }
  const direct = {title: "Nova mensagem direta", body: "Abra o chat do clube para ler.", tag: "dm"}

  test("a recent message shows as it came", async () => {
    const [shown] = await push({...room, url: "/spaces/x/suporte", created_at: ago(30, MINUTE)})

    expect(shown.title).toBe(room.title)
    expect(shown.options).toMatchObject({body: room.body, tag: room.tag, renotify: false})
    expect(shown.options.data).toEqual({url: "/spaces/x/suporte"})
  })

  test("a room's message older than three hours joins the late ones", async () => {
    const [shown] = await push({...room, created_at: ago(4, HOUR)})

    expect(shown.options).toMatchObject({tag: "atrasados", silent: true, renotify: false})
    expect(shown.options.body).not.toContain(room.body)
  })

  test("a mention or a direct message waits a day", async () => {
    expect((await push({...mention, created_at: ago(4, HOUR)}))[0].options.tag).toBe(mention.tag)
    expect((await push({...direct, created_at: ago(23, HOUR)}))[0].options.tag).toBe("dm")
    expect((await push({...mention, created_at: ago(25, HOUR)}))[0].options.tag).toBe("atrasados")
    expect((await push({...direct, created_at: ago(25, HOUR)}))[0].options.tag).toBe("atrasados")
  })

  test("a push from a service that sends no time shows as before", async () => {
    expect((await push(room))[0].options.tag).toBe(room.tag)
  })
})
