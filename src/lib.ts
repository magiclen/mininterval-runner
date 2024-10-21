export type Task = (runner: MinIntervalRunner) => void | Promise<void>;
export type Listener = Task | null;
export type WaitListener =
    | ((duration: number, runner: MinIntervalRunner) => void | Promise<void>)
    | null;
export type ErrorListener =
    | ((
        error: unknown,
        runner: MinIntervalRunner,
    ) => boolean | undefined | Promise<boolean | undefined>)
    | null;

/**
 * A utility function to pause execution for a specified number of milliseconds.
 */
export const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
});

/**
 * A class representing a runner that executes a task repeatedly with minimum interval control.
 */
export class MinIntervalRunner {
    private _interval!: number;
    private _isRunning = false;
    private _isStopping = false;

    // Listeners for different stages of task execution
    onStart: Listener = null;
    onBeforeWaiting: WaitListener = null;
    onAfterWaiting: Listener = null;
    onBeforeExecuting: Listener = null;
    onAfterExecuting: Listener = null;
    /**
     * If this handler returns `true`, the task will restart immediately instead of waiting for the mininterval.
     */
    onTaskError: ErrorListener = null;
    onStop: Listener = null;

    /**
     * Constructs a new MinIntervalRunner instance with the specified interval and task.
     */
    constructor(interval: number, readonly task: Task) {
        this.interval = interval;
    }

    /**
     * Sets the minimum interval between each execution of the task.
     */
    set interval(interval: number) {
        if (interval < 0) {
            throw new RangeError("`interval` cannot be negative");
        }

        this._interval = interval;
    }

    /**
     * Gets the minimum interval (in milliseconds) between each execution of the task.
     */
    get interval(): number {
        return this.interval;
    }

    /**
     * Gets a value indicating whether the runner is currently running.
     */
    get isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Gets a value indicating whether the runner is currently stopping.
     */
    get isStopping(): boolean {
        return this._isRunning;
    }

    private async runListener(listener: Listener): Promise<void> {
        if (listener !== null) {
            try {
                await listener(this);
            } catch (error) {
                console.error(error);
            }
        }
    }

    private async runWaitListener(listener: WaitListener, duration: number): Promise<void> {
        if (listener !== null) {
            try {
                await listener(duration, this);
            } catch (error) {
                console.error(error);
            }
        }
    }

    private async runErrorListener(
        listener: ErrorListener,
        error: unknown,
    ): Promise<boolean | undefined> {
        if (listener !== null) {
            return await listener(error, this);
        }
    }

    /**
     * Starts the runner, causing it to begin executing the task repeatedly.
     */
    async start(): Promise<void> {
        if (this._isRunning) {
            return;
        }

        this._isRunning = true;

        await this.runListener(this.onStart);

        if (!this.stopIfStopping()) {
            let lastExecutionTime = 0;

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            while (this._isRunning) {
                const executionTime = Date.now() - lastExecutionTime;

                if (executionTime < this._interval) {
                    const duration = this._interval - executionTime;

                    await this.runWaitListener(this.onBeforeWaiting, duration);

                    if (!this.stopIfStopping()) {
                        await sleep(duration);

                        await this.runListener(this.onAfterWaiting);

                        if (this.stopIfStopping()) {
                            break;
                        }
                    }
                }

                for (;;) {
                    await this.runListener(this.onBeforeExecuting);

                    if (this.stopIfStopping()) {
                        break;
                    }

                    const startExecutionTime = Date.now();

                    try {
                        await this.task(this);

                        if (this.stopIfStopping()) {
                            break;
                        }
                    } catch (error) {
                        const immediatelyRun
                            = await this.runErrorListener(
                                this.onTaskError,
                                error,
                            ) === true;

                        if (this.stopIfStopping()) {
                            break;
                        }

                        if (immediatelyRun) {
                            continue;
                        }
                    }

                    lastExecutionTime = startExecutionTime;

                    await this.runListener(this.onAfterExecuting);

                    this.stopIfStopping();

                    break;
                }
            }

            this._isRunning = false;
            this._isStopping = false;
        }

        await this.runListener(this.onStop);
    }

    /**
     * Stops the runner, causing it to cease execution of the task.
     */
    stop(): void {
        if (this._isRunning) {
            this._isStopping = true;
        }
    }

    private stopIfStopping(): boolean {
        if (this._isStopping) {
            this._isStopping = false;
            this._isRunning = false;

            return true;
        }

        return false;
    }
}
