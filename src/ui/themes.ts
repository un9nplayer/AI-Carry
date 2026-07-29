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
}

export const themes: Record<string, ThemeColors> = {
  dark: {
    primary: chalk.cyan,
    secondary: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    background: chalk.bgBlack,
    text: chalk.white,
    muted: chalk.gray,
  },
  light: {
    primary: chalk.blue,
    secondary: chalk.magenta,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    background: chalk.bgWhite,
    text: chalk.black,
    muted: chalk.gray,
  },
  cyberpunk: {
    primary: chalk.yellow, // bright yellow
    secondary: chalk.magenta, // neon pink/magenta
    success: chalk.cyan, // neon blue
    warning: chalk.red, // neon orange/red
    error: chalk.bgRed.black,
    background: chalk.bgBlack,
    text: chalk.green, // matrix green
    muted: chalk.magenta,
  },
  minimal: {
    primary: chalk.bold,
    secondary: chalk.white,
    success: chalk.white,
    warning: chalk.white,
    error: chalk.underline,
    background: chalk.black,
    text: chalk.white,
    muted: chalk.dim,
  },
  monochrome: {
    primary: chalk.white,
    secondary: chalk.white,
    success: chalk.white,
    warning: chalk.white,
    error: chalk.white,
    background: chalk.bgBlack,
    text: chalk.white,
    muted: chalk.white,
  },
};
