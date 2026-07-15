import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { CUSTOM_EVENT_OPTION, tiktokFields } from './tiktok/TiktokFields';
import { buildTiktokEvent, parseTiktokValue } from './tiktok/buildTiktokEvent';
import type { TiktokTrackRequest, TiktokUserDataInput } from './tiktok/buildTiktokEvent';
import { parseEventTime } from './shared/parseEventTime';

export class TiktokEvents implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TikTok Events API',
		// The internal name is what workflows reference. It stays stable across
		// display name changes, or every existing workflow breaks. Changing it is
		// free only because nothing has been published yet.
		name: 'tiktokEvents',
		icon: { light: 'file:conversions.svg', dark: 'file:conversions.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle:
			'={{ $parameter["eventName"] === "__custom" ? $parameter["customEventName"] : $parameter["eventName"] }}',
		description: 'Send server-side conversion events to the TikTok Events API',
		defaults: {
			name: 'TikTok Events API',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'tiktokEventsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send Event',
						value: 'sendEvent',
						description: 'Send a conversion event',
						action: 'Send conversion event',
					},
				],
				default: 'sendEvent',
			},
			...tiktokFields,
		],
	};

	/**
	 * Sends to Events API 2.0, /open_api/v1.3/event/track/.
	 *
	 * One event per request. TikTok reports an outcome per request, so sending
	 * them one at a time keeps a rejected event from taking the others with it,
	 * and lets the error name the item that caused it.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			// Declared out here so the continueOnFail branch can report which pixel
			// and which event failed, rather than a bare message.
			let pixelCode = '';
			let builtEvent: IDataObject | undefined;

			try {
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				let eventName = this.getNodeParameter('eventName', i) as string;
				if (eventName === CUSTOM_EVENT_OPTION) {
					eventName = (this.getNodeParameter('customEventName', i, '') as string).trim();
					if (eventName === '') {
						throw new NodeOperationError(this.getNode(), 'Custom Event Name is empty', {
							itemIndex: i,
							description: 'Choose a standard event, or type the name of your custom event.',
						});
					}
				}

				pixelCode = (this.getNodeParameter('pixelCode', i, '') as string).trim();
				if (pixelCode === '') {
					throw new NodeOperationError(this.getNode(), 'Pixel Code is empty', {
						itemIndex: i,
						description:
							'Set the Pixel Code from TikTok Events Manager, or map it from your input data.',
					});
				}

				const rawValue = this.getNodeParameter('value', i, '') as string;
				try {
					parseTiktokValue(rawValue);
				} catch (error) {
					throw new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
						description: 'Value must be a number, or empty for events that carry no value.',
					});
				}

				// TikTok documents no maximum event age, so there is nothing to reject
				// here: an old timestamp is the caller's business.
				const rawEventTime = this.getNodeParameter('eventTime', i, '');
				let eventTimeMs: number;
				try {
					eventTimeMs = parseEventTime(rawEventTime, Date.now());
				} catch (error) {
					throw new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
						description: 'Leave Event Time empty to use the current time.',
					});
				}

				const userData = this.getNodeParameter('userData', i, {}) as TiktokUserDataInput;

				const propertiesParam = this.getNodeParameter('properties', i, {}) as {
					property?: Array<{ name: string; value: string }>;
				};
				const properties: IDataObject = {};
				for (const prop of propertiesParam.property ?? []) {
					const name = prop.name?.trim();
					if (!name) continue;
					properties[name] = prop.value;
				}

				const event = buildTiktokEvent({
					eventName,
					eventTimeMs,
					eventId: (this.getNodeParameter('eventId', i, '') as string).trim() || undefined,
					pageUrl: (this.getNodeParameter('pageUrl', i, '') as string).trim() || undefined,
					referrerUrl: options.referrerUrl as string | undefined,
					value: rawValue,
					currency: this.getNodeParameter('currency', i, 'USD') as string,
					userData,
					properties,
					defaultCountryCallingCode: options.defaultCountryCallingCode as string | undefined,
				});
				builtEvent = event as unknown as IDataObject;

				// An event with nothing to match on cannot be attributed to anyone. For
				// TikTok the click ID and the IP count, not just the hashed identifiers.
				if (Object.keys(event.user).length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Event has no customer information to match on',
						{
							itemIndex: i,
							description:
								'Map at least one identifier under Customer Information, such as Email, Phone, Ttclid or Client IP Address. Values that failed validation are dropped, so check the format of what you mapped.',
						},
					);
				}

				// event_id is what deduplicates against the TikTok Pixel. Falling back to
				// the execution ID keeps retries idempotent when nothing else is mapped.
				if (!event.event_id) {
					event.event_id = `${this.getExecutionId()}-${i}`;
				}

				const testEventCode = ((options.testEventCode as string) ?? '').trim() || undefined;

				const body: TiktokTrackRequest = {
					event_source: 'web',
					event_source_id: pixelCode,
					...(testEventCode ? { test_event_code: testEventCode } : {}),
					data: [event],
				};

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: 'https://business-api.tiktok.com/open_api/v1.3/event/track/',
					body,
					json: true,
				};

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'tiktokEventsApi',
					requestOptions,
				)) as IDataObject;

				// TikTok answers HTTP 200 even when it rejects the event, putting the real
				// outcome in the body's code. Treating the status as the answer would
				// report every failure as a delivered conversion.
				if (response.code !== 0) {
					throw new NodeApiError(this.getNode(), response as JsonObject, {
						itemIndex: i,
						message: (response.message as string) || 'TikTok rejected the event',
						description: `TikTok returned code ${String(response.code)}. The request reached TikTok, so this is the event being rejected rather than a network or auth failure.`,
					});
				}

				returnData.push({
					json: {
						...response,
						event_source_id: pixelCode,
						// Without this there is no way to tell from the output whether the
						// event counted as a real conversion or landed in Test Events.
						...(testEventCode ? { test_event_code: testEventCode } : {}),
						event: event as unknown as IDataObject,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							// The failure branch carries the same context as the success one,
							// so a downstream node can log or retry without re-deriving which
							// pixel and which event it was.
							...(pixelCode ? { event_source_id: pixelCode } : {}),
							...(builtEvent ? { event: builtEvent } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// An API failure is already a NodeApiError and has to stay one. n8n's
				// guidance is to "use NodeApiError when dealing with external API
				// calls and HTTP requests", and re-wrapping it here would throw away
				// the type and the httpCode. NodeOperationError's constructor passes
				// through its own kind but not this one, so it is caught explicitly.
				// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- this IS a NodeApiError; the rule cannot see that and wrapping it again would nest it inside a NodeOperationError.
				if (error instanceof NodeApiError) throw error;

				// Carries over the guidance from the validation errors raised above, and
				// pins the failure to the item that caused it.
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: i,
					description: (error as NodeOperationError).description ?? undefined,
				});
			}
		}

		return [returnData];
	}
}
