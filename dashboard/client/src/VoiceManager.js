

const VoiceManager = (() => {
  let synth;
  let voices = [];
  let currentVoice = null;
  let muted = false;

  const loadVoices = () =>
    new Promise((resolve) => {
      const s = window.speechSynthesis;
      if (!s) return resolve([]);
      let list = s.getVoices();
      if (list && list.length) return resolve(list);

      const onVoices = () => {
        list = s.getVoices();
        s.removeEventListener("voiceschanged", onVoices);
        resolve(list);
      };
      s.addEventListener("voiceschanged", onVoices);
    });

  const chooseVoice = (preferredNames = []) => {
    if (!voices.length) return null;

    for (const name of preferredNames) {
      const v = voices.find((vv) => vv.name.toLowerCase().includes(name.toLowerCase()));
      if (v) return v;
    }
    const fem = voices.find(
      (v) =>
        /female/i.test(v.name) &&
        (/en-/i.test(v.lang) || /english/i.test(v.name))
    );
    if (fem) return fem;

    const en = voices.find((v) => /en-/i.test(v.lang) || /english/i.test(v.name));
    if (en) return en;

    return voices[0] || null;
  };

  const init = async (opts = {}) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported in this browser.");
      return;
    }
    synth = window.speechSynthesis;
    voices = await loadVoices();
    currentVoice = chooseVoice(opts.preferredNames || [
      "Google UK English Female",
      "Microsoft Sonia Online",
      "Google US English Female",
    ]);
  };

  const speak = (text, { rate = 1.0, pitch = 1.0, volume = 1.0 } = {}) => {
    if (!synth || muted || !text) return;
    if (synth.speaking) synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    if (currentVoice) u.voice = currentVoice;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    synth.speak(u);
  };

  const stop = () => {
    if (synth && synth.speaking) synth.cancel();
  };

  const setMuted = (v) => {
    muted = !!v;
    if (muted) stop();
  };

  const setVoiceByName = (name) => {
    if (!voices?.length) return false;
    const v = voices.find((vv) => vv.name.toLowerCase().includes(name.toLowerCase()));
    if (v) {
      currentVoice = v;
      return true;
    }
    return false;
  };


  const buildAlertSentence = (alert, roomName) => {
    if (!alert) return "";
    const { sensor, status, value } = alert;

    // Friendly sensor labels
    const label =
      sensor?.toLowerCase().includes("temp") ? "temperature"
      : sensor?.toLowerCase().includes("humid") ? "humidity"
      : sensor?.toLowerCase().includes("co2") ? "C O two"
      : sensor?.toLowerCase().includes("light") ? "light level"
      : sensor || "sensor";

    const roomPart = roomName ? ` in ${roomName}` : "";
    const sev =
      status === "high" ? "is high"
      : status === "low" ? "is low"
      : "is out of range";

    return `Warning: ${label}${roomPart} ${sev}. Current reading: ${value}.`;
  };

  return {
    init,
    speak,
    stop,
    setMuted,
    setVoiceByName,
    buildAlertSentence,
  };
})();

export default VoiceManager;
