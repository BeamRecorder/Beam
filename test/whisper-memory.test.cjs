const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the actual browser entry bundle, including its non-exported cache helpers.
const bundle = readFileSync(
  resolve(__dirname, '../node_modules/@huggingface/transformers/dist/transformers.web.js'),
  'utf8',
);
const syntax = ts.createSourceFile('transformers.web.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functionSource = (name) => {
  const declaration = syntax.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(declaration, `Missing patched browser function: ${name}`);
  return declaration.getText(syntax);
};
const library = import('@huggingface/transformers');
const encoderKey = 'past_key_values.0.encoder.key';
const presentKey = 'present.0.encoder.key';

test('duplicate encoder caches are released on every decoding step', async (t) => {
  const { DynamicCache, full } = await library;
  const getPastKeyValues = new Function(
    'DynamicCache',
    `${functionSource('getPastKeyValues')}; return getPastKeyValues;`,
  )(DynamicCache);
  const cached = full([1], 1);
  const cache = new DynamicCache({ [encoderKey]: cached });
  for (let step = 0; step < 400; step++) {
    const duplicate = full([1], 2);
    const dispose = t.mock.method(duplicate, 'dispose');
    assert.equal(getPastKeyValues({ [presentKey]: duplicate }, cache), cache);
    assert.equal(dispose.mock.callCount(), 1);
    assert.equal(cache[encoderKey], cached);
  }
  cached.dispose();
});

test('an already reused encoder tensor stays alive', async (t) => {
  const { DynamicCache, full } = await library;
  const getPastKeyValues = new Function(
    'DynamicCache',
    `${functionSource('getPastKeyValues')}; return getPastKeyValues;`,
  )(DynamicCache);
  const cached = full([1], 1);
  const cache = new DynamicCache({ [encoderKey]: cached });
  const dispose = t.mock.method(cached, 'dispose');
  assert.equal(getPastKeyValues({ [presentKey]: cached }, cache)[encoderKey], cached);
  assert.equal(dispose.mock.callCount(), 0);
  cached.dispose();
});

test('first-pass encoder outputs become the cache without disposal', async (t) => {
  const { DynamicCache, full } = await library;
  const getPastKeyValues = new Function(
    'DynamicCache',
    `${functionSource('getPastKeyValues')}; return getPastKeyValues;`,
  )(DynamicCache);
  const first = full([1], 1);
  const dispose = t.mock.method(first, 'dispose');
  const cache = getPastKeyValues({ [presentKey]: first, unrelated: first }, null);
  assert.equal(cache[encoderKey], first);
  assert.equal(Object.keys(cache).length, 1);
  assert.equal(dispose.mock.callCount(), 0);
  first.dispose();
});

const timestampDisposal = new Function(
  `${functionSource('disposeTimestampGenerationOutputs')}; return disposeTimestampGenerationOutputs;`,
)();

test('word alignment releases each shared attention once and the final decoder cache', async (t) => {
  const tensor = { dispose: t.mock.fn() };
  const outputs = {
    cross_attentions: [[tensor], [tensor]],
    encoder_attentions: [[tensor]],
    decoder_attentions: [[tensor]],
    past_key_values: { dispose: t.mock.fn(async () => {}) },
  };
  await timestampDisposal(outputs);
  assert.equal(tensor.dispose.mock.callCount(), 1);
  assert.equal(outputs.past_key_values.dispose.mock.callCount(), 1);
  assert.equal(outputs.cross_attentions, null);
  assert.equal(outputs.encoder_attentions, null);
  assert.equal(outputs.decoder_attentions, null);
});

test('word alignment tolerates absent attention groups and caches', async () => {
  await timestampDisposal({});
  await timestampDisposal({ cross_attentions: [] });
});

test('word alignment awaits asynchronous cache disposal', async (t) => {
  let release;
  let completed = false;
  const pending = timestampDisposal({
    past_key_values: {
      dispose: t.mock.fn(
        () =>
          new Promise((r) => {
            release = r;
          }),
      ),
    },
  });
  pending.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  release();
  await pending;
  assert.equal(completed, true);
});

