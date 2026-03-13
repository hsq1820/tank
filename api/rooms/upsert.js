'use strict';

const { runCommand } = require('../_lib/redis');
const { readJsonBody } = require('../_lib/body');

const ROOM_SET_KEY = 'tank:rooms';
const ROOM_TTL_SECONDS = 12;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { roomId, hostName, roomName, playerCount, maxPlayers } = await readJsonBody(req);
    if (!roomId || !hostName || !roomName) {
      res.status(400).json({ error: 'Missing room fields' });
      return;
    }

    const room = {
      roomId: String(roomId),
      hostName: String(hostName),
      roomName: String(roomName),
      playerCount: Number(playerCount || 1),
      maxPlayers: Number(maxPlayers || 4),
      updatedAt: Date.now()
    };

    await runCommand('SET', `tank:room:${room.roomId}`, JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
    await runCommand('SADD', ROOM_SET_KEY, room.roomId);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
