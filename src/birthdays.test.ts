import assert from 'node:assert/strict';
import { test } from 'node:test';
import { birthdayMessage, isLeapYear, isValidBirthday } from './birthdays.js';

test('accepts real dates, including Feb 29', () => {
  assert.ok(isValidBirthday(1, 1));
  assert.ok(isValidBirthday(31, 12));
  assert.ok(isValidBirthday(30, 4));
  assert.ok(isValidBirthday(29, 2));
});

test('rejects impossible dates and non-whole numbers', () => {
  assert.ok(!isValidBirthday(30, 2));
  assert.ok(!isValidBirthday(31, 4));
  assert.ok(!isValidBirthday(0, 1));
  assert.ok(!isValidBirthday(1, 13));
  assert.ok(!isValidBirthday(2.5, 1));
});

test('knows which years have a Feb 29', () => {
  assert.ok(isLeapYear(2028));
  assert.ok(isLeapYear(2000));
  assert.ok(!isLeapYear(2027));
  assert.ok(!isLeapYear(2100));
});

test('names the member with a mention that does not ping them', () => {
  assert.deepEqual(birthdayMessage('123'), {
    content: 'Happy Birthday <@123>! :birthday:',
    allowedMentions: { parse: [] },
  });
});
