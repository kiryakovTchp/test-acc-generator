import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetDir = path.join(root, 'backend/src/datasets');
const outputPath = path.join(root, 'docs/DOCUMENT_DATASET_VERIFICATION.md');

const EVIDENCE = {
  'burkina_faso.national_personal_identification_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://autriche.diplomatie.gov.bf/index.php/services/passeport/',
    description: 'Passport requirements state that the personal identification number (N.I.P.) on the CNIB has 17 digits.',
    observedShape: '^\\d{17}$',
    versionStatus: 'Official passport-service requirements page; document version not separately applicable.',
    requiredAction: 'Keep verified for public shape only; no checksum or registry validation.',
  },
  'ethiopia.fayda_identification_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://id.gov.et/',
    description: 'National ID Program page states that a Fayda Number is a 12 digit unique identification number issued by NIDP.',
    observedShape: '^\\d{12}$',
    versionStatus: 'Official Fayda/NIDP page; document version not separately applicable.',
    requiredAction: 'Keep verified for public shape only; no live assignment validation.',
  },
  'gabon.passport': {
    type: 'readable_specimen',
    status: 'current',
    url: 'https://www.consilium.europa.eu/prado/en/GAB-AO-03001/index.html',
    description: 'PRADO current ordinary passport specimen shows Passport No. 13SP01349.',
    observedShape: '13SP01349 -> /^\\d{2}SP\\d{5}$/',
    versionStatus: 'PRADO GAB-AO-03001 valid; first issued 01/11/2013.',
    requiredAction: 'Keep sample_verified only; do not promote without national grammar.',
  },
  'ghana.ghana_card_pin': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://register.nia.gov.gh/faqs',
    description: 'NIA FAQ states Ghanaian PINs start with country code GHA followed by ten digits, displayed as GHA-000000000-0.',
    observedShape: '^GHA-\\d{9}-\\d$',
    versionStatus: 'Official NIA FAQ; document version not separately applicable.',
    requiredAction: 'Keep verified for public display shape only.',
  },
  'ireland.pps_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://www.gov.ie/en/department-of-social-protection/services/get-a-personal-public-service-pps-number/',
    description: 'Official PPS page defines the PPS number as seven numbers followed by either one or two letters.',
    observedShape: '^\\d{7}[A-Z]{1,2}$',
    versionStatus: 'Official service page; document version not applicable because this is PPS, not an ID card.',
    requiredAction: 'Keep verified; keep type as PPS rather than national ID document.',
  },
  'ireland.passport_card_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://www.oireachtas.ie/en/debates/question/2022-09-08/767/',
    description: 'Official parliamentary answer states passport card numbers begin with C followed by eight digits.',
    observedShape: '^C\\d{8}$',
    versionStatus: 'Official parliamentary answer; passport-card version not separately encoded.',
    requiredAction: 'Keep verified for public shape only.',
  },
  'kazakhstan.iin': {
    type: 'explicit_grammar',
    sources: [
      {
        status: 'current',
        purpose: 'checksum_and_length',
        url: 'https://adilet.zan.kz/rus/docs/V2300032942',
        description: 'Order of the Minister of Internal Affairs of Kazakhstan No. 521 defines IIN as a unique 12-digit combination and publishes the two-cycle mod 11 control digit algorithm.',
      },
      {
        status: 'historical',
        purpose: 'historical_semantic_evidence',
        url: 'https://adilet.zan.kz/rus/docs/P030000565_',
        description: 'Government Resolution No. 565 transition program describes the citizen-style digit structure: first six digits as YYMMDD birth date, seventh digit as sex/century, digits 8-11 as registration sequence, and digit 12 as the control digit.',
      },
    ],
    description: 'Current Ministry of Internal Affairs rules define IIN as a unique 12-digit combination and publish the two-cycle mod 11 control digit algorithm. Official Kazakhstan transition program describes the citizen-style digit structure: first six digits as YYMMDD birth date, seventh digit as sex/century, digits 8-11 as registration sequence, and digit 12 as the control digit.',
    observedShape: '^\\d{12}$ citizen-style generation with digits 1-6 = YYMMDD birth date, digit 7 = sex/century (odd male, even female; 3/4 for 20th century, 5/6 for 21st), digits 8-11 = synthetic registration sequence, and digit 12 calculated from the first 11 digits using weights 1..11 then 3..11,1,2 when the first result is 10.',
    versionStatus: 'Order of the Minister of Internal Affairs of Kazakhstan No. 521 dated 29/06/2023 and Government Resolution No. 565 transition program dated 11/06/2003; both viewed on Adilet updated 31/07/2026.',
    requiredAction: 'Keep verified for citizen-style synthetic generation. Existing assigned IIN validation must be limited to 12 digits and checksum; do not reject assigned IINs on DOB, sex, or century semantics because foreigner and historical registrations can contain exceptions. Generated values are not checked against the live government registry.',
  },
  'malawi.passport': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://www.malawiembassy.de/.cm4all/uproc.php/0/MALAWI%20e-PASSPORT.pdf?_=1766b210d8f&cdp=a',
    description: 'Official e-passport factsheet states ordinary passport numbering prefixes MWAxxxxxx for 36 pages and MWZxxxxxx for 48 pages.',
    observedShape: '^MW[AZ]\\d{6}$',
    versionStatus: 'Official e-passport factsheet; current status not independently versioned in runtime.',
    requiredAction: 'Keep verified for prefix/length only; no registry validation.',
  },
  'malawi.personal_number': {
    type: 'readable_specimen',
    status: 'current',
    url: 'https://www.consilium.europa.eu/prado/en/prado-documents/mwi/a/docs-per-category.html',
    description: 'PRADO specimen context shows Personal No. 1212433/2.',
    observedShape: '1212433/2 -> /^\\d{7}\\/\\d$/',
    versionStatus: 'PRADO specimen-level evidence; exact version status not encoded in runtime source URL.',
    requiredAction: 'Keep sample_verified only.',
  },
  'mozambique.tax_identification_number_nuit': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://www.at.gov.mz/eng/Perguntas-Frequentes2/NUIT',
    description: 'Mozambique Revenue Authority FAQ defines NUIT as a unique taxpayer identification number containing nine digits.',
    observedShape: '^\\d{9}$',
    versionStatus: 'Official tax authority FAQ; document version not applicable.',
    requiredAction: 'Keep verified for public shape only; no checksum implemented.',
  },
  'namibia.national_identity_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://mhaiss.gov.na/documents/292728/553941/Identification%2BAct%2B21%2Bof%2B1996.pdf/f74661d2-8cbe-b31f-5249-ebc90d4988eb?download=true&t=1665685065951&version=1.0',
    description: 'Identification Act source defines identity number as the eleven-digit number assigned to a person.',
    observedShape: '^\\d{11}$',
    versionStatus: 'Official act text; document/card version not separately encoded.',
    requiredAction: 'Keep verified for public shape only.',
  },
  'nigeria.nin': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://www.nimc.gov.ng/',
    description: 'NIMC public material defines NIN as an 11-digit number.',
    observedShape: '^\\d{11}$',
    versionStatus: 'Official NIMC source; document version not applicable.',
    requiredAction: 'Keep verified for length only; no registry validation.',
  },
  'senegal.ecowas_id_card_number': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://dge.sn/decret-n-2016-1536-du-29-septembre-2016-portant-application-de-la-loi-n-2016-09-du-14-mars-2016-instituant-une-carte-didentite-biometrique-cedeao-publie-au-jors-n-6965-du-5/',
    description: 'Senegal decree directly states that the ECOWAS biometric identity card number contains 17 digits.',
    observedShape: '^\\d{17}$',
    versionStatus: 'Official decree for ECOWAS biometric identity card implementation.',
    requiredAction: 'Keep verified for public shape only; runtime does not implement semantic components.',
  },
  'sierra_leone.passport': {
    type: 'readable_specimen',
    status: 'current',
    url: 'https://www.consilium.europa.eu/prado/en/SLE-AO-01001/index.html',
    description: 'PRADO specimen shows Passport No. 0114439; SLE is country code, not the passport number.',
    observedShape: '0114439 -> /^\\d{7}$/',
    versionStatus: 'PRADO SLE-AO-01001 valid; first issued 07/07/2004.',
    requiredAction: 'Keep sample_verified only.',
  },
  'sierra_leone.personal_number': {
    type: 'readable_specimen',
    status: 'current',
    url: 'https://www.consilium.europa.eu/prado/en/SLE-AO-01001/index.html',
    description: 'PRADO specimen shows Personal No. 000119146.',
    observedShape: '000119146 -> /^\\d{9}$/',
    versionStatus: 'PRADO SLE-AO-01001 valid; first issued 07/07/2004.',
    requiredAction: 'Keep sample_verified only.',
  },
  'tanzania.national_identification_number': {
    type: 'readable_specimen',
    status: 'current',
    url: 'https://services.nida.go.tz/requestctrnm',
    description: 'Official NIDA service displays sample NIN 19760517-37227-00002-17.',
    observedShape: '19760517-37227-00002-17 -> /^\\d{8}-\\d{5}-\\d{5}-\\d{2}$/',
    versionStatus: 'Official NIDA service sample; card/document version not applicable.',
    requiredAction: 'Keep sample_verified only; do not infer full allocation semantics.',
  },
  'uzbekistan.pinfl': {
    type: 'explicit_grammar',
    status: 'current',
    url: 'https://my.gov.uz/en/static/jshshir-for-foreigners',
    description: 'Official my.gov.uz page defines PINFL/JSHSHIR as a 14-digit personal identification number.',
    observedShape: '^\\d{14}$',
    versionStatus: 'Official my.gov.uz service page; document version not applicable.',
    requiredAction: 'Keep verified for public shape only.',
  },
};

