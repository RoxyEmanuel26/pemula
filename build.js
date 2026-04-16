/**
 * BUILD SCRIPT — Membuat config.js dari Environment Variable
 * Dijalankan otomatis oleh Vercel saat deploy
 */
const fs = require('fs');

const secret = process.env.ADMIN_SECRET || '';

const content = `/**
 * CONFIG.JS — Auto-generated saat build
 * JANGAN edit file ini langsung!
 */
const CONFIG = {
    ADMIN_SECRET: '${secret}'
};
`;

fs.writeFileSync('config.js', content);
console.log('✅ config.js berhasil di-generate');
