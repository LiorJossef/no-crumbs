import { describe, expect, it } from 'vitest';

import { isDegenerateRepetition, judgeTranscript } from '@/integrations/transcription/no-speech';

describe('judgeTranscript', () => {
  it('keeps ordinary speech verbatim, including its punctuation and casing', () => {
    const verdict = judgeTranscript({
      hasSpeech: true,
      transcript: "  Okay so this place, Cafe Levinsky, does the best sourdough in the city.  ",
    });
    expect(verdict).toEqual({
      kept: true,
      text: "Okay so this place, Cafe Levinsky, does the best sourdough in the city.",
    });
  });

  it('keeps Hebrew in Hebrew script rather than reading a non-Latin transcript as empty', () => {
    const verdict = judgeTranscript({ hasSpeech: true, transcript: 'הלכנו למאפייה הזאת ברחוב לוינסקי' });
    expect(verdict.kept).toBe(true);
  });

  it('suppresses a transcript when the model itself reported no speech, even if it wrote one anyway', () => {
    // The self-contradicting response. Resolved toward silence on purpose: the expensive mistake is
    // a fabricated venue name reaching the extractor, not a missed one.
    const verdict = judgeTranscript({ hasSpeech: false, transcript: 'We went to Cafe Levinsky.' });
    expect(verdict).toEqual({ kept: false, reason: 'model-reported-no-speech' });
  });

  it('suppresses an empty or whitespace-only transcript', () => {
    expect(judgeTranscript({ hasSpeech: true, transcript: '' })).toEqual({ kept: false, reason: 'empty' });
    expect(judgeTranscript({ hasSpeech: true, transcript: '   \n  ' })).toEqual({ kept: false, reason: 'empty' });
  });

  it.each([
    ['[Music]'],
    ['[music playing]'],
    ['(upbeat instrumental music)'],
    ['<inaudible>'],
    ['♪♪♪'],
    ['[Music] (applause) [Music]'],
  ])('suppresses annotation-only output: %s', (transcript) => {
    expect(judgeTranscript({ hasSpeech: true, transcript })).toEqual({ kept: false, reason: 'annotation-only' });
  });

  it.each([['Music'], ['No speech detected.'], ['The audio contains no speech.'], ['Unintelligible'], ['N/A']])(
    'suppresses a whole-string no-speech phrase: %s',
    (transcript) => {
      expect(judgeTranscript({ hasSpeech: true, transcript })).toEqual({ kept: false, reason: 'no-speech-phrase' });
    },
  );

  it('does not suppress a real sentence that merely contains a no-speech word', () => {
    // The phrase list is whole-string for exactly this reason: "music" starting a sentence is a
    // person talking, and a substring match here would delete real transcripts.
    const verdict = judgeTranscript({
      hasSpeech: true,
      transcript: 'Music here is great and the food is even better, go on a Tuesday.',
    });
    expect(verdict.kept).toBe(true);
  });

  it('suppresses a degenerate loop', () => {
    const verdict = judgeTranscript({
      hasSpeech: true,
      transcript: 'Thank you. Thank you. Thank you. Thank you. Thank you. Thank you.',
    });
    expect(verdict).toEqual({ kept: false, reason: 'degenerate-repetition' });
  });

  it('strips annotations before judging, so speech wrapped in markers survives', () => {
    const verdict = judgeTranscript({
      hasSpeech: true,
      transcript: '[Music] The bakery opens at seven, get there early. [Music]',
    });
    // The kept text is the original, unedited: the annotation mask is a test, not a rewrite. We do
    // not put our own words in a speaker's mouth by silently editing what came back.
    expect(verdict).toEqual({
      kept: true,
      text: '[Music] The bakery opens at seven, get there early. [Music]',
    });
  });
});

describe('isDegenerateRepetition', () => {
  it.each([
    ['a single word run', 'no no no no no no'],
    ['a two-word loop', 'thank you thank you thank you thank you thank you'],
    ['a phrase loop the unique-ratio rule alone would miss', 'subscribe to my channel subscribe to my channel subscribe to my channel'],
    ['a loop truncated mid-phrase', 'like and subscribe like and subscribe like and subscribe like and'],
    ['a low-vocabulary crawl', 'okay okay so okay okay so okay okay so okay okay so'],
  ])('flags %s', (_label, text) => {
    expect(isDegenerateRepetition(text)).toBe(true);
  });

  it.each([
    ['a short repetition a person would really say', 'Yes. Yes. Yes.'],
    ['ordinary speech', 'We went to this bakery on Levinsky and ordered the pistachio thing and it was unbelievable.'],
    ['speech with a repeated emphasis word', 'It is really really good, honestly, go early because the queue gets long.'],
    ['a Hebrew sentence', 'הלכנו למאפייה הזאת ברחוב לוינסקי והפיסטוק שם פשוט מטורף תלכו מוקדם'],
    ['a single word', 'Amazing'],
  ])('does not flag %s', (_label, text) => {
    expect(isDegenerateRepetition(text)).toBe(false);
  });
});