const VERSION_HINTS = {
  'https://www.consilium.europa.eu/prado/en/ZMB-AO-01001/index.html': 'PRADO ZMB-AO-01001 valid; first issued 10/08/2008.',
  'https://www.consilium.europa.eu/prado/en/ZWE-AO-01002/index.html': 'PRADO ZWE-AO-01002 valid; first issued 22/05/2015.',
  'https://www.consilium.europa.eu/prado/en/AGO-AO-01001/index.html': 'PRADO AGO-AO-01001 valid; first issued 01/01/2000.',
};

const rows = [];
for (const file of fs.readdirSync(datasetDir).filter((item) => item.endsWith('.json')).sort()) {
  const dataset = JSON.parse(fs.readFileSync(path.join(datasetDir, file), 'utf8'));
  for (const [documentType, rule] of Object.entries(dataset.documents)) {
    const key = `${dataset.key}.${documentType}`;
    const evidence = EVIDENCE[key];
    const generated = generateExample(rule);
    const verdict = classify(rule, evidence);
    rows.push({
      dataset: dataset.key,
      geo: `${dataset.country} (${dataset.countryCode})`,
      documentType,
      runtime: runtimeShape(rule),
      generated,
      source: evidence ? formatEvidenceSources(evidence) : rule.source.url,
      evidenceType: evidence?.type ?? 'none',
      evidenceStatus: evidence ? evidenceStatus(evidence) : 'none',
      evidenceDescription: evidence?.description ?? 'No independent evidence entry. Runtime quality/source type was not used as proof.',
      status: evidence?.versionStatus ?? versionStatus(rule),
      observedShape: evidence?.observedShape ?? 'none',
      verdict,
      quality: rule.quality,
      action: evidence?.requiredAction ?? requiredAction(verdict, rule),
    });
  }
}

