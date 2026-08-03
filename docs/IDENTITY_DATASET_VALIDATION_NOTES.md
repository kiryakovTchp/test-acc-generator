# Identity Dataset Validation Notes

Checked at: 2026-08-03

This note is synchronized with runtime datasets after the document-number audit in
`docs/DOCUMENT_DATASET_VERIFICATION.md`. Runtime, not older draft notes, is the
source of truth for current generated document values.

## Runtime Snapshot

- Runtime document rules: 93.
- Quality counts: 11 `verified`, 8 `sample_verified`, 74 `synthetic_pattern`.
- Evidence-backed audit verdicts: 16 `match`, 0 `mismatch`, 43 `insufficient evidence`, 0 `outdated document`, 34 `source does not confirm number format`.
- `generic_intl` is a fallback/test GEO and is not a confirmed real document dataset.
- Document generation is still review-heavy: 77 runtime rules remain production blockers because explicit independent evidence is missing, insufficient, or does not confirm number format.

## Methodology

The document report no longer treats runtime `quality`, `source.type`, or a
government/PRADO URL as proof. `match` requires an explicit independent evidence
entry with:

- exact source URL;
- evidence type `explicit_grammar` or `readable_specimen`;
- observed rule/specimen shape;
- document version/status where applicable.

Evidence-tier rules:

- `verified`: requires `explicit_grammar`.
- `sample_verified`: requires `readable_specimen`.
- `synthetic_pattern`: remains review-only even if the source confirms the document exists.
- PRADO country/category/listing pages and search snippets are not number-format evidence.
- Country/MRZ/document labels such as `GAB`, `SLE`, `ZMB`, `ZWE`, `CNI`, `NRC`, `NIC`, `BI`, `ID`, and `NINA` must not be generated inside a number unless evidence shows them inside the displayed number field.

## Runtime Changes From The Audit

| GEO | Document | Previous runtime | Current runtime | Quality | Reason |
| --- | --- | --- | --- | --- | --- |
| GA | passport | `^[A-Z]\d{8}$` | `^\d{2}SP\d{5}$` | `sample_verified` | PRADO current ordinary passport `GAB-AO-03001` is valid and first issued `01/11/2013`; specimen display shape is `13SP01349`. |
| CG | national_identity_card_number | `^CNI\d{9}$` | `^\d{9}$` | `synthetic_pattern` | `CNI` was only a document label/marker. |
| SZ / Eswatini | national_identity_card_number | `^ID\d{8}$` | `^\d{9}$` | `synthetic_pattern` | Aligned with Swaziland GEO; `ID` label removed. |
| SZ / Eswatini | passport | `^SZ\d{7}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | Aligned with Swaziland GEO; country code removed. |
| MW | national_identity_number | `^NID\d{8}$` | `^\d{8}$` | `synthetic_pattern` | `NID` was only a document label/marker. |
| ML | national_identification_number_nina | `^NINA\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `NINA` was only a field/document label. |
| MU | national_identity_card_number | `^NIC\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `NIC` was only a field/document label. |
| MZ | national_identity_card_number | `^BI\d{10}$` | `^\d{10}$` | `synthetic_pattern` | `BI` was only a document label. |
| NE | national_identity_card_number | `^CNI\d{9}$` | `^\d{9}$` | `synthetic_pattern` | `CNI` was only a document label/marker. |
| ZM | passport | `^ZMP\d{6}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | `ZMP` country/document marker removed. |
| ZM | national_registration_card_number | `^NRC\d{8}$` | `^\d{13}$` | `synthetic_pattern` | Ministry material says the new NRC identity card contains a 13-digit national registration identity number; no checksum/semantics published. |
| ZW | passport | `^ZWP\d{6}$` | `^[A-Z]\d{8}$` | `synthetic_pattern` | `ZWP` country/document marker removed. |
| ZW | national_identity_card_number | `^ID\d{8}$` | `^\d{8}$` | `synthetic_pattern` | `ID` was only a document label/marker. |

## Quality Corrections From Methodology Follow-Up

| GEO | Document | Previous quality | Current quality | Reason |
| --- | --- | --- | --- | --- |
| BW | omang | `sample_verified` | `synthetic_pattern` | Government source confirms Omang issuance, but not the nine-digit number grammar. |
| GM | national_identification_number | `sample_verified` | `synthetic_pattern` | Evidence is secondary strategy material, not a primary issuer source. |
| GE | personal_number | `verified` | `synthetic_pattern` | OECD source is secondary; no primary official issuer source was found in this pass. |
| KZ | iin | `verified` | `synthetic_pattern` | eGov confirms 12 digits, but not the runtime checksum algorithm. |
| RW | national_identity_number | `verified` | `synthetic_pattern` | World Bank source is secondary; no primary issuer source was found in this pass. |
| SN | ecowas_id_card_number | `sample_verified` | `verified` | Official decree explicitly defines the card number as 17 digits. |

## Production Verdict

The document dataset is not production-ready as a verified document generator.
It is usable only as an explicitly evidence-tagged review dataset: the 16
evidence-backed `match` rules can be used with their stated limits, while the
remaining 77 rules must remain production blockers until exact official grammar
or readable official specimen evidence is attached.
