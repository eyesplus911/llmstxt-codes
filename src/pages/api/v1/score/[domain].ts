export const prerender = false;

import { validateDomain } from '../../../../lib/domain';
import { errorResponse } from '../../../../lib/errors';
import { getTier, TIER_CONFIG } from '../../../../lib/scoring';

// GET /api/v1/score/{domain} — thin read-only API (from D1 cache)
export async function GET({ params, request, locals }: {
  params: { domain: string };
  request: Request;
  locals: App.Locals;
}) {
  const domainParam = params.domain;
  if (!domainParam) {
    return errorResponse('DOMAIN_INVALID', 'Missing domain');
  }

  const validation = validateDomain(domainParam);
  if (!validation.valid) {
    return errorResponse('DOMAIN_INVALID', validation.error);
  }

  const domain = validation.domain;

  try {
    const db = locals.runtime.env.DB;

    // Get most recent scan for this domain
    const row = await db.prepare(
      'SELECT score, llms_txt_score, robots_txt_score, ai_txt_score, sitemap_score, meta_score, headers_score, score_version, scanned_at FROM scans WHERE domain = ? ORDER BY scanned_at DESC LIMIT 1'
    ).bind(domain).first<{
      score: number | null;
      llms_txt_score: number | null;
      robots_txt_score: number | null;
      ai_txt_score: number | null;
      sitemap_score: number | null;
      meta_score: number | null;
      headers_score: number | null;
      score_version: number;
      scanned_at: string;
    }>();

    if (!row || row.score === null) {
      return new Response(JSON.stringify({
        domain,
        score: null,
        tier: null,
        message: 'No scan results found. Visit https://llmstxt.codes to scan this domain.',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tier = getTier(row.score);
    const tierInfo = TIER_CONFIG[tier];

    return new Response(JSON.stringify({
      domain,
      score: row.score,
      tier: tierInfo.label,
      sub_scores: {
        llms_txt: row.llms_txt_score,
        robots_txt: row.robots_txt_score,
        ai_txt: row.ai_txt_score,
        sitemap: row.sitemap_score,
        meta: row.meta_score,
        headers: row.headers_score,
      },
      score_version: row.score_version,
      scanned_at: row.scanned_at,
      report_url: `https://llmstxt.codes/report/${domain}`,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: unknown) {
    console.error('Score lookup failed:', err);
    return errorResponse('INTERNAL_ERROR', undefined, 500);
  }
}
