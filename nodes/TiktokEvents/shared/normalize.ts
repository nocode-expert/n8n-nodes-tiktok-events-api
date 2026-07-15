import { createHash } from 'crypto';

/**
 * Normalization + SHA-256 hashing for TikTok Events API customer information.
 *
 * Rules follow TikTok's "Report a Web Event" reference:
 * https://business-api.tiktok.com/portal/docs?id=1771101186666498
 *
 * Every normalizer returns undefined for input that carries no signal, so the
 * caller can omit the key entirely rather than send a hash of an empty string.
 * SHA-256('') is a valid-looking digest that matches no real person.
 */

/** True when a value is absent or would normalize to nothing. */
function isBlank(value: unknown): boolean {
	return value === undefined || value === null || String(value).trim() === '';
}

/** SHA-256 hex digest. Input must already be normalized. */
export function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Detects an already-hashed value so we never double-hash. TikTok accepts
 * pre-hashed identifiers, and re-hashing a digest silently destroys the match.
 */
export function isSha256Hex(value: string): boolean {
	return /^[a-f0-9]{64}$/i.test(value.trim());
}

/** "Trim any leading and trailing spaces. Convert all characters to lowercase." */
export function normalizeEmail(value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const email = String(value).trim().toLowerCase();
	// A value without a local@domain shape is a data-entry artifact, not an email.
	if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) return undefined;
	return email;
}

/**
 * Whether a number with no leading + is missing its country code.
 *
 * There is no certain answer without a full numbering-plan database, and this
 * package ships no dependencies on purpose, so this is a heuristic. Its failure
 * modes are chosen deliberately, and it leans on the fact that the caller told
 * us the country: Default Country Calling Code is an explicit statement, not a
 * guess, so it is trusted unless the number visibly disagrees.
 *
 *  - A trunk zero is decisive. Nothing international starts with one, so the
 *    number is national. This is what makes UK (07911123456) and German
 *    (015123456789) numbers work, which a length rule alone gets wrong: both
 *    exceed 10 digits once the zero is stripped.
 *  - A number that already opens with the country code AND is longer than any
 *    national number already carries it; prepending would corrupt it.
 *  - Anything else is national and gets the code.
 *
 * Length alone was wrong in both directions. It dropped the code from every
 * national number over ten digits, and on numbers that merely start with their
 * own country code (an Indian mobile beginning 91) it skipped a code that was
 * genuinely missing. Both hash to values matching nobody, and every platform
 * answers success regardless.
 */
function needsCountryCode(
	digitsWithoutTrunkZero: string,
	hadTrunkZero: boolean,
	countryCode: string,
): boolean {
	if (hadTrunkZero) return true;
	// Longer than any national number and starting with the code: it is already
	// international. A Chinese mobile is 11 digits, so a length-only rule read
	// every one of them as already carrying a code they did not have.
	if (countryCode !== '' && digitsWithoutTrunkZero.startsWith(countryCode)) {
		return digitsWithoutTrunkZero.length <= 10;
	}
	return true;
}

/**
 * TikTok's phone rule. Verbatim, from the Report a Web Event reference:
 *
 *   "If the country code is 86, then do not include country code (example:
 *    13800000000). Otherwise, include country code with + and remove any other
 *    characters (spaces, '-') between numbers (example for US: +12133734253)"
 *
 * The leading + is kept and is part of the hashed string, which is what makes
 * this rule TikTok's own: other platforms want bare digits, so a number hashed
 * for one of them matches nobody here. TikTok still answers code: 0, so the
 * mistake never surfaces in the response.
 *
 * Note the China carve-out inverts the rule: for +86 the country code is
 * stripped and no + is emitted.
 *
 * defaultCountryCode is used only when the input carries no + of its own, since
 * a bare national number gives us nothing to infer the country from.
 */
