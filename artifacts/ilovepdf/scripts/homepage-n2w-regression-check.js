#!/usr/bin/env node
/**
 * Regression test for the homepage-only Numbers-to-Words calculator.
 * Runs the browser engine in an isolated VM and checks the lazy-loader contract.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const failures = [];
const pass = (message) => console.log('PASS:', message);
const fail = (message) => { failures.push(message); console.error('FAIL:', message); };

const enginePath = new URL('../public/js/n2w-converter.js', import.meta.url);
const homePath = new URL('../public/js/home.js', import.meta.url);
const engine = fs.readFileSync(enginePath, 'utf8');
const home = fs.readFileSync(homePath, 'utf8');
const browserWindow = {
  location: { href: 'https://ilovepdf-web.web.app/' },
  setTimeout,
  clearTimeout,
};
const context = { window: browserWindow, console };
vm.runInNewContext(engine, context, { filename: 'n2w-converter.js', timeout: 1000 });

if (typeof browserWindow.convertNumberToWords !== 'function') {
  fail('converter script does not expose window.convertNumberToWords');
} else {
  pass('converter exposes its browser API');
  const cases = [
    ['123', 'one hundred twenty-three'],
    ['12345', 'twelve thousand three hundred forty-five'],
    ['0', 'zero'],
    ['12.34', 'twelve point three four'],
    ['-5', 'negative five'],
  ];
  for (const [input, expected] of cases) {
    const result = browserWindow.convertNumberToWords(input, { letterCase: 'lowercase' });
    if (result?.text === expected) pass(input + ' converts to "' + expected + '"');
    else fail(input + ' expected "' + expected + '", received ' + JSON.stringify(result));
  }
  const invalid = browserWindow.convertNumberToWords('not-a-number');
  if (invalid?.error) pass('invalid input returns a user-facing validation error');
  else fail('invalid input should return a validation error');
}

const loaderChecks = [
  ['homepage wires the inline calculator button', /btn\.addEventListener\('click',\s*run\)/.test(home)],
  ['homepage lazily requests the converter engine', /new URL\('\/js\/n2w-converter\.js',\s*window\.location\.href\)/.test(home)],
  ['homepage loader rejects a missing converter API', /Converter script loaded without exposing its API/.test(home)],
  ['homepage loader times out instead of leaving infinite loading', /Timed out loading the Numbers-to-Words engine/.test(home) && /window\.clearTimeout\(loadTimer\)/.test(home)],
  ['homepage lets the user retry after a failed load', /window\.__iloveN2WConverterLoad = null/.test(home) && /tap Convert to retry/.test(home)],
];
for (const [label, ok] of loaderChecks) ok ? pass(label) : fail(label);

if (failures.length) {
  console.error('Homepage Numbers-to-Words regression test failed: ' + failures.length + ' issue(s).');
  process.exit(1);
}
console.log('Homepage Numbers-to-Words regression test passed.');
