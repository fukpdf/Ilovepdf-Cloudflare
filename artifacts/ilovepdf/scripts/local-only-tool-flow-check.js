// Static contract checks for the shared, browser-only tool pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let passed = 0;

function check(label, condition) {
  assert.ok(condition, label);
  passed++;
  console.log(`PASS ${label}`);
}

const toolHtml = read('public/tool.html');
const coreList = toolHtml.match(/var coreScriptPaths = new Set\(\[([\s\S]*?)\]\);/);
check('tool route boots a curated shared core script list', !!coreList);
check('tool route keeps processors, queue, and session persistence out of first paint',
  !/browser-tools|advanced-engine|queue-client|session-persist|worker-pool|live-preview\.js|page-organizer\.js/i.test(coreList[1]));

const moduleRegistry = read('public/js/tool-module-registry.js');
check('selected-file preparation loads the processor and selected dependencies on demand',
  moduleRegistry.includes("_loadScript('/js/browser-tools.js')") &&
  moduleRegistry.includes('G.BrowserTools.prewarm(toolId, files || [])') &&
  moduleRegistry.includes('unavailableLocalEngines') &&
  read('public/js/tools-config.js').includes('window.TOOLS = TOOLS'));

const toolPageSource = read('public/js/tool-page.js');
const navigation = read('public/js/shared-navigation.js');
check('navigation preserves the existing shell and replaces only main content',
  navigation.includes('replaceChild(nextMain, oldMain)') &&
  navigation.includes('path !== \'/js/queue-client.js\''));
check('standalone tool routes load their content and scripts into the shared shell',
  navigation.includes('specialToolPageForUrl') &&
  navigation.includes('loadSpecialToolPage') &&
  navigation.includes('loadSpecialPageScripts') &&
  navigation.includes('data-shared-special-route') &&
  navigation.includes('function isRuntimeToolMain'));
check('standalone route scripts preserve dependencies and isolate inline handlers',
  navigation.includes('function loadSpecialPageScript') &&
  navigation.includes('routeScriptLoads') &&
  navigation.includes('(function () {\\n'));
const server = read('server.js');
const staticPages = server.match(/const STATIC_PAGES = \[([\s\S]*?)\];/);
check('remaining standalone utilities are served before the generic tool shell',
  !!staticPages &&
  /'numbers-to-words'/.test(staticPages[1]) &&
  /'currency-converter'/.test(staticPages[1]) &&
  /'qr-code-generator'/.test(staticPages[1]) &&
  /'barcode-generator'/.test(staticPages[1]) &&
  !/image-compressor|image-converter|zip-builder/.test(staticPages[1]) &&
  server.indexOf('STATIC_PAGES.forEach') < server.indexOf("app.get('/:slug'"));
check('image compression, conversion, and ZIP tools use the generic shared tool route',
  !/special:\s*'\/(image-compressor|image-converter|zip-builder)\.html'/.test(read('public/js/tools-config.js')) &&
  /'image-compressor':\s*\{ id:'image-compressor' \}/.test(read('public/js/tools-config.js')) &&
  /'image-converter':\s*\{ id:'image-converter' \}/.test(read('public/js/tools-config.js')) &&
  /'zip-builder':\s*\{ id:'zip-builder' \}/.test(read('public/js/tools-config.js')));
check('direct and programmatic standalone routes prefer shared navigation',
  toolPageSource.includes('function openSpecialToolPage') &&
  toolPageSource.includes('window.SharedNavigation.navigate(target, { push: false })'));
check('currency converter initializes after SPA insertion as well as first page load',
  read('public/currency-converter.html').includes("document.readyState === 'loading'") &&
  read('public/currency-converter.html').includes('wireFx();'));

