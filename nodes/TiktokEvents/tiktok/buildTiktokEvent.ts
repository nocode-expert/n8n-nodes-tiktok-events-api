import { parseConversionValue } from '../shared/parseValue';
import {
	hashIdentifier,
	normalizeEmail,
	normalizeExternalId,
	normalizeIp,
	normalizePhoneE164,
	normalizeRaw,
} from '../shared/normalize';

/** Re-exported under the name the node and tests already use. */
export const parseTiktokValue = parseConversionValue;

/**
 * Builds one TikTok event for Events API 2.0, /open_api/v1.3/event/track/.
 *
 * Two TikTok generations exist and they are not the same API:
 *  - /pixel/track/ (legacy web only): pixel_code, an ISO 8601 timestamp, a
 *    context object, and identifiers as plain strings.
 *  - /event/track/ (Events API 2.0, this one): event_source + event_source_id,
 *    event_time in unix seconds, a data array, and identifiers as arrays.
 * TikTok's public docs still describe the legacy shape, so this is built from a
 * payload verified working in production instead.
 *
 * Its rules are its own, and not the ones other ad platforms teach:
 *  - phone keeps its leading + (see normalizePhoneE164), and a +86 number drops
 *    its country code entirely.
 *  - ip and user_agent live inside user.
 *  - hashed identifiers are arrays, but external_id is a plain string.
 * None of those mistakes is visible in the response: TikTok answers code: 0
 * regardless, so a wrongly shaped identifier reads as a delivered conversion.
 */

/**
 * Keys are the node's field names, not TikTok's wire names, because this is what
 * the Customer Information collection hands over. They diverged once: the
 * builder read `ip` and `userAgent` while the collection set `clientIpAddress`
 * and `clientUserAgent`, so both were dropped from every event the node sent.
 * The cast at the call site is unchecked, so TypeScript said nothing and TikTok
 * answered code: 0.
 */
export interface TiktokUserDataInput {
	email?: string;
	phone?: string;
	externalId?: string;
	ttp?: string;
	ttclid?: string;
	clientIpAddress?: string;
	clientUserAgent?: string;
}

export interface BuildTiktokEventInput {
	eventName: string;
	eventTimeMs: number;
	eventId?: string;
	pageUrl?: string;
	referrerUrl?: string;
	value?: string | number;
	currency?: string;
	userData: TiktokUserDataInput;
	properties?: Record<string, unknown>;
	defaultCountryCallingCode?: string;
}

export interface TiktokWebEvent {
	event: string;
	event_time: number;
	event_id?: string;
	user: Record<string, unknown>;
	page?: Record<string, unknown>;
	properties?: Record<string, unknown>;
}

/** The request body wrapping one or more events. */
export interface TiktokTrackRequest {
	event_source: string;
	event_source_id: string;
	test_event_code?: string;
	data: TiktokWebEvent[];
}

function setIfPresent(
	target: Record<string, unknown>,
	key: string,
	value: string | undefined,
): void {
	if (value !== undefined) target[key] = value;
}

/**
 * Events API 2.0 takes hashed identifiers as arrays, which lets one event carry
 * several values for the same key. The legacy /pixel/track/ endpoint took plain
 * strings, which is a silent difference between the two.
 */
function setHashed(
	target: Record<string, unknown>,
	key: string,
	hashed: string | undefined,
): void {
	if (hashed !== undefined) target[key] = [hashed];
}

/**
 * Builds the user object. Unlike the legacy endpoint, ip and user_agent belong
 * here rather than beside it, and the click ID is user.ttclid rather than
 * context.ad.callback.
 */
export function buildTiktokUser(
	input: TiktokUserDataInput,
	defaultCountryCallingCode?: string,
): Record<string, unknown> {
	const user: Record<string, unknown> = {};

	// hashIdentifier, not normalize-then-hash: a value that is already a digest
	// must skip the normalizer, which would otherwise destroy it.
	setHashed(user, 'email', hashIdentifier(input.email, normalizeEmail));
	setHashed(
		user,
		'phone',
		hashIdentifier(input.phone, (value) => normalizePhoneE164(value, defaultCountryCallingCode)),
	);

	// external_id is hashed, but TikTok takes it as a single string here.
	const externalId = hashIdentifier(input.externalId, normalizeExternalId);
	setIfPresent(user, 'external_id', externalId);

	// Never hashed.
	setIfPresent(user, 'ttclid', normalizeRaw(input.ttclid));
	setIfPresent(user, 'ttp', normalizeRaw(input.ttp));
	setIfPresent(user, 'ip', normalizeIp(input.clientIpAddress));
	setIfPresent(user, 'user_agent', normalizeRaw(input.clientUserAgent));

	return user;
}

export function buildTiktokEvent(input: BuildTiktokEventInput): TiktokWebEvent {
	const event: TiktokWebEvent = {
		event: input.eventName,
		// Events API 2.0 wants unix seconds. The legacy endpoint wanted ISO 8601.
		event_time: Math.floor(input.eventTimeMs / 1000),
		user: buildTiktokUser(input.userData, input.defaultCountryCallingCode),
	};

	if (input.eventId) event.event_id = input.eventId;

	const page: Record<string, unknown> = {};
	setIfPresent(page, 'url', normalizeRaw(input.pageUrl));
	setIfPresent(page, 'referrer', normalizeRaw(input.referrerUrl));
	if (Object.keys(page).length > 0) event.page = page;

	const properties: Record<string, unknown> = { ...(input.properties ?? {}) };

	// An event either has a value or it does not. TikTok: "Values should always
	// be formatted as an integer or decimal ... It cannot contain any currency
	// signs, special characters, letters, or commas."
	const value = parseTiktokValue(input.value);
	if (value !== undefined) {
		properties.value = value;
		properties.currency = (input.currency ?? 'USD').trim().toUpperCase();
	}

	if (Object.keys(properties).length > 0) event.properties = properties;

	return event;
}

