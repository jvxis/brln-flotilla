import {Wraps} from "@welshman/app"
import type {AppPolicy} from "@welshman/app"
import type {TrustedEvent} from "@welshman/util"

// Welshman opens wraps in the order they arrive, fifty at a time. A device that has to open its
// whole history -- a new device, or after moving to another signer, when the stored plaintexts are
// gone -- queues every wrap the relays hold before a message that comes in live, and through a
// remote signer each wrap is two round trips. On 08/11/2026 Jaime's 1,140 wraps took about twenty
// minutes per device to open, and a direct message sent meanwhile showed only after all of them.
//
// So the queue is kept newest first, by the wrap's date. That date is backdated on purpose, by at
// most two days (see wrapDrift.ts), so a wrap that just arrived still sorts ahead of everything
// older than that, which is nearly all of a history; and the recent conversations fill in first.
// Small batches let a new arrival get in front without waiting for fifty to finish.
const BATCH_SIZE = 5

const insertNewestFirst = (items: TrustedEvent[], wrap: TrustedEvent) => {
  let low = 0
  let high = items.length

  while (low < high) {
    const middle = (low + high) >> 1

    if (items[middle].created_at >= wrap.created_at) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  items.splice(low, 0, wrap)
}

export const wrapOrderPolicy: AppPolicy = $app => {
  const queue = $app.use(Wraps).queue
  const push = queue.push
  const batchSize = queue.options.batchSize

  queue.options.batchSize = BATCH_SIZE
  queue.items.sort((a, b) => b.created_at - a.created_at)
  queue.push = (wrap: TrustedEvent) => {
    insertNewestFirst(queue.items, wrap)
    queue.process()
  }

  return () => {
    queue.push = push
    queue.options.batchSize = batchSize
  }
}
