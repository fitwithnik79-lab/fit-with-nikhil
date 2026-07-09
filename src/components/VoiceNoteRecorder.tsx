import React, { useState, useRef, useEffect } from 'react';
import { Mic, Play, Pause, Trash2, Square, Volume2, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceNoteRecorderProps {
  voiceNote?: string; // base64 encoded string: "data:audio/..."
  onSave?: (base64: string | undefined) => void;
  isReadOnly?: boolean;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  voiceNote,
  onSave,
  isReadOnly = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio duration when voiceNote changes
  useEffect(() => {
    if (voiceNote) {
      const audio = new Audio(voiceNote);
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration || 0);
      });
      audioRef.current = audio;

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    } else {
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [voiceNote]);

  // Handle Recording Timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingSeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    setError(null);
    chunksRef.current = [];
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser or inside this view.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determine supported MIME type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          if (onSave) {
            onSave(base64String);
          }
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks on the stream to release the mic
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      recorder.start(250); // Get chunks every 250ms
      setIsRecording(true);
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError(err.message || 'Microphone permission denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Clear data handler so it doesn't save
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio playback failed:', err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleDelete = () => {
    if (onSave) {
      onSave(undefined);
    }
  };

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-zinc-950/40 border border-white/5 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Mic className="w-3 h-3 text-orange-500" />
          Voice Instruction
        </span>
        {voiceNote && !isReadOnly && (
          <button
            onClick={handleDelete}
            className="text-[9px] font-black uppercase text-red-500/70 hover:text-red-500 flex items-center gap-1 transition-all"
            title="Delete Voice Note"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl text-[10px] flex items-start gap-2 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* State 1: Active recording */}
        {isRecording && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </span>
              <span className="text-xs font-mono font-black text-white">
                {formatTime(recordingSeconds)}
              </span>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest animate-pulse hidden xs:inline">
                Recording...
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={cancelRecording}
                className="px-2.5 py-1 text-[10px] font-black uppercase bg-zinc-900 border border-white/5 hover:bg-zinc-850 hover:text-white text-zinc-400 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={stopRecording}
                className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all flex items-center gap-1.5"
                title="Stop and Save"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="text-[10px] font-black uppercase tracking-wider pr-1">Done</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* State 2: Has recorded voiceNote */}
        {!isRecording && voiceNote && (
          <motion.div
            key="playback"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="bg-zinc-900/60 border border-white/5 p-3 rounded-xl flex items-center gap-3"
          >
            {/* Play/Pause Button */}
            <button
              onClick={togglePlayback}
              className="w-8 h-8 rounded-full bg-orange-500/10 hover:bg-orange-500 border border-orange-500/20 hover:border-transparent text-orange-500 hover:text-white transition-all flex items-center justify-center shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            {/* Progress Slider */}
            <div className="flex-1 min-w-0 space-y-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.05"
                value={currentTime}
                onChange={handleSeek}
                className="w-full accent-orange-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-pointer outline-none"
              />
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <Volume2 className="w-4 h-4 text-zinc-600 shrink-0 hidden sm:block" />
          </motion.div>
        )}

        {/* State 3: Idle - click to record */}
        {!isRecording && !voiceNote && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {isReadOnly ? (
              <p className="text-[10px] font-medium text-zinc-500 italic py-1">
                No voice instruction attached
              </p>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="w-full py-2.5 bg-zinc-900 hover:bg-orange-500/5 border border-white/5 hover:border-orange-500/20 text-zinc-400 hover:text-orange-500 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-bold"
              >
                <Mic className="w-3.5 h-3.5" />
                Record Voice Note Cues
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
