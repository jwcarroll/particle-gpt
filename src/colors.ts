export type RgbColor = readonly [red: number, green: number, blue: number];

const NAMED_COLORS: Record<string, RgbColor> = {
  black: [0, 0, 0],
  blue: [0, 0, 1],
  green: [0, 0.5019607843137255, 0],
  red: [1, 0, 0],
  white: [1, 1, 1],
};

/**
 * Parses the deliberately small, opaque color contract shared by Canvas2D and
 * WebGL: named primary colors, #rgb, #rrggbb, rgb(r,g,b), and hsl(h,s%,l%).
 */
export function parseOpaqueColor(value: string): RgbColor {
  const color = value.trim().toLowerCase();
  const named = NAMED_COLORS[color];
  if (named) return named;

  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3) {
      return [
        parseInt(raw[0] + raw[0], 16) / 255,
        parseInt(raw[1] + raw[1], 16) / 255,
        parseInt(raw[2] + raw[2], 16) / 255,
      ];
    }
    return [
      parseInt(raw.slice(0, 2), 16) / 255,
      parseInt(raw.slice(2, 4), 16) / 255,
      parseInt(raw.slice(4, 6), 16) / 255,
    ];
  }

  const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) {
    return [parseByte(rgb[1]), parseByte(rgb[2]), parseByte(rgb[3])];
  }

  const hsl = color.match(/^hsl\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
  if (hsl) {
    const saturation = parsePercentage(hsl[2]);
    const lightness = parsePercentage(hsl[3]);
    return hslToRgb(Number(hsl[1]), saturation, lightness);
  }

  throw new TypeError(
    `Unsupported opaque color "${value}". Use a named primary color, #rgb, #rrggbb, rgb(r,g,b), or hsl(h,s%,l%).`,
  );
}

function parseByte(value: string): number {
  const byte = Number(value);
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new RangeError(`RGB channel must be an integer from 0 to 255; received ${value}.`);
  }
  return byte / 255;
}

function parsePercentage(value: string): number {
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError(`HSL percentage must be from 0 to 100; received ${value}%.`);
  }
  return percentage / 100;
}

function hslToRgb(hueDegrees: number, saturation: number, lightness: number): RgbColor {
  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  if (saturation === 0) return [lightness, lightness, lightness];

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number) => {
    let value = hue + offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  return [channel(1 / 3), channel(0), channel(-1 / 3)];
}
