mininterval-runner
==========

[![CI](https://github.com/magiclen/mininterval-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/magiclen/mininterval-runner/actions/workflows/ci.yml)

Repeated execution with minimum interval control. Useful for running crawlers.

## Usage

```typescript
import { MinIntervalRunner } from 'mininterval-runner';

const task = async (runner) => {
    // do something

    // Stop executing the task when needed
    // runner.stop();
};

// Create a new MinIntervalRunner instance with a minimum interval of 5 minutes and the task function
const runner = new MinIntervalRunner(5 * 60 * 1000, task);

// The following listeners can be set if needed (usually for logging)
// runner.onStart
// runner.onBeforeWaiting
// runner.onAfterWaiting
// runner.onBeforeExecuting
// runner.onAfterExecuting

// Start executing the task
await runner.start();
```

## License

[MIT](LICENSE)