/**
 * AI Readiness Score computation.
 * Runs client-side. Uses descriptive tiers (not letter grades).
 *
 * GEO-first scoring (v2): weights redistributed across implemented components.
 * Target weights (v3, when meta+headers ship):
 *   llms.txt 40%, robots.txt 25%, sitemap 15%, ai.txt 10%, meta 5%, headers 5%
 *
 * Current effective weights (4 components, 100% total):
 *   llms.txt    44%
 *   robots.txt  28%
 *   sitemap     17%
 *   ai.txt      11%
 *   meta tags    0% (v3)
 *   headers      0% (v3)
 */

import type {
  RobotsTxtResult,
  LlmsTxtResult,
  AiTxtResult,
  SitemapResult,
} from './parsers';

export const SCORE_VERSION = 2;

export interface SubScores {
  llmsTxt: number;
  robotsTxt: number;
  sitemap: number;
  aiTxt: number;
  meta: number;
  headers: number;
}

export interface ScoreResult {
  overall: number;
  tier: ScoreTier;
  subScores: SubScores;
  scoreVersion: number;
  improvements: Improvement[];
}

export interface Improvement {
  action: string;
  points: number;
  type: 'llms-txt' | 'robots-txt' | 'ai-txt' | 'sitemap' | 'meta' | 'headers';
  link: string;
}

export type ScoreTier = 'ai-ready' | 'getting-there' | 'needs-work' | 'not-configured';

export const TIER_CONFIG = {
  'ai-ready': { label: 'AI-Ready', min: 90, color: '#22c55e', bg: '#f0fdf4' },
  'getting-there': { label: 'Getting There', min: 70, color: '#3b82f6', bg: '#eff6ff' },
  'needs-work': { label: 'Needs Work', min: 50, color: '#f59e0b', bg: '#fffbeb' },
  'not-configured': { label: 'Not Configured', min: 0, color: '#6b7280', bg: '#f9fafb' },
} as const;

export function getTier(score: number): ScoreTier {
  if (score >= 90) return 'ai-ready';
  if (score >= 70) return 'getting-there';
  if (score >= 50) return 'needs-work';
  return 'not-configured';
}

/** Compute llms.txt sub-score (0-100) */
export function scoreLlmsTxt(r: LlmsTxtResult): number {
  if (!r.exists) return 0;
  if (r.parseError) return 15;

  let score = 0;
  if (r.hasTitle) score += 20;
  if (r.hasDescription) score += 20;
  if (r.hasSections) score += 20;
  if (r.hasValidLinks) score += 20;
  if (r.correctMime) score += 10;
  if (r.reasonableSize) score += 10;
  return score;
}

/** Compute robots.txt sub-score (0-100) based on AI bot configuration */
export function scoreRobotsTxt(r: RobotsTxtResult): number {
  if (!r.exists) return 0;
  if (r.parseError) return 15;

  // Score based on intentionality of AI bot management
  const totalBots = 16; // AI_BOTS.length
  const mentionedBots = r.aiBotsBlocked.length + r.aiBotsAllowed.length;

  if (r.hasWildcardBlock && r.aiBotsAllowed.length === 0) {
    // Blanket block — they made a choice, but it's aggressive
    return 40;
  }

  if (mentionedBots === 0) {
    // No AI-specific rules at all
    return 15;
  }

  // Proportional: more bots explicitly managed = better
  const coverage = mentionedBots / totalBots;
  return Math.min(100, Math.round(40 + coverage * 60));
}

/** Compute ai.txt sub-score */
export function scoreAiTxt(r: AiTxtResult): number {
  if (!r.exists) return 0;
  if (r.parseError) return 15;
  if (!r.hasValidFormat) return 30;
  return 80; // ai.txt is experimental, give credit for having it
}

/** Compute sitemap sub-score */
export function scoreSitemap(r: SitemapResult): number {
  if (!r.exists) return 0;
  if (!r.accessible) return 30;
  return 90; // exists and accessible
}

/** Compute overall score with weighted formula */
export function computeScore(
  robotsTxt: RobotsTxtResult,
  llmsTxt: LlmsTxtResult,
  aiTxt: AiTxtResult,
  sitemap: SitemapResult,
  domain?: string
): ScoreResult {
  const subScores: SubScores = {
    llmsTxt: scoreLlmsTxt(llmsTxt),
    robotsTxt: scoreRobotsTxt(robotsTxt),
    sitemap: scoreSitemap(sitemap),
    aiTxt: scoreAiTxt(aiTxt),
    meta: 0, // TODO: implement meta tag scanning
    headers: 0, // TODO: implement header scanning
  };

  // GEO-first weights: llms.txt is the primary signal
  const overall = Math.round(
    subScores.llmsTxt * 0.44 +
    subScores.robotsTxt * 0.28 +
    subScores.sitemap * 0.17 +
    subScores.aiTxt * 0.11
  );

  const improvements: Improvement[] = [];

  const dq = domain ? `?domain=${encodeURIComponent(domain)}` : '';

  if (subScores.llmsTxt === 0) {
    improvements.push({
      action: 'Create llms.txt',
      points: 44,
      type: 'llms-txt',
      link: `/tools/generator/llms-txt${dq}`,
    });
  } else if (subScores.llmsTxt < 80) {
    improvements.push({
      action: 'Improve your llms.txt',
      points: Math.round((100 - subScores.llmsTxt) * 0.44),
      type: 'llms-txt',
      link: '/learn/llms-txt',
    });
  }

  if (subScores.robotsTxt === 0) {
    improvements.push({
      action: 'Add AI bot rules to robots.txt',
      points: 28,
      type: 'robots-txt',
      link: `/tools/generator/robots-txt${dq}`,
    });
  } else if (subScores.robotsTxt < 60) {
    improvements.push({
      action: 'Configure more AI bots in robots.txt',
      points: Math.round((100 - subScores.robotsTxt) * 0.28),
      type: 'robots-txt',
      link: '/learn/robots-txt',
    });
  }

  if (subScores.sitemap === 0) {
    improvements.push({
      action: 'Add sitemap.xml',
      points: 17,
      type: 'sitemap',
      link: '/learn/sitemap',
    });
  }

  if (subScores.aiTxt === 0) {
    improvements.push({
      action: 'Create ai.txt (experimental)',
      points: 11,
      type: 'ai-txt',
      link: `/tools/generator/ai-txt${dq}`,
    });
  }

  // Sort by impact
  improvements.sort((a, b) => b.points - a.points);

  return {
    overall,
    tier: getTier(overall),
    subScores,
    scoreVersion: SCORE_VERSION,
    improvements: improvements.slice(0, 3), // Top 3
  };
}
