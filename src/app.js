const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { db } = require('./db');
const { DB_PATH, NODE_ENV } = require('./config');
const { getMigrationState } = require('./migrations');

const publicDir = path.join(__dirname, '..', 'public');

const routes = [];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addRoute = (method, template, handler) => {
  const segments = template.split('/').filter(Boolean);
  const keys = [];
  const regexPattern = segments
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return escapeRegExp(segment);
    })
    .join('/');

  const regex = new RegExp(`^/${regexPattern}$`);
  routes.push({ method, regex, keys, handler, template });
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
};

const sendError = (res, status, message) => {
  sendJson(res, status, { message });
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseJsonBody = async (req) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unsupported Content-Type, expected application/json');
  }

  const raw = await readBody(req);
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
};

const serveStatic = async (res, pathname) => {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = path.normalize(requestedPath);
  const sanitizedPath = normalizedPath
    .replace(/^([.]{2}[\\/])+/, '')
    .replace(/^\/+|^\\+/, '');
  const resolvedPath = path.join(publicDir, sanitizedPath);

  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    console.error('[static] error serving file', resolvedPath, error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
};

addRoute('GET', '/api/health', async (_req, res) => {
  const now = new Date();
  let dbFileExists = false;
  let dbFileSize = 0;

  try {
    const stats = await fs.stat(DB_PATH);
    dbFileExists = true;
    dbFileSize = stats.size;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[health] failed to stat db file', err);
    }
  }

  const migrationState = getMigrationState(db);

  sendJson(res, 200, {
    status: 'ok',
    environment: NODE_ENV,
    sqliteDriver: 'node:sqlite (built-in, experimental)',
    dbPath: DB_PATH,
    dbFileExists,
    dbFileSize,
    migrations: migrationState,
    serverTime: now.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Register REST API routes
require('./routes')(addRoute);

const handleRequest = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = routes.find((entry) => entry.method === req.method && entry.regex.test(url.pathname));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  if (route) {
    const match = route.regex.exec(url.pathname);
    const params = {};

    if (match) {
      route.keys.forEach((key, index) => {
        params[key] = match[index + 1];
      });
    }

    await route.handler(req, res, {
      url,
      params,
      readBody,
      parseJsonBody,
      sendJson,
      sendError,
      db,
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(res, url.pathname);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ message: 'Not found' }));
};

const createApp = () => {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[server] unhandled error', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Internal server error' }));
    });
  });

  return server;
};

module.exports = { createApp };
