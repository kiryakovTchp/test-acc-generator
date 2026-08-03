# Identity Dataset Decision Matrix

Checked at: 2026-08-03

This matrix is synchronized with runtime after the document verification pass.
For the full 93-rule table, sources, generated examples, and blockers, see
`docs/DOCUMENT_DATASET_VERIFICATION.md`.

## Runtime Inventory

| Metric | Count |
| --- | ---: |
| Runtime document rules | 93 |
| `verified` quality | 13 |
| `sample_verified` quality | 11 |
| `synthetic_pattern` quality | 69 |
| Audit verdict `match` | 21 |
| Audit verdict `mismatch` | 0 |
| Audit verdict `insufficient evidence` | 38 |
| Audit verdict `outdated document` | 0 |
| Audit verdict `source does not confirm number format` | 34 |

## Can Be Treated As Matched Within Stated Limits

These rules are not necessarily registry-valid. They only match the public
evidence tier currently attached to runtime.

| GEO | Runtime type | Pattern | Quality | Limit |
| --- | --- | --- | --- | --- |
| BF | national_personal_identification_number | `^\d{17}$` | `verified` | Length is confirmed; no registry validation/checksum. |
| ET | fayda_identification_number | `^\d{12}$` | `verified` | Length is confirmed; no live assignment check. |
| GE | personal_number | `^\d{11}$` | `verified` | Secondary OECD/TIN evidence accepted for runtime; official issuer page would be stronger. |
| GH | ghana_card_pin | `^GHA-\d{9}-\d$` | `verified` | NIA FAQ confirms displayed PIN shape. |
| IE | pps_number | `^\d{7}[A-Z]{1,2}$` | `verified` | PPS number, not national ID card. |
| IE | passport_card_number | `^C\d{8}$` | `verified` | Official parliamentary answer confirms C plus eight digits. |
| KZ | iin | `^\d{12}$` | `verified` | Runtime generator implements YYMMDD, century/gender digit, and checksum. |
| MW | passport | `^MW[AZ]\d{6}$` | `verified` | Official factsheet confirms ordinary passport prefixes only. |
| MZ | tax_identification_number_nuit | `^\d{9}$` | `verified` | Official tax authority confirms 9-digit NUIT. |
| NA | national_identity_number | `^\d{11}$` | `verified` | Official act/source confirms 11-digit identity number. |
| NG | nin | `^\d{11}$` | `verified` | NIMC confirms 11-digit NIN. |
| RW | national_identity_number | `^\d{16}$` | `verified` | Secondary ID4D source; official issuer page would be stronger. |
| UZ | pinfl | `^\d{14}$` | `verified` | Official my.gov.uz confirms 14-digit PINFL. |
| GA | passport | `^\d{2}SP\d{5}$` | `sample_verified` | PRADO specimen shape only; current document `GAB-AO-03001`, valid, first issued `01/11/2013`. |
| MW | personal_number | `^\d{7}/\d$` | `sample_verified` | PRADO specimen shape only. |
| SL | passport | `^\d{7}$` | `sample_verified` | PRADO specimen shape only; `SLE` is country code, not Passport No. |
| SL | personal_number | `^\d{9}$` | `sample_verified` | PRADO specimen shape only. |
| TZ | national_identification_number | `^\d{8}-\d{5}-\d{5}-\d{2}$` | `sample_verified` | Official NIDA display sample only. |

## Must Remain Review-Only / Production Blockers

- All `synthetic_pattern` rules remain production blockers unless an exact official grammar or readable official specimen is attached.
- PRADO country/category/listing URLs confirm document existence, not number grammar. They must be replaced with exact document/specimen pages before promotion.
- Cote d'Ivoire passport, national ID, and driver licence remain user-sample-only. They are useful display-shape seeds but not production-confirmed public evidence.
- Gabon NIP remains `synthetic_pattern`; the current source does not prove control characters or full NIP semantics.
- Eswatini and Swaziland now share the same runtime document shapes for `countryCode` `SZ`, but both remain synthetic because the official pages do not publish number grammar.
- `generic_intl` is a fallback and must not be counted as a confirmed GEO.

## Decision

The document side is not ready for production as a verified dataset. It is ready
only as an explicitly quality-tagged review dataset where production consumers
can use `verified` and official `sample_verified` values cautiously and block or
warn on all other rules.
