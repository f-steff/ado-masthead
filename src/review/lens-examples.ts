// Short, synthetic examples for the in-product lens guide. They demonstrate
// the review contract without reproducing any real pull request or repository.
// Examples use C, RTOS and board-level code so the guide matches embedded work.
import type { ReviewLensId } from "./lenses";

export interface LensExampleCase {
  name: string;
  input: string;
  output: string;
}

export interface LensExample {
  whenToUse: string;
  cases: LensExampleCase[];
}

export const LENS_EXAMPLES: Record<ReviewLensId, LensExample> = {
  correctness: {
    whenToUse: "Use this on every review. It is the baseline lens for changed behavior, ISR interaction, task interaction and edge cases.",
    cases: [
      {
        name: "Ring buffer treats empty as one stale item",
        input: `src/uart_ring.c
+ while (ring->head <= ring->tail) {
+   process(ring->data[ring->head]);
+   ring->head = (ring->head + 1) % RING_SIZE;
+ }`,
        output: `src/uart_ring.c:1 - Major, high confidence
Trigger: head == tail represents an empty ring, but the loop still processes one slot.
Consequence: a stale byte is delivered after the buffer drains, and the tail can pass the head.
Suggestion: loop while head != tail, or use an explicit count protected against the producer.`
      },
      {
        name: "Ignored UART transmit result",
        input: `src/console.c
+ int console_send(const char *msg, size_t len) {
+   uart_write(UART_DEBUG, msg, len);
+   return 0;
+ }`,
        output: `src/console.c:2 - Major, high confidence
Trigger: uart_write can return a short count when the transmit FIFO is full.
Consequence: the caller reports success while the tail of a panic or diagnostic message is lost.
Suggestion: retry until len bytes are queued, or return the short count and let the caller back off.`
      },
      {
        name: "Torn shared sample",
        input: `src/sensor.c
+ uint64_t sensor_read(void) {
+   if (latest.valid) {
+     return latest.value;
+   }
+   return 0;
+ }`,
        output: `src/sensor.c:2 - Major, medium confidence
Trigger: the ISR updates latest.value as two 32-bit writes on a 32-bit MCU.
Consequence: the task can read a high word from one sample and a low word from the next.
Suggestion: read under a short critical section, or use a sequence counter and retry when it changes.`
      }
    ]
  },
  security: {
    whenToUse: "Use this when a change crosses a trust boundary, handles credentials, or reaches packets, debug shells, flash, DMA or file paths.",
    cases: [
      {
        name: "Packet length exceeds the stack buffer",
        input: `src/radio_rx.c
+ void radio_rx(const struct packet *pkt) {
+   uint8_t frame[64];
+   memcpy(frame, pkt->payload, pkt->len);
+   handle(frame);
+ }`,
        output: `src/radio_rx.c:3 - Critical, high confidence
Trigger: pkt->len comes from the radio packet and is not checked against sizeof frame.
Consequence: a packet larger than 64 bytes overwrites the stack and can redirect control flow.
Suggestion: reject len > sizeof frame and copy at most the validated length.`
      },
      {
        name: "Debug shell command injection",
        input: `src/debug_shell.c
+ void shell_exec(const char *arg) {
+   char cmd[128];
+   snprintf(cmd, sizeof cmd, "selftest %s", arg);
+   system(cmd);
+ }`,
        output: `src/debug_shell.c:3 - Critical, high confidence
Trigger: arg comes from the debug UART or network console and is passed to a shell.
Consequence: a value such as x; reboot runs an unrelated command on the gateway.
Suggestion: parse a fixed command table, or exec the tool with an argument vector instead of a shell string.`
      }
    ]
  },
  tests: {
    whenToUse: "Use this when behavior changes, a test is changed, or a new branch, interrupt path or failure mode is introduced.",
    cases: [
      {
        name: "Ring-empty regression assertion removed",
        input: `test/uart_ring_test.c
- assert_true(ring_empty(&ring));
+ /* removed while the ring refactor is in progress */`,
        output: `test/uart_ring_test.c:1 - Minor, high confidence
Trigger: the only assertion for the empty-ring state was removed.
Consequence: an off-by-one in the consumer path can ship without a failing test.
Suggestion: keep the empty-ring assertion and add a case that fills, drains and reads once more.`
      },
      {
        name: "Full-ring branch has no test",
        input: `src/uart_ring.c
+ if (ring_full(ring)) {
+   return -EAGAIN;
+ }

test/uart_ring_test.c
+ /* only the empty and half-full cases are tested */`,
        output: `test/uart_ring_test.c:1 - Minor, high confidence
Trigger: the change adds a full-ring backpressure branch, but no test fills the ring.
Consequence: a later change can remove or invert the branch without a failing test.
Suggestion: add a test that fills the ring, asserts -EAGAIN, then drains it and asserts recovery.`
      }
    ]
  },
  license: {
    whenToUse: "Use this when files are added from another source, dependencies change, or the repository's license and notice obligations need a review.",
    cases: [
      {
        name: "Vendored HAL glue without provenance",
        input: `src/vendor/vendor_hal.c
+ /* vendor HAL glue */
+ void vendor_hal_init(void) { ... }`,
        output: `src/vendor/vendor_hal.c:1 - Warning, medium confidence
Trigger: a vendored HAL file was added with no copyright, license header or source reference.
Consequence: the repository may be missing attribution or compatible terms for this code.
Suggestion: identify the upstream vendor package and license, add the required notice, and confirm redistribution terms.`
      },
      {
        name: "Conflicting license in an RTOS port",
        input: `src/port/rtos_port.c
+ // SPDX-License-Identifier: GPL-3.0-or-later
+ /* copied from an RTOS demo port */
+ void port_yield(void) { ... }`,
        output: `src/port/rtos_port.c:1 - Warning, medium confidence
Trigger: a new port file declares GPL-3.0-or-later while the repository declares MIT.
Consequence: linking and distributing the port may conflict with the repository's stated terms.
Suggestion: identify the exact upstream source and obligations, and replace it or add the required notices before distribution.`
      }
    ]
  },
  performance: {
    whenToUse: "Use this when a change affects interrupt latency, task deadlines, DMA, flash access, large collections or work that grows with input.",
    cases: [
      {
        name: "Busy-wait instead of blocking",
        input: `src/sensor_task.c
+ for (;;) {
+   while (!(SENSOR->STATUS & DATA_READY)) {
+     for (volatile int i = 0; i < 100000; ++i) { }
+   }
+   read_sample();
+ }`,
        output: `src/sensor_task.c:2 - Major, high confidence
Trigger: the task spins on a register instead of sleeping or waiting for an interrupt.
Consequence: it burns CPU, starves lower-priority tasks and can miss the watchdog deadline.
Suggestion: wait on the sensor interrupt or an RTOS event with a bounded timeout.`
      },
      {
        name: "Blocking flash write in the ISR",
        input: `src/log_isr.c
+ void log_isr(void) {
+   flash_write(entry, sizeof entry);
+ }`,
        output: `src/log_isr.c:2 - Major, high confidence
Trigger: the ISR performs a synchronous flash write.
Consequence: flash erase and program time can exceed the interrupt budget and drop incoming events.
Suggestion: copy the entry into a queue and let a lower-priority task write flash.`
      }
    ]
  },
  maintainability: {
    whenToUse: "Use this when a change adds control flow, duplicates a board rule, or makes the affected code harder to change safely.",
    cases: [
      {
        name: "LED pin mask duplicated",
        input: `src/board/led.c
+ #define LED_MASK (1u << 5)
+ GPIOA->ODR |= LED_MASK;

src/app/status.c
+ GPIOA->ODR |= (1u << 5);`,
        output: `src/app/status.c:1 - Minor, high confidence
Trigger: the LED pin mask is defined in the board file and repeated as a literal in the application.
Consequence: moving the LED to another pin updates one path and leaves the other writing the old pin.
Suggestion: expose board_led_set from the board layer and use it from both paths.`
      },
      {
        name: "DMA release repeated on every error",
        input: `src/dma.c
+ if (!dma_start(ch)) { dma_release(ch); return -EIO; }
+ if (!dma_wait(ch)) { dma_release(ch); return -ETIMEDOUT; }
+ if (!dma_check(ch)) { dma_release(ch); return -EINVAL; }`,
        output: `src/dma.c:2 - Minor, high confidence
Trigger: cleanup is repeated in every error branch instead of following one exit path.
Consequence: a future branch can return without releasing the channel and leave DMA ownership stuck.
Suggestion: keep one cleanup label and release the channel there after setting the result.`
      }
    ]
  },
  architecture: {
    whenToUse: "Use this when a change crosses an existing board, driver or RTOS boundary, bypasses a helper, or changes a shared contract. Correctness covers behavior; this lens covers conformance to the repository's design.",
    cases: [
      {
        name: "Application writes a GPIO register directly",
        input: `src/app/led.c
+ #include "board/gpio_regs.h"
+ GPIOA->ODR |= (1u << 5);`,
        output: `src/app/led.c:2 - Major, medium confidence
Trigger: the application writes the GPIO register directly, while the board layer owns pinmux and active-low handling through board_led_set.
Consequence: this path skips the board rules and writes the wrong electrical level when the LED polarity changes.
Suggestion: call board_led_set from the application and keep register access inside the board layer.`
      },
      {
        name: "Blocking RTOS call inside an ISR",
        input: `src/drivers/uart.c
+ void uart_isr(void) {
+   xQueueSend(log_queue, &byte, portMAX_DELAY);
+ }`,
        output: `src/drivers/uart.c:2 - Major, medium confidence
Trigger: the interrupt handler calls a blocking queue API, while the repository convention is the FromISR variant plus a yield.
Consequence: the ISR can block or invert priority, delaying every interrupt at or below its level.
Suggestion: use xQueueSendFromISR and portYIELD_FROM_ISR with a higher-priority task flag.`
      }
    ]
  },
  data: {
    whenToUse: "Use this for persistent configuration, NVS or flash layout changes, migrations, backfills and changes that must survive power loss or a rolling update.",
    cases: [
      {
        name: "Calibration key erased before migration",
        input: `src/storage/nvs_schema.c
+ nvs_erase_key("cal_v1");
+ /* no migration to cal_v2 */`,
        output: `src/storage/nvs_schema.c:1 - Major, high confidence
Trigger: the old calibration key is erased before any code reads it into the new layout.
Consequence: devices updated in the field lose factory calibration and may fail accuracy checks.
Suggestion: read and migrate cal_v1 first, verify the new record, then erase the old key.`
      },
      {
        name: "Required configuration without a default",
        input: `src/config/defaults.c
+ config_require("radio.tx_power");`,
        output: `src/config/defaults.c:1 - Major, high confidence
Trigger: the update makes an existing configuration key mandatory without a default or migration.
Consequence: devices with an older configuration fail validation and can stop booting after the update.
Suggestion: provide a safe default or migrate the stored configuration before requiring the key.`
      }
    ]
  },
  dependencies: {
    whenToUse: "Use this when packages, lockfiles, build steps, containers, infrastructure or pipeline configuration change.",
    cases: [
      {
        name: "Remote script during build",
        input: `CMakeLists.txt
+ execute_process(COMMAND bash -c
+   "curl -fsSL https://downloads.example.test/setup.sh | sh")`,
        output: `CMakeLists.txt:1 - Major, high confidence
Trigger: configuration executes a remote script fetched from an unversioned URL.
Consequence: the build can run unreviewed code with repository and CI credentials.
Suggestion: pin a reviewed artifact or dependency, verify its checksum, and avoid network install scripts.`
      },
      {
        name: "Unpinned vendor SDK",
        input: `CMakeLists.txt
+ FetchContent_Declare(vendor_hal
+   GIT_REPOSITORY https://example.test/vendor-hal.git
+   GIT_TAG main)`,
        output: `CMakeLists.txt:1 - Warning, high confidence
Trigger: the build fetches a moving branch instead of a fixed commit or release.
Consequence: the same source revision can build with different vendor code and hide a supply-chain change.
Suggestion: fetch a tagged release or pinned commit and record the expected checksum or lockfile.`
      }
    ]
  }
};
