/* SAF bilingual document integrity utilities. No PDF parsing or translation here.
   The English source must be an immutable, independently extracted snapshot.
   Comparison is deliberately strict: no trim(), normalization, or autocorrection. */
export function verifyEnglishBlocks(source, rendered) {
  if (!Array.isArray(source) || !Array.isArray(rendered))
    return { ok:false, errors:['Invalid block collection'] };
  const errors = [];
  if (source.length !== rendered.length) errors.push('Block count differs');
  const ids = new Set();
  source.forEach((block, i) => {
    if (!block || typeof block.id !== 'string' || typeof block.text !== 'string' ||
        !Number.isInteger(block.page) || block.page < 1) {
      errors.push('Invalid source block at '+i); return;
    }
    if (ids.has(block.id)) errors.push('Duplicate source ID '+block.id);
    ids.add(block.id);
    const actual = rendered[i];
    if (!actual || actual.id !== block.id || actual.page !== block.page ||
        actual.text !== block.text)
      errors.push('Source mismatch at block '+i+' ('+block.id+')');
  });
  return { ok:errors.length===0, errors };
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}
export function renderBilingualBlocks(source, translations, mode='both') {
  if (!['both','en','fr'].includes(mode)) throw Error('Invalid language mode');
  if (!Array.isArray(source) || !Array.isArray(translations) ||
      source.length !== translations.length) throw Error('Block alignment required');
  return source.map((block,i) => {
    const tr=translations[i];
    if (!tr || tr.id !== block.id || typeof tr.text !== 'string')
      throw Error('Translation alignment mismatch at '+i);
    const en='<p lang="en" class="saf-en">'+escapeHtml(block.text)+'</p>';
    const fr='<p lang="fr" class="saf-fr">'+escapeHtml(tr.text)+'</p>';
    return '<section class="saf-bilingual-block" data-source-id="'+escapeHtml(block.id)+'">'+
      (mode==='fr'?'':en)+(mode==='en'?'':fr)+'</section>';
  }).join('\n');
}
