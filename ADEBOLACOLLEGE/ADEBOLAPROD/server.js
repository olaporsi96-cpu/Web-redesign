const { createServer } = require('node:http');
const next = require('next');

process.env.NODE_ENV = 'production';

async function start() {
  // Passenger normally supplies PORT. Use 3000 as a fallback on hosts
  // that omit it, while still validating any supplied value.
  const port = Number(process.env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid application PORT: ${process.env.PORT}`);
  }

  const app = next({ dev: false });
  await app.prepare();

  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    Promise.resolve()
      .then(() => handle(request, response))
      .catch((error) => {
        console.error('Next.js request handling failed.', error);
        if (!response.headersSent) {
          response.statusCode = 500;
        }
        if (!response.writableEnded) {
          response.end('Internal server error');
        }
      });
  });

  server.on('error', (error) => {
    console.error('Next.js server failed to listen.', error);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    console.log(`Adebola College staging server listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Next.js server startup failed.', error);
  process.exitCode = 1;
});
