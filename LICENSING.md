# Beam licensing

Copyright (c) 2026 Alan Trebugeais and the respective contributors.

## Open-source code

Unless a file or directory carries a different license notice, Beam's source
code and Beam-authored documentation in this revision are licensed under the
Mozilla Public License, version 2.0. The unmodified license is in [LICENSE](LICENSE).
This notice attaches that license to those files, including files without an
individual SPDX header, as permitted by Exhibit A of the MPL.

You may use, build and modify the MPL-covered code for personal or commercial
purposes, including inside a company, without buying Beam Pro. If you distribute
an executable containing MPL-covered code, make the corresponding covered source,
including your modifications, available to recipients under MPL-2.0 and explain
how to obtain it. Preserve the required license and copyright notices. Private
modifications do not have to be published simply because a company uses them.

Beam source is available at <https://github.com/BeamRecorder/Beam>. Obtain the
source commit or release tag corresponding to the executable you redistribute.
This document and the license are also included in the packaged CLI resources.

## Desktop Pro and cloud services

MPL-2.0 is the source-code license. It is not a subscription agreement or a grant
of access to Beam-operated services. A future official Desktop Pro distribution
may have separate commercial terms, provided those terms preserve recipients'
MPL rights in the covered source. Independent proprietary modules and cloud
services may have their own terms and dependency-license obligations.

The intended subscription rules and offline activation design are recorded in
[Desktop Pro policy](docs/licensing/DESKTOP-PRO.md). They describe planned work:
no subscription requirement, activation server or Pro feature gate is introduced
by this licensing change. Batch export is an example of a future Pro feature,
not an existing paid feature.

If a feature or its local activation code is distributed under MPL, a fork may
modify that code and compile its own version. A local Pro gate does not remove
those rights. Access to Beam-operated cloud services still requires the service's
authorization and commercial agreement.

## Earlier MIT versions and contributions

Previously distributed MIT versions keep their MIT permissions. This change
does not revoke those grants or rewrite Git history. The original Beam MIT notice
is retained in [LEGACY-MIT.txt](docs/licensing/LEGACY-MIT.txt) for pre-existing code
incorporated into this revision. That historical notice does not grant an MIT
license to new code released only under MPL-2.0. Other upstream notices remain
applicable to their respective code.

New original contributions are accepted under MPL-2.0, unless explicitly agreed
otherwise or identified as third-party material under its original license.
Contributors retain their copyright; submitting a contribution is not a copyright
assignment or permission to relicense it under a proprietary license.

## Third-party material and branding

The repository license does not relicense dependencies, fonts, cursor artwork,
logos, device frames, photographs, music or reference videos. Follow their own
license notices and permissions. In particular, see:

- [Beamy's upstream engine notice](apps/desktop/src/components/brand/Beamy/engine/NOTICE.md)
  and its adjacent MIT license;
- [cursor-pack notices](public/cursorPacks/THIRD_PARTY_NOTICES.md);
- [FFmpeg notices](docs/third-party/ffmpeg.md) and its LGPL text;
- the asset and reference notices within `examples/` and `docs/agents/templates/`.

Some asset notices record unresolved redistribution permissions. MPL-2.0 does
not resolve those permissions or make those assets suitable for commercial use.

MPL-2.0 does not grant trademark rights in the Beam name or logos. Forks must not
misrepresent their origin or imply official endorsement. Official support does
not cover problems introduced by a fork or its modifications.

Beam does not require a Beam credit or watermark on your exported videos or
screenshots. Rights in any third-party material included in an export still apply.

Questions: [zippy.pro123456@gmail.com](mailto:zippy.pro123456@gmail.com?subject=Beam%20licensing%20question).
