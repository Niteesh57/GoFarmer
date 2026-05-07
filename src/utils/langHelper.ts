export const getLangCode = (lang: string) => {
  if (!lang) return 'en-US';
  const l = lang.toLowerCase();
  if (l.includes('hindi') || l.includes('हिंदी')) return 'hi-IN';
  if (l.includes('fran')) return 'fr-FR';
  if (l.includes('espa')) return 'es-ES';
  return 'en-US';
};

export const getAppLangCode = (langLabel: string) => {
  if (!langLabel) return 'en';
  const l = langLabel.toLowerCase();
  if (l.includes('hindi') || l.includes('हिंदी')) return 'hi';
  if (l.includes('fran')) return 'fr';
  if (l.includes('espa')) return 'es';
  return 'en';
};
