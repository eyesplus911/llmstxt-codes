import { describe, it, expect } from 'vitest';
import { validateDomain, buildFetchUrls } from '../src/lib/domain';

describe('validateDomain', () => {
  it('accepts valid domains', () => {
    expect(validateDomain('example.com').valid).toBe(true);
    expect(validateDomain('sub.example.com').valid).toBe(true);
    expect(validateDomain('my-site.co.uk').valid).toBe(true);
  });

  it('strips protocol', () => {
    const r = validateDomain('https://example.com');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('example.com');
  });

  it('strips path', () => {
    const r = validateDomain('example.com/page/foo');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('example.com');
  });

  it('strips port', () => {
    const r = validateDomain('example.com:8080');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('example.com');
  });

  it('lowercases', () => {
    const r = validateDomain('EXAMPLE.COM');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('example.com');
  });

  it('rejects empty input', () => {
    expect(validateDomain('').valid).toBe(false);
    expect(validateDomain('  ').valid).toBe(false);
  });

  it('rejects IP addresses', () => {
    expect(validateDomain('192.168.1.1').valid).toBe(false);
    expect(validateDomain('10.0.0.1').valid).toBe(false);
    expect(validateDomain('127.0.0.1').valid).toBe(false);
  });

  it('rejects IPv6', () => {
    expect(validateDomain('[::1]').valid).toBe(false);
    expect(validateDomain('::1').valid).toBe(false);
  });

  it('rejects localhost', () => {
    expect(validateDomain('localhost').valid).toBe(false);
    expect(validateDomain('0.0.0.0').valid).toBe(false);
  });

  it('rejects internal TLDs', () => {
    expect(validateDomain('app.local').valid).toBe(false);
    expect(validateDomain('test.internal').valid).toBe(false);
    expect(validateDomain('a.localhost').valid).toBe(false);
  });

  it('rejects Cloudflare internal domains', () => {
    expect(validateDomain('my-app.workers.dev').valid).toBe(false);
    expect(validateDomain('my-app.pages.dev').valid).toBe(false);
  });

  it('rejects invalid domain formats', () => {
    expect(validateDomain('not a domain').valid).toBe(false);
    expect(validateDomain('a').valid).toBe(false);
  });
});

describe('buildFetchUrls', () => {
  it('builds correct URLs', () => {
    const urls = buildFetchUrls('example.com');
    expect(urls.robotsTxt).toBe('https://example.com/robots.txt');
    expect(urls.llmsTxt).toBe('https://example.com/llms.txt');
    expect(urls.aiTxt).toBe('https://example.com/ai.txt');
    expect(urls.sitemapXml).toBe('https://example.com/sitemap.xml');
  });
});
