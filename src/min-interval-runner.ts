import { setImmediate, setTimeout as sleep } from "node:timers/promises";

/** The max delay (in milliseconds) which timers can accept. */
const MAX_INTERVAL = 2 ** 31 - 1;

/** A task which is executed repeatedly by `MinIntervalRunner`. */
export type Task = (runner: MinIntervalRunner) => void | Promise<void>;

/** A listener which is called at a stage of `MinIntervalRunner`. */
export type Listener = (runner: MinIntervalRunner) => void | Promise<void>;

/** A listener which is called before waiting, with the waiting duration (in milliseconds). */
export type WaitListener = (duration: number, runner: MinIntervalRunner) => void | Promise<void>;

/** A listener which is called when the task throws an error. */
export type ErrorListener = (
    error: unknown,
    runner: MinIntervalRunner,
) => boolean | undefined | Promise<boolean | undefined>;

/** Call a listener and print its error, so that a broken listener cannot break the runner. */
const callSafely = async <T>(fn: () => T | Promise<T>): Promise<T | undefined> => {
    try {
        return await fn();
    } catch (error) {
        console.error(error);

        return undefined;
    }
};

/**
 * A runner which executes a task repeatedly with minimum interval control.
 *
 * The interval is counted from the start of the previous execution. Errors thrown by listeners are
 * printed by `console.error` and do not stop the runner.
 */
export class MinIntervalRunner {
    #interval = 0;
    #isStopping = false;
    #running: Promise<void> | undefined;
    #controller = new AbortController();
    /**
     * The start time of the last execution. `undefined` means the next execution does not need to
     * wait.
     */
    #lastExecutionTime: number | undefined;

    /** Called once when the runner starts. */
    onStart?: Listener;
    /** Called before waiting for the interval. */
    onBeforeWaiting?: WaitListener;
    /** Called after waiting for the interval. It is not called if the waiting is stopped. */
    onAfterWaiting?: Listener;
    /** Called before each execution of the task. */
    onBeforeExecuting?: Listener;
    /** Called after each execution of the task, whether the task succeeds or fails. */
    onAfterExecuting?: Listener;
    /**
     * Called when the task throws an error. If it returns `true`, the task is executed again
     * immediately without waiting for the interval. If it is not set, the error is printed by
     * `console.error`.
     */
    onTaskError?: ErrorListener;
    /** Called once when the runner stops. */
    onStop?: Listener;

    /**
     * Create a runner with the minimum interval (in milliseconds) and the task.
     *
     * @throws {RangeError} When the interval is invalid
     */
    constructor(
        interval: number,
        readonly task: Task,
    ) {
        this.interval = interval;
    }

    /** The minimum interval (in milliseconds) between the starts of two executions. */
    get interval(): number {
        return this.#interval;
    }

    /**
     * Set the minimum interval (in milliseconds). It must be from `0` to `2147483647`. A new value
     * takes effect from the next waiting.
     *
     * @throws {RangeError} When the interval is invalid
     */
    set interval(interval: number) {
        if (!Number.isFinite(interval) || interval < 0 || interval > MAX_INTERVAL) {
            throw new RangeError(`\`interval\` must be between 0 and ${MAX_INTERVAL}`);
        }

        this.#interval = interval;
    }

    /**
     * Whether the runner is running. It is `true` until the promise returned by `start()` is
     * settled.
     */
    get isRunning(): boolean {
        return this.#running !== undefined;
    }

    /** Whether `stop()` has been called but the runner has not stopped yet. */
    get isStopping(): boolean {
        return this.#isStopping;
    }

    /**
     * The signal of the current run. It is aborted when `stop()` is called. Pass it to the
     * operations in the task (e.g. `fetch`) to cancel them when stopping.
     */
    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    /**
     * Start executing the task repeatedly. If the runner is already running, the same promise is
     * returned.
     *
     * @param signal Stop the runner when this signal is aborted
     * @returns A promise which is resolved after the runner stops
     */
    start(signal?: AbortSignal): Promise<void> {
        if (this.#running === undefined) {
            // Set the running promise first, so that `start()` and `stop()` called by listeners work.
            const { promise, resolve, reject } = Promise.withResolvers<void>();

            this.#running = promise;
            this.#isStopping = false;
            this.#controller = new AbortController();
            this.#lastExecutionTime = undefined;

            this.#run(signal).then(resolve, reject);
        }

        return this.#running;
    }

    /**
     * Stop the runner. The waiting is stopped immediately, but the running task is not. Use
     * `signal` to cancel the running task.
     */
    stop(): void {
        if (this.#running !== undefined && !this.#isStopping) {
            this.#isStopping = true;
            this.#controller.abort();
        }
    }

    async #run(signal: AbortSignal | undefined): Promise<void> {
        const onAbort = (): void => {
            this.stop();
        };

        if (signal?.aborted === true) {
            this.stop();
        } else {
            signal?.addEventListener("abort", onAbort, { once: true });
        }

        try {
            await callSafely(() => this.onStart?.(this));

            while (!this.#isStopping) {
                // oxlint-disable-next-line eslint/no-await-in-loop -- each round must wait for the previous one
                await this.#runRound();
            }
        } finally {
            signal?.removeEventListener("abort", onAbort);

            await callSafely(() => this.onStop?.(this));

            this.#running = undefined;
            this.#isStopping = false;
        }
    }

    /** Wait for the interval if needed, and then execute the task once. */
    async #runRound(): Promise<void> {
        if (this.#lastExecutionTime !== undefined) {
            const duration = this.#lastExecutionTime + this.#interval - performance.now();

            if (duration > 0) {
                await callSafely(() => this.onBeforeWaiting?.(duration, this));

                if (this.#isStopping) {
                    return;
                }

                try {
                    await sleep(duration, undefined, { signal: this.#controller.signal });
                } catch {
                    // The waiting is aborted by `stop()`.
                    return;
                }

                await callSafely(() => this.onAfterWaiting?.(this));

                if (this.#isStopping) {
                    return;
                }
            }
        }

        await callSafely(() => this.onBeforeExecuting?.(this));

        if (this.#isStopping) {
            return;
        }

        const executionTime = performance.now();
        let retry = false;

        try {
            await this.task(this);
        } catch (error) {
            const { onTaskError } = this;

            if (onTaskError === undefined) {
                console.error(error);
            } else {
                retry = (await callSafely(() => onTaskError(error, this))) === true;
            }
        }

        // A retried execution does not count, so the next execution starts without waiting.
        this.#lastExecutionTime = retry ? undefined : executionTime;

        await callSafely(() => this.onAfterExecuting?.(this));

        // Let timers and I/O run, even if the next execution does not need to wait.
        await setImmediate();
    }
}
