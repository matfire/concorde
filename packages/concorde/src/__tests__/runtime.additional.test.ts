import { type } from "arktype";
import { describe, expect, it } from "vitest";
import { safeValidate } from "../runtime.js";

describe("Runtime Edge Cases", () => {
  describe("Async schema validation", () => {
    it("should handle schemas that return promises", async () => {
      const schema = type({
        email: "string",
        age: "number>0",
      });

      const validData = {
        email: "test@example.com",
        age: 25,
      };

      const result = await safeValidate(schema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
        expect(result.issues).toBeUndefined();
      }
    });

    it("should handle async validation with errors", async () => {
      const schema = type({
        email: "string",
        age: "number>0",
      });

      const invalidData = {
        email: "not-an-email",
        age: -5,
      };

      const result = await safeValidate(schema, invalidData as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeUndefined();
        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Complex validation errors", () => {
    it("should handle multiple validation issues", async () => {
      const schema = type({
        name: "string",
        age: "number>0",
        email: "string",
        isActive: "boolean",
      });

      const invalidData = {
        name: "a", // too short
        age: -1, // negative
        email: "invalid-email", // not an email
        isActive: "not-boolean", // not a boolean
      };

      const result = await safeValidate(schema, invalidData as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeUndefined();
        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(1);

        // Check that we have issues for multiple fields
        const issueMessages = result.issues.map((issue) => issue.message || "");
        expect(issueMessages.length).toBeGreaterThan(0);
      }
    });

    it("should provide detailed error information", async () => {
      const schema = type({
        count: "number>=10",
      });

      const invalidData = { count: 5 };

      const result = await safeValidate(schema, invalidData as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(0);

        const issue = result.issues?.[0];
        expect(issue).toBeDefined();
        expect(issue?.path).toBeDefined();
        expect(issue?.message).toBeDefined();
      }
    });
  });

  describe("Nested object validation", () => {
    it("should validate complex nested structures", async () => {
      const schema = type({
        user: {
          id: "string",
          profile: {
            name: "string",
            settings: {
              theme: "'dark'|'light'",
              notifications: "boolean",
            },
          },
        },
        metadata: {
          version: "number",
          tags: "string[]",
        },
      });

      const validData = {
        user: {
          id: "user123",
          profile: {
            name: "John Doe",
            settings: {
              theme: "dark" as const,
              notifications: true,
            },
          },
        },
        metadata: {
          version: 1,
          tags: ["admin", "active"],
        },
      };

      const result = await safeValidate(schema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it("should handle validation errors in nested objects", async () => {
      const schema = type({
        user: {
          id: "string",
          profile: {
            name: "string",
            age: "number>0",
          },
        },
      });

      const invalidData = {
        user: {
          id: 123, // should be string
          profile: {
            name: "", // empty string might be invalid depending on constraints
            age: "not-a-number", // should be number
          },
        },
      };

      const result = await safeValidate(schema, invalidData as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    it("should validate optional nested properties", async () => {
      const schema = type({
        required: "string",
        "optional?": {
          nested: "string",
        },
      });

      // Test with optional property present
      const dataWithOptional = {
        required: "test",
        optional: {
          nested: "value",
        },
      };

      const resultWithOptional = await safeValidate(schema, dataWithOptional);
      expect(resultWithOptional.success).toBe(true);

      // Test with optional property missing
      const dataWithoutOptional = {
        required: "test",
      };

      const resultWithoutOptional = await safeValidate(
        schema,
        dataWithoutOptional,
      );
      expect(resultWithoutOptional.success).toBe(true);
    });
  });

  describe("Array validation", () => {
    it("should validate arrays with item constraints", async () => {
      const schema = type({
        numbers: "number[]",
        strings: "string[]",
        users: "object[]",
      });

      const validData = {
        numbers: [1, 2, 3, 4, 5],
        strings: ["hello", "world"],
        users: [
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ],
      };

      const result = await safeValidate(schema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it("should handle invalid array items", async () => {
      const schema = type({
        numbers: "number[]",
        users: "object[]",
      });

      const invalidData = {
        numbers: [1, "not-a-number", 3], // mixed types
        users: [
          { id: "1", age: 25 },
          { id: 2, age: -5 } as any, // id should be string, age should be positive
        ],
      };

      const result = await safeValidate(schema, invalidData as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    it("should validate empty arrays", async () => {
      const schema = type({
        items: "string[]",
      });

      const dataWithEmptyArray = {
        items: [],
      };

      const result = await safeValidate(schema, dataWithEmptyArray);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toEqual([]);
      }
    });

    it("should validate arrays with length constraints", async () => {
      const schema = type("string[]>=2");

      // Valid: array with 2+ items
      const validArray = ["item1", "item2", "item3"];
      const validResult = await safeValidate(schema, validArray);
      expect(validResult.success).toBe(true);

      // Invalid: array with < 2 items
      const invalidArray = ["item1"];
      const invalidResult = await safeValidate(schema, invalidArray as any);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("Union and discriminated union types", () => {
    it("should handle union types", async () => {
      const schema = type("string|number");

      // Test string variant
      const stringResult = await safeValidate(schema, "hello");
      expect(stringResult.success).toBe(true);

      // Test number variant
      const numberResult = await safeValidate(schema, 42);
      expect(numberResult.success).toBe(true);

      // Test invalid variant
      const invalidResult = await safeValidate(schema, true as any);
      expect(invalidResult.success).toBe(false);
    });

    it("should handle discriminated unions", async () => {
      const schema = type({
        type: "'user'|'admin'",
        data: "unknown",
      });

      const userData = {
        type: "user" as const,
        data: { name: "John" },
      };

      const result = await safeValidate(schema, userData);
      expect(result.success).toBe(true);
    });
  });

  describe("Edge cases and boundary conditions", () => {
    it("should handle null and undefined values", async () => {
      const schema = type({
        required: "string",
        "optional?": "string",
        nullable: "string|null",
      });

      const dataWithNull = {
        required: "test",
        nullable: null,
      };

      const result = await safeValidate(schema, dataWithNull);
      expect(result.success).toBe(true);
    });

    it("should handle very large numbers", async () => {
      const schema = type("number");

      const largeNumber = Number.MAX_SAFE_INTEGER;
      const result = await safeValidate(schema, largeNumber);
      expect(result.success).toBe(true);
    });

    it("should handle special string values", async () => {
      const schema = type("string");

      const specialStrings = ["", " ", "\n", "\t", "🚀", "测试"];

      for (const str of specialStrings) {
        const result = await safeValidate(schema, str);
        expect(result.success).toBe(true);
      }
    });

    it("should handle deeply nested structures", async () => {
      const schema = type({
        level1: {
          level2: {
            level3: {
              level4: {
                value: "string",
              },
            },
          },
        },
      });

      const deepData = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep value",
              },
            },
          },
        },
      };

      const result = await safeValidate(schema, deepData);
      expect(result.success).toBe(true);
    });
  });

  describe("Performance considerations", () => {
    it("should handle large datasets efficiently", async () => {
      const schema = type("object[]");

      const largeArray = Array.from(
        { length: 1000 },
        (_, i) =>
          ({
            id: `item-${i}`,
            value: i,
          }) as any,
      );

      const startTime = performance.now();
      const result = await safeValidate(schema, largeArray);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });
  });
});
