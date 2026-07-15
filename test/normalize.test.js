const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
	normalizeEmail,
	normalizePhoneE164,
	normalizeExternalId,
	normalizeIp,
	normalizeRaw,
	hashIdentifier,
	hashNormalized,
	isSha256Hex,
	sha256,
} = require('../dist/nodes/TiktokEvents/shared/normalize.js');

const SHA256_OF_EMPTY_STRING =
	'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('email is trimmed and lowercased', () => {
	assert.equal(normalizeEmail('  JSmith@Example.COM '), 'jsmith@example.com');
});

test('email that is not an email is dropped rather than hashed', () => {
	assert.equal(normalizeEmail('n/a'), undefined);
	assert.equal(normalizeEmail(''), undefined);
	assert.equal(normalizeEmail('   '), undefined);
	assert.equal(normalizeEmail(undefined), undefined);
});

test('ip accepts v4 and v6 and drops anything else', () => {
	assert.equal(normalizeIp('203.0.113.5'), '203.0.113.5');
	assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1');
	assert.equal(normalizeIp('999.1.1.1'), undefined);
	assert.equal(normalizeIp('unknown'), undefined);
});

test('ip takes the client address from an X-Forwarded-For chain', () => {
	assert.equal(normalizeIp('203.0.113.5, 70.41.3.18'), '203.0.113.5');
});

test('hashNormalized never returns the hash of an empty string', () => {
	assert.equal(hashNormalized(undefined), undefined);
	assert.notEqual(hashNormalized(normalizeEmail('')), SHA256_OF_EMPTY_STRING);
	assert.equal(hashNormalized(normalizeEmail('')), undefined);
});

test('hash matches a SHA-256 computed independently', () => {
	const expected = createHash('sha256').update('jsmith@example.com', 'utf8').digest('hex');
	assert.equal(hashNormalized(normalizeEmail('JSmith@example.com ')), expected);
});

test('an already hashed value is passed through, never double hashed', () => {
	const alreadyHashed = sha256('jsmith@example.com');
	assert.ok(isSha256Hex(alreadyHashed));
	assert.equal(hashNormalized(alreadyHashed), alreadyHashed);
	assert.notEqual(hashNormalized(alreadyHashed), sha256(alreadyHashed));
});

// ---------------------------------------------------------------------------
// TikTok phone rule. Quoted from TikTok's "Report a Web Event" reference:
// "If the country code is 86, then do not include country code (example:
//  13800000000). Otherwise, include country code with + and remove any other
//  characters (spaces, '-') between numbers (example for US: +12133734253)"
// ---------------------------------------------------------------------------

test('tiktok phone keeps the leading + and strips separators (TikTok US example)', () => {
	assert.equal(normalizePhoneE164('+1 (213) 373-4253'), '+12133734253');
});

test("tiktok phone drops the country code for China, per TikTok's 86 carve-out", () => {
	assert.equal(normalizePhoneE164('+86 138 0000 0000'), '13800000000');
});

test('tiktok phone uses the default country code when the input has no +', () => {
	assert.equal(normalizePhoneE164('2133734253', '1'), '+12133734253');
});

test('tiktok phone does not double-prepend a country code already present', () => {
	assert.equal(normalizePhoneE164('12133734253', '1'), '+12133734253');
});

test('tiktok phone without a + and without a default country code is dropped', () => {
	// Guessing the country would silently produce a hash that matches nobody.
	assert.equal(normalizePhoneE164('2133734253'), undefined);
});

test('tiktok phone drops blank and unusable input rather than hashing it', () => {
	assert.equal(normalizePhoneE164(''), undefined);
	assert.equal(normalizePhoneE164('n/a'), undefined);
	assert.equal(normalizePhoneE164('+123', '1'), undefined);
});

// ---------------------------------------------------------------------------
// Regressions found by an independent audit, 2026-07-15. Every one produced a
// well-formed hash of the wrong string: TikTok answers code: 0, the event
// matches nobody, and nothing surfaces the mistake. They are pinned here per
// case rather than in one test, so a failure names the country it breaks.
// ---------------------------------------------------------------------------

test('a trunk zero is stripped before the country code', () => {
	// 07911 is a national number: +4407911123456 is not a phone number and
	// matched nobody. Nothing in the response said so.
	assert.equal(normalizePhoneE164('07911123456', '44'), '+447911123456');
});

