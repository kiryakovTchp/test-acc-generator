# Identity Dataset Decision Matrix

Working decision matrix for the 38-geo identity dataset draft received on
2026-07-14. This is a research artifact only; production code was not changed.

## Update From Confirmed Data

These candidates can be used to update the draft data model because a strong
source confirmed either the format or the corrected replacement.

| Geo | Field | Current draft candidate | Updated candidate | Type | Status | Source |
| --- | --- | --- | --- | --- | --- | --- |
| AO | passport | `^N\d{7}$` | `^N\d{7}$` | `passport` | confirmed | https://www.ecoi.net/en/document/2095422.html |
| GE | national_id | `^\d{11}$` | `^\d{11}$` | `personal_number` | confirmed for citizens | https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/georgia-tin.pdf |
| GH | national_id | `^GHA-\d{9}-\d{1}$` | `^GHA-\d{9}-\d$` | `ghana_card_pin` | confirmed | https://register.nia.gov.gh/faqs |
| IE | national_id | `^\d{7}[A-Z]{1,2}$` | `^\d{7}[A-Z]{1,2}$` | `pps_number` | confirmed, rename required | https://www.gov.ie/en/department-of-social-protection/services/get-a-personal-public-service-pps-number/ |
| NG | national_id | `^\d{11}$` | `^\d{11}$` | `national_identity_number` | confirmed | https://nimc.gov.ng/nin |
| SN | national_id | `^\d{13,14}$` | `^\d{17}$` | `ecowas_id_card_number` | replace | https://dge.sn/decret-n-2016-1536-du-29-septembre-2016-portant-application-de-la-loi-n-2016-09-du-14-mars-2016-instituant-une-carte-didentite-biometrique-cedeao-publie-au-jors-n-6965-du-5/ |
| TZ | national_id | `^\d{20}$` | `^\d{20}$` plus `^\d{8}-\d{5}-\d{5}-\d{2}$` display form | `national_identification_number` | adjust | https://services.nida.go.tz/requestctrnm |
| UZ | national_id | `^\d{14}$` | `^\d{14}$` | `personal_identification_number` | confirmed | https://my.gov.uz/ru/static/jshshir-for-foreigners |
| ET | national_id | `^\d{9,10}$` | `^\d{12}$` | `fayda_identification_number` | replace | https://id.gov.et/ |

Current app-only, not part of the 38-geo draft:

| Geo | Field | Updated candidate | Type | Status | Source |
| --- | --- | --- | --- | --- | --- |
| KZ | iin | `^\d{12}$` | `individual_identification_number` | confirmed | https://egov.kz/cms/en/articles/iin_info |

## Keep As Review Required

These are plausible but should not be promoted to verified yet.

| Geo | Field | Candidate | Reason |
| --- | --- | --- | --- |
| KE | passport | `^A\d{7}$` | Kenya Immigration confirms passport series, but exact number grammar needs a document/sample source. |
| KE | national_id | `^\d{8}$` | Widely used, but exact official grammar still needs a better citation. |
| GA | passport | `^\d{2}SP\d{5}$` | Better PRADO specimen shows `Passport No` as `13SP01349`; `GAB` is the country code, not part of the visible number. |
| GM | passport | `^PC\d{7}$` | Draft candidate is country-specific but not confirmed by official/sample-level source. |
| GM | national_identification_number | `^\d{11}$` | Source review indicates Gambian NIN is 11 digits, replacing the draft 10-digit candidate; keep review-required until current official grammar is confirmed. |
| MW | passport | `^\d{6}$` | PRADO specimen shows `Passport No` as six digits, e.g. `030025`; `MWI` is the country code, not part of the visible passport number. |
| MW | personal_number | `^\d{7}/\d$` | PRADO specimen shows `Personal No` in slash form, e.g. `1212433/2`; keep review-required until confirmed across current documents. |
| NG | passport | `^[A-Z]\d{8}$` | Probable, but exact visual grammar still needs sample-level source. |
| SL | passport | `^\d{7}$` | PRADO specimen shows a seven-digit passport number, e.g. `0114439`; `SLE` is the country code, not part of the visible number. |
| SL | personal_number | `^\d{9}$` | PRADO specimen shows Personal No as nine digits, e.g. `000119146`; keep review-required until confirmed across current documents. |
| TG | passport | `^X[BS]\d{6}$` | PRADO ordinary passport specimens show X-series prefixes such as `XB000072` and `XS000288`. |
| TG | diplomatic_passport | `^D\d{7}$` | PRADO diplomatic specimen shows `D9000426`; model separately from ordinary passport. |
| TG | driver_license_number | `^\d{8}$` | Driving licence sample is partially redacted; only visible fragments support a synthetic placeholder, not verified grammar. |
| UG | passport | `^B\d{7}$` | Passport document confirmed, exact visible grammar not confirmed. |
| UG | national_id | `^C[MF]\d{12}$` | Plausible, but exact prefix and length need official source. |
| UZ | passport | `^[A-Z]{2}\d{7}$` | Plausible from KYC references, not yet official-level. |
| ZM | passport | `^ZN\d{6}$` | Plausible, but exact visual grammar needs official/sample source. |
| ZM | national_id | `^\d{6}/\d{2}/\d$` | Plausible NRC visual form, exact official grammar still needed. |
| CM | national_id | `^\d{9}$` | Public samples fit, but official grammar still needed. |

## Countries Not Suitable For Verified Document Generation Yet

This list means "do not use this country for verified document generation from
the current draft". It does not mean phone/geography data is useless.

| Geo | Country/entity | Main blockers |
| --- | --- | --- |
| KM | Anjouan / Comoros subdivision | Subdivision treated as geo entity; passport pattern is generic MRZ-like filler; document sources missing. |
| BJ | Benin | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| BF | Burkina Faso | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| BI | Burundi | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| GW | Guinea-Bissau | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| GN | Guinea Conakry | Passport candidate is generic MRZ-like filler; current app pattern is also unsupported; city-region audit has many unresolved links. |
| CI | Cote d'Ivoire | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| LR | Liberia | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| MG | Madagascar | Passport candidate is generic MRZ-like filler; 60/60 city-region links unresolved in audit; surname seed is incomplete. |
| ML | Mali | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| NE | Niger | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| CG | Republic of the Congo | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| CF | Central African Republic | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| TD | Chad | Passport candidate is generic MRZ-like filler; national ID source not confirmed. |
| GQ | Equatorial Guinea | Passport candidate is generic MRZ-like filler; only 3 cities and 2 unresolved regions in audit. |
| SS | South Sudan | Draft national ID likely risks Sudan/South Sudan conflation; passport candidate is generic MRZ-like filler. |

## Main Conclusion

The draft is useful as a phone/geography/name seed, but not as a verified
document dataset. The next structural fix should be to split document types
before importing anything:

- `passport`
- `national_id_card`
- `national_identity_number`
- `personal_identification_number`
- `tax_or_social_number`
- `other_identifier`

After that, confirmed identifiers can be imported as trusted data, probable
patterns can remain `review_required`, and generic MRZ-like patterns should be
removed from the document queue or replaced with country-specific sources.
