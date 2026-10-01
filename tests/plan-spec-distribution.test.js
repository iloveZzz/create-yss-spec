const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { assetPaths } = require('../src/template/asset-runtime');

test('Plan 阶段分发只读诊断及离线解析闭包', () => {
  const files = assetPaths(path.resolve(__dirname, '../template'), {
    mode: 'selected', assetProfile: 'stage-selective',
    installedStages: ['stage.entry-triage', 'stage.plan'], installedSkills: [], resourceSkills: []
  });
  for (const file of ['scripts/inspect-plan-spec', 'scripts/lib/plan-spec-markdown.mjs', 'scripts/lib/plan-spec-quality.mjs', 'scripts/vendor/markdown.mjs', 'scripts/vendor/yaml.mjs', '.template-spec/process/plan-spec-quality.md']) assert.ok(files.has(file), file);
});
