// llmstxt.codes Chrome Extension — Popup Script

const API_BASE = 'https://llmstxt.codes/api/v1';

const TIER_CONFIG = {
  'ai-ready': { label: 'AI-Ready', color: '#22c55e' },
  'getting-there': { label: 'Getting There', color: '#3b82f6' },
  'needs-work': { label: 'Needs Work', color: '#f59e0b' },
  'not-configured': { label: 'Not Configured', color: '#6b7280' },
};

const $ = (sel) => document.querySelector(sel);
const show = (el) => { el.style.display = ''; };
const hide = (el) => { el.style.display = 'none'; };

let currentDomain = '';

// Extract domain from current tab
async function getCurrentDomain() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url) return resolve(null);
      try {
        const url = new URL(tabs[0].url);
        if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'about:') {
          return resolve(null);
        }
        resolve(url.hostname);
      } catch {
        resolve(null);
      }
    });
  });
}

// Init
async function init() {
  const domain = await getCurrentDomain();
  if (!domain) {
    $('#domain-display').textContent = 'No scannable page';
    $('#scan-btn').disabled = true;
    $('#scan-btn').textContent = 'Not available';
    return;
  }
  currentDomain = domain;
  $('#domain-display').textContent = domain;
}

// Scan
async function runScan(domain) {
  hide($('#prompt'));
  hide($('#results'));
  hide($('#error'));
  show($('#loading'));

  try {
    const res = await fetch(`${API_BASE}/scan?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Scan failed' }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    renderResults(data, domain);
  } catch (err) {
    hide($('#loading'));
    show($('#error'));
    $('#error-msg').textContent = err.message || 'Scan failed';
  }
}

function renderResults(data, domain) {
  hide($('#loading'));
  show($('#results'));

  const tier = TIER_CONFIG[data.tier] || TIER_CONFIG['not-configured'];

  // Animate score circle
  const circle = $('#score-circle');
  const circumference = 2 * Math.PI * 50; // r=50
  const offset = circumference - (data.score / 100) * circumference;
  circle.style.stroke = tier.color;
  circle.style.transition = 'stroke-dashoffset 1s ease-out';
  requestAnimationFrame(() => {
    circle.style.strokeDashoffset = offset;
  });

  // Animate score number
  animateValue($('#score-num'), 0, data.score, 800);
  $('#score-label').textContent = tier.label;
  $('#score-label').style.fill = tier.color;

  // Sub-scores
  const subs = [
    { name: 'llms.txt', key: 'llmsTxt', weight: '44%' },
    { name: 'robots.txt', key: 'robotsTxt', weight: '28%' },
    { name: 'sitemap.xml', key: 'sitemap', weight: '17%' },
    { name: 'ai.txt', key: 'aiTxt', weight: '11%' },
  ];

  $('#sub-scores').innerHTML = subs.map(s => {
    const val = data.subScores[s.key] || 0;
    const icon = val > 0 ? '✅' : '❌';
    const color = val > 0 ? '#22c55e' : '#e5e7eb';
    return `<div class="sub-item">
      <div class="sub-item-header">
        <span class="sub-icon">${icon}</span>
        <span class="sub-name">${esc(s.name)}</span>
        <span class="sub-weight">${s.weight}</span>
      </div>
      <div class="sub-bar"><div class="sub-bar-fill" style="width:${Math.max(val, 2)}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  // Improvements
  if (data.improvements && data.improvements.length > 0) {
    show($('#improvements'));
    $('#improvements-list').innerHTML = data.improvements.slice(0, 3).map(imp =>
      `<a href="https://llmstxt.codes${esc(imp.link)}" target="_blank" class="imp-item">
        <span class="imp-action">${esc(imp.action)}</span>
        <span class="imp-pts">+${imp.points} pts</span>
      </a>`
    ).join('');
  } else {
    hide($('#improvements'));
  }

  // Actions
  $('#full-report').href = `https://llmstxt.codes/report/${encodeURIComponent(domain)}`;
}

function animateValue(el, start, end, duration) {
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (end - start) * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Event listeners
$('#scan-btn').addEventListener('click', () => {
  if (currentDomain) runScan(currentDomain);
});

$('#retry-btn').addEventListener('click', () => {
  if (currentDomain) runScan(currentDomain);
});

$('#rescan-btn').addEventListener('click', () => {
  if (currentDomain) runScan(currentDomain);
});

init();
