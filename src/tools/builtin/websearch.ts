import { request } from 'undici';
import type { Tool, ToolOutput } from '../types.js';

export class WebSearchTool implements Tool {
  name = 'websearch';
  description = 'Search the web for real-time information and current events';
  permissions = 'interactive' as const;
  enabled = true;
  arguments = {
    query: {
      type: 'string' as const,
      description: 'The search query to look up',
      required: true,
    },
  };

  async run(args: { query: string }): Promise<ToolOutput> {
    try {
      if (!args.query) {
        return { success: false, output: '', error: 'Missing query argument' };
      }

      const query = args.query.trim();

      // Check if Tavily API key is available in environment
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        try {
          const response = await request('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: tavilyKey,
              query: query,
              num_results: 5,
            }),
            headersTimeout: 10000,
          });

          if (response.statusCode === 200) {
            const data: any = await response.body.json();
            if (data && Array.isArray(data.results)) {
              const formatted = data.results.map((r: any) => 
                `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n`
              ).join('\n---\n\n');
              return { success: true, output: formatted || 'No results found.' };
            }
          }
        } catch (e) {
          // Fallback to DuckDuckGo if Tavily request fails
        }
      }

      // Zero-config fallback: DuckDuckGo HTML Search
      const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await request(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        headersTimeout: 15000,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          success: false,
          output: '',
          error: `Failed to fetch search page: HTTP status ${response.statusCode}`,
        };
      }

      const rawHtml = await response.body.text();
      const results = this.parseDuckDuckGo(rawHtml);

      if (results.length === 0) {
        return {
          success: true,
          output: 'No search results found. The search engine might be throttling or blocking requests. Try a different query.',
        };
      }

      const formatted = results.slice(0, 5).map((r) => 
        `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n`
      ).join('\n---\n\n');

      return {
        success: true,
        output: formatted,
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message || String(error),
      };
    }
  }

  private parseDuckDuckGo(html: string): Array<{ title: string; snippet: string; url: string }> {
    const results: Array<{ title: string; snippet: string; url: string }> = [];
    
    // Split page into result block segments
    const blocks = html.split('class="result__body"');
    
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Match title and link href
      const hrefMatch = block.match(/href="([^"]+)"/i);
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || 
                            block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/span>/i) ||
                            block.match(/result__snippet">([\s\S]*?)<\/a>/i);

      let url = hrefMatch ? hrefMatch[1] : '';
      let title = titleMatch ? titleMatch[1] : '';
      let snippet = snippetMatch ? snippetMatch[1] : '';

      // Clean up redirect links (e.g. /l/?kh=-1&uddg=https%3A%2F%2Fexample.com)
      if (url.includes('uddg=')) {
        const parts = url.split('uddg=');
        if (parts[1]) {
          url = decodeURIComponent(parts[1].split('&')[0]);
        }
      }

      // Clean HTML tags and entities
      title = title.replace(/<[^>]+>/g, '').trim();
      snippet = snippet.replace(/<[^>]+>/g, '').trim();

      // Decode basic HTML entities
      const decodeEntities = (str: string) => str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      title = decodeEntities(title);
      snippet = decodeEntities(snippet);

      if (url && title) {
        results.push({
          title,
          url,
          snippet: snippet || 'No description available.',
        });
      }
    }
    return results;
  }
}
