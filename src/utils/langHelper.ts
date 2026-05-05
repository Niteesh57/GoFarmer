export const getLangCode = (lang: string) => {
  if (!lang) return 'en-US';
  if (lang.includes('Hindi')) return 'hi-IN';
  if (lang.includes('Fran')) return 'fr-FR';
  if (lang.includes('Espa')) return 'es-ES';
  return 'en-US';
};

export const getAppLangCode = (langLabel: string) => {
  if (!langLabel) return 'en';
  if (langLabel.includes('Hindi')) return 'hi';
  if (langLabel.includes('Fran')) return 'fr';
  if (langLabel.includes('Espa')) return 'es';
  return 'en';
};
