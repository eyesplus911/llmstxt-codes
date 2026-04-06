export const prerender = false;

import { validateDomain, buildFetchUrls } from '../../../lib/domain';
import { errorResponse } from '../../../lib/errors';

const FETCH_TIMEOUT = 3000; // 3s per file
const MAX_BODY = 512_000; // 500KB cap
const RATE_LIMIT = 30; // max scans per IP per minute
const RATE_WINDOW = 60_000; // 1 minute

// In-memory rate limiter (resets on cold start, good enough for single-instance)
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

async function fetchFile(url: string): Promise<{
  url: string;
  status: number | null;
  content: string | null;
  contentType: string | null;
  error: string | null;
  errorCode: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual', // SSRF: don't follow redirects to internal IPs
      headers: {
        'User-Agent': 'llmstxt-codes-scanner/1.0 (+https://llmstxt.codes)',
      },
    });

    clearTimeout(timeout);

    // Don't follow redirects (SSRF protection)
    if (res.status >= 300 && res.status < 400) {
      return {
        url,
        status: res.status,
        content: null,
        contentType: null,
        error: 'Redirect not followed for security',
        errorCode: 'FETCH_REDIRECT',
      };
    }

    const contentType = res.headers.get('content-type');
    const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10);

    if (contentLength > MAX_BODY) {
      return {
        url,
        status: res.status,
        content: null,
        contentType,
        error: 'File too large',
        errorCode: 'FILE_TOO_LARGE',
      };
    }

    const text = await res.text();

    // Double-check actual content size
    if (text.length > MAX_BODY) {
      return {
        url,
        status: res.status,
        content: text.slice(0, MAX_BODY),
        contentType,
        error: 'File truncated at 500KB',
        errorCode: 'FILE_TOO_LARGE',
      };
    }

    return {
      url,
      status: res.status,
      content: text,
      contentType,
      error: null,
      errorCode: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = message.includes('abort');
    return {
      url,
      status: null,
      content: null,
      contentType: null,
      error: isTimeout ? 'Request timed out (3s)' : message,
      errorCode: isTimeout ? 'FETCH_TIMEOUT' : 'DOMAIN_UNREACHABLE',
    };
  }
}

// GET /api/v1/fetch?domain=example.com
export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const domainParam = url.searchParams.get('domain');

  // Rate limiting
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return errorResponse('RATE_LIMITED', undefined, 429);
  }

  if (!domainParam) {
    return errorResponse('DOMAIN_INVALID', 'Missing domain parameter');
  }

  const validation = validateDomain(domainParam);
  if (!validation.valid) {
    return errorResponse('DOMAIN_INVALID', validation.error);
  }

  const urls = buildFetchUrls(validation.domain);

  // Fetch all 4 files in parallel (Workers allows 6 concurrent subrequests)
  const [robotsTxt, llmsTxt, aiTxt, sitemapXml] = await Promise.allSettled([
    fetchFile(urls.robotsTxt),
    fetchFile(urls.llmsTxt),
    fetchFile(urls.aiTxt),
    fetchFile(urls.sitemapXml),
  ]);

  const result = {
    domain: validation.domain,
    robotsTxt: robotsTxt.status === 'fulfilled' ? robotsTxt.value : {
      url: urls.robotsTxt, status: null, content: null, contentType: null,
      error: 'Fetch failed', errorCode: 'INTERNAL_ERROR',
    },
    llmsTxt: llmsTxt.status === 'fulfilled' ? llmsTxt.value : {
      url: urls.llmsTxt, status: null, content: null, contentType: null,
      error: 'Fetch failed', errorCode: 'INTERNAL_ERROR',
    },
    aiTxt: aiTxt.status === 'fulfilled' ? aiTxt.value : {
      url: urls.aiTxt, status: null, content: null, contentType: null,
      error: 'Fetch failed', errorCode: 'INTERNAL_ERROR',
    },
    sitemapXml: sitemapXml.status === 'fulfilled' ? sitemapXml.value : {
      url: urls.sitemapXml, status: null, content: null, contentType: null,
      error: 'Fetch failed', errorCode: 'INTERNAL_ERROR',
    },
    fetchedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
