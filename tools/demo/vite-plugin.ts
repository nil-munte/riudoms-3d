// Dev-server endpoint used by the demo recorder (tools/demo/director.ts):
//   POST /__demo/frame/<n>     JPEG frame  -> demo-out/frames/f<n>.jpg
//   POST /__demo/file/<name>   any file    -> demo-out/<name>
// Only active with `vite` (serve), never in the production build.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function demoRecorder(outDir = 'demo-out'): Plugin {
  return {
    name: 'demo-recorder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__demo', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const parts = (req.url ?? '').split('/').filter(Boolean);
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          let file: string;
          if (parts[0] === 'frame') file = path.join(outDir, 'frames', `f${String(parseInt(parts[1], 10)).padStart(5, '0')}.jpg`);
          else if (parts[0] === 'file' && /^[\w.-]+$/.test(parts[1] ?? '')) file = path.join(outDir, parts[1]);
          else { res.statusCode = 400; res.end(); return; }
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, body);
          res.statusCode = 204; res.end();
        });
      });
    },
  };
}