test('a national number keeps its country code when it opens with the same digits', () => {
	// An Indian mobile can legitimately start 91. Testing startsWith(cc) made
	// this look like an international number, so the +91 was skipped.
	assert.equal(normalizePhoneE164('9198765432', '91'), '+919198765432');
});

test('a national number longer than ten digits still gets its country code', () => {
	// German numbers are 11 digits after the trunk zero, which a length-only
	// rule dropped on the floor.
	assert.equal(normalizePhoneE164('015123456789', '49'), '+4915123456789');
});

test('a number that already carries its country code is not given a second one', () => {
	assert.equal(normalizePhoneE164('447911123456', '44'), '+447911123456');
});

test('tiktok rejects a too-short number even inside the 86 carve-out', () => {
	assert.equal(normalizePhoneE164('+86 12'), undefined);
});

test('external id is trimmed and hashed, and a blank one is dropped', () => {
	assert.equal(normalizeExternalId('  user-42 '), 'user-42');
	assert.equal(normalizeExternalId('   '), undefined);
	assert.equal(hashIdentifier('user-42', normalizeExternalId), sha256('user-42'));
});

test('raw passthrough trims and drops blanks rather than sending an empty string', () => {
	assert.equal(normalizeRaw('  Mozilla/5.0 '), 'Mozilla/5.0');
	assert.equal(normalizeRaw(''), undefined);
	assert.equal(normalizeRaw(undefined), undefined);
});

test('hashIdentifier checks for a digest BEFORE normalizing, so a hash survives', () => {
	// Order matters and getting it wrong is silent: normalizePhoneE164 would
	// strip the hex letters out of a digest and hash the surviving digits.
	const digest = sha256('+12133734253');
	assert.equal(
		hashIdentifier(digest, (v) => normalizePhoneE164(v, '1')),
		digest,
	);
});

test('a bracketed trunk zero is dropped, not embedded', () => {
	// "+44 (0)7911 123456" is how much of Europe writes a number. Stripping only
	// a leading zero left +4407911123456, which is nobody's number.
	assert.equal(normalizePhoneE164('+44 (0)7911 123456'), '+447911123456');
	assert.equal(normalizePhoneE164('+49 (0) 151 23456789'), '+4915123456789');
});

test('an explicit country code of 86 reaches the China carve-out', () => {
	// An 11-digit Chinese mobile skipped the prepend on length, then got a +
	// stuck on the front: +13800000000 asserts country code 1.
	assert.equal(normalizePhoneE164('13800000000', '86'), '13800000000');
	assert.equal(normalizePhoneE164('447911123456', '44'), '+447911123456');
});

test('an IP is validated structurally, not just by its alphabet', () => {
	// ":::" and "abc:def" contain only hex and colons, so a character-class test
	// passed both. Meta rejects a malformed address, which bounces the event
	// rather than dropping the field.
	assert.equal(normalizeIp(':::'), undefined);
	assert.equal(normalizeIp('abc:def'), undefined);
	assert.equal(normalizeIp('1:2:3:4:5:6:7'), undefined, 'seven groups is not an address');
	assert.equal(normalizeIp('1::2::3'), undefined, 'only one :: may compress');
	assert.equal(normalizeIp('12345::1'), undefined, 'a group is at most four hex digits');
});

test('real addresses in every documented form still pass', () => {
	assert.equal(normalizeIp('254.254.254.254'), '254.254.254.254');
	// Both forms TikTok's reference gives as acceptable.
	assert.equal(normalizeIp('2001:0db8:1111:000a:00b0:0000:0000:0200'), '2001:0db8:1111:000a:00b0:0000:0000:0200');
	assert.equal(normalizeIp('2001:db8:1111:a:b0::200'), '2001:db8:1111:a:b0::200');
	assert.equal(normalizeIp('::1'), '::1');
	assert.equal(normalizeIp('::ffff:192.168.1.1'), '::ffff:192.168.1.1', 'IPv4-mapped');
	assert.equal(normalizeIp('fe80::1%eth0'), 'fe80::1%eth0', 'zone index');
	assert.equal(normalizeIp('203.0.113.9, 70.41.3.18'), '203.0.113.9', 'X-Forwarded-For chain');
});
