#!/usr/bin/env node
/**
 * Real Chromium lab test for the production homepage's inline Numbers-to-Words calculator.
 * Run after deploy with N2W_BASE_URL set to the deployed origin.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwrightPath = require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_INSTALL_DIR || process.cwd()] });
const { chromium } = require(playwrightPath);

const baseUrl = new URL(process.env.N2W_BASE_URL || 'https://ilovepdf-web.web.app/');
const origin = baseUrl.origin;
const homepageUrl = new URL('/', baseUrl);
homepageUrl.search = baseUrl.search;
const browser = await chromium.launch({ headless: true });
const failures = [];
const pass = (message) => console.log('PASS:', message);
const fail = (message) => { failures.push(message); console.error('FAIL:', message); };

try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const converterResponses = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/js/n2w-converter.js') {
      converterResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('pageerror', error => failures.push('Uncaught browser error: ' + error.message));

  const response = await page.goto(homepageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!response || response.status() !== 200) throw new Error('Homepage navigation failed: HTTP ' + (response?.status() ?? 'no response'));
  await page.locator('#calc-input').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#calc-go').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => window.__ILOVE_HOME_RUNTIME_READY === true, null, { timeout: 30000 });
  pass('homepage loads and the inline calculator runtime is ready');

  async function convert(input, expected) {
    const inputBox = page.locator('#calc-input');
    const output = page.locator('#calc-out');
    await inputBox.fill(input);
    await page.locator('#calc-go').click();
    await page.waitForFunction(
      ({ selector, expectedText }) => {
        const el = document.querySelector(selector);
        return !!el && el.textContent.toLowerCase().includes(expectedText) &&
          !/loading converter|converter is loading/i.test(el.textContent);
      },
      { selector: '#calc-out', expectedText: expected },
      { timeout: 20000 }
    );
    const actual = (await output.innerText()).trim();
    if (!actual.toLowerCase().includes(expected)) throw new Error(input + ' output mismatch: ' + actual);
    pass(input + ' → ' + actual);
  }

  await convert('123', 'one hundred twenty-three');
  if (!converterResponses.length) throw new Error('Converter asset was not requested when the user clicked Convert.');
  if (converterResponses.some(item => item.status !== 200)) {
    throw new Error('Converter asset did not return HTTP 200: ' + JSON.stringify(converterResponses));
  }
  pass('lazy-loaded converter asset returns HTTP 200 after user interaction');

  await convert('12345', 'twelve thousand three hundred forty-five');
  await convert('12.34', 'twelve point three four');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileToggle = page.locator('#calc-toggle');
  if (await mobileToggle.isVisible()) await mobileToggle.click();
  await page.locator('#calc-input').waitFor({ state: 'visible', timeout: 10000 });
  await convert('42', 'forty-two');
  pass('mobile viewport conversion works after opening the homepage calculator panel');

  if (failures.length) throw new Error(failures.join('\n'));
  console.log('REAL HOMEPAGE LAB PASSED: ' + origin);
} finally {
  await browser.close();
}
