/**
 * Portable exact-unit helpers for DrawingML integer domains.
 *
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 */

const MIN_NORMAL = 2 ** -1022;

/**
 * Scale one finite source value into an OOXML integer domain. A result that is
 * already a safe integer is retained exactly. Otherwise, the nearest safe
 * integer is accepted only when both the multiplication residue and the
 * source-versus-inverse residue are no greater than one IEEE-754 ULP at their
 * respective magnitudes. This admits binary representation noise such as
 * `(16000 / 60) * 60 === 16000.000000000002` without general rounding.
 */
export function scaleOoxmlInteger(
  value: number,
  factor: number,
): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(factor) || factor <= 0) {
    return undefined;
  }
  const scaled = value * factor;
  if (!Number.isFinite(scaled)) return undefined;
  if (Number.isSafeInteger(scaled)) return Object.is(scaled, -0) ? 0 : scaled;

  const nearest = Math.round(scaled);
  if (!Number.isSafeInteger(nearest)) return undefined;
  if (Math.abs(scaled - nearest) > unitInLastPlace(scaled)) return undefined;

  const inverse = nearest / factor;
  if (
    !Number.isFinite(inverse) ||
    Math.abs(value - inverse) > unitInLastPlace(value)
  ) {
    return undefined;
  }
  return Object.is(nearest, -0) ? 0 : nearest;
}

function unitInLastPlace(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude < MIN_NORMAL) return Number.MIN_VALUE;
  return 2 ** (Math.floor(Math.log2(magnitude)) - 52);
}
