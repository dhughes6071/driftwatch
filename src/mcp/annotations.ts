/**
 * MCP tool safety annotations.
 *
 * Clients use these hints to decide whether a tool call can run without
 * interrupting the user. Omitting them is not neutral: a careful client must
 * then assume the worst and prompt every time, so an unannotated read-only
 * tool is *harder* to use than an annotated one. Ours were missing entirely
 * until 2026-09-11.
 *
 * Kept in their own module so they can be asserted in tests -- importing
 * server.ts connects a stdio transport and hangs a test runner.
 *
 * Spec meanings, since three of the four are easy to misread:
 *   readOnlyHint    the tool does not modify its environment
 *   destructiveHint it may perform destructive updates (only meaningful when
 *                   readOnlyHint is false)
 *   idempotentHint  repeated calls with the same arguments have no additional
 *                   effect (only meaningful when readOnlyHint is false)
 *   openWorldHint   it interacts with entities outside the local system
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/**
 * Pure lookup against public registries. Nothing is written, nothing is spent.
 */
export const CHECK_PACKAGE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * NOT marked read-only, deliberately.
 *
 * With the LLM tier enabled this can spend real money on the Anthropic API --
 * bounded by a daily cap, but spent without asking. Annotations are static and
 * cannot vary with configuration, so the honest choice is the conservative
 * one: declaring `readOnlyHint: true` would tell a client it is always safe to
 * run unattended, which is false for anyone who has set an API key.
 *
 * `destructiveHint: false` and `idempotentHint: true` say the rest precisely:
 * the side effects are safe and repeated calls cost nothing extra, because
 * every result is cached permanently. Clients treat that as "has effects, but
 * benign" rather than prompting aggressively.
 *
 * If the LLM tier is ever removed, this becomes a genuine read-only tool and
 * the hint should flip.
 */
export const GET_MIGRATION_DELTA_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
