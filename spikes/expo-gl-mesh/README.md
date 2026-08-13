# expo-gl mesh spike (C0)

A measurement rig, not an app. It answers one question: **can expo-gl + three
render `assets/world-mesh.bin` on Android?**

Findings are written up in [`docs/react_migration/c0-expo-gl-spike.md`](../../docs/react_migration/c0-expo-gl-spike.md).
Short answer: yes, at 60 fps on an emulator, with one workaround for a false-positive
WebGL1 check in three. The open question is memory on real low-end hardware.

This directory is deliberately **outside the npm workspace** (the root `workspaces`
globs are `packages/*` and `apps/*`) so its dependency tree cannot perturb the main
project's. It is throwaway: when `packages/globe-bridge` gains a native
implementation, delete it.

## Running it

The rig fetches the real assets over HTTP, so serve the repo root first:

```bash
cd /path/to/globe3D && python3 -m http.server 8011
```

Then:

```bash
cd spikes/expo-gl-mesh
npm install
npx expo start --port 8090
```

`ASSET_BASE` defaults to `http://10.0.2.2:8011/assets` — the Android emulator's
alias for the host loopback. **On a physical device**, point it at the machine's
LAN address:

```bash
EXPO_PUBLIC_ASSET_BASE=http://192.168.1.201:8011/assets npx expo start --port 8090
```

Everything is reported on screen, so a phone with no debugger attached is enough.

## Measuring memory

The rig does not measure its own memory: Hermes has no `performance.memory`, and
the number that matters spans the JS heap, the native heap and the GPU allocation.
Sample from outside, and take a baseline **before** the mesh lands (roughly the
first two seconds) or the figure is meaningless:

```bash
adb shell am force-stop host.exp.exponent
adb shell am start -a android.intent.action.VIEW -d "exp://<host>:8090"
for i in $(seq 1 20); do
  adb shell dumpsys meminfo host.exp.exponent | grep -E "Native Heap:|^ +TOTAL +[0-9]"
  sleep 1
done
```

Expo Go accounts for ~176 MB before the globe loads, and the emulator's GL
translator keeps host-side copies of every buffer. **Neither is present in a
release build on real hardware**, which is why the measurement is only trustworthy
there.

## Toggles

| Env var | Effect |
|---|---|
| `EXPO_PUBLIC_ASSET_BASE` | Where to fetch the three `.bin` files from |
| `EXPO_PUBLIC_KEEP_ARRAYS=1` | Keep the JS-side attribute arrays after upload instead of releasing them (the ~30 MB memory lever) |
