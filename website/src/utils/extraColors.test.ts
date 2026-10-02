import { DISALLOWED_COLORS, generateExtraColors, installExtraColorStyles } from './extraColors';

// Rough difference between two colors, as the distance between them in RGB
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbDistance = (a: string, b: string) =>
  Math.hypot(...channels(a).map((c, i) => c - channels(b)[i]));

describe(generateExtraColors, () => {
  test('it should give the requested number of different hex colors', () => {
    const colors = generateExtraColors(16);

    expect(colors).toHaveLength(16);
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
    expect(new Set(colors).size).toBe(16);
  });

  test('it should give the same colors every time, with more colors added to the end', () => {
    expect(generateExtraColors(16)).toEqual(generateExtraColors(16));
    expect(generateExtraColors(20).slice(0, 16)).toEqual(generateExtraColors(16));
  });

  test('it should not give disallowed colors or colors that are close to them', () => {
    generateExtraColors(24).forEach((color) => {
      DISALLOWED_COLORS.forEach((disallowed) => {
        expect(color).not.toBe(disallowed);
        expect(rgbDistance(color, disallowed)).toBeGreaterThan(40);
      });
    });
  });

  test('it should not give colors that are close to each other', () => {
    const colors = generateExtraColors(16);

    colors.forEach((color, i) => {
      colors.slice(i + 1).forEach((other) => {
        expect(rgbDistance(color, other)).toBeGreaterThan(30);
      });
    });
  });
});

describe(installExtraColorStyles, () => {
  test('it should add a color class for every extra color, only once', () => {
    installExtraColorStyles(8, 3);
    installExtraColorStyles(8, 3);

    const styles = document.querySelectorAll('#extra-colors');
    expect(styles).toHaveLength(1);
    [8, 9, 10].forEach((index) => expect(styles[0].textContent).toContain(`.color-${index} {`));
    expect(styles[0].textContent).not.toContain('.color-11 {');
  });
});
