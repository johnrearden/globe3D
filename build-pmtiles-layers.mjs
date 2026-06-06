// Regenerate assets/pmtiles-layers.json — the Protomaps basemap style layers
// (light theme, English labels) baked to a static file so the runtime country
// map (js/features/country-map.js) needs no protomaps-themes-base import in the
// browser. Run after bumping the protomaps-themes-base devDependency:
//
//   npm i -D protomaps-themes-base
//   node build-pmtiles-layers.mjs
//
// Keep the source name 'protomaps' in sync with the vector source id in
// country-map.js _buildStyle().
import { layers, namedTheme } from 'protomaps-themes-base';
import { writeFileSync } from 'fs';

const arr = layers('protomaps', namedTheme('light'), { lang: 'en' });
writeFileSync('assets/pmtiles-layers.json', JSON.stringify(arr));
console.log(`wrote assets/pmtiles-layers.json: ${arr.length} layers`);
