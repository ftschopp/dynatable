## @ftschopp/dynatable-core [1.6.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.6.0...@ftschopp/dynatable-core@1.6.1) (2026-05-10)


### Bug Fixes

* **core:** preserve concrete builder type through where(), unblock IDE typecheck on tests ([#45](https://github.com/ftschopp/dynatable/issues/45)) ([fb98553](https://github.com/ftschopp/dynatable/commit/fb98553684943291f6d500200bb4b7d32e2fa613))

# @ftschopp/dynatable-core [1.6.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.5.2...@ftschopp/dynatable-core@1.6.0) (2026-05-10)


### Features

* **core:** expose ReturnConsumedCapacity on query/scan/update/put/delete ([#44](https://github.com/ftschopp/dynatable/issues/44)) ([048e52f](https://github.com/ftschopp/dynatable/commit/048e52f8172cd13a0ad1720e8c701af8bf20603d))

## @ftschopp/dynatable-core [1.5.2](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.5.1...@ftschopp/dynatable-core@1.5.2) (2026-05-10)


### Bug Fixes

* **core:** guard primary-key template fields and non-set ops on GSI templates in update builder ([#42](https://github.com/ftschopp/dynatable/issues/42)) ([4487ff2](https://github.com/ftschopp/dynatable/commit/4487ff22ad507b37aa0e2e279a602a4813afddba))

## @ftschopp/dynatable-core [1.5.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.5.0...@ftschopp/dynatable-core@1.5.1) (2026-05-10)


### Bug Fixes

* **core:** close cleanInternalKeys gaps — derive from schema; cover put/query ([#41](https://github.com/ftschopp/dynatable/issues/41)) ([b429f36](https://github.com/ftschopp/dynatable/commit/b429f360ef70fec9612bc983b14903f2d1c1df91))

# @ftschopp/dynatable-core [1.5.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.4.4...@ftschopp/dynatable-core@1.5.0) (2026-05-09)


### Features

* **core:** chunk and retry BatchGet/BatchWrite to handle DynamoDB limits ([#26](https://github.com/ftschopp/dynatable/issues/26)) ([5c7b1cc](https://github.com/ftschopp/dynatable/commit/5c7b1cc0044d0ae6a213735a40f20ef0232dbceb)), closes [#6](https://github.com/ftschopp/dynatable/issues/6)

## @ftschopp/dynatable-core [1.4.4](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.4.3...@ftschopp/dynatable-core@1.4.4) (2026-05-09)


### Bug Fixes

* **core:** detect SET-collisions on auto-recomputed index keys; stripInternalKeys recurses ([#38](https://github.com/ftschopp/dynatable/issues/38)) ([d609c5b](https://github.com/ftschopp/dynatable/commit/d609c5bbeb566145ec034ec9883246a6d77d7cf6)), closes [#17](https://github.com/ftschopp/dynatable/issues/17) [#GSI1](https://github.com/ftschopp/dynatable/issues/GSI1) [#GSI1](https://github.com/ftschopp/dynatable/issues/GSI1)

## @ftschopp/dynatable-core [1.4.3](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.4.2...@ftschopp/dynatable-core@1.4.3) (2026-05-09)


### Bug Fixes

* **query:** resolve index keys exactly, not by prefix match ([#34](https://github.com/ftschopp/dynatable/issues/34)) ([5ca8654](https://github.com/ftschopp/dynatable/commit/5ca865465454e84bee6b5e3e1510f5905a7027d9)), closes [#11](https://github.com/ftschopp/dynatable/issues/11)

## @ftschopp/dynatable-core [1.4.2](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.4.1...@ftschopp/dynatable-core@1.4.2) (2026-05-08)


### Bug Fixes

* **core:** throw at dbParams() when Query has no partition-key condition ([#27](https://github.com/ftschopp/dynatable/issues/27)) ([2f93385](https://github.com/ftschopp/dynatable/commit/2f933850677956a198077421eaeb032372d50724)), closes [#8](https://github.com/ftschopp/dynatable/issues/8)

## @ftschopp/dynatable-core [1.4.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.4.0...@ftschopp/dynatable-core@1.4.1) (2026-05-08)


### Bug Fixes

* **core:** use ExpressionAttributeNames placeholders for projections ([#25](https://github.com/ftschopp/dynatable/issues/25)) ([0e14ebd](https://github.com/ftschopp/dynatable/commit/0e14ebd64cfc58eb2b2353fa7678239bdddb22a6)), closes [#5](https://github.com/ftschopp/dynatable/issues/5)

# @ftschopp/dynatable-core [1.4.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.3.0...@ftschopp/dynatable-core@1.4.0) (2026-05-08)


### Features

* **core:** add iterate() async iterator and Scan executeWithPagination ([#21](https://github.com/ftschopp/dynatable/issues/21)) ([c31d458](https://github.com/ftschopp/dynatable/commit/c31d45861e92ba0c52240128084939128a6e4acc)), closes [#4](https://github.com/ftschopp/dynatable/issues/4)

# @ftschopp/dynatable-core [1.3.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.5...@ftschopp/dynatable-core@1.3.0) (2026-05-07)


### Features

* **core:** auto-recompute index keys on update and improve composite-key queries ([ce4b7dc](https://github.com/ftschopp/dynatable/commit/ce4b7dc1d783ffe2d78fee7f43b999a179a9f9f4))

## @ftschopp/dynatable-core [1.2.5](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.4...@ftschopp/dynatable-core@1.2.5) (2026-05-05)


### Bug Fixes

* remove unused isoDates ([63c3064](https://github.com/ftschopp/dynatable/commit/63c30649c5fd88c63596bff22542acd2d3ec828b))

## @ftschopp/dynatable-core [1.2.4](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.3...@ftschopp/dynatable-core@1.2.4) (2026-04-29)


### Bug Fixes

* get keyname for attribute index ([5bd47c3](https://github.com/ftschopp/dynatable/commit/5bd47c38585c78153ff51f5e457777e928d6e667))

## @ftschopp/dynatable-core [1.2.3](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.2...@ftschopp/dynatable-core@1.2.3) (2026-04-27)


### Bug Fixes

* resolve both required and optional keys in generate fields ([2c06b43](https://github.com/ftschopp/dynatable/commit/2c06b435d4578cb28f773798c80c19bf4eb9ef28))

## @ftschopp/dynatable-core [1.2.2](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.1...@ftschopp/dynatable-core@1.2.2) (2026-04-15)


### Bug Fixes

* add filter type scan entity ([dddff15](https://github.com/ftschopp/dynatable/commit/dddff15228f84fd11b0c6d2daa6f5cc8d77c641d))

## @ftschopp/dynatable-core [1.2.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.0...@ftschopp/dynatable-core@1.2.1) (2026-04-15)


### Bug Fixes

* resolve GSI key attributes to KeyConditionExpression when using useIndex ([8b2ee35](https://github.com/ftschopp/dynatable/commit/8b2ee35ca56bae9a32c8f1fec764365e8496674d))

## @ftschopp/dynatable-core [1.2.1](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.2.0...@ftschopp/dynatable-core@1.2.1) (2026-04-15)


### Bug Fixes

* resolve GSI key attributes to KeyConditionExpression when using useIndex ([8b2ee35](https://github.com/ftschopp/dynatable/commit/8b2ee35ca56bae9a32c8f1fec764365e8496674d))

# @ftschopp/dynatable-core [1.2.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.1.0...@ftschopp/dynatable-core@1.2.0) (2026-03-20)


### Features

* support nested objects and arrays schema ([c06e43e](https://github.com/ftschopp/dynatable/commit/c06e43e6b425bae09f127d2f767b5c8c62dd1142))

# @ftschopp/dynatable-core [1.1.0](https://github.com/ftschopp/dynatable/compare/@ftschopp/dynatable-core@1.0.0...@ftschopp/dynatable-core@1.1.0) (2026-01-20)


### Bug Fixes

* improve types ([efdf362](https://github.com/ftschopp/dynatable/commit/efdf362cefa94f5b6cba653b3a0cc8d017da6966))


### Features

* improve types ([3a87c5c](https://github.com/ftschopp/dynatable/commit/3a87c5c37565f92d8c4a4790396eefa57cd9a5c5))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([e282548](https://github.com/ftschopp/dynatable/commit/e28254895a40fdc26bab1dde2c634f663857ec16))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([e282548](https://github.com/ftschopp/dynatable/commit/e28254895a40fdc26bab1dde2c634f663857ec16))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# @ftschopp/dynatable-core 1.0.0 (2026-01-10)


### Features

* major initial release ([fc6e561](https://github.com/ftschopp/dynatable/commit/fc6e561a4b06507a7acd9ae6fb594936a65d7c4f))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
