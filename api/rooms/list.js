'use strict';

const { runCommand } = require('../_lib/redis');

const ROOM_SET_KEY = 'tank:rooms';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const roomIds = await runCommand('SMEMBERS', ROOM_SET_KEY);
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      res.status(200).json([]);
      return;
    }

    const values = await runCommand('MGET', ...roomIds.map((roomId) => `tank:room:${roomId}`));
    const rooms = [];
    const staleRoomIds = [];

    roomIds.forEach((roomId, index) => {
      const raw = Array.isArray(values) ? values[index] : null;
      if (!raw) {
        staleRoomIds.push(roomId);
        return;
      }
      try {
        rooms.push(JSON.parse(raw));
      } catch (error) {
        staleRoomIds.push(roomId);
      }
    });

    if (staleRoomIds.length) {
      await runCommand('SREM', ROOM_SET_KEY, ...staleRoomIds);
    }

    rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
