import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Lazy routes load their module on first render; under a full parallel run
// that can exceed the 1000 ms default and fail findBy queries at random.
configure({ asyncUtilTimeout: 5000 });

// Testing Library only registers its automatic cleanup when Vitest globals are
// enabled. They are not, so without this every render stayed mounted and later
// queries matched elements from earlier tests.
afterEach(() => {
  cleanup();
});
