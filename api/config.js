'use strict';

const STUN_LIST_URL = 'https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_hosts.txt';
const MAX_STUN_SERVERS = 12;

function parseList(value) {
  return String(value || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchAlwaysOnlineStunServers() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(STUN_LIST_URL, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return [];

    const hosts = (await response.text())
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const uniqueHosts = [...new Set(hosts)].slice(0, MAX_STUN_SERVERS);
    return uniqueHosts.map((host) => ({
      urls: [host.startsWith('stun:') ? host : `stun:${host}`]
    }));
  } catch (error) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  const turnUrls = parseList(process.env.TURN_URLS);
  const turnUsernames = parseList(process.env.TURN_USERNAME);
  const turnCredentials = parseList(process.env.TURN_CREDENTIAL);
  const stunServers = await fetchAlwaysOnlineStunServers();
  const turnServers = turnUrls.map((url, index) => ({
    urls: [url],
    username: turnUsernames[index] || turnUsernames[0] || '',
    credential: turnCredentials[index] || turnCredentials[0] || ''
  })).filter((item) => item.urls.length && item.username && item.credential);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).end(JSON.stringify({ stunServers, turnServers }));
};
