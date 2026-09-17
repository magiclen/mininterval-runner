mininterval-runner
==========

[![CI](https://github.com/magiclen/mininterval-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/magiclen/mininterval-runner/actions/workflows/ci.yml)

Repeated execution with minimum interval control. Useful for running crawlers.

## Usage

```typescript
import { MinIntervalRunner } from "mininterval-runner";

// Execute the task at most once every 5 minutes
const runner = new MinIntervalRunner(5 * 60 * 1000, async (runner) => {
    // do something
    // stop executing the task when needed
    // runner.stop();
});

// Start executing the task, and wait until the runner stops
await runner.start();
```

The interval is counted from the start of the previous execution. For example, if the task takes 1 minute, the runner waits 4 minutes before the next execution. If the task takes longer than the interval, the next execution starts immediately.

### Stop the Runner

`runner.stop()` stops the waiting immediately, but it does not interrupt the running task. The promise returned by `runner.start()` is resolved after the runner stops.

```typescript
const running = runner.start();

process.once("SIGTERM", () => {
    runner.stop();
});

await running;
```

`runner.signal` is aborted when `runner.stop()` is called. Pass it to the operations in the task to cancel them when stopping.

```typescript
const runner = new MinIntervalRunner(60 * 1000, async ({ signal }) => {
    const response = await fetch("https://example.com/", { signal });

    // ..
});
```

The runner can also be stopped by an `AbortSignal`.

```typescript
// stop the runner after 1 hour
await runner.start(AbortSignal.timeout(60 * 60 * 1000));
```

### Listeners

The following listeners can be set if needed (usually for logging).

```typescript
runner.onStart = (runner) => {};
runner.onBeforeWaiting = (duration, runner) => {};
runner.onAfterWaiting = (runner) => {};
runner.onBeforeExecuting = (runner) => {};
runner.onAfterExecuting = (runner) => {};
runner.onStop = (runner) => {};

runner.onTaskError = (error, runner) => {
    console.error(error);

    // return `true` to execute the task again immediately instead of waiting for the interval
    return false;
};
```

They are called in the following order.

```text
onStart
  ┌→ onBeforeWaiting → (wait) → onAfterWaiting     (only when waiting is needed)
  │  onBeforeExecuting → (task) → onTaskError → onAfterExecuting     (onTaskError only when the task throws an error)
  └─ repeat until the runner is stopped
onStop
```

Errors thrown by listeners are printed by `console.error` and do not stop the runner. If `onTaskError` is not set, errors thrown by the task are printed by `console.error` as well.

### Other Properties

```typescript
// change the interval, which takes effect from the next waiting
runner.interval = 10 * 60 * 1000;

runner.isRunning; // `true` until the promise returned by `runner.start()` is resolved
runner.isStopping; // `true` after `runner.stop()` is called, until the runner stops
```

## License

[MIT](LICENSE)
