const { createServer } = require('node:http');
const next = require('next');

process.env.NODE_ENV = 'production';

async function start() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Passenger must provide a valid PORT environment variable.');
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

  server.listen(port);
}

start().catch((error) => {
  console.error('Next.js server startup failed.', error);
  process.exitCode = 1;
});
