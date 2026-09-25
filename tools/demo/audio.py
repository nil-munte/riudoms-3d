"""Ambient soundtrack for the demo video, synthesised from the event log that
tools/demo/director.ts writes (demo-out/events.json). No samples are used:
wind, birds, crickets, fountains, footsteps, bicycle, church bells and UI
sounds are all generated here, so the result is reproducible and free of
third-party rights.

    python tools/demo/audio.py demo-out/events.json demo-out/audio.wav
"""
import json
import sys
import wave

import numpy as np
from scipy import ndimage, signal

SR = 44100
rng = np.random.default_rng(1702)

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
T = d['duration']
N = int(T * SR) + SR
t = np.arange(N) / SR
L = np.zeros(N)
R = np.zeros(N)

tr = d['track']
ft = np.array([f['t'] for f in tr])
fn_night = np.array([f['n'] for f in tr])
fn_aer = np.array([1.0 if f['m'] == 'aerial' else 0.0 for f in tr])


def curve(key, fn=lambda v: v):
    """Per-frame value -> per-sample envelope (linear interpolation)."""
    v = np.array([fn(f) for f in tr], dtype=float) if key is None else np.array([f[key] for f in tr], dtype=float)
    return np.interp(t, ft, v)


def smooth(x, sec):
    return ndimage.uniform_filter1d(x, max(1, int(sec * SR)), mode='nearest')


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='high', fs=SR, output='sos'), x)


