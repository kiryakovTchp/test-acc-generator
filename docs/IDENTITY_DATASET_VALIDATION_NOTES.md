# Identity Dataset Validation Notes

Working notes for the 38-geo identity dataset draft received on 2026-07-14.
This document is not an implementation plan and does not mark any unreviewed
document pattern as production-verified.

Decision summary and country suitability list:
`docs/IDENTITY_DATASET_DECISION_MATRIX.md`.

## Dataset Snapshot

- Dataset status: `draft`.
- Entities: 38.
- Phone examples: 38/38 parse through libphonenumber.
- Cities: 1513 total, 1253 linked to ISO subdivision codes in the audit.
- Document candidates: 76 in manual review queue.
- Current application coverage: 8 geos in `backend/src/geo-rules.json`.

## Source Review

| Source | Dataset use | Initial verdict | Notes |
| --- | --- | --- | --- |
| Google libphonenumber | Phone metadata and examples | Accept | Strong source of truth for phone parsing. Pin library version. |
| pycountry / ISO 3166-2 | Subdivision identifiers | Accept with snapshot caveat | Good technical source, but not a live ISO authority. Store version/snapshot date. |
| GeoNames | Cities and admin links | Accept with attribution | CC BY data. Keep attribution and expect unresolved or stale admin mappings. |
| Faker | Localized names | Partial accept | Accept only locales with real country-specific person providers. Keep seed-only names as inferred. |

## Current App vs Dataset

The current app is deliberately synthetic:

- `geo-rules.json` stores only `key`, `label`, and document templates.
- `utils.ts` has hand-written geography, phone prefixes, and shared name pools.
- Most current document templates are placeholders, not real visual formats.

The new dataset is broader and should be treated as a master draft:

- phone metadata can replace current prefix-based phones later;
- geography can replace hand-written country/region/city pools later;
- names need source-tier filtering;
- document candidates must stay manual-review until a source confirms them.

## Document Validation Pass 1

