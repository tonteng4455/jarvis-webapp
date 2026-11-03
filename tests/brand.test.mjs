import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { safeName, applyBrand, DEFAULT } = createRequire(import.meta.url)('../tools/brandLoader.cjs');

test('the default name changes nothing', () => {
  assert.equal(DEFAULT, 'Jarvis');
  const src = "const a = 'ใช้ Jarvis ได้ฟรี'; // jarvis-webapp";
  assert.equal(applyBrand(src, 'Jarvis'), src);
  assert.equal(safeName(undefined), 'Jarvis');
  assert.equal(safeName(''), 'Jarvis');
  assert.equal(safeName('   '), 'Jarvis');
});

test('another name replaces every capitalised "Jarvis" and nothing in lower case', () => {
  assert.equal(applyBrand('Jarvis ผูกบัญชีได้ Jarvis เดียว · jarvis-line-bot · jarvis_session', 'Friday'), 'Friday ผูกบัญชีได้ Friday เดียว · jarvis-line-bot · jarvis_session');
});

test('the name is made safe to paste into source code', () => {
  assert.equal(safeName('Friday'), 'Friday');
  assert.equal(safeName('  ฟรายเดย์ 2 '), 'ฟรายเดย์ 2');
  assert.equal(safeName("Fri'day"), 'Friday');
  assert.equal(safeName('"; process.exit(1); //'), 'process.exit1');
  assert.equal(safeName('<b>x</b>`${y}`\\'), 'bxby');
  assert.equal(safeName('a'.repeat(80)).length, 30);
  assert.equal(safeName("'\"`"), 'Jarvis');
});

test('a female bot says "ค่ะ" / "คะ" / "นะคะ"; the default voice is untouched', async () => {
  const { applyPersona, safeGender } = (await import('node:module')).createRequire(import.meta.url)('../tools/persona.cjs');
  const t = 'พร้อมให้บริการครับ ต้องการให้ดำเนินการอย่างไรครับ ได้ไหมครับ? ต้องกดก่อนนะครับ เรียบร้อยครับผม';
  assert.equal(applyPersona(t, 'female'), 'พร้อมให้บริการค่ะ ต้องการให้ดำเนินการอย่างไรคะ ได้ไหมคะ? ต้องกดก่อนนะคะ เรียบร้อยค่ะ');
  assert.equal(applyPersona(t, undefined), t);
  assert.equal(applyPersona(t, 'male'), t);
  assert.equal(safeGender('Female'), 'female');
  assert.equal(safeGender('x'), 'male');
});
