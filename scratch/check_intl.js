try {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of('hi');
  console.log('Language Name:', name);
} catch (e) {
  console.log('Intl.DisplayNames not supported:', e.message);
}
