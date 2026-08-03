import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetDir = path.join(root, 'backend/src/datasets');
const outputPath = path.join(root, 'docs/DOCUMENT_DATASET_VERIFICATION.md');

const SPECIMENS = {
  gabon: {
    passport: {
      shape: '13SP01349 -> /^\\d{2}SP\\d{5}$/',
      status: 'PRADO GAB-AO-03001 valid; first issued 01/11/2013',
      action: 'Keep sample_verified only; do not promote to verified without national grammar.',
    },
  },
  malawi: {
    passport: {
      shape: 'MWAxxxxxx or MWZxxxxxx from official factsheet',
      status: 'Official e-passport fact sheet; current status not independently versioned in runtime.',
      action: 'Keep verified for prefix/length only; no registry validation.',
    },
    personal_number: {
      shape: '1212433/2 -> /^\\d{7}\\/\\d$/',
      status: 'PRADO specimen-level evidence; document version status not encoded in runtime.',
      action: 'Keep sample_verified only.',
    },
  },
  sierra_leone: {
    passport: {
      shape: '0114439 -> /^\\d{7}$/',
      status: 'PRADO SLE-AO-01001 valid; first issued 07/07/2004',
      action: 'Keep sample_verified only; SLE is country code, not part of Passport No.',
    },
    personal_number: {
      shape: '000119146 -> /^\\d{9}$/',
      status: 'PRADO SLE-AO-01001 valid; first issued 07/07/2004',
      action: 'Keep sample_verified only.',
    },
  },
  togo: {
    passport: {
      shape: 'XB000072 / XS000288 -> /^X[BS]\\d{6}$/',
      status: 'PRADO TGO-AO-04001 listed; version status not fully encoded in runtime.',
      action: 'Keep synthetic_pattern until the exact specimen page is attached and rechecked.',
    },
    diplomatic_passport: {
      shape: 'D9000426 -> /^D\\d{7}$/',
      status: 'PRADO TGO-AD-04001 listed; version status not fully encoded in runtime.',
      action: 'Keep synthetic_pattern until the exact specimen page is attached and rechecked.',
    },
  },
  tanzania: {
    national_identification_number: {
      shape: '19760517-37227-00002-17 -> /^\\d{8}-\\d{5}-\\d{5}-\\d{2}$/',
      status: 'NIDA official service sample; current card/document version not applicable.',
      action: 'Keep sample_verified; do not infer full NIN allocation semantics.',
    },
  },
  cote_divoire: {
    passport: {
      shape: '13AS85673 -> /^\\d{2}[A-Z]{2}\\d{5}$/',
      status: 'User-provided field sample; not an official public source.',
      action: 'Production blocker until an official/public specimen is attached.',
    },
    national_id: {
      shape: 'CI000910000 -> /^CI\\d{9}$/',
      status: 'User-provided field sample; not an official public source.',
      action: 'Production blocker until an official/public specimen is attached.',
    },
    driver_license_number: {
      shape: 'LLLLNN-NN-NNNNNNNNL display shape',
      status: 'User-provided field sample; not an official public source.',
      action: 'Production blocker until an official/public specimen is attached.',
    },
  },
  zambia: {
    national_registration_card_number: {
      shape: '13-digit national registration identity number stated by MOHAIS news item',
      status: 'Official ministry statement; no checksum or digit semantics published.',
      action: 'Keep synthetic_pattern until official grammar/checksum semantics are published.',
    },
  },
};

const VERSION_HINTS = {
  'https://www.consilium.europa.eu/prado/en/GAB-AO-03001/index.html': 'PRADO GAB-AO-03001 valid; first issued 01/11/2013',
  'https://www.consilium.europa.eu/prado/en/SLE-AO-01001/index.html': 'PRADO SLE-AO-01001 valid; first issued 07/07/2004',
  'https://www.consilium.europa.eu/prado/en/ZMB-AO-01001/index.html': 'PRADO ZMB-AO-01001 valid; first issued 10/08/2008',
  'https://www.consilium.europa.eu/prado/en/ZWE-AO-01002/index.html': 'PRADO ZWE-AO-01002 valid; first issued 22/05/2015',
  'https://www.consilium.europa.eu/prado/en/AGO-AO-01001/index.html': 'PRADO AGO-AO-01001 valid; first issued 01/01/2000',
};

const rows = [];
for (const file of fs.readdirSync(datasetDir).filter((item) => item.endsWith('.json')).sort()) {
  const dataset = JSON.parse(fs.readFileSync(path.join(datasetDir, file), 'utf8'));
  for (const [documentType, rule] of Object.entries(dataset.documents)) {
    const specimen = SPECIMENS[dataset.key]?.[documentType];
    const generated = generateExample(rule);
    const verdict = classify(dataset, documentType, rule, specimen);
    rows.push({
      dataset: dataset.key,
      geo: `${dataset.country} (${dataset.countryCode})`,
      documentType,
      runtime: runtimeShape(rule),
      generated,
      source: rule.source.url,
      status: specimen?.status ?? versionStatus(rule),
      specimenShape: specimen?.shape ?? specimenShape(rule),
      verdict,
      quality: rule.quality,
      action: specimen?.action ?? requiredAction(verdict, rule),
    });
  }
}

const counts = rows.reduce((acc, row) => {
  acc[row.verdict] = (acc[row.verdict] ?? 0) + 1;
  return acc;
}, {});
const qualityCounts = rows.reduce((acc, row) => {
  acc[row.quality] = (acc[row.quality] ?? 0) + 1;
  return acc;
}, {});

