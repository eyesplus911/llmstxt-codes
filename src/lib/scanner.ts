/**
 * Client-side scanner orchestrator.
 * Fetches raw files via Worker proxy, parses client-side, computes score.
 */

import {
  parseRobotsTxt,
  parseLlmsTxt,
  parseAiTxt,
  parseSitemap,
} from '../lib/parsers';
import type { FetchResult, ParsedResults } from '../lib/parsers';
import { computeScore, SCORE_VERSION } from '../lib/scoring';
import type { ScoreResult } from '../lib/scoring';

export interface ScanResult {
  domain: string;
  fetchResult: FetchResult;
  parsed: ParsedResults;
  score: ScoreResult;
  savedAt: string | null;
}

/** Run a full domain scan: fetch → parse → score → save */
export async function scanDomain(domain: string, force = false): Promise<ScanResult> {
  // 1. Fetch raw files via Worker proxy
  const fetchUrl = `/api/v1/fetch?domain=${encodeURIComponent(domain)}${force ? '&force=1' : ''}`;
  const res = await fetch(fetchUrl);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'INTERNAL_ERROR', message: 'Fetch failed' }));
    throw new Error(err.message || 'Failed to fetch domain files');
  }

  const fetchResult: FetchResult = await res.json();

  // 2. Parse all files client-side
  const parsed: ParsedResults = {
    robotsTxt: parseRobotsTxt(fetchResult.robotsTxt),
    llmsTxt: parseLlmsTxt(fetchResult.llmsTxt),
    aiTxt: parseAiTxt(fetchResult.aiTxt),
    sitemap: parseSitemap(fetchResult.sitemapXml),
  };

  // 3. Compute score
  const score = computeScore(parsed.robotsTxt, parsed.llmsTxt, parsed.aiTxt, parsed.sitemap, fetchResult.domain);

  // 4. Save to D1 via Worker
  let savedAt: string | null = null;
  try {
    const saveRes = await fetch('/api/v1/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: fetchResult.domain,
        score: score.overall,
        subScores: score.subScores,
        scoreVersion: SCORE_VERSION,
        results: { fetchResult, parsed, score },
      }),
    });
    if (saveRes.ok) {
      savedAt = new Date().toISOString();
    }
  } catch {
    // Save failure is non-critical — UI still works
    console.warn('Failed to save scan results');
  }

  return { domain: fetchResult.domain, fetchResult, parsed, score, savedAt };
}

/** Normalize user input to a clean domain */
export function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/\/.*$/, '');
  domain = domain.replace(/:\d+$/, '');
  return domain;
}