def add(sig, at, gain=1.0, pan=0.0):
    """Mix a short mono sound at time `at` (s) with equal-power panning."""
    i = int(at * SR)
    if i >= N:
        return
    s = sig[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    L[i:i + len(s)] += s * np.cos(a)
    R[i:i + len(s)] += s * np.sin(a)


def env(n, attack, decay):
    k = np.arange(n) / SR
    return np.minimum(1, k / max(attack, 1e-4)) * np.exp(-k / decay)


mode = [f['m'] for f in tr]
aer = curve(None, lambda f: 1.0 if f['m'] == 'aerial' else 0.0)
aer = smooth(aer, 0.8)
night = curve('n')
alt = curve('alt')
menu = smooth(curve(None, lambda f: 1.0 if f['m'] == 'menu' else 0.0), 0.3)
duck = 1 - 0.55 * menu  # the world gets quieter while the menu is open

# 1. wind: two decorrelated low-passed noises, slow gusts; louder high up
gust = 0.6 + 0.4 * np.sin(2 * np.pi * t / 9.0) * np.sin(2 * np.pi * t / 23.0 + 1)
wind_g = (0.035 + 0.13 * aer * np.clip(alt / 250, 0.25, 1)) * gust * (1 - 0.35 * night)
for ch in (L, R):
    w = lp(rng.standard_normal(N), 450, 2) + 0.4 * bp(rng.standard_normal(N), 700, 1800)
    ch += w / np.abs(w).max() * wind_g * 1.6 * duck

# 2. leaves / distant town air (daytime, on the ground)
air = bp(rng.standard_normal(N), 2500, 7000)
air = air / np.abs(air).max()
air_g = 0.018 * (1 - aer) * (1 - night) * (0.7 + 0.3 * np.sin(2 * np.pi * t / 5.3))
L += air * air_g * duck
R += np.roll(air, 3000) * air_g * duck


# 3. birds (sparrows and a blackbird-ish whistle) by day
def chirp(dur, f0, f1, vib=0.0):
    n = int(dur * SR)
    k = np.arange(n) / SR
    f = np.linspace(f0, f1, n) + vib * np.sin(2 * np.pi * 38 * k) * f0 * 0.04
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.sin(np.pi * k / dur) ** 2


tt = 0.5
while tt < T:
    day = 1 - np.interp(tt, ft, fn_night)
    a = np.interp(tt, ft, fn_aer)
    if day > 0.2:
        pan = rng.uniform(-0.8, 0.8)
        g = 0.05 * day * (0.35 if a > 0.5 else 1.0) * rng.uniform(0.4, 1.0)
        if rng.random() < 0.75:  # sparrow cluster
            for k in range(rng.integers(2, 6)):
                f0 = rng.uniform(3200, 5200)
                add(chirp(rng.uniform(0.04, 0.09), f0, f0 * rng.uniform(0.75, 1.2), 1), tt + k * rng.uniform(0.08, 0.16), g, pan)
        else:  # short melodic whistle
            base = rng.uniform(1800, 2600)
            for k, r in enumerate(rng.choice([1, 1.12, 1.25, 1.33, 1.5], size=rng.integers(3, 6))):
                add(chirp(rng.uniform(0.12, 0.22), base * r, base * r * rng.uniform(0.95, 1.08), 0.5), tt + k * 0.2, g * 0.8, pan)
    tt += rng.exponential(1.1)

# 4. crickets at night: 4.4 kHz pulse trains
tt = 0.0
while tt < T:
    nv = np.interp(tt, ft, fn_night)
    if nv > 0.15:
        pan = rng.uniform(-0.9, 0.9)
        f = rng.uniform(4200, 4700)
        n = int(0.022 * SR)
        k = np.arange(n) / SR
        pulse = np.sin(2 * np.pi * f * k) * np.sin(np.pi * k / 0.022) ** 2
        for j in range(rng.integers(3, 5)):
            add(pulse, tt + j * 0.045, 0.02 * nv * rng.uniform(0.5, 1), pan)
    tt += rng.uniform(0.18, 0.5) / max(0.3, nv) if nv > 0.15 else 0.25

# 5. fountains: water noise with distance attenuation
fo = curve('fo')
wat = bp(rng.standard_normal(N), 400, 5000) + 0.5 * bp(rng.standard_normal(N), 150, 600)
wat *= 1 + 0.35 * bp(rng.standard_normal(N), 3, 12, 1) * 8
wat = wat / np.abs(wat).max()
wg = 0.16 / (1 + (fo / 7.0) ** 2) * (1 - 0.8 * aer)
L += wat * wg * duck
R += np.roll(wat, 1500) * wg * duck

# 6. bicycle: tyre roll, freewheel ticks, chain while pedalling
bv = curve(None, lambda f: f['v'] if f['m'] == 'bike' else 0.0)
ped = smooth(curve('ped'), 0.15)
roll = lp(rng.standard_normal(N), 900) + 0.3 * bp(rng.standard_normal(N), 2000, 5000)
roll = roll / np.abs(roll).max()
rg = 0.05 * np.clip(bv / 8, 0, 1.2)
L += roll * rg
R += roll * rg
crank = bv / 0.34 / 2.1 / (2 * np.pi)  # crank revolutions per second (as in bike.ts)
chain = bp(rng.standard_normal(N), 3000, 8000) * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(2 * crank) / SR))
chain = chain / np.abs(chain).max()
L += chain * 0.006 * ped * np.clip(bv / 4, 0, 1)
R += chain * 0.006 * ped * np.clip(bv / 4, 0, 1)
tick = np.exp(-np.arange(int(0.004 * SR)) / SR / 0.0008) * rng.standard_normal(int(0.004 * SR))
tick = hp(tick, 3000)
phase = 0.0
for i in range(len(tr) - 1):
    f = tr[i]
    if f['m'] == 'bike' and f['v'] > 0.4 and not f['ped']:
        rate = f['v'] * 7.5  # clicks per second of the freehub
        n = int(rate / 30 + phase)
        for k in range(n):
            add(tick, f['t'] + k / max(rate, 1), 0.05)
        phase = (rate / 30 + phase) - n
    else:
        phase = 0.0


# 7. footsteps
def footstep(run):
    n = int(0.12 * SR)
    x = bp(rng.standard_normal(n), 250, 3500) * env(n, 0.002, 0.025 if not run else 0.032)
    k = np.arange(n) / SR
    thump = np.sin(2 * np.pi * rng.uniform(80, 110) * k) * env(n, 0.001, 0.02)
    return x * 0.8 + thump * 0.6


side = 1
for e in d['events']:
    if e['type'] == 'step':
        side = -side
        add(footstep(e['run']), e['t'], (0.11 if e['run'] else 0.075) * rng.uniform(0.8, 1.1), 0.12 * side)


