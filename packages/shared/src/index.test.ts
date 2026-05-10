import { describe, expect, test } from "vitest";
import { APP_NAME } from "./index.js";

describe("shared constants", () => {
  test("APP_NAME is VoxaFlow", async () => {
    expect(APP_NAME).toBe("VoxaFlow");
  });
});
