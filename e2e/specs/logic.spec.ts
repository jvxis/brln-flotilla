import {expect, test} from "@playwright/test"
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
  // What a member pasted on 12/11/2026; each one copied into a terminal with a space after the "/".
  for (const content of [
    "openssl x509 -in /data/lnd/tls.cert -noout -text",
    'curl --cacert /data/lnd/tls.cert -H "X-Api-Key: $(xxd -p $A/lnbits.macaroon)"',
    "tar -xzf /home/admin/lnbits-redin.tar.gz -C /var/lib/lightningos/apps-data/lnbits/lnd",
    "ls ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
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
