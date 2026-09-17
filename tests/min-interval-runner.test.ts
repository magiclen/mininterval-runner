import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MinIntervalRunner } from "../src/index.ts";

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
});
