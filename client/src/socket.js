import { io } from 'socket.io-client';

// Same-origin by default (Vite proxies /socket.io in dev; Express serves the build in prod).
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: true });

export const emit = (event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload ?? {}, (err, res) => {
      if (err) return reject(new Error('Server did not respond'));
      if (!res?.ok) return reject(Object.assign(new Error(res?.error || 'Request failed'), { code: res?.code }));
      resolve(res);
    });
  });
