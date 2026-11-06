/**
 * Lets an experimenter script personality changes for one cook over the course
 * of a round — e.g. start cooperative, then switch to selfish at 90 seconds in.
 *
 * Text format, one or more blocks:
 *
 *   @90
 *   From now on, prioritize your own deliveries over helping your teammate.
 *
 *   @150
 *   Go back to normal cooperative play.
 *
 * A line matching `@<seconds>` starts a new block; everything after it, up to
 * the next `@` line or the end of the text, is that block's instructions
 * (trimmed). Blocks do not need to be written in order — they are sorted by
 * time when parsed. Text before the first `@` line is ignored: use the
 * separate "starting instructions" field for what applies from t=0.
 */
export function parseInstructionSchedule(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];

  const lines = raw.split("\n");
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const marker = line.match(/^\s*@\s*(\d+(?:\.\d+)?)\s*$/);
    if (marker) {
      current = { atSeconds: Number(marker[1]), lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  return blocks
    .map((b) => ({ atSeconds: b.atSeconds, text: b.lines.join("\n").trim() }))
    .filter((b) => b.text)
    .sort((a, b) => a.atSeconds - b.atSeconds);
}
