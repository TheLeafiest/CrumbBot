import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPostContent, echoSubmission, parseSubmitterId, submissionForms, type SubmissionType } from './posts.js';

test('builds a post body with only the answered fields', () => {
  const content = buildPostContent('idea', '123', { title: 'Grenades', idea: 'Add grenades', why: '  ' });

  assert.equal(content, 'Submitted by <@123>\n\n**Your idea**\nAdd grenades');
});

test('reads the submitter back from a post body', () => {
  const content = buildPostContent('bug', '456', { title: 't', happened: 'Crashed', steps: 'Open map' });

  assert.equal(parseSubmitterId(content), '456');
  assert.equal(parseSubmitterId('A post someone made by hand'), null);
});

test('a full form always fits in one Discord message', () => {
  for (const type of Object.keys(submissionForms) as SubmissionType[]) {
    const values = Object.fromEntries(submissionForms[type].fields.map(field => [field.id, 'x'.repeat(field.maxLength)]));

    assert.ok(buildPostContent(type, '1'.repeat(20), values).length <= 2000, `${type} body is too long`);
    assert.ok(echoSubmission(type, values).length <= 2000 - 200, `${type} echo leaves no room for a message`);
  }
});

test('form labels and descriptions fit Discord limits', () => {
  for (const { modalTitle, fields } of Object.values(submissionForms)) {
    assert.ok(modalTitle.length <= 45, modalTitle);
    assert.ok(fields.length <= 5);

    for (const field of fields) {
      assert.ok(field.label.length <= 45, field.label);
      assert.ok(field.description.length <= 100, field.description);
    }
  }
});

test('echoes the member\'s text in a code block they cannot break out of', () => {
  const echo = echoSubmission('idea', { title: 'Hats', idea: 'Add ```hats```' });

  assert.equal(echo, "```\nHats\n\n**Your idea**\nAdd '''hats'''\n```");
});
