import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class TiktokEventsApi implements ICredentialType {
	name = 'tiktokEventsApi';

	displayName = 'TikTok Events API';

	icon: Icon = { light: 'file:conversions.svg', dark: 'file:conversions.dark.svg' };

	// The TikTok page, not the Meta access-token guide: TikTok issues one token
	// from Events Manager with none of Meta's five types to choose between, so
	// sending a TikTok user to Meta's token page answers a question they do not
	// have.
	documentationUrl = 'https://nocode.expert/docs/n8n/tiktok-events-api#credential';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Access token for the TikTok Business API. Generate one in TikTok Events Manager under your pixel, or in the TikTok for Business developer portal.',
		},
	];

	// TikTok takes the token as a request header, unlike Meta's query parameter.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Access-Token': '={{ $credentials.accessToken }}',
			},
		},
	};

	/**
	 * Resolves the token's owner, which proves the token is valid and unexpired.
	 * As with Meta, it deliberately does not check access to a pixel: the pixel is
	 * per-event data that belongs on the node, and one token often covers several.
	 *
	 * No `rules` needed. Verified against a live bad token: TikTok answers HTTP 403
	 * for one, so the request throws and n8n fails the test on its own with
	 * "Forbidden - perhaps check your credentials?". It fails closed.
	 *
	 * TikTok uses two conventions, which is worth knowing when reading the node:
	 * authentication failures are HTTP 403, but an authenticated request carrying
	 * a bad *event* is answered HTTP 200 with a non-zero `code` in the body. So
	 * auth failures surface as thrown errors, while event rejections have to be
	 * caught by inspecting the body.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://business-api.tiktok.com/open_api/v1.3',
			url: '/user/info/',
			method: 'GET',
		},
	};
}
