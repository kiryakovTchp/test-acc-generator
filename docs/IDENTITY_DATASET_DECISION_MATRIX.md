# Identity Dataset Decision Matrix

Checked at: 2026-08-03

This matrix is synchronized with runtime after the document verification
methodology follow-up. For the full 93-rule table, evidence entries, generated
examples, and blockers, see `docs/DOCUMENT_DATASET_VERIFICATION.md`.

## Runtime Inventory

| Metric | Count |
| --- | ---: |
| Runtime document rules | 93 |
| `verified` quality | 12 |
| `sample_verified` quality | 8 |
| `synthetic_pattern` quality | 73 |
| Audit verdict `match` | 16 |
| Audit verdict `mismatch` | 0 |
| Audit verdict `insufficient evidence` | 43 |
| Audit verdict `outdated document` | 0 |
| Audit verdict `source does not confirm number format` | 34 |
| Production blockers | 77 |

## Evidence-Backed Match Rules

These rules match explicit independent evidence. They are still synthetic
generated values and are not registry-validated. There are 16 evidence-backed
`match` rules: 12 `verified` + `explicit_grammar` and 4 `sample_verified` +
`readable_specimen`.

| GEO | Runtime type | Pattern | Quality | Evidence type | Limit |
| --- | --- | --- | --- | --- | --- |
| BF | national_personal_identification_number | `^\d{17}$` | `verified` | `explicit_grammar` | Official page confirms 17-digit NIP only. |
| ET | fayda_identification_number | `^\d{12}$` | `verified` | `explicit_grammar` | Official NIDP page confirms 12-digit Fayda number. |
| GH | ghana_card_pin | `^GHA-\d{9}-\d$` | `verified` | `explicit_grammar` | NIA FAQ confirms displayed PIN shape. |
| IE | pps_number | `^\d{7}[A-Z]{1,2}$` | `verified` | `explicit_grammar` | PPS number, not national ID card. |
| IE | passport_card_number | `^C\d{8}$` | `verified` | `explicit_grammar` | Official parliamentary answer confirms C plus eight digits. |
| KZ | iin | `^\d{12}$` | `verified` | `explicit_grammar` | Ministry of Internal Affairs rules confirm 12 digits and the two-cycle checksum algorithm; Government Resolution No. 565 transition program confirms citizen-style YYMMDD birth-date prefix, sex/century digit, registration sequence, and control digit. Existing assigned IIN validation must not reject on DOB, sex, or century semantics because foreigner or historical registrations may contain exceptions. |
| MW | passport | `^MW[AZ]\d{6}$` | `verified` | `explicit_grammar` | Official factsheet confirms ordinary passport prefixes only. |
| MZ | tax_identification_number_nuit | `^\d{9}$` | `verified` | `explicit_grammar` | Official tax authority confirms 9-digit NUIT. |
| NA | national_identity_number | `^\d{11}$` | `verified` | `explicit_grammar` | Official act/source confirms 11-digit identity number. |
| NG | nin | `^\d{11}$` | `verified` | `explicit_grammar` | NIMC confirms 11-digit NIN. |
| SN | ecowas_id_card_number | `^\d{17}$` | `verified` | `explicit_grammar` | Official decree confirms 17-digit card number. |
| UZ | pinfl | `^\d{14}$` | `verified` | `explicit_grammar` | Official my.gov.uz confirms 14-digit PINFL. |
| GA | passport | `^\d{2}SP\d{5}$` | `sample_verified` | `readable_specimen` | PRADO specimen shape only; current document `GAB-AO-03001`, valid, first issued `01/11/2013`. |
| SL | passport | `^\d{7}$` | `sample_verified` | `readable_specimen` | PRADO specimen shape only; `SLE` is country code, not Passport No. |
| SL | personal_number | `^\d{9}$` | `sample_verified` | `readable_specimen` | PRADO specimen shape only. |
| TZ | national_identification_number | `^\d{8}-\d{5}-\d{5}-\d{2}$` | `sample_verified` | `readable_specimen` | Official NIDA display sample only. |

## Must Remain Review-Only / Production Blockers

- The remaining 77 runtime document rules stay production blockers: 34 sources confirm document existence but not number format, 40 have insufficient independent evidence, and 3 Cote d'Ivoire user-sample display-shape rules remain `insufficient evidence`.
- All `synthetic_pattern` rules remain production blockers unless an exact official grammar or readable official specimen is attached.
- PRADO country/category/listing URLs confirm document existence, not number grammar.
- Cote d'Ivoire passport, national ID, and driver licence remain user-sample-only display-shape seeds.
- Gabon NIP remains `synthetic_pattern`; the current source does not prove control characters or full NIP semantics.
- Botswana Omang, Gambia NIN, Georgia personal number, and Rwanda NIN are now blockers because the previous evidence was secondary, circular, or did not prove runtime semantics. Kazakhstan IIN is verified for citizen-style synthetic generation using the official 12-digit/checksum grammar via Ministry of Internal Affairs rules and the semantic digit structure in Government Resolution No. 565; existing assigned IIN validation must stay limited to 12 digits and checksum because foreigner or historical registrations may contain exceptions. Generated values are not live registry assignments.
- Eswatini and Swaziland share the same runtime document shapes for `countryCode` `SZ`, but both remain synthetic because official pages do not publish number grammar.
- `generic_intl` is a fallback and must not be counted as a confirmed GEO.

## Decision

The document side is not ready for production as a verified dataset. It is ready
only as an explicitly evidence-tagged review dataset where production consumers
can use the 16 evidence-backed `match` rules cautiously and block or warn on all
other rules.
