# Tabang API for partners

Tabang is a flood reporting and response application for Aklan.
This API lets partner systems send hazard signals to Tabang and read the incidents Tabang holds.
The contract is `openapi.json` in this folder (OpenAPI 3.1); this page explains how to use it.

## Access

A Tabang operator issues each partner a key and the scopes it may use:

| Scope | Allows |
|---|---|
| `incidents:read` | `GET /api/v1/incidents` and `GET /api/v1/incidents/{id}` |
| `signals:write` | `POST /api/v1/signals` and `POST /api/v1/integrations/dost-signal` |

Send the key on every request:

```
Authorization: Bearer tbk_<client id>_<secret>
```

The key is shown once when it is created and only its hash is stored.
If it is lost or exposed, ask for it to be revoked and a new one issued.
`GET /api/v1/health` and `GET /api/v1/advisories` need no key.

## Conventions

- Every path starts with `/api/v1`. A breaking change will use `/api/v2`.
- Requests and responses are JSON; send `Content-Type: application/json` with a body.
- Timestamps are ISO 8601 with an offset, for example `2026-10-01T08:00:00+08:00`.
- Every response has an `X-Request-Id` header. Quote it when reporting a problem.
- Lists return `{ "data": [...], "nextCursor": "..." }`. Pass `nextCursor` back as `cursor` for the next page; it is `null` on the last page. `limit` is 1 to 100, default 25.
- Each key may make 60 requests a minute by default; more get `429` with `Retry-After`.
- Bodies may be up to 64 KB for signals and 8 KB elsewhere.

Errors always look like this:

```json
{ "error": { "code": "invalid_request", "message": "headline is required", "requestId": "..." } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | A parameter or body field is wrong; the message names it. |
| 401 | `unauthorized` | No key, or the key is unknown, malformed, or revoked. |
| 403 | `forbidden` | The key lacks the scope this route needs. |
| 404 | `not_found` | No such route or record. |
| 405 | `method_not_allowed` | The route exists but not with this method. |
| 413 | `invalid_request` | The body is too large. |
| 429 | `rate_limited` | Too many requests; wait a minute. |
| 501 | `not_implemented` | The route is reserved but not yet available. |
| 503 | `unavailable` | Tabang cannot reach its database right now. |
| 500 | `internal` | A fault on Tabang's side. |

## Sending hazard signals

`POST /api/v1/signals` with the canonical signal:

```json
{
  "source": "dost-signal",
  "externalId": "TCWS-2026-KRISTINE-014",
  "type": "tropical-cyclone-wind-signal",
  "level": "2",
  "headline": "Signal No. 2 raised over Aklan",
  "body": "Optional detail, up to 2000 characters.",
  "areas": [{ "municipality": "Kalibo" }, { "municipality": "Numancia", "barangay": "Poblacion" }],
  "issuedAt": "2026-10-01T08:00:00+08:00",
  "expiresAt": "2026-10-02T08:00:00+08:00",
  "url": "https://example.gov.ph/bulletin/014"
}
```

- `type` is one of `tropical-cyclone-wind-signal`, `rainfall-warning`, `flood-advisory`, or `other`.
- Each area names one of Aklan's 17 municipalities, and optionally a barangay.
- Tabang publishes the headline as a public advisory until `expiresAt`.
- Sending the same `source` and `externalId` again updates the signal and its advisory instead of creating a second one: the first send answers `201`, later sends answer `200`.

`POST /api/v1/integrations/dost-signal` is reserved for DOST Signal's own payload format and answers `501` until that contract is agreed.
Use the canonical endpoint meanwhile.

## Reading incidents

`GET /api/v1/incidents` lists incidents ordered by last change, oldest first.

| Parameter | Values |
|---|---|
| `status` | `open` (default: new, acknowledged, dispatched, on scene), or one status |
| `kind` | `flood` or `help` |
| `municipality` | One of the 17 Aklan municipalities |
| `since` | Only incidents changed at or after this time |
| `limit`, `cursor` | Paging, as above |

To stay in sync, poll with `since` set to the time of your last successful poll, and follow `nextCursor` to the end each time.

Each incident has `id`, `kind`, `incidentStatus`, `verificationStatus`, `severity`, `need`, `peopleAffected`, `municipality`, `barangay`, `createdAt`, `updatedAt`, `acknowledgedAt`, and `resolvedAt`.
Contact numbers, descriptions, exact locations, landmarks, photos, and who filed a report are never shared; that would need a data sharing agreement first.

## Reading advisories

`GET /api/v1/advisories` lists published advisories that have not expired, newest first, including those created from signals.
It needs no key and may be called from any website.
