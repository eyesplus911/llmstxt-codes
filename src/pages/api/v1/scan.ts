export const prerender = false;

/**
 * GET /api/v1/scan?domain=example.com
 * All-in-one endpoint: fetch → parse → score in a single request.
 * Returns { domain, score, subScores, tier, improvements, fetchedAt }.
 * CORS enabled for external API consumers.
 */

import { validateDomain, buildFetchUrls } from '../../../lib/domain';
import { parseRobotsTxt, parseLlmsTxt, parseAiTxt, parseSitemap } from '../../../lib/parsers';
import { computeScore, SCORE_VERSION } from '../../../lib/scoring';
import { errorResponse } from '../../../lib/errors';

const FETCH_TIMEOUT = 3000;
const MAX_BODY = 512_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
      return { url, status: res.status, content: null, contentType: null, error: 'Redirect not followed', errorCode: 'FETCH_REDIRECT' };
    }

    const contentType = res.headers.get('content-type');
    const text = await res.text();
    return {
      url,
      status: res.status,
      content: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text,
      contentType,
      error: null,
      errorCode: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      url,
      status: null,
      content: null,
      contentType: null,
      error: message.includes('abort') ? 'Timeout (3s)' : message,
      errorCode: message.includes('abort') ? 'FETCH_TIMEOUT' : 'DOMAIN_UNREACHABLE',
    };
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const domainParam = url.searchParams.get('domain');

  if (!domainParam) {
    return errorResponse('DOMAIN_INVALID', 'Missing domain parameter');
  }

  const validation = validateDomain(domainParam);
  if (!validation.valid) {
    return errorResponse('DOMAIN_INVALID', validation.error);
  }

  const urls = buildFetchUrls(validation.domain);

  const [robotsTxt, llmsTxt, aiTxt, sitemapXml] = await Promise.allSettled([
    fetchFile(urls.robotsTxt),
    fetchFile(urls.llmsTxt),
    fetchFile(urls.aiTxt),
    fetchFile(urls.sitemapXml),
  ]);

  const resolve = (r: PromiseSettledResult<ReturnType<typeof fetchFile> extends Promise<infer T> ? T : never>) =>
    r.status === 'fulfilled'
      ? r.value
      : { url: '', status: null, content: null, contentType: null, error: 'Fetch failed', errorCode: 'INTERNAL_ERROR' };

  const files = {
    robotsTxt: resolve(robotsTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>),
    llmsTxt: resolve(llmsTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>),
    aiTxt: resolve(aiTxt as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>),
    sitemapXml: resolve(sitemapXml as PromiseSettledResult<Awaited<ReturnType<typeof fetchFile>>>),
  };

  const parsed = {
    robotsTxt: parseRobotsTxt(files.robotsTxt),
    llmsTxt: parseLlmsTxt(files.llmsTxt),
    aiTxt: parseAiTxt(files.aiTxt),
    sitemap: parseSitemap(files.sitemapXml),
  };

  const score = computeScore(parsed.robotsTxt, parsed.llmsTxt, parsed.aiTxt, parsed.sitemap, validation.domain);

  const result = {
    domain: validation.domain,
    score: score.overall,
    tier: score.tier,
    subScores: score.subScores,
    improvements: score.improvements,
    scoreVersion: SCORE_VERSION,
    fetchedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...CORS_HEADERS,
    },
  });
}
