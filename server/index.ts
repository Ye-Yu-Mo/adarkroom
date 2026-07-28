/** Server entry point — Express + WebSocket.
 *  Placeholder for Milestone 1 Feature 1.
 *  Full implementation in Features 5-7.
 */
import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.4.0' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[adr-server] listening on port ${PORT}`);
});

export { app };
