const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');

test('HTTP responses do not expose Express and include baseline browser protections', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