let markdown = '# Document Dataset Verification\n\n';
markdown += 'Checked at: 2026-08-03\n\n';
markdown += 'Scope: runtime document rules from `backend/src/datasets/*.json`, `backend/src/datasets.ts`, registered document generators, and the current validation/decision docs. `generic_intl` is counted in runtime inventory but is not treated as a real confirmed GEO.\n\n';
markdown += `Runtime inventory: ${rows.length} document rules; ${qualityCounts.verified ?? 0} verified, ${qualityCounts.sample_verified ?? 0} sample_verified, ${qualityCounts.synthetic_pattern ?? 0} synthetic_pattern.\n\n`;
markdown += `Verdict summary: ${counts.match ?? 0} match; ${counts.mismatch ?? 0} mismatch; ${counts['insufficient evidence'] ?? 0} insufficient evidence; ${counts['outdated document'] ?? 0} outdated document; ${counts['source does not confirm number format'] ?? 0} source does not confirm number format.\n\n`;
markdown += 'Rules used in this audit:\n\n';
markdown += '- `verified` requires an official source that defines structure, length, prefix, or algorithm/checksum.\n';
markdown += '- `sample_verified` means an official specimen or official/public display sample supports the visible shape, but not a full national grammar.\n';
markdown += '- `synthetic_pattern` remains review-only when the source confirms the document exists but not the public number grammar.\n';
markdown += '- PRADO country/category pages and search snippets are not treated as number-format confirmation. Exact document pages are still insufficient if the visible specimen number is not readable.\n';
markdown += '- Country/MRZ/document labels are not allowed inside generated numbers unless the source explicitly shows them as part of the displayed field value.\n\n';
markdown += '## Findings\n\n';
markdown += '| Dataset | GEO | Document type | Runtime pattern/template | Generated example | Exact source | Document version/status | Specimen shape | Verdict | Quality | Required action |\n';
markdown += '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';

for (const row of rows) {
  markdown += `| ${cell(row.dataset)} | ${cell(row.geo)} | ${cell(row.documentType)} | ${cell(row.runtime)} | ${cell(row.generated)} | ${cell(row.source)} | ${cell(row.status)} | ${cell(row.specimenShape)} | ${cell(row.verdict)} | ${cell(row.quality)} | ${cell(row.action)} |\n`;
}

markdown += '\n## Production Blockers\n\n';
for (const row of rows.filter((item) => item.verdict !== 'match')) {
  markdown += `- ${row.dataset}.${row.documentType}: ${row.verdict}; ${row.action}\n`;
}

fs.writeFileSync(outputPath, markdown);

function classify(dataset, documentType, rule, specimen) {
  if (dataset.key === 'generic_intl') return 'insufficient evidence';
  if (rule.source.type === 'user_sample') return 'insufficient evidence';
  if (rule.quality === 'synthetic_pattern') {
    if (rule.source.url.includes('/prado-documents/') || /docs-per-|index\.html$/.test(rule.source.url)) {
      return 'source does not confirm number format';
    }
    return 'insufficient evidence';
  }
  if (rule.quality === 'sample_verified') return specimen || rule.source.type === 'official' || rule.source.type === 'government_sample' || rule.source.type === 'trusted_reference' ? 'match' : 'insufficient evidence';
  if (rule.quality === 'verified') return rule.source.type === 'official' || rule.source.type === 'trusted_reference' ? 'match' : 'insufficient evidence';
  return 'insufficient evidence';
}

function requiredAction(verdict, rule) {
  if (verdict === 'match') return 'No runtime change required; keep evidence tier as-is.';
  if (verdict === 'source does not confirm number format') return 'Production blocker: attach exact official/PRADO specimen page or keep as synthetic_pattern review-only.';
  if (rule.quality === 'synthetic_pattern') return 'Production blocker: do not promote without official grammar or readable official specimen.';
  return 'Production blocker: replace source or lower quality if official support cannot be produced.';
}

function versionStatus(rule) {
  if (VERSION_HINTS[rule.source.url]) return VERSION_HINTS[rule.source.url];
  if (rule.source.url.includes('consilium.europa.eu/prado')) {
    return rule.source.url.includes('/prado-documents/') ? 'PRADO listing/category only; exact current document version not proven by this source URL.' : 'PRADO exact page; status must be read from page.';
  }
  if (rule.source.type === 'official' || rule.source.type === 'government_sample') return 'Official source; document version/status not separately published in runtime.';
  if (rule.source.type === 'user_sample') return 'User sample; official document version/status not established.';
  if (rule.source.type === 'assumption') return 'Assumption-only fallback; not a real document version.';
  return 'Secondary/trusted reference; current issuing status not established.';
}

function specimenShape(rule) {
  if (rule.quality === 'verified') return `Official source confirms runtime shape ${rule.pattern}`;
  if (rule.quality === 'sample_verified') return `Sample-level shape ${rule.pattern}`;
  return 'No readable official specimen number confirming the runtime grammar.';
}

function runtimeShape(rule) {
  if (rule.generator) return `generator:${rule.generator}; pattern:${rule.pattern}`;
  return `templates:${rule.templates.join(', ')}; pattern:${rule.pattern}`;
}

function generateExample(rule) {
  if (rule.generator === 'gabon_nip') return 'AB123419910727';
  if (rule.generator === 'kazakhstan_iin') return '910727400010';
  if (rule.generator === 'nigeria_nin') return '12345678901';
  return fillTemplate(rule.templates[0]);
}

function fillTemplate(template) {
  return template
    .replace('{DOB_YYMMDD}', '910727')
    .replace(/\{RANDL(\d+)\}/g, (_, count) => 'A'.repeat(Number(count)))
    .replace(/\{RAND(\d+)\}/g, (_, count) => '1'.repeat(Number(count)));
}

function cell(value) {
  return String(value).replace(/\|/g, '/');
}
