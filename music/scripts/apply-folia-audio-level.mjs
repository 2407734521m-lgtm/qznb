import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const foliaDir = path.resolve(scriptDir, '../folia');

async function patchFile(relativePath, patch) {
  const target = path.join(foliaDir, relativePath);
  let source = await fs.readFile(target, 'utf8');
  const next = patch(source);
  if (next !== source) await fs.writeFile(target, next, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('Folia RMS overlay expected one unambiguous ' + label + ' anchor.');
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

await patchFile('src/stores/motionSignals.ts', (source) =>
  replaceOnce(
    source,
    'export const audioPower = motionValue(0);',
    'export const audioPower = motionValue(0);\n\n/** Time-domain RMS loudness from the active Web Audio analyser, normalized to 0..1. */\nexport const audioLevel = motionValue(0);',
    'audio level signal',
  ),
);

await patchFile('src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts', (source) => {
  let next = replaceOnce(
    source,
    '    audioBands,\n    audioPower,',
    '    audioBands,\n    audioLevel,\n    audioPower,',
    'audio level import',
  );

  next = replaceOnce(
    next,
    '    const currentLineIndexRef = useRef(-1);',
    '    const currentLineIndexRef = useRef(-1);\n    // Reuse one time-domain buffer; this loop runs at display refresh rate.\n    const timeDomainDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);',
    'time-domain buffer ref',
  );

  next = replaceOnce(
    next,
    '            analyserRef.current.getByteFrequencyData(dataArray);\n            audioBands.spectrum?.set(dataArray);',
    `            analyserRef.current.getByteFrequencyData(dataArray);
            audioBands.spectrum?.set(dataArray);

            // RMS reads waveform amplitude, so it remains a useful fallback when
            // frequency bins are empty or too quiet to produce a meaningful spectrum.
            let waveformData = timeDomainDataRef.current;
            if (!waveformData || waveformData.length !== analyserRef.current.fftSize) {
                waveformData = new Uint8Array(analyserRef.current.fftSize);
                timeDomainDataRef.current = waveformData;
            }
            analyserRef.current.getByteTimeDomainData(waveformData);
            let sumSquares = 0;
            for (let index = 0; index < waveformData.length; index += 1) {
                const sample = (waveformData[index] - 128) / 128;
                sumSquares += sample * sample;
            }
            const rms = Math.sqrt(sumSquares / waveformData.length);
            const normalizedRms = Math.min(1, Math.pow(Math.max(0, rms - 0.0015) * 6, 0.65));
            const previousLevel = audioLevel.get();
            const levelSmoothing = normalizedRms > previousLevel ? 0.55 : 0.2;
            audioLevel.set(previousLevel + (normalizedRms - previousLevel) * levelSmoothing);`,
    'waveform RMS sampling',
  );

  next = replaceOnce(
    next,
    '        } else {\n            const time = Date.now() / 2000;',
    '        } else {\n            audioLevel.set(0);\n            const time = Date.now() / 2000;',
    'RMS reset when analyser is unavailable',
  );
  return next;
});

console.log('Applied Folia time-domain RMS loudness signal using the existing playback analyser.');
