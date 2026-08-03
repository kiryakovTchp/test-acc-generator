# Identity Dataset Validation Notes

Checked at: 2026-08-03

This note is synchronized with runtime datasets after the document-number audit in
`docs/DOCUMENT_DATASET_VERIFICATION.md`. Runtime, not older draft notes, is the
source of truth for current generated document values.

## Runtime Snapshot

- Runtime document rules: 93.
- Quality counts: 13 `verified`, 11 `sample_verified`, 69 `synthetic_pattern`.
- `generic_intl` is a fallback/test GEO and is not a confirmed real document dataset.
- Document generation is still review-heavy: 72 runtime rules remain production blockers because the source is insufficient or does not confirm number format.

## Confirmed Runtime Changes From This Audit

| GEO | Document | Previous runtime | Current runtime | Quality | Reason |
| --- | --- | --- | --- | --- | --- |
| GA | passport | `^[A-Z]\d{8}$` | `^\d{2}SP\d{5}$` | `sample_verified` | PRADO current ordinary passport `GAB-AO-03001` is valid and first issued `01/11/2013`; reviewed specimen display shape is `13SP01349`. This confirms only specimen shape, not national grammar. |
| CG | national_identity_card_number | `^CNI\d{9}$` | `^\d{9}$` | `synthetic_pattern` | `CNI` was only a document label/marker; no source confirms it as part of the generated number. |
| SZ / Eswatini | national_identity_card_number | `^ID\d{8}$` | `^\d{9}$` | `synthetic_pattern` | Aligned with Swaziland GEO; `ID` label removed from generated value. |
| SZ / Eswatini | passport | `^SZ\d{7}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | Aligned with Swaziland GEO; country code removed from generated value. |
| MW | national_identity_number | `^NID\d{8}$` | `^\d{8}$` | `synthetic_pattern` | `NID` was only a document label/marker; no source confirms it as part of the generated number. |
| ML | national_identification_number_nina | `^NINA\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `NINA` was only a field/document label; no source confirms it as part of the generated number. |
| MU | national_identity_card_number | `^NIC\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `NIC` was only a field/document label; no source confirms it as part of the generated number. |
| MZ | national_identity_card_number | `^BI\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `BI` was only a document label; no source confirms it as part of the generated number. |
| NE | national_identity_card_number | `^CNI\d{9}$` | `^\d{9}$` | `synthetic_pattern` | `CNI` was only a document label/marker; no source confirms it as part of the generated number. |
| ZM | passport | `^ZMP\d{6}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | `ZMP` country/document marker removed; PRADO page does not confirm it as the passport number prefix. |
| ZM | national_registration_card_number | `^NRC\d{8}$` | `^\d{13}$` | `synthetic_pattern` | Ministry material says the new NRC identity card contains a 13-digit national registration identity number; no checksum/semantics published. |
| ZW | passport | `^ZWP\d{6}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | `ZWP` country/document marker removed; PRADO page does not confirm it as the passport number prefix. |
| ZW | national_identity_card_number | `^ID\d{8}$` | `^\d{8}$` | `synthetic_pattern` | `ID` was only a document label/marker; no source confirms it as part of the generated number. |

## Evidence Rules

- `verified`: official source directly defines structure, length, prefix, or algorithm/checksum.
- `sample_verified`: official/public specimen confirms a displayed shape, but not a full national grammar.
- `synthetic_pattern`: source confirms document existence or a plausible secondary pattern, but not enough for production-verified generation.
- A PRADO country page, PRADO category/listing page, or search result is not enough to confirm a visible document number.
- Country/MRZ codes such as `GAB`, `SLE`, `ZMB`, `ZWE`, or document labels such as `CNI`, `NRC`, `NIC`, `BI`, `ID`, `NINA` must not be generated as part of the document number unless an exact source shows them inside the number field.

## Production Verdict

The document dataset is not production-ready as a verified document generator.
It is usable only as a mixed-quality review dataset: the `verified` and
official `sample_verified` rules can be used with their stated limits, while
`synthetic_pattern`, user-sample-only, and PRADO-listing-only rules must remain
production blockers until exact official grammar or readable official specimen
evidence is attached.
