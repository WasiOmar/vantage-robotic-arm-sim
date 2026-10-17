export function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // Set voice to the first English voice available
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find((v) => v.lang.startsWith('en'));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  // Handle voices loading dynamically in some browsers
  if (voices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      const updatedVoices = window.speechSynthesis.getVoices();
      const updatedEnglishVoice = updatedVoices.find((v) => v.lang.startsWith('en'));
      if (updatedEnglishVoice) {
        utterance.voice = updatedEnglishVoice;
      }
    };
  }

  window.speechSynthesis.speak(utterance);
}

export function cancel(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
