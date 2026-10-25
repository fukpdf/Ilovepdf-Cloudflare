(function (G) {
  'use strict';

  var api = G.BrowserTools;
  if (!api || typeof api.registerHandler !== 'function') {
    throw new Error('The shared browser tool runtime must load before local file tools.');
  }
  if (api.supports('image-compressor') && api.supports('image-converter') && api.supports('zip-builder')) return;

  var IMAGE_MIME_BY_EXTENSION = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  var IMAGE_EXTENSION_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  var MAX_IMAGE_PIXELS = 64 * 1000 * 1000;

  function safeBaseName(value, fallback) {
    var base = String(value || fallback || 'file').replace(/\\/g, '/').split('/').pop();
    base = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+$/, '_').trim();
    return (base || fallback || 'file').slice(0, 180);
  }

  function fileStem(value) {
    return safeBaseName(value, 'image').replace(/\.[^.]*$/, '') || 'image';
  }

  function imageMime(file) {
    var declared = String(file && file.type || '').toLowerCase();
    if (IMAGE_EXTENSION_BY_MIME[declared]) return declared;
    var extension = String(file && file.name || '').split('.').pop().toLowerCase();
    return IMAGE_MIME_BY_EXTENSION[extension] || '';
  }

  function requestedImageMime(value, file) {
    if (value === 'original') return imageMime(file);
    return IMAGE_EXTENSION_BY_MIME[value] ? value : 'image/jpeg';
  }

  async function decodeImage(file) {
    if (typeof G.createImageBitmap === 'function') {
      var bitmap = await G.createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: function () { if (typeof bitmap.close === 'function') bitmap.close(); },
      };
    }

    var url = URL.createObjectURL(file);
    try {
      var image = await new Promise(function (resolve, reject) {
        var element = new Image();
        element.onload = function () { resolve(element); };
        element.onerror = function () { reject(new Error('The selected image could not be decoded.')); };
        element.src = url;
      });
      return {
        image: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: function () { URL.revokeObjectURL(url); },
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function renderImage(file, mime, quality) {
    if (!file || !imageMime(file)) throw new Error('Choose a valid JPG, PNG, or WebP image.');
    var decoded = await decodeImage(file);
    var canvas = document.createElement('canvas');
    try {
      if (!decoded.width || !decoded.height) throw new Error('The selected image has invalid dimensions.');
      if (decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
        throw new Error('This image is too large to process safely in this browser. Choose a smaller image.');
      }
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      var context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is not available in this browser.');
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (result) {
          if (result) resolve(result);
          else reject(new Error('The browser could not encode this image format.'));
        }, mime, quality);
      });
      if (!blob || !blob.size) throw new Error('The browser produced an empty image.');
      return blob;
    } finally {
      decoded.dispose();
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  function extensionForMime(mime) {
    return IMAGE_EXTENSION_BY_MIME[mime] || 'jpg';
  }

  function safeZipEntryName(name, fallback) {
    return safeBaseName(name, fallback).replace(/[\u0000-\u001f]/g, '_') || fallback;
  }

  function uniqueEntryName(name, used) {
    var safe = safeZipEntryName(name, 'file');
    var dot = safe.lastIndexOf('.');
    var stem = dot > 0 ? safe.slice(0, dot) : safe;
    var extension = dot > 0 ? safe.slice(dot) : '';
    var candidate = safe;
    var suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = stem + ' (' + suffix + ')' + extension;
      suffix++;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  async function loadZip() {
    var JSZip = G.JSZip;
    if (!JSZip && typeof api._loadJsZip === 'function') JSZip = await api._loadJsZip();
    if (!JSZip) throw new Error('The local ZIP engine could not be prepared.');
    return JSZip;
  }

  function compressionOptions(options) {
    var level = Number(options && options.compressionLevel);
    if (!Number.isFinite(level)) level = 6;
    level = Math.max(1, Math.min(9, Math.round(level)));
    return { compression: 'DEFLATE', compressionOptions: { level: level } };
  }

  async function imageCompressor(files, options) {
    var file = files && files[0];
    if (!file) throw new Error('Choose an image before processing.');
    var mime = requestedImageMime(options && options.format || 'original', file);
    if (!mime) throw new Error('The selected image format is not supported.');
    var qualityValue = Number(options && options.quality);
    var quality = Number.isFinite(qualityValue) && qualityValue > 0
      ? Math.max(10, Math.min(100, qualityValue)) / 100
      : 0.85;
    var blob = await renderImage(file, mime, quality);
    var extension = extensionForMime(mime);
    return {
      blob: blob,
      ext: '.' + extension,
      filename: safeBaseName(fileStem(file.name) + '-compressed.' + extension, 'compressed.' + extension),
      originalSize: file.size,
      outputSize: blob.size,
    };
  }

  async function imageConverter(files, options) {
    var inputs = Array.from(files || []);
    if (!inputs.length) throw new Error('Choose one or more images before processing.');
    var mime = requestedImageMime(options && options.format || 'image/jpeg');
    if (!mime) throw new Error('Choose a supported output image format.');
    var JSZip = await loadZip();
    var zip = new JSZip();
    var used = new Set();
    var extension = extensionForMime(mime);
    for (var i = 0; i < inputs.length; i++) {
      var file = inputs[i];
      var blob = await renderImage(file, mime, 0.92);
      var name = uniqueEntryName(fileStem(file.name) + '.' + extension, used);
      zip.file(name, blob);
    }
    var output = await zip.generateAsync(Object.assign({
      type: 'blob',
      mimeType: 'application/zip',
    }, compressionOptions({ compressionLevel: 6 })));
    return { blob: output, ext: '.zip', filename: 'ILovePDF-Converted-Images.zip' };
  }

  async function zipBuilder(files, options) {
    var inputs = Array.from(files || []);
    if (!inputs.length) throw new Error('Choose one or more files before building the ZIP archive.');
    var JSZip = await loadZip();
    var zip = new JSZip();
    var used = new Set();
    inputs.forEach(function (file) {
      zip.file(uniqueEntryName(file.name, used), file);
    });
    var output = await zip.generateAsync(Object.assign({
      type: 'blob',
      mimeType: 'application/zip',
    }, compressionOptions(options)));
    var base = safeBaseName(options && options.archiveName || 'ILovePDF-Archive', 'ILovePDF-Archive')
      .replace(/\.zip$/i, '') || 'ILovePDF-Archive';
    return { blob: output, ext: '.zip', filename: base + '.zip' };
  }

  api.registerHandler('image-compressor', imageCompressor);
  api.registerHandler('image-converter', imageConverter);
  api.registerHandler('zip-builder', zipBuilder);
}(window));
