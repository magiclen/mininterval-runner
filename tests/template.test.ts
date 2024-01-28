import { MinIntervalRunner } from "../src/lib.js";

describe("MinIntervalRunner", () => {
    it("should success", async () => {
        const context = { counter: 0 };

        const runner = new MinIntervalRunner(200, (r) => {
            context.counter += 1;

            if (context.counter === 5) {
                r.stop();
            }
        });

        await runner.start();

        expect(context.counter).toBe(5);
    }, 1000);
});
