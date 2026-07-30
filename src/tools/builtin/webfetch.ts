import { request } from 'undici';
import type { Tool, ToolOutput } from '../types.js';

export class WebFetchTool implements Tool {
  name = 'webfetch';
  description = 'Fetch and display the text content from a web page URL';
  permissions = 'interactive' as const;
  enabled = true;
  arguments = {
    url: {
      type: 'string' as const,
      description: 'The HTTP or HTTPS URL to fetch content from',
      required: true,
    },
  };

  async run(args: { url: string }): Promise<ToolOutput> {
    try {
      if (!args.url) {
        return { success: false, output: '', error: 'Missing url argument' };
      }

      let targetUrl = args.url.trim();
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      const response = await request(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        headersTimeout: 15000,
        bodyTimeout: 15000,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          success: false,
          output: '',
          error: `HTTP error status: ${response.statusCode}`,
        };
      }

      const rawHtml = await response.body.text();
      const cleanedText = this.cleanHtml(rawHtml);

      return {
        success: true,
        output: cleanedText,
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message || String(error),
      };
    }
  }

  private cleanHtml(html: string): string {
    // Strip script, style, noscript, and iframe elements
    let text = html.replace(/<(script|style|noscript|iframe)[^>]*>([\s\S]*?)<\/\1>/gi, '');
    
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    
    // Extract headings
    text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (match, content) => {
      const cleanHeading = content.replace(/<[^>]+>/g, '').trim();
      return `\n\n### ${cleanHeading}\n\n`;
    });
    
    // Extract list items
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, content) => {
      const cleanItem = content.replace(/<[^>]+>/g, '').trim();
      return `\n- ${cleanItem}`;
    });
    
    // Line breaks for paragraphs and block tags
    text = text.replace(/<\/(p|div|tr|header|footer|section|article)>/gi, '\n');
    
    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'");

    // Clean whitespace and line endings
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\r/g, '');
    text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
    return text.trim();
  }
}
