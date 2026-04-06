/**
 * Client-side parsers for robots.txt, llms.txt, ai.txt, and sitemap.xml.
 * These run in the browser since Workers free tier has only 10ms CPU.
 */

// ─── Known AI Crawlers ───

export const AI_BOTS = [
  { name: 'GPTBot', operator: 'OpenAI', description: 'ChatGPT / GPT models' },
  { name: 'ChatGPT-User', operator: 'OpenAI', description: 'ChatGPT browsing' },
  { name: 'OAI-SearchBot', operator: 'OpenAI', description: 'OpenAI search' },
  { name: 'Google-Extended', operator: 'Google', description: 'Gemini training' },
  { name: 'Googlebot', operator: 'Google', description: 'Google Search (also AI)' },
  { name: 'anthropic-ai', operator: 'Anthropic', description: 'Claude training' },
  { name: 'ClaudeBot', operator: 'Anthropic', description: 'Claude web browsing' },
  { name: 'CCBot', operator: 'Common Crawl', description: 'Open dataset' },
  { name: 'FacebookBot', operator: 'Meta', description: 'Meta AI training' },
  { name: 'Bytespider', operator: 'ByteDance', description: 'TikTok/Douyin AI' },
  { name: 'Applebot-Extended', operator: 'Apple', description: 'Apple Intelligence' },
  { name: 'PerplexityBot', operator: 'Perplexity', description: 'Perplexity search' },
  { name: 'YouBot', operator: 'You.com', description: 'You.com search AI' },
  { name: 'Diffbot', operator: 'Diffbot', description: 'Knowledge Graph' },
  { name: 'cohere-ai', operator: 'Cohere', description: 'Cohere models' },
  { name: 'Amazonbot', operator: 'Amazon', description: 'Alexa / Amazon AI' },
] as const;

export type AIBot = (typeof AI_BOTS)[number];

// ─── Fetch Result Types ───

export interface FetchedFile {
  url: string;
  status: number | null;
  content: string | null;
  contentType: string | null;
  error: string | null;
  errorCode: string | null;
}

export interface FetchResult {
  domain: string;
  robotsTxt: FetchedFile;
  llmsTxt: FetchedFile;
  aiTxt: FetchedFile;
  sitemapXml: FetchedFile;
  fetchedAt: string;
}

// ─── Parse Result Types ───

export interface RobotsTxtResult {
  exists: boolean;
  parseError: boolean;
  aiBotsBlocked: string[];
  aiBotsAllowed: string[];
  hasWildcardBlock: boolean;
  rawContent: string | null;
  issues: string[];
}

export interface LlmsTxtResult {
  exists: boolean;
  parseError: boolean;
  hasTitle: boolean;
  hasDescription: boolean;
  hasSections: boolean;
  hasValidLinks: boolean;
  correctMime: boolean;
  reasonableSize: boolean;
  rawContent: string | null;
  issues: string[];
}

export interface AiTxtResult {
  exists: boolean;
  parseError: boolean;
  isExperimental: true; // always true: spec is still evolving
  hasValidFormat: boolean;
  rawContent: string | null;
  issues: string[];
}

export interface SitemapResult {
  exists: boolean;
  accessible: boolean;
  rawContent: string | null;
  issues: string[];
}

export interface ParsedResults {
  robotsTxt: RobotsTxtResult;
  llmsTxt: LlmsTxtResult;
  aiTxt: AiTxtResult;
  sitemap: SitemapResult;
}

// ─── robots.txt Parser ───

export function parseRobotsTxt(file: FetchedFile): RobotsTxtResult {
  const result: RobotsTxtResult = {
    exists: false,
    parseError: false,
    aiBotsBlocked: [],
    aiBotsAllowed: [],
    hasWildcardBlock: false,
    rawContent: null,
    issues: [],
  };

  if (!file.content || file.status !== 200) {
    if (file.status === 404) {
      result.issues.push('robots.txt not found — any bot can crawl your site');
    } else if (file.error) {
      result.issues.push(`Could not fetch robots.txt: ${file.error}`);
    }
    return result;
  }

  result.exists = true;
  result.rawContent = file.content;

  // Cap at 500KB for safety
  if (file.content.length > 512_000) {
    result.parseError = true;
    result.issues.push('robots.txt exceeds 500KB — unusually large');
    return result;
  }

  try {
    const lines = file.content.split(/\r?\n/);
    let currentAgents: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim(); // strip comments
      if (!line) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const directive = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (directive === 'user-agent') {
        currentAgents = [value];
      } else if (directive === 'disallow' && value === '/') {
        for (const agent of currentAgents) {
          // Check if this is an AI bot
          const matchedBot = AI_BOTS.find(
            (b) => b.name.toLowerCase() === agent.toLowerCase()
          );
          if (matchedBot) {
            if (!result.aiBotsBlocked.includes(matchedBot.name)) {
              result.aiBotsBlocked.push(matchedBot.name);
            }
          }
          if (agent === '*') {
            result.hasWildcardBlock = true;
          }
        }
      } else if (directive === 'allow') {
        for (const agent of currentAgents) {
          const matchedBot = AI_BOTS.find(
            (b) => b.name.toLowerCase() === agent.toLowerCase()
          );
          if (matchedBot) {
            if (!result.aiBotsAllowed.includes(matchedBot.name)) {
              result.aiBotsAllowed.push(matchedBot.name);
            }
          }
        }
      }
    }

    // Generate insights
    if (result.hasWildcardBlock && result.aiBotsAllowed.length === 0) {
      result.issues.push('Wildcard block (Disallow: /) blocks ALL bots including AI crawlers');
    }

    const unmentioned = AI_BOTS.filter(
      (b) =>
        !result.aiBotsBlocked.includes(b.name) &&
        !result.aiBotsAllowed.includes(b.name)
    );
    if (unmentioned.length > 0 && !result.hasWildcardBlock) {
      result.issues.push(
        `${unmentioned.length} AI bots not mentioned — they can crawl freely`
      );
    }
  } catch {
    result.parseError = true;
    result.issues.push('Failed to parse robots.txt');
  }

  return result;
}

