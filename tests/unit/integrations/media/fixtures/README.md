# MP4 demuxer fixtures

Two small MP4s, **synthesised on this machine** with tools that ship with macOS. No third-party
media, no TikTok content, nothing fetched from the network. Both are committed because the demuxer's
acceptance test is "a real container, produced by someone else's muxer, decodes back to the right
duration" — a builder's idea of an MP4 cannot prove that.

| File | What it is | Why it is here |
|---|---|---|
| `speech-aac.m4a` | 8.41 s, 44.1 kHz mono AAC-LC, 362 packets, 66,603 audio bytes | the happy path, and the source of the co64 and truncation variants the tests derive from it |
| `speech-alac.m4a` | ~3 s, 22.05 kHz mono ALAC | a real, well-formed MP4 whose audio we deliberately do not read |

Regenerate:

```sh
say -o say.aiff "This is a synthetic test clip for the demuxer. It contains no third party content. One, two, three, four, five."
afconvert say.aiff -f m4af -d aac@44100 -b 64000 speech-aac.m4a

say -o short.aiff "Synthetic fixture. No third party content."
afconvert short.aiff -f m4af -d alac speech-alac.m4a
```

The numbers the tests assert on (`362` packets, `66603` bytes, `44100 Hz`, `1 ch`) come from
`afinfo speech-aac.m4a` — CoreAudio's reading of the file, not ours. Regenerating the fixture
changes them.
