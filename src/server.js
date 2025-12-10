const { createApp } = require('./app');
const { PORT } = require('./config');

const server = createApp();

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

const shutdown = () => {
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
