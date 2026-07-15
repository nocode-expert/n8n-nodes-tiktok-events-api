# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Initial release, not yet published.

### Added

- **TikTok Events API** node with a Send Event operation, sending to Events API 2.0 at `/open_api/v1.3/event/track/`
- **TikTok Events API** credential holding the access token, with a credential test that resolves the token owner. Pixel Code is a node parameter, since it is data rather than auth and can be an expression.
- Normalization and SHA-256 hashing for `email`, `phone` and `external_id`, following TikTok's identity and data normalization reference. Phone keeps its leading `+`, and a `+86` number drops its country code entirely.
- A trunk zero is stripped before a country code is applied, so `07911 123456` with a default of `44` becomes `+447911123456` rather than `+4407911123456`
- Absent identifiers are omitted rather than sent as a hash of an empty string
- Already-hashed values are detected and passed through instead of being hashed twice, checked before normalizing rather than after
- `X-Forwarded-For` chains are reduced to the client IP, and invalid IPs are dropped
- Optional value: an empty value omits `value` and `currency` entirely, a value of `0` is still sent, and a non-numeric value raises an error rather than being sent as `0`
- Event name dropdown covering TikTok's 18 standard web events, with a Custom Event option
- A non-zero `code` in the response body is raised as an error, since TikTok answers `HTTP 200` for an event it has rejected
- `event_id` falls back to `{executionId}-{itemIndex}`, keeping retries idempotent when nothing is mapped
- `test_event_code` is reported in the node output, so a test send is distinguishable from a real one
- Continue-on-fail output carries the pixel and the built event alongside the error
- Tests covering the request wire format, not just payload construction

### Fixed

- Client IP Address and Client User Agent now reach the wire. The builder read `ip` and `userAgent` while the node's Customer Information collection supplied `clientIpAddress` and `clientUserAgent`, so both were dropped from every event. The cast between them is unchecked, so TypeScript said nothing, and TikTok answered `code: 0` regardless. Covered by a test that drives the node rather than the builder.

[Unreleased]: https://github.com/nocode-expert/n8n-nodes-tiktok-events-api/commits/main
