import chalk from 'chalk';

export interface ThemeColors {
  primary: (text: string) => string;
  secondary: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  background: (text: string) => string;
  text: (text: string) => string;
  muted: (text: string) => string;
  dim: (text: string) => string;
  accent: (text: string) => string;
  inkBorderColor: string;
  inkBorderStyle: 'single' | 'double' | 'round' | 'bold' | 'classic';
}

// Soft warm-dark theme matching OpenCode's refined terminal aesthetic.
// Avoids harsh full-saturation colors. Uses HSL-tuned rgb values.
const mkTheme = (
  primaryRgb: [number, number, number],
  accentRgb: [number, number, number],
  successRgb: [number, number, number],
  warningRgb: [number, number, number],
  errorRgb: [number, number, number],
  textRgb: [number, number, number],
  mutedRgb: [number, number, number],
  dimRgb: [number, number, number],
  borderColor: string,
  borderStyle: ThemeColors['inkBorderStyle']
): ThemeColors => ({
  primary: chalk.rgb(...primaryRgb),
  secondary: chalk.rgb(...accentRgb),
  success: chalk.rgb(...successRgb),
  warning: chalk.rgb(...warningRgb),
  error: chalk.rgb(...errorRgb),
  background: chalk.bgBlack,
  text: chalk.rgb(...textRgb),
  muted: chalk.rgb(...mutedRgb),
  dim: chalk.rgb(...dimRgb),
  accent: chalk.rgb(...accentRgb),
  inkBorderColor: borderColor,
  inkBorderStyle: borderStyle,
});

export const themes: Record<string, ThemeColors> = {
  // Default: warm dark, soft teal primary, muted gold accent — like OpenCode
  dark: mkTheme(
    [110, 190, 185],   // primary: soft teal
    [185, 148, 100],   // secondary/accent: warm amber
    [120, 180, 120],   // success: muted green
    [200, 170, 90],    // warning: soft gold
    [200, 100, 95],    // error: dusty rose
    [210, 210, 205],   // text: off-white warm
    [120, 120, 118],   // muted: mid-gray warm
    [70, 70, 68],      // dim: dark charcoal
    'gray',
    'single'
  ),

  // Light: soft ink-on-paper
  light: mkTheme(
    [40, 110, 160],    // primary: slate blue
    [120, 80, 160],    // accent: muted purple
    [60, 140, 80],     // success: forest green
    [160, 120, 40],    // warning: amber
    [180, 70, 60],     // error: brick red
    [40, 40, 40],      // text: near black
    [120, 115, 108],   // muted: warm gray
    [160, 158, 152],   // dim: lighter gray
    'gray',
    'single'
  ),

  // Cyberpunk: neon on dark but de-saturated from pure primaries
  cyberpunk: mkTheme(
    [210, 210, 0],     // primary: desaturated neon yellow
    [200, 50, 170],    // accent: muted hot pink
    [0, 210, 180],     // success: teal
    [210, 100, 30],    // warning: muted orange
    [200, 60, 60],     // error: muted red
    [200, 255, 200],   // text: soft matrix green
    [100, 100, 100],   // muted
    [50, 50, 50],      // dim
    'gray',
    'single'
  ),

  // Minimal: monochrome warm
  minimal: mkTheme(
    [220, 220, 220],
    [180, 180, 180],
    [200, 200, 200],
    [160, 160, 160],
    [220, 100, 100],
    [230, 230, 230],
    [110, 110, 110],
    [60, 60, 60],
    'gray',
    'single'
  ),

  // Monochrome
  monochrome: mkTheme(
    [255, 255, 255],
    [200, 200, 200],
    [255, 255, 255],
    [200, 200, 200],
    [180, 180, 180],
    [240, 240, 240],
    [140, 140, 140],
    [80, 80, 80],
    'gray',
    'single'
  ),
};
