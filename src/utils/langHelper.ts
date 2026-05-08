export const getLangCode = (lang: string) => {
  if (!lang) return 'en-US';
  const l = lang.toLowerCase();
  
  // Mapping of common language names to ISO codes for TTS
  const map: { [key: string]: string } = {
    'hindi': 'hi-IN',
    'हिंदी': 'hi-IN',
    'english': 'en-US',
    'french': 'fr-FR',
    'français': 'fr-FR',
    'spanish': 'es-ES',
    'español': 'es-ES',
    'german': 'de-DE',
    'deutsch': 'de-DE',
    'telugu': 'te-IN',
    'తెలుగు': 'te-IN',
    'tamil': 'ta-IN',
    'தமிழ்': 'ta-IN',
    'kannada': 'kn-IN',
    'ಕನ್ನಡ': 'kn-IN',
    'chinese': 'zh-CN',
    '中文': 'zh-CN',
    'japanese': 'ja-JP',
    '日本語': 'ja-JP',
    'swedish': 'sv-SE',
    'svenska': 'sv-SE',
    'marathi': 'mr-IN',
    'मराठी': 'mr-IN',
    'bengali': 'bn-IN',
    'বাংলা': 'bn-IN',
    'gujarati': 'gu-IN',
    'ગુજરાતી': 'gu-IN',
  };

  for (const [name, code] of Object.entries(map)) {
    if (l.includes(name)) return code;
  }

  return 'en-US';
};

export const getAppLangCode = (langLabel: string) => {
  if (!langLabel) return 'en';
  const l = langLabel.toLowerCase();
  
  const map: { [key: string]: string } = {
    'hindi': 'hi',
    'हिंदी': 'hi',
    'english': 'en',
    'french': 'fr',
    'français': 'fr',
    'spanish': 'es',
    'español': 'es',
    'german': 'de',
    'deutsch': 'de',
    'telugu': 'te',
    'తెలుగు': 'te',
    'kannada': 'kn',
    'ಕನ್ನಡ': 'kn',
    'chinese': 'zh',
    '中文': 'zh',
    'japanese': 'ja',
    '日本語': 'ja',
    'swedish': 'sv',
    'svenska': 'sv',
    'tamil': 'ta',
  };

  for (const [name, code] of Object.entries(map)) {
    if (l.includes(name)) return code;
  }

  return 'en';
};
