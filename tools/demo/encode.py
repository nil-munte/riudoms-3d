"""Synthesise the soundtrack and encode the demo video (H.264 720p30 + AAC).

    python tools/demo/encode.py [demo-out] [demo/riudoms-3d-demo.mp4]

Needs the frames and events.json written by tools/demo/director.ts, and the
ffmpeg binary shipped with the imageio-ffmpeg package (pip install imageio-ffmpeg).
"""
import os
import subprocess
import sys

import imageio_ffmpeg

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else 'demo-out'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join('demo', 'riudoms-3d-demo.mp4')
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
wav = os.path.join(src, 'audio.wav')
subprocess.run([sys.executable, os.path.join(here, 'audio.py'), os.path.join(src, 'events.json'), wav], check=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ff, '-y', '-loglevel', 'error',
       '-framerate', '30', '-i', os.path.join(src, 'frames', 'f%05d.jpg'),
       '-i', wav,
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', '4500k', '-bufsize', '9000k', '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-tune', 'film',
       '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
       '-metadata', 'title=Riudoms 3D - demo', out]
subprocess.run(cmd, check=True)
print(out, f'{os.path.getsize(out) / 1e6:.1f} MB')
