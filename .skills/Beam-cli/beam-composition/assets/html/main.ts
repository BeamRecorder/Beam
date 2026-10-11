const card = document.querySelector<HTMLElement>('.card');
if (!card) throw new Error('Missing composition card.');
const subject = card;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - value) ** 3;

Object.assign(window, {
  beamComposition: {
    seek(timeMs: number) {
      const enter = easeOut(clamp(timeMs / 700));
      const leave = clamp((timeMs - 5300) / 700);
      subject.style.opacity = String(enter * (1 - leave));
      subject.style.transform = `translateY(${(1 - enter) * 32 - leave * 16}px)`;
    },
  },
});