const counts = countBy(rows, (row) => row.verdict);
const qualityCounts = countBy(rows, (row) => row.quality);

let markdown = '# Document Dataset Verification\n\n';
markdown += 'Checked at: 2026-08-03\n\n';
markdown += 'Scope: runtime document rules from `backend/src/datasets/*.json`, `backend/src/datasets.ts`, registered document generators, and the current validation/decision docs. `generic_intl` is counted in runtime inventory but is not treated as a real confirmed GEO.\n\n';
markdown += `Runtime inventory: ${rows.length} document rules; ${qualityCounts.verified ?? 0} verified, ${qualityCounts.sample_verified ?? 0} sample_verified, ${qualityCounts.synthetic_pattern ?? 0} synthetic_pattern.\n\n`;
markdown += `Verdict summary: ${counts.match ?? 0} match; ${counts.mismatch ?? 0} mismatch; ${counts['insufficient evidence'] ?? 0} insufficient evidence; ${counts['outdated document'] ?? 0} outdated document; ${counts['source does not confirm number format'] ?? 0} source does not confirm number format.\n\n`;
markdown += 'Methodology:\n\n';
markdown += '- `match` requires an explicit evidence registry entry independent of runtime quality and runtime pattern.\n';
markdown += '- Evidence sources carry machine-readable `current`, `historical`, `outdated`, or `unknown` status. A historical source may support generated semantics, but cannot by itself prove a mandatory current rule.\n';
markdown += '- `verified` can be `match` only with `explicit_grammar` evidence.\n';
markdown += '- `sample_verified` can be `match` only with `readable_specimen` evidence.\n';
markdown += '- PRADO country/category pages, government service pages, secondary PDFs, and `source.type` do not by themselves confirm document-number format.\n';
markdown += '- Country/MRZ/document labels are not allowed inside generated numbers unless the evidence shows them inside the displayed number field.\n\n';
markdown += '## Findings\n\n';
markdown += '| Dataset | GEO | Document type | Runtime pattern/template | Generated example | Exact evidence/source | Evidence type | Evidence status | Evidence description | Document version/status | Observed shape | Verdict | Quality | Required action |\n';
markdown += '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';

