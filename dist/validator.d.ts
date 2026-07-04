/**
 * OKF bundle validator - validates conformance to OKF v0.1 specification
 */
import type { BundleIndex, ValidationResult } from "./types.js";
/**
 * Validate an OKF bundle for conformance to v0.1 spec
 */
export declare function validateBundle(bundlePath: string, index: BundleIndex, specificPath?: string): Promise<ValidationResult>;
//# sourceMappingURL=validator.d.ts.map