// ─── llms.txt Parser ───

export function parseLlmsTxt(file: FetchedFile): LlmsTxtResult {
  const result: LlmsTxtResult = {
    exists: false,
    parseError: false,
    hasTitle: false,
    hasDescription: false,
    hasSections: false,
    hasValidLinks: false,
    correctMime: false,
    reasonableSize: false,
    rawContent: null,
    issues: [],
  };

  if (!file.content || file.status !== 200) {
    if (file.status === 404) {
      result.issues.push('llms.txt not found — AI models cannot learn about your site');
    } else if (file.error) {
      result.issues.push(`Could not fetch llms.txt: ${file.error}`);
    }
    return result;
  }

  result.exists = true;
  result.rawContent = file.content;

  try {
    const content = file.content.trim();

    // Check MIME type
    if (file.contentType?.includes('text/plain') || file.contentType?.includes('text/markdown')) {
      result.correctMime = true;
    } else {
      result.issues.push(`Expected text/plain or text/markdown, got ${file.contentType ?? 'unknown'}`);
    }

    // Size check (should be concise: 100B-100KB)
    if (content.length >= 100 && content.length <= 102_400) {
      result.reasonableSize = true;
    } else if (content.length < 100) {
      result.issues.push('llms.txt is very short — consider adding more context');
    } else {
      result.issues.push('llms.txt exceeds 100KB — consider being more concise');
    }

    const lines = content.split(/\r?\n/);

    // Title: first line should be "# Title"
    if (lines[0]?.startsWith('# ')) {
      result.hasTitle = true;
    } else {
      result.issues.push('Missing title (first line should be "# Site Name")');
    }

    // Description: text after title, before first ## section
    const descLines = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) break;
      if (lines[i].trim()) descLines.push(lines[i]);
    }
    if (descLines.length > 0) {
      result.hasDescription = true;
    } else {
      result.issues.push('Missing description after title');
    }

    // Sections: ## headings
    const sections = lines.filter((l) => l.startsWith('## '));
    if (sections.length > 0) {
      result.hasSections = true;
    } else {
      result.issues.push('No sections found (use ## headings to organize content)');
    }

    // Links: markdown links or URLs
    const urlPattern = /https?:\/\/[^\s)]+/g;
    const urls = content.match(urlPattern) || [];
    if (urls.length > 0) {
      result.hasValidLinks = true;
    } else {
      result.issues.push('No links found — include links to key pages');
    }
  } catch {
    result.parseError = true;
    result.issues.push('Failed to parse llms.txt');
  }

  return result;
}

// ─── ai.txt Parser ───

export function parseAiTxt(file: FetchedFile): AiTxtResult {
  const result: AiTxtResult = {
    exists: false,
    parseError: false,
    isExperimental: true,
    hasValidFormat: false,
    rawContent: null,
    issues: [],
  };

  if (!file.content || file.status !== 200) {
    if (file.status === 404) {
      result.issues.push('ai.txt not found — this is an emerging standard (experimental)');
    } else if (file.error) {
      result.issues.push(`Could not fetch ai.txt: ${file.error}`);
    }
    return result;
  }

  result.exists = true;
  result.rawContent = file.content;

  try {
    const content = file.content.trim();
    // ai.txt is still evolving — parse leniently
    // Expected format: key: value pairs
    const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));

    if (lines.length === 0) {
      result.issues.push('ai.txt is empty');
      return result;
    }

    // Check for key-value format
    const kvLines = lines.filter((l) => l.includes(':'));
    if (kvLines.length > 0) {
      result.hasValidFormat = true;
    } else {
      result.issues.push('ai.txt does not follow key: value format');
    }
  } catch {
    result.parseError = true;
    result.issues.push('Failed to parse ai.txt');
  }

  return result;
}

// ─── sitemap.xml Parser ───

export function parseSitemap(file: FetchedFile): SitemapResult {
  const result: SitemapResult = {
    exists: false,
    accessible: false,
    rawContent: null,
    issues: [],
  };

  if (!file.content || file.status !== 200) {
    if (file.status === 404) {
      result.issues.push('sitemap.xml not found — search engines and AI crawlers may miss pages');
    } else if (file.error) {
      result.issues.push(`Could not fetch sitemap.xml: ${file.error}`);
    }
    return result;
  }

  result.exists = true;
  result.rawContent = file.content.slice(0, 65_536); // cap at 64KB for display

  // Check if it's valid XML with sitemap namespace
  if (
    file.content.includes('<urlset') ||
    file.content.includes('<sitemapindex')
  ) {
    result.accessible = true;
  } else {
    result.issues.push('File does not appear to be a valid sitemap XML');
  }

  return result;
}
