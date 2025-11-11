let paused = false;
let speaking = false;

export function setPaused(v) {
  paused = !!v;
  if (paused) {
    try { window.speechSynthesis.cancel(); } catch {}
    speaking = false;
  }
}

export function cancelAll() {
  try { window.speechSynthesis.cancel(); } catch {}
  speaking = false;
}

export function speak(text, opts = {}) {
  if (!text || paused) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    if (typeof opts.rate === "number") u.rate = opts.rate;
    if (typeof opts.pitch === "number") u.pitch = opts.pitch;
    if (typeof opts.volume === "number") u.volume = opts.volume;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      const preferred = voices.find(v =>
        /female|woman|Google UK English Female|Samantha|Victoria|Amelia|Allison/i.test(v.name)
      );
      if (preferred) u.voice = preferred;
      window.speechSynthesis.speak(u);
      speaking = true;
      u.onend = () => { speaking = false; };
      u.onerror = () => { speaking = false; };
    };

    if ((window.speechSynthesis.getVoices() || []).length === 0) {
      window.speechSynthesis.onvoiceschanged = pickVoice;
    } else {
      pickVoice();
    }
  } catch {}
}

export function isSpeaking() { return speaking; }
export function isPaused() { return paused; }
