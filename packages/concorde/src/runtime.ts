// runtime.ts
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Throw-less helper: returns { success:true, data } | { success:false, issues }
 */
export async function safeValidate<S extends StandardSchemaV1>(
  schema: S,
  u: unknown,
): Promise<
  | { success: true; data: StandardSchemaV1.InferOutput<S>; issues: undefined }
  | {
      success: false;
      data: undefined;
      issues: readonly StandardSchemaV1.Issue[];
    }
> {
  let result = schema["~standard"].validate(u);
  if (result instanceof Promise) result = await result;

  // Type guard to check if it's a failure result
  if ("issues" in result && result.issues) {
    return { success: false, data: undefined, issues: result.issues };
  }
  return { success: true, data: result.value, issues: undefined };
}
