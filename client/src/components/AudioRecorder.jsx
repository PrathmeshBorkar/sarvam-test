import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

/**
 * Encodes Float32 PCM samples into a 16-bit Mono WAV Blob (16kHz recommended for Sarvam)
 */
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default function AudioRecorder({ onRecordingComplete, isProcessing, label = 'Speak Complaint' }) {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // Create script processor (4096 buffer size, 1 input channel, 1 output channel)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy chunk
        audioChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Microphone access is required. Please check browser permissions or use HTTPS tunnel.');
    }
  };

  const stopRecording = () => {
    if (!recording) return;

    if (timerRef.current) clearInterval(timerRef.current);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const sampleRate = audioContextRef.current ? audioContextRef.current.sampleRate : 44100;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    setRecording(false);

    // Flatten all chunks into one Float32Array
    const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Encode to standard WAV
    const wavBlob = encodeWAV(combined, sampleRate);
    onRecordingComplete(wavBlob);
  };

  return (
    <div style={{ textAlign: 'center', margin: '20px 0' }}>
      {!recording ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(37, 99, 235, 0.3)',
          }}
          onClick={startRecording}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="animate-spin" size={36} />
          ) : (
            <Mic size={36} />
          )}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-danger"
          style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s infinite',
            boxShadow: '0 8px 16px rgba(220, 38, 38, 0.4)',
          }}
          onClick={stopRecording}
        >
          <Square size={32} />
        </button>
      )}

      <p style={{ marginTop: 12, fontWeight: 600, fontSize: 15 }}>
        {recording ? `Recording... (${recordSeconds}s) - Tap to Stop` : isProcessing ? 'Processing with Sarvam AI...' : label}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        Speak naturally in Marathi, Hindi, English, etc.
      </p>
    </div>
  );
}
