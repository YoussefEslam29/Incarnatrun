/**
 * Minimal types for the Khronos glTF validator, which ships no declarations.
 *
 * Only the surface the conformance tests use is declared. Widening this beyond
 * what is actually called would mean writing types nothing checks.
 */
declare module "gltf-validator" {
  export interface ValidationMessage {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }

  export interface ValidationIssues {
    numErrors: number;
    numWarnings: number;
    numInfos: number;
    numHints: number;
    messages: ValidationMessage[];
    truncated: boolean;
  }

  export interface ValidationReport {
    uri?: string;
    mimeType?: string;
    validatorVersion: string;
    issues: ValidationIssues;
    info?: Record<string, unknown>;
  }

  export function validateBytes(
    data: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<ValidationReport>;

  export function validateString(
    json: string,
    options?: Record<string, unknown>,
  ): Promise<ValidationReport>;
}
