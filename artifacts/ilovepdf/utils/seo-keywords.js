const LOCAL_ENGINE_UNAVAILABLE = {
  'protect-pdf': 'PDF password protection is unavailable until a verified browser-only encryption engine is ready. Your file is not uploaded.',
  'unlock-pdf': 'PDF password removal is unavailable until a verified browser-only decryption engine is ready. Your file is not uploaded.',
  'translate-pdf': 'PDF translation is unavailable until an on-device translation model is ready. Your file is not uploaded.',
};

export function getToolSeo(slug, defaultName = '') {
  const cleanName = defaultName || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const unavailableMessage = LOCAL_ENGINE_UNAVAILABLE[slug];
  return {
    title: unavailableMessage
      ? `${cleanName} Temporarily Unavailable | ILovePDF`
      : `${cleanName} Online Free — Fast & Secure | ILovePDF`,
    description: unavailableMessage ||
      `Free online ${cleanName} tool. No signup or installation required. Supported file processing runs in your browser; document contents are not uploaded to our file-processing service.`,
    h1: cleanName,
    keywords: `${slug}, ${cleanName.toLowerCase()}, free online pdf tools, ilovepdf`,
    faqs: unavailableMessage ? [
      { q: `Is ${cleanName} available?`, a: unavailableMessage },
      { q: `Are my files uploaded?`, a: `No. ${cleanName} does not send your document to a file-processing server.` },
    ] : [
      { q: `Is ${cleanName} free to use?`, a: `Yes, ${cleanName} is 100% free with no account or registration required.` },
      { q: `Are my files safe?`, a: `Supported file tools process document contents locally in your browser. The app releases its own references after processing; browser memory and downloads remain under browser control.` },
      { q: `What file formats are supported?`, a: `We support PDF documents and all standard image formats.` },
    ],
    benefits: [
      'No installation needed',
      'Client-first private processing',
      'High speed & lossless quality',
      'Works on all mobile and desktop browsers'
    ],
  };
}
