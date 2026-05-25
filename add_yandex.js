const fs = require('fs');
const path = require('path');

const dir = __dirname;
const tag = '<meta name="yandex-verification" content="676559ea6fc65e95" />';

const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');
    
    if (!content.includes('yandex-verification')) {
        // Insert after <head> or <meta charset="UTF-8">
        if (content.includes('<meta charset="UTF-8">')) {
            content = content.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n    ' + tag);
        } else if (content.includes('<head>')) {
            content = content.replace('<head>', '<head>\n    ' + tag);
        }
        
        fs.writeFileSync(p, content, 'utf8');
        console.log('Added to', file);
    } else {
        console.log('Already exists in', file);
    }
});
