const fs = require('fs');
const path = require('path');

const sitemapsDir = path.join(__dirname, 'sitemaps');
const stateFile = path.join(__dirname, 'sitemap_state.json');

const files = fs.readdirSync(sitemapsDir);
const videoFiles = [];
const completedQueries = new Set();

files.forEach(f => {
    if (f.startsWith('sitemap_video_')) {
        videoFiles.push(f);
        const match = f.match(/sitemap_video_([a-zA-Z0-9]+)(?:_\d+)?\.xml/);
        if (match) {
            completedQueries.add(match[1]);
        }
    }
});

const state = {
    completedQueries: Array.from(completedQueries),
    sitemapVideoFiles: videoFiles,
    grandTotalVideos: 0,
    grandTotalRequests: 0,
    grandTotalDupes: 0
};

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

// Also generate sitemap_index.xml
const baseUrl = 'https://www.kumpulenak.web.id';
const dateStr = new Date().toISOString().replace(/\.\d+Z$/, '+00:00'); // Close enough for lastmod
let indexXml = `<?xml version='1.0' encoding='UTF-8'?>\n<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>\n`;
indexXml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/sitemap_pages.xml</loc>\n    <lastmod>${dateStr}</lastmod>\n  </sitemap>\n`;
indexXml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/sitemap_kategori.xml</loc>\n    <lastmod>${dateStr}</lastmod>\n  </sitemap>\n`;
indexXml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/sitemap_tags.xml</loc>\n    <lastmod>${dateStr}</lastmod>\n  </sitemap>\n`;

videoFiles.forEach(sf => {
    indexXml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/${sf}</loc>\n    <lastmod>${dateStr}</lastmod>\n  </sitemap>\n`;
});
indexXml += `</sitemapindex>`;

fs.writeFileSync(path.join(__dirname, 'sitemap_index.xml'), indexXml);
console.log('Fix complete! Added queries:', Array.from(completedQueries).join(', '));
