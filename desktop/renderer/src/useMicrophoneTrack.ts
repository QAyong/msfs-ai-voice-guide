import { useEffect, useRef, useState } from 'react';
import { createLocalAudioTrack } from 'livekit-client';
import type { LocalAudioTrack } from 'livekit-client';

export type MicrophoneState = 'idle' | 'requesting' | 'listening' | 'error';

const calculateLevel = (analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>) => {
  analyser.getByteTimeDomainData(samples);

  let sumOfSquares = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumOfSquares += centered * centered;
  }

  const rms = Math.sqrt(sumOfSquares / samples.length);
  return Math.min(1, Math.max(0, (rms - 0.012) / 0.16));
};

export const useMicrophoneTrack = () => {
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<MicrophoneState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [track, setTrack] = useState<LocalAudioTrack | null>(null);
  const trackRef = useRef<LocalAudioTrack | null>(null);
  const trackRequestRef = useRef<Promise<LocalAudioTrack> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pressedRef = useRef(false);
  const disposedRef = useRef(false);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    const updateLevel = () => {
      const analyser = analyserRef.current;
      if (analyser && pressedRef.current) {
        const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const measured = calculateLevel(analyser, samples);
        const smoothing = measured > smoothedLevelRef.current ? 0.42 : 0.16;
        smoothedLevelRef.current += (measured - smoothedLevelRef.current) * smoothing;
        setLevel(smoothedLevelRef.current);
      } else if (smoothedLevelRef.current > 0.002) {
        smoothedLevelRef.current *= 0.72;
        setLevel(smoothedLevelRef.current);
      } else if (smoothedLevelRef.current !== 0) {
        smoothedLevelRef.current = 0;
        setLevel(0);
      }

      animationFrameRef.current = window.requestAnimationFrame(updateLevel);
    };

    animationFrameRef.current = window.requestAnimationFrame(updateLevel);

    return () => {
      disposedRef.current = true;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      sourceRef.current?.disconnect();
      trackRef.current?.stop();
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, []);

  const connectMeter = async (localTrack: LocalAudioTrack) => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;

    const stream = new MediaStream([localTrack.mediaStreamTrack]);
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = context;
    sourceRef.current = source;
    analyserRef.current = analyser;
    await context.resume();
  };

  const ensureTrack = () => {
    if (trackRef.current) return Promise.resolve(trackRef.current);
    if (trackRequestRef.current) return trackRequestRef.current;

    const request = createLocalAudioTrack({
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    })
      .then(async (localTrack) => {
        if (disposedRef.current) {
          localTrack.stop();
          throw new Error('Microphone component was disposed');
        }
        trackRef.current = localTrack;
        setTrack(localTrack);
        await connectMeter(localTrack);
        return localTrack;
      })
      .finally(() => {
        trackRequestRef.current = null;
      });

    trackRequestRef.current = request;
    return request;
  };

  const start = async () => {
    pressedRef.current = true;
    setErrorMessage('');
    setState('requesting');

    try {
      const localTrack = await ensureTrack();
      if (!pressedRef.current) {
        await localTrack.mute();
        setState('idle');
        return;
      }

      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      await localTrack.unmute();
      setState('listening');
    } catch (error) {
      if (disposedRef.current) return;
      pressedRef.current = false;
      setLevel(0);
      setErrorMessage(error instanceof Error ? error.message : '无法访问麦克风');
      setState('error');
    }
  };

  const stop = async () => {
    pressedRef.current = false;
    smoothedLevelRef.current = 0;
    setLevel(0);
    if (trackRef.current) await trackRef.current.mute();
    setState((current) => (current === 'error' ? current : 'idle'));
  };

  return { errorMessage, level, start, state, stop, track };
};
