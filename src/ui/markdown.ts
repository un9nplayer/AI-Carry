import chalk from 'chalk';
import pkg from 'cli-highlight';
const { highlight } = pkg;

export function renderMarkdown(markdown: string): string {
  let output = markdown;

  // 1. Code blocks: ```js ... ```
  // Process code blocks FIRST so any tags inside code blocks are styled and not matched as active tool calls.
  // Handles both closed and unclosed code blocks during streaming.
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(```|$)/g;
  output = output.replace(codeBlockRegex, (match, lang, code, closing) => {
    const trimmedCode = code.trim();
    let highlighted = trimmedCode;
    try {
      if (lang) {
        highlighted = highlight(trimmedCode, { language: lang });
      }
    } catch {
      // Fallback if highlight fails
    }
    const border = chalk.gray('─'.repeat(60));
    const streamingIndicator = closing ? '' : `\n${chalk.yellow('⠋ Streaming code block...')}`;
    return `\n${border}\n${highlighted}${streamingIndicator}\n${border}\n`;
  });

  // 2. Tool Calls formatting: <terminal>...</terminal> etc.
  const toolTags = ['terminal', 'cat', 'grep', 'write', 'edit', 'webfetch', 'websearch'];
  const toolIcons: Record<string, string> = {
    terminal: '⬡', cat: '◈', grep: '◎', write: '✎', edit: '✏', webfetch: '⟁', websearch: '⌕',
  };
  for (const tool of toolTags) {
    const openTag = `<${tool}>`;
    const closeTag = `</${tool}>`;
    
    let searchIdx = 0;
    while (true) {
      const startIdx = output.indexOf(openTag, searchIdx);
      if (startIdx === -1) break;
      
      const endIdx = output.indexOf(closeTag, startIdx + openTag.length);
      const toolIcon = toolIcons[tool] || '⬡';
      const border = chalk.gray('─'.repeat(56));
      const header = `\n${chalk.gray(`  ${toolIcon} ${tool}`)}\n${border}\n`;
      
      if (endIdx !== -1) {
        // Completed tag
        const content = output.slice(startIdx + openTag.length, endIdx).trim();
        const replacement = `${header}${content}\n${border}\n`;
        output = output.slice(0, startIdx) + replacement + output.slice(endIdx + closeTag.length);
        searchIdx = startIdx + replacement.length;
      } else {
        // Streaming/Unclosed tag: only treat as streaming tool call if it starts with a newline or is at the end of the output
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
          const replacement = `${header}${cleanContent}\n${chalk.blue('⠋ Running/Streaming...')}\n${border}\n`;
          output = output.slice(0, startIdx) + replacement;
          break; // Since we consumed to the end of the string
        } else {
          // Just a raw tag mention (e.g. `<terminal> ,`), skip it
          searchIdx = startIdx + openTag.length;
        }
      }
    }
  }

  // 3. Tool Outputs formatting: <output tool="terminal">...</output> or streaming <output tool="terminal">...
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
    const cleanContent = (endIdx !== -1 
      ? output.slice(startIdx + openTag.length, endIdx) 
      : output.slice(startIdx + openTag.length)
    ).trim();
    
    const isError = cleanContent.toLowerCase().startsWith('error:') || cleanContent.toLowerCase().includes('\nerror:');
    const statusIcon = isError ? '✗' : '✓';
    const statusHeader = isError
      ? chalk.rgb(200, 100, 95)(`  ${statusIcon} ${tool}`)
      : chalk.rgb(120, 180, 120)(`  ${statusIcon} ${tool}`);
    const border = chalk.gray('─'.repeat(56));
    
    if (endIdx !== -1) {
      // Completed output tag
      const replacement = `\n${statusHeader}\n${border}\n${cleanContent}\n${border}\n`;
      output = output.slice(0, startIdx) + replacement + output.slice(endIdx + closeTag.length);
      outputSearchIdx = startIdx + replacement.length;
    } else {
      // Streaming/Unclosed output tag: only treat as streaming tool call if it starts with a newline or is at the end of the output
      const remaining = output.slice(startIdx + openTag.length);
      const isStreaming = remaining === '' || remaining.startsWith('\n');
      
      if (isStreaming) {
        let content = remaining;
        const partialClose = '</output>';
        for (let i = partialClose.length; i > 0; i--) {
          const sub = partialClose.slice(0, i);
          if (content.endsWith(sub)) {
            content = content.slice(0, -sub.length);
            break;
          }
        }
        const cleanContentText = content.trim();
        const replacement = `\n${statusHeader}\n${border}\n${cleanContentText}\n${chalk.yellow('⠋ Streaming output...')}\n${border}\n`;
        output = output.slice(0, startIdx) + replacement;
        break; // Since we consumed to the end of the string
      } else {
        // Just a raw tag mention, skip it
        outputSearchIdx = startIdx + openTag.length;
      }
    }
  }

  // 4. Inline code: `code`
  output = output.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.black(` ${code} `));

  // 5. Headings
  output = output.replace(/^# (.*)$/gm, (_, title) => chalk.rgb(210, 210, 205).bold(`\n${title}\n`));
  output = output.replace(/^## (.*)$/gm, (_, title) => chalk.rgb(110, 190, 185)(`\n${title}\n`));
  output = output.replace(/^### (.*)$/gm, (_, title) => chalk.rgb(185, 148, 100)(`${title}`));

  // 6. Numbered lists: 1. 2. etc. highlight number
  output = output.replace(/^(\d+)\. (.*)$/gm, (_, n, text) => `  ${chalk.rgb(185, 148, 100)(n + '.')} ${text}`);

  // 6. Bold & Italic
  output = output.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));
  output = output.replace(/\*([^*]+)\*/g, (_, text) => chalk.italic(text));

  // 7. Lists
  output = output.replace(/^\s*[-*+]\s+(.*)$/gm, (_, text) => `  ${chalk.rgb(120, 120, 118)('·')} ${text}`);

  // 8. Blockquotes: > quote
  output = output.replace(/^>\s+(.*)$/gm, (_, text) => chalk.dim(`  │ ${text}`));

  return output;
}
