const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
	buildTiktokEvent,
	parseTiktokValue,
} = require('../dist/nodes/TiktokEvents/tiktok/buildTiktokEvent.js');

const sha256 = (v) => createHash('sha256').update(v, 'utf8').digest('hex');

const T = Date.UTC(2020, 8, 17, 19, 49, 27); // 1600372167
const base = { eventName: 'Lead', eventTimeMs: T, userData: {} };

// ---------------------------------------------------------------------------
// Events API 2.0 (/event/track/). Shape verified against a payload running in
// production, since TikTok's public docs still describe the legacy
// /pixel/track/ endpoint, which differs in almost every one of these details.
// ---------------------------------------------------------------------------

test('event_time is unix seconds, not the legacy ISO 8601 timestamp', () => {
	const event = buildTiktokEvent({ ...base, userData: { clientIpAddress: '13.57.97.131' } });
	assert.equal(event.event_time, 1600372167);
	assert.equal(event.timestamp, undefined);
});

test('email is hashed and sent as an array', () => {
	const event = buildTiktokEvent({ ...base, userData: { email: ' JSmith@Example.COM ' } });
	assert.deepEqual(event.user.email, [sha256('jsmith@example.com')]);
});

test('phone is hashed in TikTok format, keeping the +, and sent as an array', () => {
	const event = buildTiktokEvent({ ...base, userData: { phone: '+1 (213) 373-4253' } });
	assert.deepEqual(event.user.phone, [sha256('+12133734253')]);
});

test('external_id is hashed but sent as a single string, not an array', () => {
	const event = buildTiktokEvent({ ...base, userData: { externalId: 'user-42' } });
	assert.equal(event.user.external_id, sha256('user-42'));
});

test('ttclid, ip and user_agent live inside user and are never hashed', () => {
	const event = buildTiktokEvent({
		...base,
		userData: { ttclid: '123ATXSfe', clientIpAddress: '13.57.97.131', clientUserAgent: 'Mozilla/5.0' },
	});
	assert.equal(event.user.ttclid, '123ATXSfe');
	assert.equal(event.user.ip, '13.57.97.131');
	assert.equal(event.user.user_agent, 'Mozilla/5.0');
	// The legacy endpoint put these on context; 2.0 does not have a context at all.
	assert.equal(event.context, undefined);
});

test('page url is on the event, not nested under context', () => {
	const event = buildTiktokEvent({
		...base,
		userData: { clientIpAddress: '13.57.97.131' },
		pageUrl: 'https://example.com/thank-you',
	});
	assert.equal(event.page.url, 'https://example.com/thank-you');
});

test('an event with no value omits properties entirely', () => {
	const event = buildTiktokEvent({ ...base, userData: { clientIpAddress: '13.57.97.131' }, value: '' });
	assert.equal(event.properties, undefined);
});

test('a value sends value and currency together, currency upper-cased', () => {
	const event = buildTiktokEvent({
		...base,
		userData: { clientIpAddress: '13.57.97.131' },
		value: '60',
		currency: 'usd',
	});
	assert.equal(event.properties.value, 60);
	assert.equal(event.properties.currency, 'USD');
});

test('zero is a real value and is sent', () => {
	const event = buildTiktokEvent({ ...base, userData: { clientIpAddress: '13.57.97.131' }, value: '0' });
	assert.equal(event.properties.value, 0);
});

test('a non-numeric value raises rather than booking the conversion at 0', () => {
	assert.throws(() => parseTiktokValue('N/A'), /is not a number/);
});

test('blank identifiers are omitted, never sent as a hash of an empty string', () => {
	const event = buildTiktokEvent({
		...base,
		userData: { email: '', phone: '', externalId: '', clientIpAddress: '13.57.97.131' },
	});
	assert.equal(event.user.email, undefined);
	assert.equal(event.user.phone, undefined);
	assert.equal(event.user.external_id, undefined);
});

test('a pre-hashed identifier is passed through, not hashed twice', () => {
	const digest = sha256('jsmith@example.com');
	const event = buildTiktokEvent({ ...base, userData: { email: digest, phone: digest } });
	assert.deepEqual(event.user.email, [digest]);
	assert.deepEqual(event.user.phone, [digest]);
});

test('custom properties are merged alongside value and currency', () => {
	const event = buildTiktokEvent({
		...base,
		userData: { clientIpAddress: '13.57.97.131' },
		value: '46',
		properties: { content_type: 'product_group', content_id: '1077218' },
	});
	assert.equal(event.properties.content_type, 'product_group');
	assert.equal(event.properties.content_id, '1077218');
	assert.equal(event.properties.value, 46);
});
