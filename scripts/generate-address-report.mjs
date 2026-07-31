import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetDir = path.join(root, 'backend/src/datasets');
const outputPath = path.join(root, 'docs/ADDRESS_DATASET_MAP_VERIFICATION.md');

const rows = [];

for (const file of fs.readdirSync(datasetDir).filter((item) => item.endsWith('.json')).sort()) {
  const dataset = JSON.parse(fs.readFileSync(path.join(datasetDir, file), 'utf8'));
  for (const region of dataset.locations.regions) {
    for (const city of region.cities) {
      for (const address of city.addresses) {
        rows.push({
          geo: dataset.key,
          region: region.name,
          city: city.name,
          addressLine: address.addressLine,
          postalCode: address.postalCode ?? 'absent',
          source: address.source.url,
          osmType: address.osmType ?? '',
          osmId: address.osmId ?? '',
        });
      }
    }
  }
}

const withPostcode = rows.filter((row) => row.postalCode !== 'absent').length;
const withoutPostcode = rows.length - withPostcode;

let markdown = '# Address Dataset Map Verification\n\n';
markdown += 'Checked at: 2026-07-31\n\n';
markdown += `Summary: ${rows.length} map-sourced address records across dataset cities; ${withPostcode} include a map/source postcode; ${withoutPostcode} have no postcode in the selected map record. postalCode is omitted when absent.\n\n`;
markdown += 'Notes:\n\n';
markdown += '- Address records were sourced from OpenStreetMap/Nominatim map results for public places where available.\n';
markdown += '- PO Box, BP, Plus Code, telephone calling-code, and placeholder values are not copied into `postalCode`.\n';
markdown += '- `postalCode` is optional by design; missing values are reported rather than invented.\n';
markdown += '- Evinayong and Bimbo currently use city-level OpenStreetMap records because no better public-place point was found in map search and should be replaced when a verified public-place map record is available.\n\n';
markdown += '| Geo | Region | City | Address line | Postal code | OSM | Map source |\n';
markdown += '| --- | --- | --- | --- | --- | --- | --- |\n';

for (const row of rows) {
  markdown += `| ${escapeCell(row.geo)} | ${escapeCell(row.region)} | ${escapeCell(row.city)} | ${escapeCell(row.addressLine)} | ${escapeCell(row.postalCode)} | ${escapeCell([row.osmType, row.osmId].filter(Boolean).join('/'))} | ${row.source} |\n`;
}

fs.writeFileSync(outputPath, markdown);

function escapeCell(value) {
  return String(value).replace(/\|/g, '/');
}