# 8. church bells: inharmonic partials, long decays, attenuated with distance
def bell(f0):
    n = int(7 * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for r, a, dec in [(0.5, 0.6, 5.5), (1.0, 1.0, 3.5), (1.19, 0.5, 2.8), (1.5, 0.45, 2.2), (2.0, 0.5, 1.8),
                      (2.51, 0.3, 1.2), (2.66, 0.25, 1.1), (3.01, 0.2, 0.9), (4.16, 0.15, 0.6)]:
        s += a * np.sin(2 * np.pi * f0 * r * k + rng.uniform(0, 6.28)) * np.exp(-k / dec)
    s *= np.minimum(1, k / 0.004)
    strike = hp(rng.standard_normal(int(0.02 * SR)), 2000) * env(int(0.02 * SR), 0.0005, 0.004)
    s[: len(strike)] += strike * 0.8
    return s / np.abs(s).max()


fn_ch = np.array([f['ch'] for f in tr])


def dist_at(time):
    return float(np.interp(time, ft, fn_ch))


# 9. UI and interaction sounds
def click(f=2400, dur=0.03):
    n = int(dur * SR)
    k = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * k) * 0.5 + bp(rng.standard_normal(n), 1500, 6000) * 0.5) * env(n, 0.0005, dur / 5)


def whoosh():
    n = int(0.9 * SR)
    k = np.arange(n) / SR
    x = rng.standard_normal(n)
    out_ = np.zeros(n)
    for j in range(0, n, 2048):  # sweeping band-pass
        c = 300 + 3500 * (j / n) ** 1.5
        out_[j:j + 2048] = bp(x[j:j + 2048], c * 0.7, c * 1.4, 1)
    return out_ * np.sin(np.pi * k / 0.9) ** 2 / (np.abs(out_).max() + 1e-9)


def chime(freqs, gap=0.11):
    n = int(1.6 * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for j, f in enumerate(freqs):
        i = int(j * gap * SR)
        kk = k[: n - i]
        s[i:] += (np.sin(2 * np.pi * f * kk) + 0.3 * np.sin(2 * np.pi * f * 2.76 * kk)) * np.exp(-kk / 0.45) * np.minimum(1, kk / 0.003)
    return s / np.abs(s).max()


def clunk():
    n = int(0.35 * SR)
    k = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * k) * np.exp(-k / dd) for f, dd in [(180, 0.06), (410, 0.05), (1250, 0.03), (2890, 0.02)])
    s += bp(rng.standard_normal(n), 800, 6000) * env(n, 0.0005, 0.01) * 2
    return s / np.abs(s).max()


def ding():
    n = int(1.4 * SR)
    k = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * k) * np.exp(-k / dd) for f, a, dd in [(2150, 1, 0.5), (4660, 0.4, 0.25), (6100, 0.2, 0.15)])
    return s / np.abs(s).max()


for e in d['events']:
    ty, at = e['type'], e['t']
    if ty == 'bell':
        dist = dist_at(at)
        g = 0.24 / (1 + (dist / 45) ** 1.2)
        for j in range(e.get('n', 1)):
            add(bell(311), at + 0.4 + j * 2.4, g, -0.25)
    elif ty == 'key':
        add(click(1800, 0.025), at, 0.06)
    elif ty == 'ui':
        add(click(2600, 0.04), at, 0.09)
    elif ty == 'whoosh':
        add(whoosh(), max(0, at - 0.45), 0.12)
    elif ty == 'sign':
        add(chime([660, 990]), at, 0.045)
    elif ty == 'mount':
        add(clunk(), at + 0.05, 0.1, 0.1)
        add(ding(), at + 1.3, 0.05, 0.2)
        add(ding(), at + 1.55, 0.04, 0.2)
    elif ty == 'dismount':
        add(clunk(), at + 0.1, 0.09, -0.1)

# master: gentle fades, soft limiter, normalise
fade = np.minimum(1, t / 1.5) * np.minimum(1, np.clip((T - t) / 2.0, 0, 1))
L *= fade
R *= fade
rms = np.sqrt(np.mean(np.concatenate([L, R]) ** 2))
g = 0.09 / rms  # about -21 dBFS RMS, then a soft limiter
L, R = np.tanh(L * g / 0.9) * 0.9, np.tanh(R * g / 0.9) * 0.9
pcm = (np.stack([L, R], 1)[: int(T * SR)] * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(out, f'{T:.1f} s')
