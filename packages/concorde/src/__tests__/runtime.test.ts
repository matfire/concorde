import { type } from "arktype";
import { describe, expect, it } from "vitest";
import { safeValidate } from "../runtime.js";

describe("runtime", () => {
  it("Should return issues", async () => {
    const schema = type({
      name: "string",
    });
    const testData = schema({
      name: 123,
    });

    if (!(testData instanceof type.errors)) {
      return;
    }

    const data = await safeValidate(schema, { name: 123 } as any);
    expect(data).toMatchObject({
      success: false,
      issues: expect.arrayContaining(Array.from(testData.issues)),
    });
  });

  it("Should return valid data", async () => {
    const schema = type({
      name: "string",
    });
    const testData = schema({
      name: "test",
    });

    const data = await safeValidate(schema, { name: "test" });

    expect(data).toMatchObject({ success: true, data: testData });
  });
});
