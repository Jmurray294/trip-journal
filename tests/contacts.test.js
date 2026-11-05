import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContact, upsertContact, removeContact, mailtoMany, smsTo } from '../src/lib/contacts.js';

test('a contact needs an email or a phone, and gets a name if it has none', () => {
  assert.equal(makeContact({ name: 'Karen' }, 'a'), null);
  assert.equal(makeContact({ name: 'Karen', email: 'not-an-email' }, 'a'), null);
  const c = makeContact({ name: '  Aunt   Karen ', email: ' Karen@Example.com ', phone: '' }, 'a');
  assert.deepEqual(c, { id: 'a', name: 'Aunt Karen', email: 'karen@example.com', phone: '' });
  assert.equal(upsertContact([], makeContact({ email: 'bob@x.com' }, 'b'))[0].name, 'bob');
  assert.equal(makeContact({ phone: '(414) 555-0101' }, 'c').phone, '(414) 555-0101');
});

test('the same email is the same person: saving again updates, and keeps what it knew', () => {
  let l = upsertContact([], makeContact({ name: 'Karen', email: 'k@x.com' }, 'a'));
  l = upsertContact(l, makeContact({ name: 'Bob', phone: '555-1234' }, 'b'));
  l = upsertContact(l, makeContact({ name: 'Aunt Karen', email: 'K@x.com', phone: '555-9999' }, 'z'));
  assert.equal(l.length, 2);
  const k = l.find((x) => x.email === 'k@x.com');
  assert.deepEqual(k, { id: 'a', name: 'Aunt Karen', email: 'k@x.com', phone: '555-9999' });
  assert.deepEqual(l.map((x) => x.name), ['Aunt Karen', 'Bob']);
  // editing by id changes that contact
  l = upsertContact(l, { ...makeContact({ name: 'Bobby', phone: '555-1234' }, 'b') });
  assert.deepEqual(l.map((x) => x.name), ['Aunt Karen', 'Bobby']);
  assert.deepEqual(removeContact(l, 'a').map((x) => x.id), ['b']);
  // an edit replaces: clearing the phone clears it
  l = upsertContact(l, makeContact({ name: 'Aunt Karen', email: 'k@x.com', phone: '' }, 'a'));
  assert.equal(l.find((x) => x.id === 'a').phone, '');
  // inviting someone again by email alone keeps the name they were saved with
  l = upsertContact(l, makeContact({ email: 'k@x.com' }, 'q'));
  assert.equal(l.find((x) => x.email === 'k@x.com').name, 'Aunt Karen');
});

test('group email is bcc; a text goes to one number with the message', () => {
  const m = mailtoMany(['a@x.com', 'b@x.com'], 'Hi there', 'Line 1\nhttps://x.com/?t=1');
  assert.ok(m.startsWith('mailto:?bcc=a%40x.com%2Cb%40x.com&subject=Hi%20there&body=Line%201%0Ahttps'));
  assert.equal(smsTo('(414) 555-0101', 'Join us'), 'sms:4145550101?&body=Join%20us');
});
