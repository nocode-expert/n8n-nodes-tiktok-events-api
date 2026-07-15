# Security Policy

## Reporting a vulnerability

Do not open a public issue.

Report privately through [GitHub Security Advisories](https://github.com/nocode-expert/n8n-nodes-tiktok-events-api/security/advisories/new), or email **hello@nocode.expert** with `n8n-nodes-tiktok-events-api` in the subject.

Expect an acknowledgement within 72 hours and an assessment within 7 days. If the report is valid you will be credited in the advisory and the release notes, unless you would rather not be.

## Scope

This node handles access tokens and personal data, so the things worth reporting most are:

- An access token or other credential leaking into logs, error messages, node output, or the workflow JSON
- Raw personal data being sent where a hash was intended, or written anywhere it is not expected
- Any path where a value crosses from one n8n item, credential, or pixel into another

## Supported versions

The latest published minor version receives security fixes. This package is pre-1.0, so there are no long term support branches yet.

## A note on tokens

If a TikTok access token has been committed to a repository, pasted into a workflow JSON, or shared anywhere public, rotate it in TikTok Events Manager first and report second. A leaked token can write events to your pixel and read from it.
