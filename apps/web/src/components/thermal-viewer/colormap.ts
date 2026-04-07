/**
 * Temperature-to-color mapping (cool blue → warm red)
 * Returns [r, g, b] in 0-1 range
 */
export function temperatureToColor(
  temp: number,
  min: number,
  max: number,
): [number, number, number] {
  const range = max - min;
  if (range <= 0) return [0, 0, 1];

  const t = Math.max(0, Math.min(1, (temp - min) / range));

  // Blue(0) → Cyan(0.25) → Green(0.5) → Yellow(0.75) → Red(1)
  if (t < 0.25) {
    const s = t / 0.25;
    return [0, s, 1];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [0, 1, 1 - s];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [s, 1, 0];
  } else {
    const s = (t - 0.75) / 0.25;
    return [1, 1 - s, 0];
  }
}

export function temperatureToHex(temp: number, min: number, max: number): string {
  const [r, g, b] = temperatureToColor(temp, min, max);
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
