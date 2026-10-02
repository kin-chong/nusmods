/**
 * The theme palettes only have a few colors, which is not enough to tell apart the courses of
 * the user and their friends. These are more colors, picked so that every one of them looks as
 * different as possible from all the others, from the colors of the default theme, and from the
 * colors of the page, so that a course never looks like the background or like another course.
 */

type Rgb = readonly [number, number, number]; // 0 - 255
type Lab = readonly [number, number, number];

// White point of D65, which sRGB is defined against
const WHITE: Lab = [95.047, 100, 108.883];

// Colors that must not be used, nor anything close to them: the backgrounds of the page in dark
// mode and light mode, which a course would disappear into
export const DISALLOWED_COLORS = ['#292929', '#222324', '#f3f5f8', '#ffffff'];

// How different a color must be from every disallowed color, in CIELAB distance. Around 2.3 is
// the smallest difference that can be seen, and 30 is clearly a different color.
const MIN_DISALLOWED_DISTANCE = 30;

// Colors of the default theme, which the extra colors need to be different from
const THEME_COLORS = ['#f2777a', '#f99157', '#ffcc66', '#99cc99', '#66cccc', '#6699cc', '#cc99cc'];

// Light enough that the dark text on them stays readable, but with more range and more color
// than the pastels of the themes so that they are easier to tell apart
const LIGHTNESSES = [60, 67, 74, 81];
const CHROMAS = [35, 50, 65];
const HUE_STEP = 3;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): Rgb {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToLab([r, g, b]: Rgb): Lab {
  const [lr, lg, lb] = [r, g, b].map((c) => toLinear(c / 255));
  const xyz = [
    (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100,
    (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) * 100,
    (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) * 100,
  ];
  const [fx, fy, fz] = xyz.map((v, i) => {
    const t = v / WHITE[i];
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  });
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Null when the color cannot be shown on a screen
function lchToRgb(l: number, c: number, hue: number): Rgb | null {
  const h = (hue * Math.PI) / 180;
  const fy = (l + 16) / 116;
  const fx = fy + (c * Math.cos(h)) / 500;
  const fz = fy - (c * Math.sin(h)) / 200;
  const [x, y, z] = [fx, fy, fz].map((f, i) => {
    const cube = f ** 3;
    return (cube > 0.008856 ? cube : (f - 16 / 116) / 7.787) * WHITE[i];
  });

  const linear = [
    (3.2404542 * x - 1.5371385 * y - 0.4985314 * z) / 100,
    (-0.969266 * x + 1.8760108 * y + 0.041556 * z) / 100,
    (0.0556434 * x - 0.2040259 * y + 1.0572252 * z) / 100,
  ];
  if (linear.some((v) => v < 0 || v > 1)) return null;
  return linear.map((v) => fromLinear(v) * 255) as unknown as Rgb;
}

const distance = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Pick colors one at a time, each time taking the candidate that is the furthest away from its
 * closest already picked color (farthest point sampling). The distance is measured in CIELAB,
 * where it matches how different two colors look, so colors that look alike are not both picked.
 * Colors that are too close to a disallowed color are never candidates.
 * The result is always the same for the same count.
 */
export function generateExtraColors(count: number): string[] {
  const disallowed = DISALLOWED_COLORS.map((hex) => rgbToLab(hexToRgb(hex)));

  const candidates: { hex: string; lab: Lab }[] = [];
  LIGHTNESSES.forEach((l) =>
    CHROMAS.forEach((c) => {
      for (let hue = 0; hue < 360; hue += HUE_STEP) {
        const rgb = lchToRgb(l, c, hue);
        if (!rgb) continue;

        const lab = rgbToLab(rgb);
        if (disallowed.every((d) => distance(lab, d) >= MIN_DISALLOWED_DISTANCE)) {
          candidates.push({ hex: rgbToHex(rgb), lab });
        }
      }
    }),
  );

  const picked: Lab[] = THEME_COLORS.map((hex) => rgbToLab(hexToRgb(hex)));
  // How far each candidate is from the closest picked color
  const closest = candidates.map(({ lab }) => Math.min(...picked.map((p) => distance(lab, p))));

  const result: string[] = [];
  while (result.length < count && candidates.length > 0) {
    const best = closest.indexOf(Math.max(...closest));
    const { hex, lab } = candidates[best];
    result.push(hex);
    picked.push(lab);
    closest.forEach((d, i) => {
      closest[i] = Math.min(d, distance(candidates[i].lab, lab));
    });
    // Never picked twice, even if every other candidate is closer
    closest[best] = -1;
  }
  return result;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [channel(0), channel(8), channel(4)];
}

// Same as darken() of Sass, which the colors of the themes are made with
function darken(hex: string, amount: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.max(0, l - amount)]));
}

/**
 * Add `.color-N` classes for the extra colors, which are styled like the ones of the themes (see
 * the `color` mixin) but are the same in every theme. They follow on from the colors of the
 * themes, so the first extra color is `.color-<firstIndex>`.
 */
export function installExtraColorStyles(firstIndex: number, count: number): void {
  if (typeof document === 'undefined' || document.getElementById('extra-colors')) return;

  const rules = generateExtraColors(count).map((hex, i) => {
    const selector = `.color-${firstIndex + i}`;
    return [
      `${selector} { border-color: ${darken(hex, 0.2)}; color: ${darken(hex, 0.4)}; background-color: ${hex}; }`,
      `${selector}.hoverable:hover, ${selector}.hoverable.hover { background-color: ${darken(hex, 0.1)}; }`,
    ].join('\n');
  });

  const style = document.createElement('style');
  style.id = 'extra-colors';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}
