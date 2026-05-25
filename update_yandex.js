const fs = require('fs');
const path = require('path');

const dir = __dirname;
const oldTag = '<meta name="yandex-verification" content="676559ea6fc65e95" />';
const newTag = '<meta name="yandex-verification" content="a25cbe2b4f64ad3a" />';

const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');
    
    if (content.includes(oldTag)) {
        content = content.replace(oldTag, newTag);
        fs.writeFileSync(p, content, 'utf8');
        console.log('Replaced in', file);
    } else {
        console.log('Old tag not found in', file);
    }
});
