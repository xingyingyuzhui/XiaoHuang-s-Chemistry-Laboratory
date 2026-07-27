const test = require('node:test');
const assert = require('node:assert/strict');

// Test the prestudy config data directly (pure data, no server needed)
test('lab prestudy config has valid structure for configured experiments', async () => {
  // Dynamic import for ESM module
  const { getPrestudyConfig, LAB_PRESTUDY_CONFIGS } = await import(
    '../src/data/lab-prestudy-config.js'
  );

  // At least 2 experiments should be configured
  const configIds = Object.keys(LAB_PRESTUDY_CONFIGS);
  assert.ok(configIds.length >= 2, `expected at least 2 configs, got ${configIds.length}`);

  for (const id of configIds) {
    const config = LAB_PRESTUDY_CONFIGS[id];
    assert.ok(config.objective, `${id} should have objective`);
    assert.ok(Array.isArray(config.steps), `${id} should have steps array`);
    assert.ok(config.steps.length > 0, `${id} should have at least 1 step`);

    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      assert.ok(step.label, `${id} step ${i} should have label`);
      if (step.predict) {
        assert.ok(step.predict.question, `${id} step ${i} predict should have question`);
        assert.ok(Array.isArray(step.predict.options), `${id} step ${i} predict should have options`);
        assert.equal(step.predict.options.length, 4, `${id} step ${i} should have exactly 4 options`);
        assert.ok(typeof step.predict.answer === 'number', `${id} step ${i} should have numeric answer`);
        assert.ok(step.predict.answer >= 0 && step.predict.answer <= 3, `${id} step ${i} answer should be 0-3`);
        assert.ok(step.predict.explanation, `${id} step ${i} should have explanation`);
      }
    }
  }
});

test('getPrestudyConfig returns null for unconfigured experiments', async () => {
  const { getPrestudyConfig } = await import('../src/data/lab-prestudy-config.js');

  assert.equal(getPrestudyConfig('nonexistent-lab'), null);
  assert.equal(getPrestudyConfig(''), null);
  assert.equal(getPrestudyConfig(null), null);
});

test('getPrestudyConfig returns config for configured experiments', async () => {
  const { getPrestudyConfig } = await import('../src/data/lab-prestudy-config.js');

  const o2Config = getPrestudyConfig('lab-o2');
  assert.ok(o2Config, 'lab-o2 should have config');
  assert.ok(o2Config.objective.includes('氧气'), 'lab-o2 objective should mention oxygen');
  assert.ok(o2Config.steps.length >= 3, 'lab-o2 should have at least 3 steps');

  const co2Config = getPrestudyConfig('lab-co2');
  assert.ok(co2Config, 'lab-co2 should have config');
  assert.ok(co2Config.objective.includes('二氧化碳'), 'lab-co2 objective should mention CO2');
});

test('every lab script has a matching prestudy config', async () => {
  const { LAB_PRESTUDY_CONFIGS } = await import('../src/data/lab-prestudy-config.js');
  const { LAB_SCRIPTS } = await import('../src/data/lab-scripts.js');

  const configIds = Object.keys(LAB_PRESTUDY_CONFIGS);
  assert.equal(configIds.length, LAB_SCRIPTS.length, `expected all ${LAB_SCRIPTS.length} lab scripts to have configs, got ${configIds.length}`);

  for (const lab of LAB_SCRIPTS) {
    assert.ok(LAB_PRESTUDY_CONFIGS[lab.id], `lab script "${lab.id}" (${lab.title}) should have a prestudy config`);
  }
});

test('all prestudy configs reference existing lab script IDs', async () => {
  const { LAB_PRESTUDY_CONFIGS } = await import('../src/data/lab-prestudy-config.js');
  const { LAB_SCRIPTS } = await import('../src/data/lab-scripts.js');

  const labIds = new Set(LAB_SCRIPTS.map((l) => l.id));
  for (const id of Object.keys(LAB_PRESTUDY_CONFIGS)) {
    assert.ok(labIds.has(id), `prestudy config ${id} should reference an existing lab script`);
  }
});
