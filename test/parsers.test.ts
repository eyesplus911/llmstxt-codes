import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, parseLlmsTxt, parseAiTxt, parseSitemap } from '../src/lib/parsers';
import type { FetchedFile } from '../src/lib/parsers';

function makeFile(overrides: Partial<FetchedFile> = {}): FetchedFile {
  return {
    url: 'https://example.com/test',
    status: null,
    content: null,
    contentType: null,
    error: null,
    errorCode: null,
    ...overrides,
  };
}

describe('parseRobotsTxt', () => {
  it('returns not exists for 404', () => {
    const r = parseRobotsTxt(makeFile({ status: 404 }));
    expect(r.exists).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('parses AI bot blocks', () => {
    const r = parseRobotsTxt(makeFile({
      status: 200,
      content: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /',
    }));
    expect(r.exists).toBe(true);
    expect(r.aiBotsBlocked).toContain('GPTBot');
    expect(r.aiBotsBlocked).toContain('ClaudeBot');
  });

  it('detects wildcard block', () => {
    const r = parseRobotsTxt(makeFile({
      status: 200,
      content: 'User-agent: *\nDisallow: /',
    }));
    expect(r.hasWildcardBlock).toBe(true);
  });

  it('detects AI bot allows', () => {
    const r = parseRobotsTxt(makeFile({
      status: 200,
      content: 'User-agent: GPTBot\nAllow: /public\n',
    }));
    expect(r.aiBotsAllowed).toContain('GPTBot');
  });
});

describe('parseLlmsTxt', () => {
  it('returns not exists for 404', () => {
    const r = parseLlmsTxt(makeFile({ status: 404 }));
    expect(r.exists).toBe(false);
  });

  it('detects title', () => {
    const r = parseLlmsTxt(makeFile({
      status: 200,
      content: '# My Site\n\nSome description that is long enough to meet the minimum size requirement for llms.txt validation which needs at least 100 characters of content to pass the size check.',
      contentType: 'text/plain',
    }));
    expect(r.exists).toBe(true);
    expect(r.hasTitle).toBe(true);
  });

  it('detects correct mime type', () => {
    const r = parseLlmsTxt(makeFile({
      status: 200,
      content: '# Test\n\n' + 'x'.repeat(100),
      contentType: 'text/plain; charset=utf-8',
    }));
    expect(r.correctMime).toBe(true);
  });

  it('flags wrong mime type', () => {
    const r = parseLlmsTxt(makeFile({
      status: 200,
      content: '# Test\n\n' + 'x'.repeat(100),
      contentType: 'text/html',
    }));
    expect(r.correctMime).toBe(false);
  });
});

describe('parseAiTxt', () => {
  it('returns not exists for no content', () => {
    const r = parseAiTxt(makeFile());
    expect(r.exists).toBe(false);
  });
});

describe('parseSitemap', () => {
  it('returns not exists for 404', () => {
    const r = parseSitemap(makeFile({ status: 404 }));
    expect(r.exists).toBe(false);
  });

  it('detects accessible sitemap', () => {
    const r = parseSitemap(makeFile({
      status: 200,
      content: '<?xml version="1.0"?><urlset></urlset>',
    }));
    expect(r.exists).toBe(true);
    expect(r.accessible).toBe(true);
  });
});
