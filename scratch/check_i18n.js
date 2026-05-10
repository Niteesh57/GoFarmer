import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('c:/Users/venka/gemma-4/Gemma4Mobile/src/i18n/i18n.ts', 'utf8');

// Use a regex to extract the resources object or part of it
// This is a bit tricky with raw string, let's try to extract the main keys manually or use a simpler approach.

// Let's use a simplified approach: extract all keys for each language section.

const languages = ['en', 'hi', 'es', 'fr', 'zh', 'ja', 'te', 'kn', 'sv', 'de'];
const sections = ['common', 'tabs', 'splash', 'weather', 'aieye', 'doubts', 'radio', 'advisor', 'insights', 'settings', 'onboarding'];

const extractKeys = (lang) => {
    const langStart = content.indexOf(`  ${lang}: {`);
    if (langStart === -1) return {};
    
    // Find next language or end of resources
    let langEnd = content.length;
    for (const otherLang of languages) {
        if (otherLang === lang) continue;
        const otherLangStart = content.indexOf(`  ${otherLang}: {`, langStart);
        if (otherLangStart !== -1 && otherLangStart < langEnd) {
            langEnd = otherLangStart;
        }
    }

    const langContent = content.substring(langStart, langEnd);
    const keys = {};

    sections.forEach(section => {
        const sectionStart = langContent.indexOf(`      ${section}: {`);
        if (sectionStart === -1) return;
        
        let sectionEnd = langContent.indexOf('      }', sectionStart);
        if (sectionEnd === -1) sectionEnd = langContent.length;

        const sectionContent = langContent.substring(sectionStart, sectionEnd);
        const sectionKeys = [];
        const regex = /        (\w+):/g;
        let match;
        while ((match = regex.exec(sectionContent)) !== null) {
            sectionKeys.push(match[1]);
        }
        keys[section] = sectionKeys;
    });

    return keys;
};

const enKeys = extractKeys('en');

languages.forEach(lang => {
    if (lang === 'en') return;
    const langKeys = extractKeys(lang);
    console.log(`Checking ${lang}...`);
    sections.forEach(section => {
        if (!enKeys[section]) return;
        enKeys[section].forEach(key => {
            if (!langKeys[section] || !langKeys[section].includes(key)) {
                console.log(`  Missing [${section}.${key}] in ${lang}`);
            }
        });
    });
});