for (const failure of [false, true]) {
  test(`Whisper preserves timestamps and releases alignment resources${failure ? ' when alignment fails' : ''}`, async (t) => {
    const { PreTrainedModel, WhisperForConditionalGeneration, full } = await library;
    const tensor = { dispose: t.mock.fn() };
    const outputs = {
      cross_attentions: [[tensor]],
      past_key_values: { dispose: t.mock.fn(async () => {}) },
    };
    t.mock.method(PreTrainedModel.prototype, 'generate', async () => outputs);
    const model = new WhisperForConditionalGeneration({ model_type: 'whisper' }, {}, {});
    model._prepare_generation_config = () => ({
      return_token_timestamps: true,
      alignment_heads: [[0, 0]],
    });
    model._retrieve_init_tokens = () => [0];
    const timestamps = full([1, 2], 0.5);
    model._extract_token_timestamps = () => {
      if (failure) throw new Error('Alignment failed');
      return timestamps;
    };
    const pending = model.generate({ inputs: full([1, 1, 2], 0) });
    if (failure) await assert.rejects(pending, /Alignment failed/);
    else assert.equal((await pending).token_timestamps, timestamps);
    assert.equal(tensor.dispose.mock.callCount(), 1);
    assert.equal(outputs.past_key_values.dispose.mock.callCount(), 1);
  });
}

for (const scenario of ['single pass', 'multiple passes', 'alignment failure']) {
  test(`Whisper seek generation releases each pass: ${scenario}`, async (t) => {
    const { PreTrainedModel, WhisperForConditionalGeneration, Tensor, full } = await library;
    const attentions = [];
    const caches = [];
    t.mock.method(PreTrainedModel.prototype, 'generate', async () => {
      const attention = { dispose: t.mock.fn() };
      const cache = { dispose: t.mock.fn(async () => {}) };
      attentions.push(attention);
      caches.push(cache);
      return {
        sequences: new Tensor('int64', [0n, 1n, 99n], [1, 3]),
        cross_attentions: [[attention]],
        past_key_values: cache,
      };
    });
    const model = new WhisperForConditionalGeneration({ model_type: 'whisper', max_source_positions: 1 }, {}, {});
    model._extract_token_timestamps = () => {
      if (scenario === 'alignment failure') throw new Error('Alignment failed');
      return full([1, 3], 0.5);
    };
    const pending = model._generate_with_seek({
      inputs: full([1, 1, scenario === 'multiple passes' ? 4 : 2], 0),
      generation_config: {
        no_timestamps_token_id: 999,
        eos_token_id: 99,
        return_token_timestamps: true,
        alignment_heads: [[0, 0]],
      },
      logits_processor: null,
      init_tokens: [0],
      kwargs: {},
    });
    if (scenario === 'alignment failure') await assert.rejects(pending, /Alignment failed/);
    else {
      const result = await pending;
      assert.deepEqual(result.sequences.tolist(), [scenario === 'multiple passes' ? [0n, 1n, 1n, 99n] : [0n, 1n, 99n]]);
      assert.equal(result.token_timestamps.dims[1], result.sequences.dims[1]);
      assert.equal(result.token_timestamps.tolist()[0][1], 0.5);
    }
    assert.equal(attentions.length, scenario === 'multiple passes' ? 2 : 1);
    for (const tensor of attentions) assert.equal(tensor.dispose.mock.callCount(), 1);
    for (const cache of caches) assert.equal(cache.dispose.mock.callCount(), 1);
  });
}

for (const scenario of ['owned encoder', 'caller encoder', 'decoder only']) {
  test(`generation releases only its own encoder output: ${scenario}`, async (t) => {
    const { PreTrainedModel, GenerationConfig, full } = await library;
    const encoder = full([1, 1, 2], 0);
    const dispose = t.mock.method(encoder, 'dispose');
    const ids = full([1, 1], 0n);
    const model = new PreTrainedModel({ is_encoder_decoder: scenario !== 'decoder only' }, {}, {});
    model._validate_model_class = () => {};
    model._prepare_generation_config = () => new GenerationConfig({ max_new_tokens: 1 });
    model._prepare_model_inputs = () => ({
      inputs_tensor: ids,
      model_input_name: 'input_ids',
      model_inputs: {
        input_ids: ids,
        ...(scenario === 'caller encoder' ? { encoder_outputs: encoder } : {}),
      },
    });
    model._prepare_encoder_decoder_kwargs_for_generation = async ({ model_inputs }) => ({
      ...model_inputs,
      encoder_outputs: encoder,
    });
    model._prepare_decoder_input_ids_for_generation = ({ model_kwargs }) => ({
      input_ids: ids,
      model_inputs: model_kwargs,
    });
    model._get_logits_processor = () => (_ids, logits) => logits;
    model._get_stopping_criteria = () => () => [true];
    model.prepare_inputs_for_generation = (_ids, inputs) => inputs;
    model.forward = async () => ({ logits: full([1, 1, 2], 1) });
    const result = await model.generate({ inputs: ids });
    assert.deepEqual(result.tolist(), [[0n, 0n]]);
    assert.equal(dispose.mock.callCount(), scenario === 'owned encoder' ? 1 : 0);
    if (scenario !== 'owned encoder') encoder.dispose();
  });
}
