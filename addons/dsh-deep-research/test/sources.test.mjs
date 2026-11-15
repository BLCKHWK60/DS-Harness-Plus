// How a report labels its sources: read, seen only in search results, or neither.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FETCHED, SEARCH_ONLY, SOURCE_LABELS, UNSEEN, droppedNote, fetchSucceeded, moreCertain, notRead, sourceLabel, sourceLines, statusOf, unreadNotes } from '../lib/sources.js';

test('a source\'s status comes from what its helper opened and was shown', () => {
  const log = { fetched: new Set(['https://a.example/x']), seen: new Set(['https://a.example/x', 'https://b.example/y']) };
  assert.equal(statusOf('https://a.example/x', log), FETCHED, 'opened beats seen');
  assert.equal(statusOf('https://b.example/y', log), SEARCH_ONLY);
  assert.equal(statusOf('https://c.example/z', log), UNSEEN);
  assert.equal(statusOf('https://c.example/z', undefined), UNSEEN);
  assert.equal(notRead(FETCHED), false);
  assert.equal(notRead(SEARCH_ONLY), true);
  assert.equal(notRead(UNSEEN), true);
});

test('two helpers citing one page: the source keeps the more certain status', () => {
  assert.equal(moreCertain(UNSEEN, SEARCH_ONLY), SEARCH_ONLY, 'seen in a search beats not seen');
  assert.equal(moreCertain(SEARCH_ONLY, UNSEEN), SEARCH_ONLY);
  assert.equal(moreCertain(UNSEEN, FETCHED), FETCHED, 'read beats not seen');
  assert.equal(moreCertain(FETCHED, UNSEEN), FETCHED);
  assert.equal(moreCertain(SEARCH_ONLY, FETCHED), FETCHED, 'read beats seen in a search');
  assert.equal(moreCertain(FETCHED, SEARCH_ONLY), FETCHED);
  for (const status of [FETCHED, SEARCH_ONLY, UNSEEN]) assert.equal(moreCertain(status, status), status);
  assert.equal(moreCertain('odd', UNSEEN), UNSEEN, 'an unknown status ranks below them all');
  assert.equal(moreCertain(UNSEEN, 'odd'), UNSEEN);
  assert.equal(moreCertain(undefined, SEARCH_ONLY), SEARCH_ONLY);
});

test('a page counts as read only when its fetch came back without an error', () => {
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] }, meta: { url: 'https://a.example/x', statusCode: 200, truncated: false } }), true);
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] } }), true, 'a fetch tool without a status: no error is enough');
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [], isError: false }, meta: { statusCode: 399 } }), true);
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [], isError: true } }), false, 'an error result (timeout, refused, too large)');
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] }, meta: { statusCode: 403 } }), false, 'an error page from the site');
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] }, meta: { statusCode: 404 } }), false);
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] }, meta: { statusCode: 503 } }), false);
  assert.equal(fetchSucceeded({ message: { toolCallId: 'f1', content: [] }, meta: { statusCode: '403' } }), true, 'only a numeric status is read');
  assert.equal(fetchSucceeded(undefined), false, 'no result is no page');
});

test('labels say plainly whether the page was read', () => {
  assert.equal(sourceLabel(FETCHED), 'read');
  assert.equal(sourceLabel(SEARCH_ONLY), 'seen only in search results, not read');
  assert.equal(sourceLabel(UNSEEN), 'not read, and not seen in search results');
  assert.equal(sourceLabel('odd'), SOURCE_LABELS[UNSEEN], 'an unknown status reads as the least certain one');
  for (const label of Object.values(SOURCE_LABELS)) assert.doesNotMatch(label, /fetch/, 'no tool words in the report');
  assert.equal(sourceLines([{ n: 1, url: 'https://a.example/x', status: FETCHED }, { n: 2, url: 'https://b.example/y', status: SEARCH_ONLY }]),
    '[1] https://a.example/x (read)\n[2] https://b.example/y (seen only in search results, not read)');
});

test('the Checks name cited sources no helper read, one note per kind', () => {
  assert.deepEqual(unreadNotes([{ status: FETCHED }]), []);
  const one = unreadNotes([{ status: FETCHED }, { status: SEARCH_ONLY }]);
  assert.deepEqual(one, ['1 cited source was seen only in search results, not read: what the report takes from it rests at most on a search result\'s short summary, not on the page.']);
  const both = unreadNotes([{ status: SEARCH_ONLY }, { status: SEARCH_ONLY }, { status: UNSEEN }]);
  assert.equal(both.length, 2);
  assert.match(both[0], /^2 cited sources were seen only in search results, not read: .* from them /);
  assert.match(both[1], /^1 cited source was not read, and not seen in search results either: check it before relying on what it supports\.$/);
});

test('the dropped note names unread pages only when they are dropped', () => {
  assert.equal(droppedNote(0, true), '');
  assert.equal(droppedNote(1, false), '1 finding was dropped (no usable address, over the source limit).');
  assert.equal(droppedNote(3, true), '3 findings were dropped (no usable address, over the source limit, or its helper did not read the page).');
});
