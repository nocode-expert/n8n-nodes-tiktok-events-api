const test = require('node:test');
const assert = require('node:assert/strict');

const { TiktokEvents } = require('../dist/nodes/TiktokEvents/TiktokEvents.node.js');

/**
 * These tests cover how the request goes on the wire, and how the answer is
 * read, rather than how the payload is built. Both are places where every unit
 * test can pass while the node is wrong: TikTok answers HTTP 200 to an event it
 * has rejected, so the status line is not the outcome.
 */

function makeContext(params, capture, response) {
	return {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ accessToken: 'token' }),
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getNode: () => ({ name: 'TikTok Events API' }),
		getExecutionId: () => 'exec-1',
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: {
				call: async (_ctx, credentialName, options) => {
					capture.options = options;
					capture.credentialName = credentialName;
					return response ?? { code: 0, message: 'OK', request_id: 'REQ' };
				},
			},
		},
	};
}

const baseParams = {
	operation: 'sendEvent',
	pixelCode: 'CACHW3JC77UB1AB2CDEF',
	eventName: 'Schedule',
	pageUrl: 'https://example.com/thanks',
	eventId: 'evt-1',
	eventTime: '',
	value: '',
	currency: 'USD',
	userData: { email: 'test@gmail.com' },
	properties: {},
	options: {},
};

async function run(params, response, overrides = {}) {
	const capture = {};
	const ctx = { ...makeContext(params, capture, response), ...overrides };
	const output = await TiktokEvents.prototype.execute.call(ctx);
	return { capture, output };
}

test('the request posts a JSON body to the Events API 2.0 endpoint', async () => {
	const { capture } = await run(baseParams);
	assert.equal(capture.options.method, 'POST');
	assert.equal(
		capture.options.url,
		'https://business-api.tiktok.com/open_api/v1.3/event/track/',
	);
	assert.equal(capture.options.json, true);
});

test('the pixel code is sent as event_source_id with event_source web', async () => {
	const { capture } = await run(baseParams);
	assert.equal(capture.options.body.event_source, 'web');
	assert.equal(capture.options.body.event_source_id, 'CACHW3JC77UB1AB2CDEF');
});

test('the event travels inside a data array', async () => {
	const { capture } = await run(baseParams);
	assert.ok(Array.isArray(capture.options.body.data));
	assert.equal(capture.options.body.data.length, 1);
	assert.equal(capture.options.body.data[0].event, 'Schedule');
});

test('the node authenticates through the credential rather than a token in the URL', async () => {
	const { capture } = await run(baseParams);
	assert.equal(capture.credentialName, 'tiktokEventsApi');
	assert.ok(!capture.options.url.includes('access_token'));
});

test('test_event_code sits beside data, never inside the event', async () => {
	const { capture } = await run({ ...baseParams, options: { testEventCode: 'TEST87463' } });
	assert.equal(capture.options.body.test_event_code, 'TEST87463');
	assert.ok(!('test_event_code' in capture.options.body.data[0]));
});

test('no test_event_code is sent when none is configured', async () => {
	const { capture } = await run(baseParams);
	assert.ok(!('test_event_code' in capture.options.body));
});

test('test_event_code is reported in the output so a test send is distinguishable', async () => {
	const { output } = await run({ ...baseParams, options: { testEventCode: 'TEST87463' } });
	assert.equal(output[0][0].json.test_event_code, 'TEST87463');
	assert.equal(output[0][0].json.code, 0);
});

test('client ip and user agent reach the wire under user', async () => {
	// The node's field names and the builder's input keys diverged once, so both
	// were dropped from every event while every unit test still passed.
	const { capture } = await run({
		...baseParams,
		userData: {
			email: 'test@gmail.com',
			clientIpAddress: '13.57.97.131',
			clientUserAgent: 'Mozilla/5.0',
		},
	});
	assert.equal(capture.options.body.data[0].user.ip, '13.57.97.131');
	assert.equal(capture.options.body.data[0].user.user_agent, 'Mozilla/5.0');
});

test('a rejected event raises even though TikTok answered HTTP 200', async () => {
	// The whole point: TikTok returns 200 with a non-zero code in the body. Reading
	// the status alone would report every rejection as a delivered conversion.
	await assert.rejects(
		run(baseParams, { code: 40100, message: 'Invalid pixel code', request_id: 'REQ' }),
		/Invalid pixel code/,
	);
});

test('a code of 0 is a success and is passed through', async () => {
	const { output } = await run(baseParams, { code: 0, message: 'OK', request_id: 'REQ' });
	assert.equal(output[0][0].json.code, 0);
	assert.equal(output[0][0].json.event_source_id, 'CACHW3JC77UB1AB2CDEF');
	assert.equal(output[0][0].json.event.event, 'Schedule');
});

test('event_id falls back to the execution id so retries stay idempotent', async () => {
	const { capture } = await run({ ...baseParams, eventId: '' });
	assert.equal(capture.options.body.data[0].event_id, 'exec-1-0');
});

test('an event with no identifier at all is rejected rather than sent unmatched', async () => {
	await assert.rejects(
		run({ ...baseParams, userData: {} }),
		/no customer information to match on/,
	);
});

test('continueOnFail reports the pixel and the event, not just the message', async () => {
	const { output } = await run(
		baseParams,
		{ code: 40100, message: 'Invalid pixel code', request_id: 'REQ' },
		{ continueOnFail: () => true },
	);
	assert.match(output[0][0].json.error, /Invalid pixel code/);
	assert.equal(output[0][0].json.event_source_id, 'CACHW3JC77UB1AB2CDEF');
	assert.equal(output[0][0].json.event.event, 'Schedule');
});
