export const prerender = false;

/**
 * GET /api/v1/badge/{domain}
 * Returns an SVG badge showing the AI Readiness Score for a domain.
 * Shields.io-compatible format. Cached for 1 hour.
 *
 * Usage:
 *   <img src="https://llmstxt.codes/api/v1/badge/example.com" alt="AI Readiness Score" />
 *   [![AI Readiness](https://llmstxt.codes/api/v1/badge/example.com)](https://llmstxt.codes/?domain=example.com)
 */

import { validateDomain, buildFetchUrls } from '../../../../lib/domain';
import { parseRobotsTxt, parseLlmsTxt, parseAiTxt, parseSitemap } from '../../../../lib/parsers';
import { computeScore, getTier, TIER_CONFIG } from '../../../../lib/scoring';

const FETCH_TIMEOUT = 3000;
const MAX_BODY = 512_000;

async function fetchFile(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'llmstxt-codes-scanner/1.0 (+https://llmstxt.codes)' },
    });
    clearTimeout(timeout);
    if (res.status >= 300 && res.status < 400) {
      return { url, status: res.status, content: null, contentType: null, error: 'Redirect', errorCode: 'FETCH_REDIRECT' };
    }
    const text = await res.text();
    return { url, status: res.status, content: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text, contentType: res.headers.get('content-type'), error: null, errorCode: null };
  } catch {
    return { url, status: null, content: null, contentType: null, error: 'Failed', errorCode: 'FETCH_FAILED' };
  }
}

function makeBadgeSvg(label: string, value: string, color: string): string {
  const labelWidth = label.length * 6.5 + 12;
  const valueWidth = value.length * 6.5 + 12;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${escXml(label)}</text>
    <text x="${labelWidth / 2}" y="13">${escXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${escXml(value)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${escXml(value)}</text>
  </g>
</svg>`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET({ params }: { params: { domain: string } }) {
  const domainParam = params.domain;

  if (!domainParam) {
    return new Response(makeBadgeSvg('AI Readiness', 'error', '#999'), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
    });
  }

  const validation = validateDomain(domainParam);
  if (!validation.valid) {
    return new Response(makeBadgeSvg('AI Readiness', 'invalid domain', '#e05d44'), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
    });
  }

  const urls = buildFetchUrls(validation.domain);

  const [robotsTxt, llmsTxt, aiTxt, sitemapXml] = await Promise.allSettled([
    fetchFile(urls.robotsTxt),
    fetchFile(urls.llmsTxt),
    fetchFile(urls.aiTxt),
    fetchFile(urls.sitemapXml),
  ]);

  const resolve = (r: PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>) =>
    r.status === 'fulfilled'
      ? r.value
      : { url: '', status: null, content: null, contentType: null, error: 'Failed', errorCode: 'INTERNAL_ERROR' };

  const parsed = {
    robotsTxt: parseRobotsTxt(resolve(robotsTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>)),
    llmsTxt: parseLlmsTxt(resolve(llmsTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>)),
    aiTxt: parseAiTxt(resolve(aiTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>)),
    sitemap: parseSitemap(resolve(sitemapXml as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>)),
  };

  const score = computeScore(parsed.robotsTxt, parsed.llmsTxt, parsed.aiTxt, parsed.sitemap, validation.domain);
  const tier = getTier(score.overall);
  const tierConfig = TIER_CONFIG[tier];

  const svg = makeBadgeSvg('AI Readiness', `${score.overall}/100`, tierConfig.color);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
