'use strict';

const net = require('node:net');
const tls = require('node:tls');

function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!redisUrl) {
    throw new Error('Missing REDIS_URL');
  }

  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:'
  };
}

function encodeCommand(parts) {
  let out = `*${parts.length}\r\n`;
  for (const part of parts) {
    const value = String(part);
    out += `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }
  return out;
}

function parseResponse(buffer, offset = 0) {
  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;

  if (prefix === '+' || prefix === ':' || prefix === '-') {
    const raw = buffer.toString('utf8', offset + 1, lineEnd);
    if (prefix === '-') throw new Error(raw);
    return { value: prefix === ':' ? Number(raw) : raw, next: lineEnd + 2 };
  }

  if (prefix === '$') {
    const length = Number(buffer.toString('utf8', offset + 1, lineEnd));
    if (length === -1) return { value: null, next: lineEnd + 2 };
    const start = lineEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.toString('utf8', start, end), next: end + 2 };
  }

  if (prefix === '*') {
    const count = Number(buffer.toString('utf8', offset + 1, lineEnd));
    if (count === -1) return { value: null, next: lineEnd + 2 };
    const values = [];
    let next = lineEnd + 2;
    for (let i = 0; i < count; i += 1) {
      const parsed = parseResponse(buffer, next);
      if (!parsed) return null;
      values.push(parsed.value);
      next = parsed.next;
    }
    return { value: values, next };
  }

  throw new Error(`Unsupported Redis response prefix: ${prefix}`);
}

async function runCommand(...parts) {
  const config = getRedisConfig();
  return new Promise((resolve, reject) => {
    const socket = config.tls
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.createConnection({ host: config.host, port: config.port });

    let stage = 0;
    let buffer = Buffer.alloc(0);
    let closed = false;

    const fail = (error) => {
      if (closed) return;
      closed = true;
      socket.destroy();
      reject(error);
    };

    const send = (...command) => {
      socket.write(encodeCommand(command));
    };

    socket.on('connect', () => {
      if (config.password) {
        if (config.username) send('AUTH', config.username, config.password);
        else send('AUTH', config.password);
      } else if (config.db > 0) {
        send('SELECT', config.db);
      } else {
        send(...parts);
      }
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (true) {
          const parsed = parseResponse(buffer, 0);
          if (!parsed) break;
          buffer = buffer.slice(parsed.next);

          if (stage === 0 && config.password) {
            stage = 1;
            if (config.db > 0) send('SELECT', config.db);
            else send(...parts);
            continue;
          }

          if ((stage === 0 && config.db > 0 && !config.password) || (stage === 1 && config.db > 0)) {
            stage = 2;
            send(...parts);
            continue;
          }

          if (!closed) {
            closed = true;
            socket.end();
            resolve(parsed.value);
          }
          return;
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.on('error', fail);
    socket.on('end', () => {
      if (!closed) fail(new Error('Redis connection ended unexpectedly'));
    });
  });
}

module.exports = { runCommand };