export function normalizePhoneE164(value: unknown, defaultCountryCode?: string): string | undefined {
	if (isBlank(value)) return undefined;

	const raw = String(value).trim();
	const hadPlus = raw.startsWith('+');
	// "+44 (0)7911 123456" is a standard European display format: the bracketed
	// zero is the national trunk prefix, to be dropped when dialling from
	// abroad. Left in, it becomes +4407911123456, which is nobody's number.
	const allDigits = raw.replace(/\(\s*0\s*\)/g, '').replace(/\D+/g, '');
	// A leading zero is a national trunk prefix, not part of the number: 07911
	// dialled from abroad is +44 7911, never +44 07911. TikTok does not spell
	// this out, but +4407911123456 matches nobody.
	const hadTrunkZero = /^0/.test(allDigits);
	let digits = allDigits.replace(/^0+/, '');
	if (digits === '') return undefined;

	const cc = (defaultCountryCode ?? '').replace(/\D+/g, '');

	if (!hadPlus) {
		// No +, so the country code is either absent or unmarked. Only a supplied
		// default lets us say which country this is.
		if (cc === '') return undefined;
		// Testing startsWith(cc) here instead would mangle every national number
		// that happens to open with its own country code, e.g. an Indian mobile
		// beginning 91.
		if (needsCountryCode(digits, hadTrunkZero, cc)) digits = `${cc}${digits}`;
	}

	// "If the country code is 86, then do not include country code."
	if (digits.startsWith('86')) {
		const national = digits.slice(2);
		// Length is checked against the national number, not the dialable one:
		// TikTok wants 13800000000, so 86 + something tiny is still nonsense.
		if (national.length < 7) return undefined;
		return national;
	}

	// Shorter than this cannot be a dialable international number.
	if (digits.length < 7) return undefined;
	return `+${digits}`;
}

/** external_id is hashed but has no prescribed normalization beyond consistency. */
export function normalizeExternalId(value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	return String(value).trim();
}

/**
 * "Must be a valid IPV4 or IPV6 address." Never hashed. An invalid address is
 * dropped rather than sent for the platform to reject.
 */
export function normalizeIp(value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	// An X-Forwarded-For chain carries the client IP first.
	const ip = String(value).trim().split(',')[0].trim();
	if (ip === '') return undefined;

	const ipv4 =
		/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	// Permissive IPv6: hex groups and :: compression, optionally zoned.
	const ipv6 = /^[0-9a-f:]+(:[0-9a-f.]+)?(%[0-9a-z]+)?$/i;

	if (ipv4.test(ip)) return ip;
	if (ip.includes(':') && ipv6.test(ip)) return ip;
	return undefined;
}

/** Plain passthrough for values that are sent raw: user agent, ttclid, ttp. */
export function normalizeRaw(value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	return String(value).trim();
}

/**
 * Hash unless the caller already supplied a digest. Returns undefined for blank
 * input so the key can be omitted.
 *
 * Prefer hashIdentifier for user input: by the time a value reaches here it has
 * already been through a normalizer, and the normalizers destroy digests.
 */
export function hashNormalized(normalized: string | undefined): string | undefined {
	if (normalized === undefined) return undefined;
	if (isSha256Hex(normalized)) return normalized.toLowerCase();
	return sha256(normalized);
}

/**
 * Normalizes and hashes one identifier, checking for an already-hashed value
 * BEFORE normalizing.
 *
 * The order matters, and getting it wrong is silent. A normalizer applied to a
 * digest destroys it: normalizeEmail drops it for having no "@", and
 * normalizePhoneE164 strips the letters out of the hex and keeps the digits,
 * which then get hashed into a value matching nobody. TikTok answers code: 0
 * either way, so the damage is invisible from the response.
 */
export function hashIdentifier(
	raw: unknown,
	normalizer: (value: unknown) => string | undefined,
): string | undefined {
	if (isBlank(raw)) return undefined;
	const trimmed = String(raw).trim();
	if (isSha256Hex(trimmed)) return trimmed.toLowerCase();
	return hashNormalized(normalizer(trimmed));
}
