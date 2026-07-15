# Contributing

Thanks for considering a contribution. This node moves real advertising spend, so the bar for correctness is high and the review will focus there. Everything below exists to make that bar easy to clear.

## The one rule that matters

**Every claim about TikTok's behaviour must cite TikTok's documentation.**

If you change how a field is normalized, hashed, or named, link the documentation page that says so, in the pull request and in a comment on the code. "This seems right" is not reviewable. "TikTok's Report a Web Event reference says a phone number keeps its country code with a `+`" is.

Where the docs are silent, say so plainly rather than guessing. TikTok's public documentation still describes the legacy `/pixel/track/` endpoint in places, while this node sends to Events API 2.0 at `/event/track/`, so this comes up more than you would like. A comment reading `// TikTok does not document this; verified empirically against Test Events on 2026-07-14` is worth more than confident silence.

## Getting set up

```bash
git clone https://github.com/nocode-expert/n8n-nodes-tiktok-events-api.git
cd n8n-nodes-tiktok-events-api
npm install
npm run dev
```

`npm run dev` starts a local n8n with the node linked, so you can drag it onto a canvas and send it a real payload.

Before you open a pull request:

```bash
npm run lint
npm run build
npm test
```

CI runs exactly these on Node 22. There is no Node 20 leg: @n8n/node-cli depends on isolated-vm, which requires >=22, so the toolchain cannot install there. Nothing merges red.

## Testing your change

Unit tests live in [`test/`](test) and run against the built output, so build before testing.

**Normalization changes need a test.** They are pure functions with no network and no n8n runtime, so there is no excuse not to. Prefer asserting against examples from TikTok's own documentation. TikTok's docs use `+12133734253` as a correctly formatted US phone number and `13800000000` for the Chinese carve-out, so that is what the tests assert.

Cover the absent case too. Most bugs in this space are not wrong values, they are empty values that got sent anyway.

Note that a passing unit test is not proof the node works. The builder is tested by calling it directly, so a mismatch between the node's field names and the builder's input keys passes every unit test while dropping the field from every event. That has happened. `test/requestFormat.test.js` exists to catch it: it drives the node's `execute` and asserts on what reaches the wire.

### Testing against a real pixel

Behaviour that only shows up against the live API should be verified in TikTok's **Test Events** tab:

1. TikTok Events Manager > your pixel > **Test Events**, copy the test code
2. Set **Options > Test Event Code** on the node
3. Fire the event and watch it arrive

Events sent with a test code are not counted as real conversions.

Be careful reading the response. TikTok answers `HTTP 200` with `code: 0` for a delivered event, and `HTTP 200` with a non-zero `code` for a rejected one, so a successful looking request proves nothing on its own. A wrongly normalized identifier is accepted, hashed, matched against nobody, and reported as a success. Test Events is the only place the difference shows.

Never put a real access token, pixel code, or anyone's personal data in a pull request, an issue, or a test fixture.

## Adding a platform

Not to this package. n8n's verification guidelines are explicit:

> Each package should integrate exactly one third-party service. [...] Submit each service as its own separate package.

So a new platform is a new package: `n8n-nodes-<service>`, its own repo, its own credential, its own README. Meta lives in `n8n-nodes-meta-conversions-api`. Open an issue first so we can agree the shape.

The one thing that does not travel is a dependency. Verified nodes may not have runtime dependencies, so `shared/normalize.ts` cannot be published and imported; each package vendors its own copy. That duplication is deliberate and it is the cost of the rule. It also has teeth: a bug fixed here is not fixed there, so a normalization fix has to be applied to every package that carries the same rule.

What each package needs:

- `nodes/<Service>/<Service>.node.ts` for the node itself
- `nodes/<Service>/<service>/build<Service>Event.ts` for a pure payload builder,
  kept free of n8n types so it can be unit tested
- `credentials/<Service>Api.credentials.ts` with a credential test that proves
  the token reaches the right account
- Tests for the builder and for every normalization rule the platform states,
  asserted against the examples in that platform's own documentation

## Code style

Prettier and ESLint are configured and enforced by CI. `npm run lint:fix` handles most of it. Note that the autofixer can be wrong about n8n specifics, so read its diff rather than trusting it.

One n8n quirk worth knowing before it bites you: the linter resolves an options list only within the file that uses it. `TIKTOK_STANDARD_EVENTS` therefore lives in the same file as the Event Name field that consumes it. Move it somewhere tidier and `node-param-default-wrong-for-options` fails on a default that is plainly valid.

A few conventions that are not machine checked:

- **Comments explain why, not what.** The code already says what.
- **Cite the spec** next to any rule that comes from one.
- **Omit rather than fake.** If a value is absent, leave the key out. Never invent a placeholder, a zero, or a hash of an empty string.
- **Fail loudly on ambiguity.** If a value is present but unusable, raise an error naming the item. Silent success is the failure mode this whole package exists to avoid.

## Pull requests

- One logical change per pull request
- Explain what breaks if the change is wrong. That is the part reviewers care about most
- Link the documentation for any behaviour claim
- Say how you verified it, including whether you tested against a real pixel

## Reporting bugs

Open an issue with the payload you sent (with personal data and tokens removed), what you expected, and what TikTok received. A screenshot of Events Manager > Test Events is often the fastest way to show the difference.

Wrong match quality is a legitimate bug report even without a stack trace. If identifiers you mapped are not arriving, that is exactly the kind of failure this node is meant to prevent.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the [MIT Licence](LICENSE).
