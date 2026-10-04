# Planned Beam Desktop Pro and cloud policy

Status: product policy and implementation design for future releases. This is
not an active end-user license agreement, checkout or implemented activation
system. Commercial terms must be finalized before the paid distribution launches.
The source-code rights described in [Beam licensing](../../LICENSING.md) are
unaffected by this policy.

## Intended subscription rules

- Individuals may use Free features for personal and commercial work, without
  a Beam attribution or watermark requirement.
- Businesses with fewer than three employees may use Free features on the same
  basis. Freelancers follow the threshold of their own business; the size of a
  client does not by itself require Pro.
- Businesses with three or more employees will require Pro for the official
  Desktop distribution, including when using Free features.
- Anyone using Pro features in the official distribution will require Pro,
  regardless of business size. Project batch export is a proposed future Pro
  feature; existing Free features are not moved into Pro by this change.
- One active subscription covers up to two activated computers. A qualifying
  business needs at least one subscription and enough subscriptions for its
  activated computers: five computers need three subscriptions.
- Pricing is EUR 12 per month, or EUR 108 billed annually (equivalent to EUR 9
  per month), excluding applicable VAT. There is no perpetual purchase.
- No advance email permission is required. Licensing questions can be sent to
  [zippy.pro123456@gmail.com](mailto:zippy.pro123456@gmail.com?subject=Beam%20licensing%20question).

These requirements concern the separately licensed official distribution and
services. They must not be added as restrictions to MPL-2.0 source rights.
Self-built versions remain usable under MPL-2.0, including commercially.

The launch terms must define how employee counts and organization boundaries
are measured, activation transfers, cancellation, renewal and the effective
date. The waiting list is not a purchase or an activated license.

## Activation and up to 30 days offline

The planned official application uses an authenticated activation service and
a signed entitlement scoped to the subscription, computer and allowed features.
The signing private key stays on the server; the desktop client needs only the
verification public key. No signing secrets belong in the public repository,
renderer, project JSON or exported media.

After a successful online verification, the client can use the cached entitlement
offline for up to 30 days. Its deadline is the earlier of the 30-day lease and
the subscription's paid-through date; the offline allowance does not extend an
expired subscription. Renewal and revocation are checked when contacting the
service. Offline revocation cannot take effect before the cached lease expires.

A network outage does not invalidate an otherwise valid cached lease. After
expiry, ask the user to reconnect before starting a new Pro operation. Explain
the license state without deleting projects, changing saved compositions or
discarding a user's work. Existing files remain readable. A failed verification
must be distinguished from a confirmed expired or revoked entitlement.

Desktop and CLI entry points for a Pro operation need the same trusted host-side
entitlement check; hiding a Vue button alone is insufficient. Keep subscription
identity and renewal traffic outside the document engine and rendering loop.
Do not add license polling to playback, scrubbing, thumbnails or every frame of
an export. Project files remain portable and contain no subscription credentials.

This design controls the official application and service access. MPL-covered
local checks can be changed by a fork, so they are not a guarantee that community
builds will enforce the same subscription rules.

## Future cloud services and proprietary modules

Storage, collaboration, hosted rendering and cloud AI can be sold as subscriptions
or usage credits. Service authorization is enforced by the server independently
of local UI state. An MPL source license does not grant free access to hosted
infrastructure, API credentials or someone else's account.

New independent files containing no MPL-covered code can carry a separate
proprietary license, subject to their dependencies. Modified MPL-covered files
remain subject to MPL when distributed. Publishing all of a Pro feature under
MPL permits community reuse of that implementation.

Operating an MPL-covered backend without distributing it does not, by itself,
require publishing that backend. Code delivered to clients is distribution and
must be assessed separately.

## References

- [MPL-2.0, sections 3.1–3.3](https://www.mozilla.org/en-US/MPL/2.0/)
- [Mozilla FAQ: executable licenses, independent files and hosted services](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
