import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        // jsdom supplies document/HTMLElement for the DOM-facing paths
        // (remote audio elements, element lookups).
        environment: "jsdom",
        include: ["src/client/**/*.test.ts"],
        restoreMocks: true,
    },
});
