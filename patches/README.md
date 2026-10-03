# Transformers.js Whisper memory fix

`@huggingface/transformers@4.3.0` carries the tensor disposal fix from
[upstream PR #1755](https://github.com/huggingface/transformers.js/pull/1755),
commit `7b2bd3a`. The published 4.3.0 package still has
[Whisper's WebGPU memory leak](https://github.com/huggingface/transformers.js/issues/1739).

The patch releases duplicate encoder cache outputs during decoding, internally
created encoder outputs after generation, and attention/cache tensors after
word alignment. It changes both source modules and the three unminified browser
and Node entry bundles. Model weights, precision and generated timestamps are
unchanged. Bun applies this version-specific patch during installation.

Regression checks: `node --test test/whisper-memory.test.cjs` and the focused
Whisper worker/composable Vitest tests. Remove the patch when an upstream release
includes the fix; rerun these checks when upgrading the dependency.
