/**
 * Domain validation with SSRF protection.
 * Rejects IPs, localhost, private ranges, and internal CF domains.
 */

import psl from 'psl';

const BLOCKED_TLDS = ['.local', '.internal', '.localhost'];
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
const BLOCKED_DOMAINS = ['.workers.dev', '.pages.dev'];

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export interface DomainValidation {
  valid: boolean;
  domain: string;
  error?: string;
}

export function validateDomain(input: string): DomainValidation {
  // Strip protocol and path
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/\/.*$/, '');
  domain = domain.replace(/:\d+$/, ''); // strip port

  if (!domain) {
    return { valid: false, domain: '', error: 'Empty domain' };
  }

  // Block IPs
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    return { valid: false, domain, error: 'IP addresses are not allowed' };
  }

  // Block IPv6
  if (domain.startsWith('[') || domain.includes('::')) {
    return { valid: false, domain, error: 'IPv6 addresses are not allowed' };
  }

  // Block localhost and known internal hosts
  if (BLOCKED_HOSTS.includes(domain)) {
    return { valid: false, domain, error: 'Internal hosts are not allowed' };
  }

  // Block internal TLDs
  for (const tld of BLOCKED_TLDS) {
    if (domain.endsWith(tld)) {
      return { valid: false, domain, error: `${tld} domains are not allowed` };
    }
  }

  // Block Cloudflare internal domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith(blocked)) {
      return { valid: false, domain, error: 'Internal platform domains are not allowed' };
    }
  }

  // Validate with PSL
  const parsed = psl.parse(domain);
  if ('error' in parsed && parsed.error) {
    return { valid: false, domain, error: 'Invalid domain name' };
  }

  // Basic format check
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
    return { valid: false, domain, error: 'Invalid domain format' };
  }

  return { valid: true, domain };
}

/** Build fetch URLs for a domain's AI-related files */
export function buildFetchUrls(domain: string) {
  return {
    robotsTxt: `https://${domain}/robots.txt`,
    llmsTxt: `https://${domain}/llms.txt`,
    aiTxt: `https://${domain}/ai.txt`,
    sitemapXml: `https://${domain}/sitemap.xml`,
  };
}
