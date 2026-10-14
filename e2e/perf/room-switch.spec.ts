// Medicao de desempenho, fora da bateria normal (o testDir e e2e/specs). Para rodar, copie para
// e2e/specs e use npx playwright test e2e/specs/room-switch.spec.ts, passando PERF_PER_ROOM, PERF_LAPS e PERF_SCROLLS. Nasceu em 14/10/2026 (PATCHES.md 22): trocar de
// sala ficava mais lento quanto mais tempo a aba ficava aberta, e um F5 resolvia. Tres salas com muito historico; a cada volta troca de sala pelo menu, espera a sala
// aparecer, rola o historico para carregar paginas antigas e mede o tempo da troca, o heap do JS e
// quantos eventos o app tem na memoria.
import {HOUR, MINUTE} from "@welshman/lib"
import {expect, messages, roomLink, roomPath, test, timeline, users} from "../harness"

const ROOMS = ["alfa", "beta", "gama"]
const PER_ROOM = Number(process.env.PERF_PER_ROOM ?? 1500)
const LAPS = Number(process.env.PERF_LAPS ?? 30)
const SCROLLS = Number(process.env.PERF_SCROLLS ?? 4)

test("perf: trocar de sala depois de muitas trocas", async ({seed, as}) => {
  test.setTimeout(60 * 60_000)
  const scenario = await seed(({relay, user, at}) => {
    const space = relay("space")
    for (const h of ROOMS) {
      space.room(h, {name: h.toUpperCase()})
      space.join(user.alice, h)
      space.join(user.bob, h)
      for (let i = 0; i < PER_ROOM; i++) {
        space.message(
          i % 2 ? user.bob : user.alice,
          h,
          `${h} mensagem ${i} ` + "x".repeat(60),
          at(i * 3, MINUTE) + HOUR,
        )
      }
    }
  })
  const {url} = scenario.space("space")
  const page = await as(users.alice, roomPath(url, ROOMS[0]))
  await expect(messages(page).first()).toBeVisible({timeout: 60_000})
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Performance.enable")

  const heap = async () => {
    const {metrics} = await cdp.send("Performance.getMetrics")
    const get = (name: string) => metrics.find(m => m.name === name)?.value ?? 0
    return {
      heap: Math.round(get("JSHeapUsedSize") / 1e6),
      nodes: get("Nodes"),
      listeners: get("JSEventListeners"),
    }
  }

  for (let lap = 1; lap <= LAPS; lap++) {
    for (const h of ROOMS) {
      const t0 = Date.now()
      await roomLink(page, h.toUpperCase()).click()
      await expect(page).toHaveURL(new RegExp(`/${h}$`))
      await expect(messages(page).first()).toContainText(`${h} mensagem`, {timeout: 60_000})
      const switchMs = Date.now() - t0
      for (let s = 0; s < SCROLLS; s++) {
        await timeline(page).evaluate(el => {
          el.scrollTop = -el.scrollHeight
        })
        await page.waitForTimeout(400)
      }
      if (h === ROOMS[0]) {
        const m = await heap()
        const loaded = await messages(page).count()
        console.log(
          `PERF volta=${lap} sala=${h} troca_ms=${switchMs} heap_mb=${m.heap} nodes=${m.nodes} listeners=${m.listeners} itens_na_tela=${loaded}`,
        )
      } else {
        console.log(`PERF volta=${lap} sala=${h} troca_ms=${switchMs}`)
      }
    }
  }
})
