import type { INodeProperties } from 'n8n-workflow';

/**
 * TikTok's 18 standard web events, from the "Report a Web Event" reference.
 * "Please make sure to use the exact name as shown in Event as it is case
 * sensitive."
 *
 * Note Lead appears in Events Manager as "Submit Form": the reporting name and
 * the API name differ, which is a common source of "my event never arrived".
 *
 * Kept in this file deliberately. n8n's linter resolves an options list only
 * within the file that uses it, so importing this array from elsewhere trips
 * node-param-default-wrong-for-options even when the default is a member of it.
 */
export const TIKTOK_STANDARD_EVENTS = [
	'AddPaymentInfo',
	'AddToCart',
	'AddToWishlist',
	'ApplicationApproval',
	'CompleteRegistration',
	'Contact',
	'CustomizeProduct',
	'Download',
	'FindLocation',
	'InitiateCheckout',
	'Lead',
	'Purchase',
	'Schedule',
	'Search',
	'StartTrial',
	'SubmitApplication',
	'Subscribe',
	'ViewContent',
] as const;

export const DEFAULT_EVENT_NAME = 'Lead';

/**
 * Every field on the node.
 *
 * Map raw values here: normalization and SHA-256 hashing to TikTok's spec are
 * the node's job, and the reason it exists. Doing them upstream is how match
 * quality quietly breaks, because TikTok answers code: 0 either way.
 */

export const CUSTOM_EVENT_OPTION = '__custom';

export const tiktokFields: INodeProperties[] = [
	{
		displayName: 'Pixel Code',
		name: 'pixelCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. CACHW3JC77UB1AB2CDEF',
		description:
			'The pixel the event is written to, from TikTok Events Manager under Data sources. Sent as event_source_id. Supports an expression, so one workflow can route events to several pixels.',
	},
	{
		displayName: 'Event Name',
		name: 'eventName',
		type: 'options',
		options: [
			...TIKTOK_STANDARD_EVENTS.map((event) => ({ name: event, value: event })),
			{ name: 'Custom Event…', value: CUSTOM_EVENT_OPTION },
		],
		default: DEFAULT_EVENT_NAME,
		required: true,
		description:
			'The standard event to report. Choose Custom Event to send an event name of your own. Lead is listed as "Submit Form" in Events Manager: the API name and the reporting name differ.',
	},
	{
		displayName: 'Custom Event Name',
		name: 'customEventName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'QualifiedLead',
		description:
			'The custom event name to report. Must match the name in TikTok Events Manager exactly, including case.',
		displayOptions: { show: { eventName: [CUSTOM_EVENT_OPTION] } },
	},
	{
		displayName: 'Page URL',
		name: 'pageUrl',
		type: 'string',
		default: '',
		placeholder: 'https://example.com/thank-you',
		description: 'The page the event happened on',
	},
	{
		displayName: 'Event ID',
		name: 'eventId',
		type: 'string',
		default: '',
		description:
			'Deduplication key against the TikTok Pixel. Use whatever the pixel sends for the same event. Leave empty and the node generates one from the execution ID, which is idempotent on retry but will not deduplicate against the pixel.',
	},
	{
		displayName: 'Event Time',
		name: 'eventTime',
		type: 'string',
		default: '',
		placeholder: 'e.g. 1784059038',
		description:
			'When the event happened. Accepts Unix seconds, Unix milliseconds, or an ISO date, and is sent as Unix seconds. Leave empty for now.',
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'string',
		default: '',
		placeholder: 'e.g. 60',
		description:
			'Monetary value of the conversion. Leave empty to send no value at all. 0 is sent as a real value. TikTok needs it for Return on Ad Spend and Value-Based Optimization.',
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		default: 'USD',
		description: 'ISO 4217 code for Value, for example USD. Only sent when Value is set.',
	},
	{
		displayName: 'Customer Information',
		name: 'userData',
		type: 'collection',
		placeholder: 'Add Identifier',
		default: {},
		description:
			'Map raw values. Each is normalized to TikTok’s rules and SHA-256 hashed where TikTok requires it. Fields left empty are omitted rather than sent as a hash of an empty string, which is a well-formed hash of nobody.',
		// Alphabetized by name, which n8n's lint requires.
		options: [
			{
				displayName: 'Client IP Address',
				name: 'clientIpAddress',
				type: 'string',
				default: '',
				description:
					'Public IP of the browser, IPv4 or IPv6. Sent raw as user.ip. An X-Forwarded-For chain is reduced to the client IP.',
			},
			{
				displayName: 'Client User Agent',
				name: 'clientUserAgent',
				type: 'string',
				default: '',
				description: 'User agent from the user’s device. Sent raw as user.user_agent.',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Trimmed, lowercased, then SHA-256 hashed',
			},
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description:
					'Your stable user ID. Trimmed, then SHA-256 hashed. Keep it consistent across events.',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				description:
					'Normalized to TikTok’s format, then hashed: digits with the leading plus sign kept. A +86 number drops its country code, which is TikTok’s own carve-out. A number with no country code needs Default Country Calling Code, or it is dropped rather than guessed at.',
			},
			{
				displayName: 'Ttclid (Click ID)',
				name: 'ttclid',
				type: 'string',
				default: '',
				description:
					'TikTok Click ID from the landing page URL. Sent raw. The strongest signal available, because it ties the event to an actual ad click.',
			},
			{
				displayName: 'Ttp (Cookie ID)',
				name: 'ttp',
				type: 'string',
				default: '',
				description: 'The _ttp cookie set by the TikTok Pixel. Sent raw.',
			},
		],
	},
	{
		displayName: 'Properties',
		name: 'properties',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Property',
		default: {},
		description:
			'Extra properties sent inside properties, such as content_type or content_id. Values are sent as-is.',
		options: [
			{
				name: 'property',
				displayName: 'Property',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		// Alphabetized by name, which n8n's lint requires.
		options: [
			{
				displayName: 'Default Country Calling Code',
				name: 'defaultCountryCallingCode',
				type: 'string',
				default: '',
				placeholder: 'e.g. 1',
				description:
					'Prepended to phone numbers that arrive without a country code. Without it, a bare national number is dropped rather than guessed at, because a wrong guess hashes to a value that matches nobody.',
			},
			{
				displayName: 'Page Referrer',
				name: 'referrerUrl',
				type: 'string',
				default: '',
				description:
					'The HTTP referrer of the page that triggered the event. Sent as page.referrer.',
			},
			{
				displayName: 'Test Event Code',
				name: 'testEventCode',
				type: 'string',
				default: '',
				placeholder: 'e.g. TEST12345',
				description:
					'Routes the event to Test Events instead of counting it as a real conversion. Find it in TikTok Events Manager, under your pixel. The code is per-pixel. Remove it before going live, or your conversions will never be counted.',
			},
		],
	},
];
