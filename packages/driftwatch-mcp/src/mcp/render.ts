/**
 * Markdown rendering for the MCP tools.
 *
 * Separate from server.ts so it can be tested without booting a stdio
 * transport -- importing the server connects to stdout, which is the MCP wire
 * protocol and hangs a test runner.
 */
import type { DeltaResult, PackageCheck } from "../engine/types.ts";

/**
 * Render for an LLM reader, not a browser. Lead with the answer, keep it
 * scannable, and make every claim traceable. Token efficiency matters -- this
 * goes straight into the caller's context window.
 */
export function renderDelta(d: DeltaResult): string {
  const lines: string[] = [];
  lines.push(`# ${d.package} ${d.from} -> ${d.to}`);
  lines.push(
    `${d.jump.kind} version change` +
      (d.jump.majorsCrossed > 0 ? `, ${d.jump.majorsCrossed} major boundary/boundaries crossed` : "") +
      `, ${d.jump.releasesInRange} release(s) in range.`,
  );
  lines.push("");

  if (d.deprecated) lines.push(`WARNING: this package is deprecated -- ${d.deprecated}\n`);

  /*
   * Lead with the coverage gap rather than burying it in caveats at the
   * bottom. An agent that reads a thin "1 breaking change" and stops has been
   * actively misled; it needs to know the authoritative document is missing
   * BEFORE it reads the findings, not after.
   */
  if (d.coverage?.majorUndocumented) {
    lines.push(
      `INCOMPLETE: no release notes exist for ${d.package} ${d.to} itself, and this is a major ` +
        `version change. The findings below come only from intermediate releases, so they are ` +
        `almost certainly missing the bulk of what changed.`,
    );
    lines.push("");
    lines.push(
      `Check the project's own upgrade guide before acting on this. Do NOT treat a short list ` +
        `here as evidence that little changed.`,
    );
    lines.push("");
  }

  if (d.breakingChanges.length === 0) {
    lines.push("No caller-visible breaking changes were found in the release notes for this range.");
    if (d.meta.warnings.length) {
      lines.push("");
      lines.push("Caveats:");
      for (const w of d.meta.warnings) lines.push(`- ${w}`);
      lines.push("");
      lines.push("Absence of evidence is not evidence of absence -- verify against the citations below.");
    }
  } else {
    lines.push(`## Breaking changes (${d.breakingChanges.length})`);
    lines.push("");
    for (const b of d.breakingChanges) {
      lines.push(`### [${b.confidence} confidence] ${b.summary}`);
      lines.push(`Landed in: ${b.version}`);
      if (b.symbols?.length) lines.push(`Affected symbols: ${b.symbols.join(", ")}`);
      if (b.migration?.before) lines.push(`Before:\n\`\`\`\n${b.migration.before}\n\`\`\``);
      if (b.migration?.after) lines.push(`After:\n\`\`\`\n${b.migration.after}\n\`\`\``);
      if (b.migration?.note) lines.push(`Note: ${b.migration.note}`);
      if (b.citations[0]) lines.push(`Source: ${b.citations[0].url}`);
      lines.push("");
    }
  }

  if (d.advisories.length) {
    lines.push(`## Security advisories affecting ${d.from} (${d.advisories.length})`);
    for (const a of d.advisories) {
      lines.push(
        `- [${a.severity}] ${a.id}: ${a.summary}` +
          (a.fixedByUpgrade ? "  <- FIXED by this upgrade" : "  (not fixed by this upgrade)"),
      );
      lines.push(`  ${a.url}`);
    }
    lines.push("");
  }

  if (d.meta.warnings.length && d.breakingChanges.length > 0) {
    lines.push("## Caveats");
    for (const w of d.meta.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(
    `_Analysis tier: ${d.tier === "synthesized" ? "LLM-structured" : "deterministic extraction"}. ` +
      `${d.citations.length} primary source(s). Verify anything load-bearing against them._`,
  );
  return lines.join("\n");
}

export function renderCheck(c: PackageCheck): string {
  if (!c.exists) {
    const dym = c.didYouMean.length ? ` Did you mean: ${c.didYouMean.join(", ")}?` : "";
    return (
      `DOES NOT EXIST: "${c.name}" is not published on ${c.ecosystem}.${dym}\n\n` +
      `Do not attempt to install it. If you generated this name from memory, it is likely a hallucination -- ` +
      `and attackers register hallucinated names to ship malware.`
    );
  }

  const lines: string[] = [];
  if (c.suspicious) {
    lines.push(`SUSPICIOUS -- DO NOT INSTALL WITHOUT VERIFYING`);
    lines.push("");
  }
  lines.push(`${c.name} (${c.ecosystem}) exists. Latest: ${c.latest ?? "unknown"}`);
  if (c.description) lines.push(`Description: ${c.description}`);
  lines.push(`Repository: ${c.repository ? `https://github.com/${c.repository}` : "NONE PUBLISHED"}`);
  if (c.deprecated) lines.push(`DEPRECATED: ${c.deprecated}`);
  if (c.advisoryCount > 0) lines.push(`Open security advisories against latest: ${c.advisoryCount}`);
  if (c.didYouMean.length) lines.push(`Similar popular package(s): ${c.didYouMean.join(", ")}`);
  for (const w of c.meta.warnings) lines.push(`WARNING: ${w}`);
  return lines.join("\n");
}
