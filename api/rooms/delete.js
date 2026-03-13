'use strict';

const { runCommand } = require('../_lib/redis');
const { readJsonBody } = require('../_lib/body');

const ROOM_SET_KEY = 'tank:rooms';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { roomId } = await readJsonBody(req);
    if (!roomId) {
      res.status(400).json({ error: 'Missing roomId' });
      return;
    }
    await runCommand('DEL', `tank:room:${roomId}`);
    await runCommand('SREM', ROOM_SET_KEY, roomId);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
