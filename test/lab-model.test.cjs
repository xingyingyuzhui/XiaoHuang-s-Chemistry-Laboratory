const test = require('node:test');
const assert = require('node:assert/strict');

test('lab draftToPayload rejects incomplete predict without placeholders', async () => {
  const { draftToPayload, emptyStep, labToDraft, formatLabsImportSummary } = await import(
    '../src/ai-classroom/lab-model.js'
  );

  assert.equal(draftToPayload({ title: '', steps: [emptyStep()] }).ok, false);
  assert.equal(draftToPayload({ title: 'x', steps: [] }).ok, false);
  assert.equal(
    draftToPayload({
      title: '加热',
      steps: [{ label: 's1', tip: 't', enablePredict: true, question: '', options: ['a', 'b', 'c', 'd'], answer: 0 }],
    }).ok,
    false,
  );
  assert.equal(
    draftToPayload({
      title: '加热',
      steps: [{ label: 's1', tip: 't', enablePredict: true, question: 'q?', options: ['a', '', 'c', 'd'], answer: 0 }],
    }).ok,
    false,
  );

  const ok = draftToPayload({
    title: '制氧气',
    type: '气体制备',
    steps: [
      {
        label: '加热',
        tip: '均匀加热',
        enablePredict: true,
        question: '试管口应？',
        options: ['略向下', '水平', '向上', '随意'],
        answer: 0,
        explanation: '防冷凝水倒流',
      },
    ],
    objective: '学会制 O₂',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.steps[0].label, '加热');
  assert.equal(ok.payload.prestudy.steps[0].predict.answer, 0);
  assert.doesNotMatch(JSON.stringify(ok.payload), /请填写题目|未命名步骤/);

  const draft = labToDraft({
    id: 'lab-x',
    title: '演示',
    steps: [{ label: 'A', tip: 'tip' }],
    prestudy: {
      steps: [
        {
          label: 'A',
          tip: 'tip',
          predict: { question: 'Q', options: ['1', '2', '3', '4'], answer: 2, explanation: 'e' },
        },
      ],
    },
  });
  assert.equal(draft.enablePredict === undefined, true);
  assert.equal(draft.steps[0].enablePredict, true);
  assert.equal(draft.steps[0].answer, 2);

  assert.match(
    formatLabsImportSummary({ created: 1, renamed: 1, skipped: 0, errors: [] }),
    /新增 1|（导入）/,
  );
  assert.match(
    formatLabsImportSummary({ created: 0, skipped: 2, errors: ['第 1 条：名称不能为空'] }),
    /没有成功导入|名称不能为空/,
  );
  assert.match(
    formatLabsImportSummary({ created: 2, renamed: 0, skipped: 1, errors: ['坏数据'] }),
    /跳过 1|未导入原因/,
  );
});

test('AI classroom lab modules: shell uses model + views', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const shell = fs.readFileSync(path.join(root, 'src/ai-classroom/lab-shell.js'), 'utf8');
  assert.match(shell, /from '\.\/lab-model\.js'/);
  assert.match(shell, /from '\.\/lab-views\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/lab-model.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/lab-views.js')));
  assert.ok(!shell.includes('function draftToPayload'));
  assert.ok(!shell.includes('function renderPredict'));
});

test('lab-views prestudy and script HTML keep key hooks', async () => {
  const { htmlPrestudyBody, htmlScriptBody, htmlTitleRow } = await import(
    '../src/ai-classroom/lab-views.js'
  );
  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const title = htmlTitleRow({
    escapeHtml,
    title: '测',
    type: '演示',
    equation: 'H₂O',
    phenomena: '沸腾',
    safety: '防烫',
    dirty: true,
    mode: 'prestudy',
    hasPre: true,
  });
  assert.match(title, /data-lab-mode="prestudy"/);
  assert.match(title, /lab-detail-title/);

  const pre = htmlPrestudyBody({
    escapeHtml,
    lab: {
      prestudy: {
        objective: '目标',
        reagents: ['水'],
        apparatus: ['烧杯'],
        steps: [
          {
            label: '加热',
            tip: '均匀',
            predict: {
              question: '温度？',
              options: ['高', '低', '中', '无'],
              answer: 0,
              explanation: 'e',
            },
          },
        ],
        summary: '总结句',
      },
    },
    stepIdx: 0,
    stepResults: {},
  });
  assert.match(pre.html, /data-prestudy-opt/);
  assert.match(pre.html, /btnPrestudyPrev/);
  assert.equal(pre.stepIdx, 0);

  const script = htmlScriptBody({
    escapeHtml,
    draft: {
      isNew: true,
      title: '新',
      type: '',
      equation: '',
      phenomena: '',
      safety: '',
      objective: '',
      reagents: '',
      apparatus: '',
      summary: '',
      steps: [
        {
          label: 'S1',
          tip: 't',
          risk: '',
          enablePredict: true,
          question: 'q',
          options: ['a', 'b', 'c', 'd'],
          answer: 1,
          explanation: '',
        },
      ],
    },
    selectedStep: 0,
    stepEditMode: false,
    saving: false,
    dirty: true,
  });
  assert.match(script.html, /id="draftTitle"/);
  assert.match(script.html, /id="btnDraftSave"/);
  assert.match(script.html, /data-draft-opt="0"/);
  assert.equal(script.selectedStep, 0);
});
