const test = require('node:test');
const assert = require('node:assert/strict');

test('chem text formatter renders source LaTex as safe chemical subscripts', async () => {
  const { formatChemOption, formatChemPreview, formatChemText, formatChemStem } = await import('../src/ai-classroom/chem-text.js');
  assert.equal(formatChemText('设 $\\mathrm{H}_{3}\\mathrm{PO}_{4}$ 溶液'), '设 <span class="chem-math">H<sub>3</sub>PO<sub>4</sub></span> 溶液');
  assert.equal(formatChemOption('(A)$\\mathrm{OH}^{-}$'), '<span class="chem-math">OH<sup>-</sup></span>');
  assert.equal(formatChemText('$\\mathrm{A}\\rightleftharpoons\\mathrm{B}$'), '<span class="chem-math">A⇌B</span>');
  assert.equal(formatChemText('$\\mathrm{AlO}_{2}{ }^{-}$'), '<span class="chem-math">AlO<sub>2</sub><sup>-</sup></span>');
  assert.equal(formatChemText('$\\mathrm{H}_{2} \\mathrm{~S}$'), '<span class="chem-math">H<sub>2</sub>S</span>');
  assert.equal(formatChemText('${ }_{1}^{3} \\mathrm{H}$'), '<span class="chem-math"><span class="chem-isotope"><sup>3</sup><sub>1</sub><span class="chem-isotope-symbol">H</span></span></span>');
  assert.equal(formatChemText('<img src=x>'), '&lt;img src=x&gt;');
  assert.equal(formatChemOption('(D)$\\mathrm{NaHCO}_{3}'), '<span class="chem-math">NaHCO<sub>3</sub></span>');
  const nestedFormula = formatChemOption('(D)出现红褐色沉淀 $3 \\mathrm{Mg}(\\mathrm{OH})_{2}+2 \\mathrm{FeCl}_{3}=2\\mathrm{Fe(OH)_{3}}+3\\mathrm{MgCl_{2}}$');
  assert.match(nestedFormula, /Fe\(OH\)<sub>3<\/sub>/);
  assert.match(nestedFormula, /MgCl<sub>2<\/sub>/);
  assert.doesNotMatch(nestedFormula, /\\mathrm|mathrm\{/);
  assert.equal(
    formatChemPreview('金属 Na 溶解于液氨中形成氨合钠离子，向该溶液中加入六齿类配体 $\\mathrm{L}$ 后继续反应', 40),
    '金属 Na 溶解于液氨中形成氨合钠离子，向该溶液中加入六齿类配体 …',
  );

  const tableStem = '下列实验现象正确的是<table class="quiz-table"><tr><th>选项</th><th>离子方程式</th></tr><tr><td>$\\mathrm{A}$</td><td>$\\text { 溶液中含 } \\mathrm{H}_{2} \\mathrm{O} \\\\[0.3em] \\text { 和 } \\mathrm{OH}^{-}$</td></tr></table>';
  assert.equal(
    formatChemStem(tableStem),
    '下列实验现象正确的是<table class="quiz-table"><tr><th>选项</th><th>离子方程式</th></tr><tr><td><span class="chem-math">A</span></td><td><span class="chem-math">溶液中含 H<sub>2</sub>O<br>和 OH<sup>-</sup></span></td></tr></table>',
  );
  assert.equal(
    formatChemStem('<table><tr><td><img src=x></td></tr></table>'),
    '<table class="quiz-table"><tr><td>&lt;img src=x&gt;</td></tr></table>',
  );

  const arrayStem = '根据实验操作及现象，\\begin{array}{|c|c|} \\hline \\text{选项} & \\text{结论} \\\\ \\hline \\text{A} & $\\mathrm{SO}_4^{2-}$ \\\\ \\hline \\end{array}';
  const renderedArray = formatChemStem(arrayStem);
  assert.match(renderedArray, /<table class="quiz-table">/);
  assert.match(renderedArray, /SO<sub>4<\/sub><sup>2-<\/sup>/);
  assert.doesNotMatch(renderedArray, /\\begin|\\hline|\\text/);
});

test('all offline question previews and question bodies contain no raw LaTex syntax', async () => {
  const { OFFLINE_QUESTIONS } = await import('../src/data/offline-quiz-bank.js');
  const { formatChemOption, formatChemPreview, formatChemStem } = await import('../src/ai-classroom/chem-text.js');
  const rawSyntax = /\\|\$|(?:mathrm|text|frac|stackrel)\{|[_^]\{/;

  for (const question of OFFLINE_QUESTIONS) {
    assert.doesNotMatch(formatChemStem(question.stem), rawSyntax, question.sourceQuestionId);
    assert.doesNotMatch(formatChemPreview(question.stem, 60), rawSyntax, `${question.sourceQuestionId} preview`);
    for (const option of question.options) {
      assert.doesNotMatch(formatChemOption(option), rawSyntax, `${question.sourceQuestionId} option`);
    }
  }
});
