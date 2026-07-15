<picture>
  <source media="(prefers-color-scheme: dark)" srcset="nodes/TiktokEvents/conversions.dark.svg">
  <img src="nodes/TiktokEvents/conversions.svg" width="56" alt="TikTok Events API">
</picture>

# TikTok Events API node for n8n

An n8n community node that sends server-side conversion events to the TikTok Events API, with the normalization and hashing done correctly.

Install it as `n8n-nodes-tiktok-events-api`. It appears in n8n as **TikTok Events API**.

[![npm](https://img.shields.io/npm/v/n8n-nodes-tiktok-events-api)](https://www.npmjs.com/package/n8n-nodes-tiktok-events-api)
[![license](https://img.shields.io/npm/l/n8n-nodes-tiktok-events-api)](LICENSE)

Built by [nocode.expert](https://nocode.expert).

---

## Why this exists

The usual way to send conversion events from n8n is a hand built chain: a Crypto node per PII field, a Switch to work out whether the event has a value, a Code node to assemble the payload, and an HTTP Request node with the access token pasted into a header. It works, until it quietly stops working.

That pattern has four failure modes, and all four are invisible in the n8n UI because TikTok returns `code: 0` either way:

1. **Hashes of empty strings.** A Crypto node runs whether or not the field has a value. When `phone` is missing you send `SHA256("")`, which is a perfectly well formed hash of nobody.
2. **Normalization that does not match the spec.** TikTok keeps the leading `+` on a phone number, and drops the country code entirely for `86`. A number formatted to another platform's rule hashes to a different string, and matches nobody.
3. **Double hashing.** Hash an already hashed value and the match is silently destroyed.
4. **A token in the workflow JSON.** Export the workflow, share it, commit it, and the token goes with it.

This node handles all four, and turns roughly a dozen nodes into one.

## Install

In n8n, go to **Settings > Community nodes > Install** and enter:

```
n8n-nodes-tiktok-events-api
```

Self hosted, from the command line:

```bash
npm install n8n-nodes-tiktok-events-api
```

## Credentials

Create a **TikTok Events API** credential:

| Field | Where to get it |
| --- | --- |
| **Access Token** | TikTok Events Manager > your pixel > **Settings**, and generate an access token. Or the TikTok for Business developer portal, for a token tied to an app rather than to your personal login. |

The credential holds the token and nothing else. **Pixel Code is set on the node**, not here, because it is data rather than auth: one token often covers several pixels, and a per-node value can be an expression, so a single workflow can route events to different pixels.

Hit **Test** and the credential resolves the token's owner, which proves the token is valid and unexpired. It does not check access to any particular pixel, since it does not know which one you mean. If a token is valid but not permitted on a given pixel, the node raises that error and names the pixel.

The token lives in n8n's encrypted credential store, not in the workflow JSON. Exporting or sharing the workflow no longer leaks it.

## Quick start

**Webhook > TikTok Events API.** That is the whole workflow.

Set **Pixel Code** to the pixel from TikTok Events Manager, choose an **Event Name**, and map the identifiers you have under **Customer Information**: Email, Phone, Ttclid, Client IP Address, Client User Agent. Map the raw values, from wherever your own payload carries them. The node does the normalizing and hashing.

**Ttclid is the one worth chasing.** It ties the event to an actual ad click, which no hashed identifier can do. It arrives on the landing page as a `ttclid` query parameter; capture it there and carry it through to the conversion.

### Events with a value, and events without

An event either has a value or it does not, and you should not need a Switch to express that.

Map `Value` to whatever your payload uses. If it resolves to empty, the node omits `value` and `currency` entirely. If it resolves to a number, it sends both inside `properties`.

`0` is treated as a real value and is sent. Empty is treated as no value. A non-numeric value such as `N/A` raises an error rather than being silently sent as `0`, because a conversion booked at zero dollars is worse than one that fails loudly.

TikTok needs a value for Return on Ad Spend reporting and Value-Based Optimization. It does not enforce that, so an event sent without one is accepted and simply cannot be optimized against.

## What the node does for you

Every identifier is normalized to TikTok's rules before hashing. Fields you leave empty are omitted from the payload, never sent as a hash of an empty string.

| Field | Sent as | Normalization |
| --- | --- | --- |
| Email | `user.email`, hashed, in an array | Trimmed, lowercased. Values that are not emails are dropped. |
| Phone | `user.phone`, hashed, in an array | TikTok's own rule. See below, it is the whole point. |
| External ID | `user.external_id`, hashed, as a plain string | Trimmed. Keep it stable across events. |
| Ttclid | `user.ttclid`, raw | Passed through. The strongest signal available. |
| Ttp | `user.ttp`, raw | Passed through. |
| Client IP Address | `user.ip`, raw | Validated as IPv4 or IPv6. An `X-Forwarded-For` chain is reduced to the client IP. |
| Client User Agent | `user.user_agent`, raw | Passed through. |

Hashed identifiers go in arrays, while `external_id` is a plain string. That asymmetry is TikTok's, not a slip here.

Values that are already SHA-256 hashes are passed through untouched, so you can hash upstream if you prefer and the node will not double hash them. That check runs *before* normalizing, because a normalizer applied to a digest destroys it.

An event with no usable identifier at all is rejected with an error naming the item, rather than being sent to TikTok to be counted as unmatched.

### The phone rule

This is the rule that is easiest to get wrong, and the reason this package exists. TikTok, verbatim:

> If the country code is 86, then do not include country code (example: 13800000000). Otherwise, include country code with + and remove any other characters (spaces, '-') between numbers (example for US: +12133734253)

So `+1 (213) 373-4253` is hashed as `+12133734253`, **keeping the plus sign**. Other ad platforms want bare digits, so a phone hashed to one of their rules matches nobody here. TikTok still answers `code: 0`, the events still land, and the match rate is quietly wrong.

The `86` carve-out inverts the rule: `+86 138 0000 0000` is hashed as `13800000000`, with the country code dropped and no plus sign at all.

A number arriving with no country code and no `+` cannot be placed in a country. Set **Options > Default Country Calling Code** and the node prepends it. Without it the number is dropped rather than guessed at, because a wrong guess hashes to a value that matches nobody. A leading trunk zero is stripped first, so `07911 123456` with a default of `44` becomes `+447911123456`, never `+4407911123456`.

## Deduplication

Set **Event ID** to the same value your TikTok Pixel sends and TikTok will collapse the two into one conversion. Leave it empty and the node generates `{executionId}-{itemIndex}`, which keeps retries idempotent but will not deduplicate against the pixel.

## Testing before you go live

Set **Options > Test Event Code** to the code from TikTok Events Manager > **Test Events**. Events land in the Test Events tab and are not counted as real conversions. Remove it to go live.

## Errors

TikTok answers `HTTP 200` even when it has rejected the event, putting the real outcome in the body's `code`. A node that trusted the status line would report every failure as a delivered conversion. This one reads the body, fails on the item that caused the problem, and tells you which one, rather than leaving you to find out from a dashboard three days later.

Turn on **Settings > Continue on fail** to route failures to a separate branch instead. Each failed item carries the error, the pixel it was bound for, and the event as it was built, so a downstream node can log or retry it without reconstructing any of that.

Checks that run before anything is sent:

- Value is a number, or genuinely empty
- Event Time is a timestamp the node can read
- At least one usable identifier survives normalization

One event goes per request. TikTok reports an outcome per request, so a rejected event fails on its own instead of taking a batch down with it.

## Roadmap

This package integrates one service, which is what n8n's verification guidelines ask for:

> Each package should integrate exactly one third-party service.

Other platforms ship as their own packages under the same brand:

| Platform | Package |
| --- | --- |
| TikTok Events API | `n8n-nodes-tiktok-events-api` (this one) |
| Meta Conversions API | `n8n-nodes-meta-conversions-api` |
| Google Ads | Next |
| Taboola | Planned |

The identifiers you map are named the same in each, so moving a mapping between them is copy and paste. What differs is the normalization on the wire, which is the part worth getting right once per platform.

## Development

```bash
npm install
npm run dev     # runs n8n locally with this node loaded
npm run build
npm run lint
npm test
```

`npm run dev` starts n8n with the node linked, so you can drag it onto a canvas and hit it with a real payload.

The normalization rules are covered by unit tests in [`test/`](test). They assert against the examples in TikTok's own documentation, so if TikTok changes the spec, the tests are the place to encode it.

## References

- [Events API 2.0: get started](https://business-api.tiktok.com/portal/docs?id=1771101027431425)
- [Events API 2.0: report a web event](https://business-api.tiktok.com/portal/docs?id=1771101186666498)
- [Events API 2.0: identity and data normalization](https://business-api.tiktok.com/portal/docs?id=1771101202182657)
- [Events API 2.0: test events](https://business-api.tiktok.com/portal/docs?id=1771101202461186)

## License

[MIT](LICENSE)