const browserTools = read('public/js/browser-tools.js');
const localFileTools = read('public/js/local-file-tools.js');
check('image and ZIP processors register only in the selected-file preparation path',
  moduleRegistry.includes("await _loadScript('/js/local-file-tools.js')") &&
  browserTools.includes('function registerHandler(toolId, handler)') &&
  localFileTools.includes("api.registerHandler('image-compressor'") &&
  localFileTools.includes("api.registerHandler('image-converter'") &&
  localFileTools.includes("api.registerHandler('zip-builder'") &&
  !/fetch\s*\(|FormData|\/api\/(upload|process|queue-job)/i.test(localFileTools));
const handlerBlock = browserTools.match(/const HANDLERS\s*=\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(handlerBlock, 'BrowserTools handler registry exists');
const handlerIds = new Set([...handlerBlock[1].matchAll(/^\s*'([^']+)'\s*:/gm)].map(match => match[1]));
check('verified local redaction uses the dedicated worker',
  handlerIds.has('redact') &&
  browserTools.includes("toolId === 'redact'") &&
  browserTools.includes("'/workers/redact-worker.js'"));
check('tools without verified local engines fail closed',
  !handlerIds.has('protect') && !handlerIds.has('unlock') && !handlerIds.has('translate'));
check('unavailable tools block file selection before upload',
  moduleRegistry.includes('getUnavailableMessage: getUnavailableMessage') &&
  toolPageSource.includes('getUnavailableMessage(tool.id)') &&
  toolPageSource.includes('renderUnavailableToolStep(tool, unavailableMessage)'));

const queueClient = read('public/js/queue-client.js');
check('legacy queue client cannot submit files to an API',
  !/fetch\s*\(|FormData|\/api\/queue-job/i.test(queueClient) &&
  queueClient.includes('tryProcess: async function () { return false; }'));

const appRouter = read('public/js/app-router.js');
check('app router has no server file-upload fallback',
  !/FormData|\/api\/queue-job|fetch\s*\(/i.test(appRouter) &&
  appRouter.includes("'redact': true"));
check('tool registry metadata contains no server processing endpoints',
  !/apiEndpoint\s*:/i.test(read('public/js/tools-config.js')) &&
  !/apiEndpoint\s*:/i.test(read('public/js/tool-registry-runtime.js')));

const translateAdapter = read('public/js/translate-worker-adapter.js');
const advancedEngine = read('public/js/advanced-engine.js');
check('translation never sends extracted document text to MyMemory',
  !/mymemory|fetch\s*\(/i.test(translateAdapter) &&
  !/api\.mymemory\.translated\.net/i.test(advancedEngine) &&
  !/api\.mymemory\.translated\.net|api\.mymemory/i.test(browserTools) &&
  advancedEngine.includes("throw new Error('local_translation_engine_unavailable')"));
const seoKeywords = read('utils/seo-keywords.js');
check('disabled local engines are clearly identified in public SEO metadata',
  seoKeywords.includes('LOCAL_ENGINE_UNAVAILABLE') &&
  /temporarily/i.test(seoKeywords) &&
  seoKeywords.includes('does not send your document to a file-processing server'));

const toolState = read('public/js/tool-state.js');
check('uploaded files are not persisted and legacy local temp stores are purged',
  toolState.includes('async function putBlob() { return false; }') &&
  toolState.includes('function save() { return false; }') &&
  toolState.includes("deleteDatabase('ilovepdf-adv-temp')") &&
  toolState.includes("deleteDatabase('ilovepdf-lfs-cp')") &&
  toolState.includes("name.indexOf('ilovepdf_') === 0"));

const toolPage = toolPageSource;
check('navigation and download release file references and stop active processing',
  toolPage.includes('function releaseToolMemory') &&
  toolPage.includes('WorkerPool.terminateAll') &&
  toolPage.includes('ToolState.clearAllFiles()') &&
  toolPage.includes('operationEpoch !== _toolMemoryEpoch') &&
  toolPage.includes("releaseToolMemory('restart')") &&
  toolPage.includes("addEventListener('pageshow'"));
check('successful processing opens the shared download step',
  toolPage.includes("this.navTo('download')") &&
  toolPage.includes('function renderDownloadStep(tool)'));

const sharedUi = read('public/js/shared.js');
check('processing status is inline and accessible',
  sharedUi.includes('processing-inline-status') &&
  sharedUi.includes('Handling your files with care') &&
  sharedUi.includes("setAttribute('aria-live', 'polite')"));

const redactWorker = read('public/workers/redact-worker.js');
check('redaction validates the selected area and page range before output',
  redactWorker.includes('Redaction area must be within the page bounds') &&
  redactWorker.includes('No valid pages were selected for redaction'));

check('static pages reinitialize after shared navigation',
  read('public/js/home.js').includes("addEventListener('app:route-changed'") &&
  read('public/js/blog-article.js').includes("addEventListener('app:route-changed'") &&
  read('public/js/about-contact-form.js').includes("addEventListener('app:route-changed'"));

console.log(`\n${passed} local-only tool-flow checks passed.`);
