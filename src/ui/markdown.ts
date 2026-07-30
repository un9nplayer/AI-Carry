import chalk from 'chalk';
import pkg from 'cli-highlight';
const { highlight } = pkg;

export function renderMarkdown(markdown: string): string {
  let output = markdown;

  // 1. Code blocks: ```js ... ```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(```|$)/g;
  output = output.replace(codeBlockRegex, (match, lang, code, closing) => {
    const trimmedCode = code.trim();
    let highlighted = trimmedCode;
    try {
      if (lang) {
        highlighted = highlight(trimmedCode, { language: lang });
      }
    } catch {
      // Fallback
    }
    const border = chalk.rgb(70, 70, 68)('───');
    const streamingIndicator = closing ? '' : ` ${chalk.rgb(200, 170, 90)('⠋')}`;
    return `\n${border}\n${highlighted}${streamingIndicator}\n${border}\n`;
  });

  // 2. Tool Calls formatting: <terminal>...</terminal>
  const toolTags = ['terminal', 'cat', 'grep', 'write', 'edit', 'webfetch', 'websearch'];
  for (const tool of toolTags) {
    const openTag = `<${tool}>`;
    const closeTag = `</${tool}>`;

    let searchIdx = 0;
    while (true) {
      const startIdx = output.indexOf(openTag, searchIdx);
      if (startIdx === -1) break;

      const endIdx = output.indexOf(closeTag, startIdx + openTag.length);

      if (endIdx !== -1) {
        const content = output.slice(startIdx + openTag.length, endIdx).trim();
        // Compact single-line tool call box
        const toolHeader = chalk.rgb(185, 148, 100)(`$ ${content}`);
        const replacement = `\n  ${toolHeader}\n`;
        output = output.slice(0, startIdx) + replacement + output.slice(endIdx + closeTag.length);
        searchIdx = startIdx + replacement.length;
      } else {
        const remaining = output.slice(startIdx + openTag.length);
        const isStreaming = remaining === '' || remaining.startsWith('\n');

        if (isStreaming) {
          let content = remaining;
          const partialClose = `</${tool}`;
          if (content.endsWith(partialClose)) {
            content = content.slice(0, -partialClose.length);
          } else if (content.endsWith('</')) {
            content = content.slice(0, -2);
          } else if (content.endsWith('<')) {
            content = content.slice(0, -1);
          }
          const cleanContent = content.trim();
          const toolHeader = chalk.rgb(185, 148, 100)(`$ ${cleanContent}`);
          const spinner = chalk.rgb(200, 170, 90)('⠋ running...');
          const replacement = `\n  ${toolHeader} ${spinner}\n`;
          output = output.slice(0, startIdx) + replacement;
          break;
        } else {
          searchIdx = startIdx + openTag.length;
        }
      }
    }
  }

  // 3. Tool Outputs formatting: <output tool="terminal">...</output>
  let outputSearchIdx = 0;
  const openOutputRegex = /<output tool="(\w+)">/g;
  while (true) {
    openOutputRegex.lastIndex = outputSearchIdx;
    const match = openOutputRegex.exec(output);
    if (!match) break;

    const startIdx = match.index;
    const tool = match[1];
    const openTag = match[0];
    const closeTag = '</output>';

    const endIdx = output.indexOf(closeTag, startIdx + openTag.length);
    const cleanContent = (
      endIdx !== -1
        ? output.slice(startIdx + openTag.length, endIdx)
        : output.slice(startIdx + openTag.length)
    ).trim();

    const isError =
      cleanContent.toLowerCase().startsWith('error:') ||
      cleanContent.toLowerCase().includes('\nerror:') ||
      cleanContent.toLowerCase().includes('not found') ||
      cleanContent.toLowerCase().includes('failed');

    if (endIdx !== -1) {
      let replacement = '';
      if (isError) {
        const errHeader = chalk.rgb(200, 100, 95)(`  ✗ ${cleanContent}`);
        replacement = `${errHeader}\n`;
      } else {
        // Compact output formatting
        const lines = cleanContent.split('\n');
        if (lines.length <= 3) {
          const outText = lines.map((l) => chalk.rgb(120, 180, 120)(`  ✓ ${l}`)).join('\n');
          replacement = `${outText}\n`;
        } else {
          const preview = lines.slice(0, 5).map((l) => `    ${l}`).join('\n');
          const summary = chalk.rgb(120, 180, 120)(`  ✓ ${lines.length} lines output:`);
          replacement = `${summary}\n${preview}\n`;
        }
      }
      output = output.slice(0, startIdx) + replacement + output.slice(endIdx + closeTag.length);
      outputSearchIdx = startIdx + replacement.length;
    } else {
      const remaining = output.slice(startIdx + openTag.length);
      const isStreaming = remaining === '' || remaining.startsWith('\n');

      if (isStreaming) {
        const replacement = `  ${chalk.rgb(200, 170, 90)('⠋ output streaming...')}\n`;
        output = output.slice(0, startIdx) + replacement;
        break;
      } else {
        outputSearchIdx = startIdx + openTag.length;
      }
    }
  }

  // 4. Inline code: `code`
  output = output.replace(/`([^`]+)`/g, (_, code) => chalk.rgb(185, 148, 100)(code));

  // 5. Headings
  output = output.replace(/^# (.*)$/gm, (_, title) => chalk.rgb(210, 210, 205).bold(`\n${title}\n`));
  output = output.replace(/^## (.*)$/gm, (_, title) => chalk.rgb(110, 190, 185)(`\n${title}\n`));
  output = output.replace(/^### (.*)$/gm, (_, title) => chalk.rgb(185, 148, 100)(`${title}`));

  // 6. Numbered lists: 1. 2. etc.
  output = output.replace(/^(\d+)\. (.*)$/gm, (_, n, text) => `  ${chalk.rgb(185, 148, 100)(n + '.')} ${text}`);

  // 7. Bold & Italic
  output = output.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));
  output = output.replace(/\*([^*]+)\*/g, (_, text) => chalk.italic(text));

  // 8. Bullet lists
  output = output.replace(/^\s*[-*+]\s+(.*)$/gm, (_, text) => `  ${chalk.rgb(120, 120, 118)('·')} ${text}`);

  // 9. Blockquotes: > quote
  output = output.replace(/^>\s+(.*)$/gm, (_, text) => chalk.dim(`  │ ${text}`));

  return output;
}
