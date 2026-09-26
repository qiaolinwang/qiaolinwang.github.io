---
layout: page
title: Paimon Voice Clone
description: Where my speech AI journey started, a VITS voice clone of Paimon from Genshin Impact (2022).
img: assets/img/paimon_poster.jpg
importance: 1
category: Open Source
---

My speech AI journey began as a side quest in the summer of 2022: teaching a model to speak as Paimon from _Genshin Impact_.

{% include video.liquid path="assets/video/paimon-voice-clone.mp4" class="img-fluid rounded z-depth-1" controls=true poster="/assets/img/paimon_poster.jpg" %}

<div class="caption">
    I Used AI to Clone Paimon's Voice (September 2022), 616K views on Bilibili.
</div>

### Highlights

- Built and annotated a multi-speaker dataset of ≈48,000 clips (15 hours) from 50 _Genshin Impact_ characters.
- Engineered the data pipeline with ECAPA-TDNN for speaker classification and Whisper for transcription.
- Fine-tuned a VITS speech synthesis model on a curated set of Paimon clips.
- Released the project as a technical demo on Bilibili, where it passed 600,000 views, with a public notebook for anyone to try.

### Resources

- Colab: [Paimon voice demo](https://colab.research.google.com/drive/1HDV84t3N-yUEBXN8dDIDSv6CzEJykCLw)
- Original upload: [Bilibili](https://www.bilibili.com/video/BV16G4y1B7Ey/)