for (const row of rows) {
  markdown += `| ${cell(row.dataset)} | ${cell(row.geo)} | ${cell(row.documentType)} | ${cell(row.runtime)} | ${cell(row.generated)} | ${cell(row.source)} | ${cell(row.evidenceType)} | ${cell(row.evidenceStatus)} | ${cell(row.evidenceDescription)} | ${cell(row.status)} | ${cell(row.observedShape)} | ${cell(row.verdict)} | ${cell(row.quality)} | ${cell(row.action)} |\n`;
}

markdown += '\n## Production Blockers\n\n';
for (const row of rows.filter((item) => item.verdict !== 'match')) {
  markdown += `- ${row.dataset}.${row.documentType}: ${row.verdict}; ${row.action}\n`;
}

fs.writeFileSync(outputPath, markdown);

function classify(rule, evidence) {
  if (!evidence) {
    if (rule.source.url.includes('consilium.europa.eu/prado') || rule.source.url.includes('/prado-documents/')) {
      return 'source does not confirm number format';
    }
    return 'insufficient evidence';
  }
  const statuses = evidenceStatuses(evidence);
  if (statuses.includes('outdated')) return 'outdated document';
  if (!statuses.includes('current')) return 'insufficient evidence';
  if (rule.quality === 'verified' && evidence.type !== 'explicit_grammar') return 'mismatch';
  if (rule.quality === 'sample_verified' && evidence.type !== 'readable_specimen') return 'mismatch';
  if (rule.quality === 'synthetic_pattern') return 'mismatch';
  return 'match';
}

function requiredAction(verdict, rule) {
  if (verdict === 'match') return 'No runtime change required; keep evidence tier as-is.';
  if (verdict === 'source does not confirm number format') return 'Production blocker: attach an exact official/PRADO evidence entry or keep as synthetic_pattern review-only.';
  if (rule.quality === 'verified') return 'Production blocker: downgrade quality or attach explicit_grammar evidence.';
  if (rule.quality === 'sample_verified') return 'Production blocker: downgrade quality or attach readable_specimen evidence.';
  return 'Production blocker: do not promote without explicit grammar or readable official specimen.';
}

function versionStatus(rule) {
  if (VERSION_HINTS[rule.source.url]) return VERSION_HINTS[rule.source.url];
  if (rule.source.url.includes('consilium.europa.eu/prado')) {
    return rule.source.url.includes('/prado-documents/') ? 'PRADO listing/category only; exact current document version not proven by this source URL.' : 'PRADO exact page; status must be read from page.';
  }
  if (rule.source.type === 'official' || rule.source.type === 'government_sample') return 'Official source exists, but no independent number-format evidence entry is attached.';
  if (rule.source.type === 'user_sample') return 'User sample; official document version/status not established.';
  if (rule.source.type === 'assumption') return 'Assumption-only fallback; not a real document version.';
  return 'Secondary/trusted reference; current issuing status not established.';
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

function evidenceSources(evidence) {
  return evidence.sources ?? [{
    status: evidence.status ?? 'unknown',
    purpose: evidence.purpose ?? 'number_format',
    url: evidence.url,
    description: evidence.description,
  }];
}

function evidenceStatuses(evidence) {
  return evidenceSources(evidence).map((source) => source.status ?? 'unknown');
}

function evidenceStatus(evidence) {
  return evidenceSources(evidence)
    .map((source) => `${source.status ?? 'unknown'}:${source.purpose ?? 'number_format'}`)
    .join(', ');
}

function formatEvidenceSources(evidence) {
  return evidenceSources(evidence)
    .map((source) => `${source.status ?? 'unknown'}:${source.purpose ?? 'number_format'} ${source.url}`)
    .join(', ');
}

function fillTemplate(template) {
  return template
    .replace('{DOB_YYMMDD}', '910727')
    .replace(/\{RANDL(\d+)\}/g, (_, count) => 'A'.repeat(Number(count)))
    .replace(/\{RAND(\d+)\}/g, (_, count) => '1'.repeat(Number(count)));
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function cell(value) {
  return String(value).replace(/\|/g, '/');
}
