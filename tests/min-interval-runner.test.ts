import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MinIntervalRunner } from "../src/index.ts";

// Timers may fire a little earlier than `performance.now()` expects.
const TIMER_TOLERANCE = 5;

describe("MinIntervalRunner", () => {
    it("runs the task until it is stopped", async () => {
        let counter = 0;

        const runner = new MinIntervalRunner(200, (r) => {
            counter += 1;

            if (counter === 5) {
                r.stop();
            }
        });

        await runner.start();

        assert.equal(counter, 5);
    });

    it("waits for the interval between the starts of two executions", async () => {
        const interval = 100;
        const startTimes: number[] = [];

        const runner = new MinIntervalRunner(interval, (r) => {
            startTimes.push(performance.now());

            if (startTimes.length === 2) {
                r.stop();
            }
        });

        await runner.start();

        const [first, second] = startTimes;

        assert.ok(second - first >= interval - TIMER_TOLERANCE);
    });

    it("gets the states of the runner", async () => {
        const states: boolean[] = [];

        const runner = new MinIntervalRunner(100, (r) => {
            states.push(r.isRunning, r.isStopping);

            r.stop();

            states.push(r.isStopping);
        });

        assert.equal(runner.interval, 100);
        assert.equal(runner.isRunning, false);

        runner.interval = 50;

        assert.equal(runner.interval, 50);

        await runner.start();

        assert.deepEqual(states, [true, false, true]);
        assert.equal(runner.isRunning, false);
        assert.equal(runner.isStopping, false);
    });

    it("stops waiting immediately when it is stopped", async () => {
        const runner = new MinIntervalRunner(10_000, () => {});

        runner.onBeforeWaiting = (_duration, r): void => {
            setTimeout(() => {
                r.stop();
            }, 50);
        };

        const startTime = performance.now();

        await runner.start();

        assert.ok(performance.now() - startTime < 1000);
    });

    it("calls the listeners in order", async () => {
        const events: string[] = [];
        let counter = 0;

        const runner = new MinIntervalRunner(20, (r) => {
            counter += 1;
            events.push("task");

            if (counter === 2) {
                r.stop();
            }
        });

        runner.onStart = (): void => {
            events.push("start");
        };
        runner.onBeforeWaiting = (): void => {
            events.push("beforeWaiting");
        };
        runner.onAfterWaiting = (): void => {
            events.push("afterWaiting");
        };
        runner.onBeforeExecuting = (): void => {
            events.push("beforeExecuting");
        };
        runner.onAfterExecuting = (): void => {
            events.push("afterExecuting");
        };
        runner.onStop = (): void => {
            events.push("stop");
        };

        await runner.start();

        assert.deepEqual(events, [
            "start",
            "beforeExecuting",
            "task",
            "afterExecuting",
            "beforeWaiting",
            "afterWaiting",
            "beforeExecuting",
            "task",
            "afterExecuting",
            "stop",
        ]);
    });

    it("executes the task again immediately when onTaskError returns true", async () => {
        let counter = 0;

        const runner = new MinIntervalRunner(10_000, (r) => {
            counter += 1;

            if (counter < 3) {
                throw new Error("failed");
            }

            r.stop();
        });

        runner.onTaskError = (): boolean => true;

        const startTime = performance.now();

        await runner.start();

        assert.equal(counter, 3);
        assert.ok(performance.now() - startTime < 1000);
    });

    it("stops when the input signal is aborted", async () => {
        const runner = new MinIntervalRunner(10_000, () => {});

        const startTime = performance.now();

        await runner.start(AbortSignal.timeout(50));

        assert.equal(runner.isRunning, false);
        assert.ok(performance.now() - startTime < 1000);
    });
});