| Geo | Candidate | Dataset type | Proposed normalized type | Verdict | Source / rationale |
| --- | --- | --- | --- | --- | --- |
| NG | `^\d{11}$` | national_id | national_identity_number | confirmed | NIMC says the NIN consists of 11 numbers: https://nimc.gov.ng/nin |
| KZ | `^\d{12}$` | national_id | individual_identification_number | confirmed | eGov Kazakhstan says IIN is a 12-digit combination and appears on ID/passport: https://egov.kz/cms/en/articles/iin_info |
| UZ | `^\d{14}$` | national_id | personal_identification_number | confirmed | my.gov.uz says PINFL is a unique 14-digit number: https://my.gov.uz/ru/static/jshshir-for-foreigners |
| IE | `^\d{7}[A-Z]{1,2}$` | national_id | pps_number | rename | This is a PPS number, not a national ID document: https://www.gov.ie/en/department-of-social-protection/services/get-a-personal-public-service-pps-number/ |
| GE | `^\d{11}$` | national_id | personal_number | confirmed for citizens | OECD Georgia TIN notes the 11-digit number is the same as the national identity card number for citizen natural persons: https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/georgia-tin.pdf |
| GH | `^GHA-\d{9}-\d{1}$` | national_id | ghana_card_pin | confirmed | NIA FAQ gives `GHA-000000000-0`: https://register.nia.gov.gh/faqs |
| ZM | `^\d{6}/\d{2}/\d{1}$` | national_id | national_registration_card_number | probable | Zambia government sources confirm NRC as national registration card; exact slash format still needs official confirmation. |
| UG | `^C[MF]\d{12}$` | national_id | national_identification_number | probable | NIRA confirms NIN/National ID; exact prefix/length still needs official confirmation. |
| TZ | `^\d{20}$` | national_id | national_identification_number | adjust | NIDA examples show a 20-digit NIN with display hyphens, e.g. `19760517-37227-00002-17`: https://services.nida.go.tz/requestctrnm |
| SN | `^\d{13,14}$` | national_id | ecowas_id_card_number | reject/replace | Senegal decree says the ECOWAS identity card number contains 17 digits: https://dge.sn/decret-n-2016-1536-du-29-septembre-2016-portant-application-de-la-loi-n-2016-09-du-14-mars-2016-instituant-une-carte-didentite-biometrique-cedeao-publie-au-jors-n-6965-du-5/ |
| ET | `^\d{9,10}$` | national_id | fayda_identification_number | reject/replace | Ethiopia National ID says Fayda is a 12-digit unique identification number: https://id.gov.et/ |
| AO | `^N\d{7}$` | passport | passport | confirmed | Immigration/refugee-source summary describes ordinary passport serial as `N` plus seven digits; PRADO confirms the passport document family: https://www.ecoi.net/en/document/2095422.html |
| CM | `^\d{9}$` | national_id | national_id_card_number | probable | Public Cameroon ID samples show 9-digit CNI numbers; government decree confirms CNI issuance but exact number grammar still needs official text/sample source. |
| SS | `^\d{11}$` | national_id | national_identity_number | reject/needs fresh source | Search results repeatedly resolve to Sudan, not South Sudan. Sudan has an 11-digit national number, but that must not be transferred to South Sudan without a South Sudanese source. |
| SS | `^[A-Z0-9<]{9}$` | passport | passport | reject/replace | Generic MRZ-like seed. A bank reference list gives South Sudan passport number as `X99999999` (one letter plus eight digits), but this is secondary and still needs official confirmation. |
| GN | `^[A-Z0-9<]{9}$` | passport | passport | reject/replace | PRADO confirms Guinea passport document families, but the candidate is only generic MRZ filler and not a country-specific visual pattern: https://www.consilium.europa.eu/prado/en/prado-documents/gin/a/o/docs-per-type.html |
| KE | `^A\d{7}$` | passport | passport | probable | Kenya Immigration confirms ordinary passport A/B/C series by booklet size; exact number grammar still needs a document sample or PRADO page: https://immigration.go.ke/type-and-fees/ |
| KE | `^\d{8}$` | national_id | national_id_card_number | probable | Kenya citizen services use national ID number as a core identifier, but exact 8-digit grammar still needs an official form/sample citation. |
| GA | `^\d{10}$` | passport | passport | specimen-based | User-provided PRADO specimen shows `Passport No` as ten digits, e.g. `0000000000`; `GAB` is displayed separately as the country code. |
| MW | `^\d{6}$` | passport | passport | specimen-based | User-provided PRADO specimen shows `Passport No` as six digits, e.g. `030025`; `MWI` is displayed separately as the country code. |
| MW | `^\d{7}/\d$` | personal_number | personal_number | specimen-based | User-provided PRADO specimen shows `Personal No` slash form, e.g. `1212433/2`; keep as synthetic/review-required until refreshed across current Malawi documents. |
| SL | `^\d{7}$` | passport | passport | specimen-based | User-provided PRADO specimen shows `Passport No` as seven digits, e.g. `0114439`; `SLE` is displayed separately as the country code. |
| SL | `^\d{9}$` | personal_number | personal_number | specimen-based | User-provided PRADO specimen shows `Personal No` as nine digits, e.g. `000119146`; keep as synthetic/review-required until refreshed across current Sierra Leone documents. |
| TG | `^X[BS]\d{6}$` | passport | passport | specimen-based | User-provided PRADO ordinary passport specimens show X-series passport numbers such as `XB000072` and `XS000288`. |
| TG | `^D\d{7}$` | diplomatic_passport | diplomatic_passport | specimen-based | User-provided PRADO diplomatic passport specimen shows a D-series number, e.g. `D9000426`; keep separate from ordinary passport. |
| TG | `^\d{8}$` | driver_license | driver_license_number | partial specimen | User-provided driving licence sample is partially redacted; visible pieces suggest a numeric licence number, but exact grammar is not verified. |
| UZ | `^[A-Z]{2}\d{7}$` | passport | passport | probable | Secondary banking/KYC lists show Uzbekistan passport as 9 chars, `XX9999999`; official migration sources confirm passport use but not the visible grammar. |
| NG | `^[A-Z]\d{8}$` | passport | passport | probable | Nigerian Immigration and PRADO confirm current passport document families; exact visual number grammar still needs a sample-level source: https://immigration.gov.ng/passports/ and https://www.consilium.europa.eu/prado/en/prado-documents/nga/a/docs-per-category.html |
| UG | `^B\d{7}$` | passport | passport | probable | Uganda official passport portal and PRADO confirm document families, but not the exact number grammar: https://passports.go.ug/ and https://www.consilium.europa.eu/prado/en/prado-documents/uga/a/docs-per-category.html |

## Modeling Notes

Do not overload `national_id` for every non-passport identifier. Split identity
document fields before importing reviewed data:

- `passport`
- `national_id_card`
- `national_identity_number`
- `personal_identification_number`
- `tax_or_social_number`
- `other_identifier`

For generation quality, store both:

- `verification.status`: `verified`, `probable`, `unknown`, `rejected`
- `verification.source_url` and `source_tier`

## Immediate Recommendations

1. Promote only confirmed document candidates to `verified`.
2. Keep probable candidates available only as `synthetic_pattern` or `review_required`.
3. Rename IE PPS, UZ PINFL, KZ IIN, GE personal number, and NG NIN away from generic `national_id`.
4. Continue validation by prioritizing geos already present in the app, then high-volume dataset geos.
