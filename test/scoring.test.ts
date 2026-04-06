import { describe, it, expect } from 'vitest';
import {
  scoreLlmsTxt,
  scoreRobotsTxt,
  scoreAiTxt,
  scoreSitemap,
  computeScore,
  getTier,
  SCORE_VERSION,
} from '../src/lib/scoring';
import type { RobotsTxtResult, LlmsTxtResult, AiTxtResult, SitemapResult } from '../src/lib/parsers';

// ─── Helper factories ───

function makeLlms(overrides: Partial<LlmsTxtResult> = {}): LlmsTxtResult {
  return {
    exists: false, parseError: false, hasTitle: false, hasDescription: false,
    hasSections: false, hasValidLinks: false, correctMime: false,
    reasonableSize: false, rawContent: null, issues: [],
    ...overrides,
  };
}

function makeRobots(overrides: Partial<RobotsTxtResult> = {}): RobotsTxtResult {
  return {
    exists: false, parseError: false, aiBotsBlocked: [], aiBotsAllowed: [],
    hasWildcardBlock: false, rawContent: null, issues: [],
    ...overrides,
  };
}

function makeAi(overrides: Partial<AiTxtResult> = {}): AiTxtResult {
  return {
    exists: false, parseError: false, isExperimental: true,
    hasValidFormat: false, rawContent: null, issues: [],
    ...overrides,
  };
}

function makeSitemap(overrides: Partial<SitemapResult> = {}): SitemapResult {
  return { exists: false, accessible: false, rawContent: null, issues: [], ...overrides };
}

// ─── getTier ───

describe('getTier', () => {
  it('returns ai-ready for 90+', () => expect(getTier(90)).toBe('ai-ready'));
  it('returns ai-ready for 100', () => expect(getTier(100)).toBe('ai-ready'));
  it('returns getting-there for 70-89', () => expect(getTier(75)).toBe('getting-there'));
  it('returns needs-work for 50-69', () => expect(getTier(55)).toBe('needs-work'));
  it('returns not-configured for 0-49', () => expect(getTier(30)).toBe('not-configured'));
  it('returns not-configured for 0', () => expect(getTier(0)).toBe('not-configured'));
});

// ─── scoreLlmsTxt ───

describe('scoreLlmsTxt', () => {
  it('returns 0 when not exists', () => {
    expect(scoreLlmsTxt(makeLlms())).toBe(0);
  });

  it('returns 15 on parse error', () => {
    expect(scoreLlmsTxt(makeLlms({ exists: true, parseError: true }))).toBe(15);
  });

  it('returns 100 when perfect', () => {
    expect(scoreLlmsTxt(makeLlms({
      exists: true, hasTitle: true, hasDescription: true,
      hasSections: true, hasValidLinks: true, correctMime: true, reasonableSize: true,
    }))).toBe(100);
  });

  it('sums components correctly', () => {
    expect(scoreLlmsTxt(makeLlms({
      exists: true, hasTitle: true, hasDescription: true,
    }))).toBe(40);
  });
});

// ─── scoreRobotsTxt ───

describe('scoreRobotsTxt', () => {
  it('returns 0 when not exists', () => {
    expect(scoreRobotsTxt(makeRobots())).toBe(0);
  });

  it('returns 15 on parse error', () => {
    expect(scoreRobotsTxt(makeRobots({ exists: true, parseError: true }))).toBe(15);
  });

  it('returns 40 for wildcard block with no AI allowed', () => {
    expect(scoreRobotsTxt(makeRobots({
      exists: true, hasWildcardBlock: true, aiBotsAllowed: [],
    }))).toBe(40);
  });

  it('returns 15 when no AI-specific rules', () => {
    expect(scoreRobotsTxt(makeRobots({ exists: true }))).toBe(15);
  });

  it('scales with bot coverage', () => {
    const score = scoreRobotsTxt(makeRobots({
      exists: true, aiBotsBlocked: ['GPTBot', 'ClaudeBot'], aiBotsAllowed: ['Googlebot'],
    }));
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(100);
  });
});

// ─── scoreAiTxt ───

describe('scoreAiTxt', () => {
  it('returns 0 when not exists', () => expect(scoreAiTxt(makeAi())).toBe(0));
  it('returns 15 on parse error', () => expect(scoreAiTxt(makeAi({ exists: true, parseError: true }))).toBe(15));
  it('returns 30 for invalid format', () => expect(scoreAiTxt(makeAi({ exists: true }))).toBe(30));
  it('returns 80 for valid format', () => expect(scoreAiTxt(makeAi({ exists: true, hasValidFormat: true }))).toBe(80));
});

// ─── scoreSitemap ───

describe('scoreSitemap', () => {
  it('returns 0 when not exists', () => expect(scoreSitemap(makeSitemap())).toBe(0));
  it('returns 30 when exists but not accessible', () => expect(scoreSitemap(makeSitemap({ exists: true }))).toBe(30));
  it('returns 90 when exists and accessible', () => expect(scoreSitemap(makeSitemap({ exists: true, accessible: true }))).toBe(90));
});

// ─── computeScore ───

describe('computeScore', () => {
  it('returns 0 for all empty', () => {
    const result = computeScore(makeRobots(), makeLlms(), makeAi(), makeSitemap());
    expect(result.overall).toBe(0);
    expect(result.tier).toBe('not-configured');
    expect(result.scoreVersion).toBe(SCORE_VERSION);
  });

  it('uses GEO-first weighting (llms.txt heaviest)', () => {
    const llmsOnly = computeScore(makeRobots(), makeLlms({
      exists: true, hasTitle: true, hasDescription: true,
      hasSections: true, hasValidLinks: true, correctMime: true, reasonableSize: true,
    }), makeAi(), makeSitemap());

    const robotsOnly = computeScore(makeRobots({
      exists: true, aiBotsBlocked: Array(16).fill('').map((_, i) => `Bot${i}`),
    }), makeLlms(), makeAi(), makeSitemap());

    expect(llmsOnly.overall).toBeGreaterThan(robotsOnly.overall);
  });

  it('generates improvement suggestions', () => {
    const result = computeScore(makeRobots(), makeLlms(), makeAi(), makeSitemap());
    expect(result.improvements.length).toBeGreaterThan(0);
    expect(result.improvements[0].points).toBeGreaterThan(0);
  });

  it('sorts improvements by impact (highest first)', () => {
    const result = computeScore(makeRobots(), makeLlms(), makeAi(), makeSitemap());
    for (let i = 1; i < result.improvements.length; i++) {
      expect(result.improvements[i - 1].points).toBeGreaterThanOrEqual(result.improvements[i].points);
    }
  });

  it('includes domain in improvement links when provided', () => {
    const result = computeScore(makeRobots(), makeLlms(), makeAi(), makeSitemap(), 'example.com');
    const genLinks = result.improvements.filter(i => i.link.includes('generator'));
    genLinks.forEach(imp => {
      expect(imp.link).toContain('domain=example.com');
    });
  });

  it('overall never exceeds 100', () => {
    const result = computeScore(
      makeRobots({ exists: true, aiBotsBlocked: Array(16).fill('').map((_, i) => `Bot${i}`) }),
      makeLlms({ exists: true, hasTitle: true, hasDescription: true, hasSections: true, hasValidLinks: true, correctMime: true, reasonableSize: true }),
      makeAi({ exists: true, hasValidFormat: true }),
      makeSitemap({ exists: true, accessible: true }),
    );
    expect(result.overall).toBeLessThanOrEqual(100);
  });
});
