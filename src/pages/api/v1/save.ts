export const prerender = false;

import { env } from 'cloudflare:workers';
import { validateDomain } from '../../../lib/domain';
import { errorResponse } from '../../../lib/errors';

// POST /api/v1/save — save scan results to D1 + R2
export async function POST({ request }: { request: Request }) {
  const body = await request.json().catch(() => null);
  if (!body || !body.domain || body.score === undefined) {
    return errorResponse('DOMAIN_INVALID', 'Missing required fields: domain, score');
  }

  const validation = validateDomain(body.domain);
  if (!validation.valid) {
    return errorResponse('DOMAIN_INVALID', validation.error);
  }

  const domain = validation.domain;
  const id = `${domain}-${new Date().toISOString().slice(0, 10)}`;

  try {
    const db = (env as unknown as Env).DB;
    const r2 = (env as unknown as Env).REPORTS;

    // Store full results in R2
    const r2Key = `reports/${domain}/${id}.json`;
    if (body.results) {
      await r2.put(r2Key, JSON.stringify(body.results), {
        httpMetadata: { contentType: 'application/json' },
      });
    }

    // Upsert scan to D1 (INSERT OR REPLACE for concurrent scan protection)
    await db.prepare(`
      INSERT OR REPLACE INTO scans (id, domain, score, llms_txt_score, robots_txt_score, ai_txt_score, sitemap_score, meta_score, headers_score, score_version, results_r2_key, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).bind(
      id,
      domain,
      body.score ?? null,
      body.subScores?.llmsTxt ?? null,
      body.subScores?.robotsTxt ?? null,
      body.subScores?.aiTxt ?? null,
      body.subScores?.sitemap ?? null,
      body.subScores?.meta ?? null,
      body.subScores?.headers ?? null,
      body.scoreVersion ?? 1,
      body.results ? r2Key : null,
    ).run();

    return new Response(JSON.stringify({ ok: true, id, domain }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    console.error('Save failed:', err);
    return errorResponse('INTERNAL_ERROR', undefined, 500);
  }
}
