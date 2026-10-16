import test from 'node:test';
import assert from 'node:assert/strict';
import { evalMath, formatResult, answerAfterEquals, answerForEqualsPrefix, completeLineOnEnter } from '../lib/noteCalc.js';

test('arithmetic: precedence, parentheses, unary minus, power', () => {
  assert.equal(evalMath('5*10'), 50);
  assert.equal(evalMath('2+3*4'), 14);
  assert.equal(evalMath('(2+3)*4'), 20);
  assert.equal(evalMath('-3+5'), 2);
  assert.equal(evalMath('2^3^2'), 512);                // right-associative
  assert.equal(evalMath('10/4'), 2.5);
  assert.equal(evalMath('10-2-3'), 5);
  assert.equal(evalMath('2 * -3'), -6);
});

test('Thai digits, x × ÷, thousands commas, decimals', () => {
  assert.equal(evalMath('๕*๑๐'), 50);
  assert.equal(evalMath('5x10'), 50);
  assert.equal(evalMath('5×10'), 50);
  assert.equal(evalMath('100÷4'), 25);
  assert.equal(evalMath('1,250.5*2'), 2501);
  assert.equal(evalMath('0.1+0.2') && formatResult(evalMath('0.1+0.2')), '0.3');
  assert.equal(evalMath('.5*4'), 2);
});

test('percent: 7% is 0.07, and + / − take a share of the left side', () => {
  assert.equal(evalMath('1000*7%'), 70);
  assert.equal(evalMath('100+10%'), 110);
  assert.equal(evalMath('200-25%'), 150);
  assert.equal(evalMath('50%*8'), 4);
});

test('not an expression → null (never guesses)', () => {
  for (const bad of ['', '5', '5*', '*5', '5**3', '(5*3', '5*3)', '1/0', '1,23*2', '1.2.3*2', 'abc', '5 6', '2^', '12 + a', '()']) assert.equal(evalMath(bad), null, bad);
});

test('formatResult rounds float noise and refuses silly sizes', () => {
  assert.equal(formatResult(10 / 3), '3.33333333333');
  assert.equal(formatResult(0.1 * 3), '0.3');
  assert.equal(formatResult(1e30), null);
  assert.equal(formatResult(NaN), null);
});

test('typed "=": the answer goes right after it', () => {
  assert.deepEqual(answerAfterEquals('5*10='), { insert: '50' });
  assert.deepEqual(answerAfterEquals('ราคา 5*10='), { insert: '50' });
  assert.deepEqual(answerAfterEquals('box 5x10='), { insert: '50' });     // the x of "box" is not part of the sum
  assert.deepEqual(answerAfterEquals('รวม (120+30)*2 ='), { insert: '300' });
  assert.deepEqual(answerAfterEquals('1000*7%='), { insert: '70' });
  assert.equal(answerAfterEquals('a='), null);
  assert.equal(answerAfterEquals('5='), null);                              // nothing to calculate
  assert.equal(answerAfterEquals('x=5*'), null);
  assert.equal(answerAfterEquals('5*10'), null);                            // no "=" at the end
  assert.equal(answerAfterEquals('1/0='), null);
});

test('"=5*10" at the end of a line becomes the answer', () => {
  assert.deepEqual(answerForEqualsPrefix('=5*10'), { from: 0, text: '50' });
  assert.deepEqual(answerForEqualsPrefix('ราคา =5*10'), { from: 5, text: '50' });
  assert.equal(answerForEqualsPrefix('ราคา = 5*10'), null);                 // spaced "label = …" is left alone
  assert.equal(answerForEqualsPrefix('x=5*10'), null);                      // assignment-looking text is left alone
  assert.equal(answerForEqualsPrefix('=hello'), null);
  assert.equal(answerForEqualsPrefix('=5'), null);
});

test('completeLineOnEnter covers both shapes', () => {
  assert.equal(completeLineOnEnter('=5*10'), '50');
  assert.equal(completeLineOnEnter('ราคา =12*3'), 'ราคา 36');
  assert.equal(completeLineOnEnter('2+2='), '2+2=4');
  assert.equal(completeLineOnEnter('2+2=4'), null);
  assert.equal(completeLineOnEnter('hello'), null);
});
