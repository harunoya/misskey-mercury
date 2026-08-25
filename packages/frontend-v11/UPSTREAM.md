# Misskey v11 client source

`vendor/misskey-11.37.1/src/client` is an unmodified snapshot of Misskey
11.37.1 (`16fb7c455769b8b1eeaa38bd5a25905ee810128e`). The original repository is
<https://github.com/misskey-dev/misskey>.

The snapshot remains licensed under AGPL-3.0-only. Its original `LICENSE` is
stored at `vendor/misskey-11.37.1/LICENSE`. Files below `src/misc`, `src/prelude`,
and `locales` are compile-time dependencies from the same commit; no v11 server,
database entity, or migration is included.

Do not edit files below `vendor/misskey-11.37.1/src/client`. Adapt Mercury at the
build and compatibility boundaries. Run `pnpm verify:upstream` to prove that all
352 Vue components still match the imported snapshot.
