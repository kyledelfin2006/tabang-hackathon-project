import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its automatic cleanup when Vitest globals are
// enabled. They are not, so without this every render stayed mounted and later
// queries matched elements from earlier tests.
afterEach(() => {
  cleanup();
});
