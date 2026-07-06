/* global module */
(function attachLocalPocketSummaryPromptCore(globalScope) {
  function normalizeSummaryMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "quick" || mode === "deep" || mode === "action" || mode === "study" || mode === "research" || mode === "auto" || mode === "custom") {
      return mode;
    }
    return "auto";
  }

  function getSummaryModeLabel(mode) {
    if (mode === "auto") return "Auto";
    if (mode === "quick") return "Quick";
    if (mode === "action") return "Action Items";
    if (mode === "study") return "Study Notes";
    if (mode === "research") return "Research";
    if (mode === "custom") return "Custom";
    return "Deep";
  }

  function truncateTextForPrompt(text, maxChars) {
    const raw = String(text || "");
    const limit = Number.isFinite(maxChars) ? Math.max(1, maxChars) : 80000;
    if (raw.length <= limit) {
      return { text: raw, truncated: false };
    }
    return { text: raw.slice(0, limit), truncated: true };
  }

  function normalizeSummarySourceText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeOutputLanguage(value) {
    const raw = String(value || "").trim().toLowerCase();
    // Strip region subtag (e.g. "en-MY" → "en", "ms-Arab" → "ms") so that
    // locale-aware values from document.documentElement.lang are matched correctly.
    const lang = raw.split('-')[0];
    const valid = {
      ms: "Bahasa Melayu",
      en: "English",
      id: "Bahasa Indonesia",
      ar: "Arabic",
      zh: "Chinese",
      es: "Spanish",
      fr: "French",
      pt: "Portuguese",
      hi: "Hindi",
      ja: "Japanese",
      ko: "Korean",
      ru: "Russian",
      de: "German",
      it: "Italian",
      vi: "Tiếng Việt",
      th: "Thai"
    };
    return valid[lang] || "English";
  }

  function normalizeTone(value) {
    const tone = String(value || "").trim().toLowerCase();
    if (tone === "formal" || tone === "casual" || tone === "educational") return tone;
    return "neutral";
  }

  function normalizeMaxWords(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 50 ? Math.min(n, 5000) : 0;
  }

  function getToneGuidance(tone) {
    const map = {
      formal: "Gunakan bahasa yang formal, tepat, dan profesional. Elakkan singkatan tidak formal dan gaya percakapan.",
      casual: "Gunakan gaya yang santai dan mudah difahami, seperti bercakap dengan rakan. Sesuai untuk bacaan ringan.",
      educational: "Gunakan gaya pendidikan yang sistematik dengan definisi, contoh, dan penjelasan langkah demi langkah.",
      neutral: "Gunakan bahasa yang jelas, neutral, dan profesional namun mudah difahami."
    };
    return map[tone] || map.neutral;
  }

  function getLengthGuidance(maxWords) {
    if (!maxWords || maxWords < 50) return "";
    return `Had panjang: Maksimum ${maxWords} patah perkataan untuk keseluruhan ringkasan. Patuhi had ini dengan ketat.`;
  }

  function getChainOfThoughtInstruction() {
    return [
      "",
      "Arahan pemikiran langkah demi langkah:",
      "Sebelum menulis output, lakukan analisis dalaman secara berperingkat:",
      "1. Baca dan fahami keseluruhan kandungan sumber dengan teliti.",
      "2. Kenal pasti 3-7 idea paling penting atau fakta utama.",
      "3. Tentukan bagaimana idea-idea ini saling berkaitan (sebab-akibat, perbandingan, kronologi).",
      "4. Nilai kualiti dan kelengkapan data yang ada.",
      "5. Rancang struktur ringkasan berdasarkan mode yang dipilih.",
      "6. Kemudian barulah hasilkan output mengikut format yang ditetapkan.",
      "JANGAN tulis langkah-langkah ini dalam output akhir. Ia hanya untuk panduan dalaman."
    ];
  }

  function getSelfEvaluationInstruction() {
    return [
      "",
      "Penilaian kendiri (sertakan di akhir ringkasan dalam seksyen ## Penilaian Kualiti):",
      "1. Skor keyakinan kandungan (0-100): Sejauh mana anda yakin dengan ketepatan ringkasan ini?",
      "2. Skor kelengkapan (0-100): Berapa peratus kandungan penting berjaya dirangkum?",
      "3. Batasan: Nyatakan jika ada bahagian kandungan yang tidak dapat dirangkum dengan tepat.",
      "4. Cadangan: Apa yang boleh ditambah baik untuk ringkasan yang lebih berkualiti?"
    ];
  }

  function getFollowUpQuestionsInstruction(mode) {
    if (mode === "quick") return [];
    return [
      "",
      "Soalan lanjutan (sertakan 2-3 soalan di akhir ringkasan dalam seksyen ## Soalan Lanjutan):",
      "Hasilkan 2-3 soalan yang relevan untuk penerokaan lebih mendalam berdasarkan kandungan ini.",
      "Soalan harus mendorong pemikiran kritis atau tindakan lanjutan."
    ];
  }

  function getSourceQualityInstruction() {
    return [
      "",
      "Penilaian sumber (sertakan dalam seksyen ## Penilaian Sumber):",
      "1. Nyatakan sama ada kandungan sumber mencukupi untuk ringkasan yang tepat.",
      "2. Jika data tidak lengkap, jelaskan batasan dan buat inferens secara konservatif.",
      "3. Jangan reka fakta yang tiada dalam sumber."
    ];
  }

  function getFewShotExample(mode, isYouTube) {
    const examples = {
      quick: {
        text: "Contoh output (mode QUICK):\n## Ringkasan Umum\nVideo ini menerangkan tiga strategi utama untuk meningkatkan produktiviti: teknik Pomodoro, task batching, dan deep work.\n\n## Inti Utama Bertimestamp\n- [00:32] Pengenalan tentang kepentingan pengurusan masa.\n- [02:15] Teknik Pomodoro: 25 minit fokus, 5 minit rehat.\n\n## Tindakan Praktikal\n- Cuba teknik Pomodoro untuk satu tugas hari ini.\n\n## Penutup\nKunci utama adalah konsistensi dalam mengamalkan strategi yang dipilih.",
        web: "Contoh output (mode QUICK):\n## Ringkasan Umum\nArtikel ini membincangkan tiga strategi produktiviti: Pomodoro, task batching, dan deep work.\n\n## Poin Penting\n- Teknik Pomodoro meningkatkan fokus dengan selang masa kerja dan rehat.\n\n## Tindakan Praktikal\n- Mulakan dengan sesi Pomodoro 25 minit.\n\n## Penutup\nKonsistensi adalah kunci kejayaan."
      },
      deep: {
        text: "Contoh output (mode DEEP):\n## Ringkasan Umum\nVideo ini menghuraikan secara mendalam tentang teknik produktiviti moden...\n\n## Inti Utama Bertimestamp\n- [01:20] Pomodoro: dicipta oleh Francesco Cirillo pada 1980-an.\n- [05:45] Task batching: kumpulkan tugas serupa untuk kurangkan context switching.\n\n## Analisis Perbandingan\nPomodoro sesuai untuk tugas individual manakala task batching lebih sesuai untuk tugas rutin.\n\n## Penutup\nGabungan ketiga-tiga teknik memberi hasil optimum.",
        web: "Contoh output (mode DEEP):\n## Ringkasan Umum\nArtikel ini memberikan analisis menyeluruh tentang produktiviti moden...\n\n## Poin Penting\n- Pomodoro menggunakan timer untuk selang fokus.\n- Task batching mengurangkan gangguan.\n\n## Analisis Perbandingan\nSetiap teknik mempunyai kekuatan dan kelemahan tersendiri.\n\n## Penutup\nPendekatan hibrid adalah yang terbaik."
      },
      action: {
        text: "Contoh output (mode ACTION ITEMS):\n## Ringkasan Umum\nPanduan langkah demi langkah untuk meningkatkan produktiviti.\n\n## Inti Utama Bertimestamp\n- [00:45] Langkah 1: Setup timer untuk Pomodoro.\n\n## Tindakan Praktikal\n- [ ] Hari 1: Cuba 1 sesi Pomodoro.\n- [ ] Hari 2: Amalkan task batching.\n- [ ] Hari 3: Deep work 90 minit.\n\n## Penutup\nAmalkan selama 21 hari untuk hasil optimum.",
        web: "Contoh output (mode ACTION ITEMS):\n## Ringkasan Umum\nPanduan praktikal untuk meningkatkan produktiviti.\n\n## Poin Penting\n- Mulakan dengan perubahan kecil.\n\n## Tindakan Praktikal\n- [ ] Setup ruang kerja.\n- [ ] Tetapkan matlamat harian.\n- [ ] Gunakan timer.\n\n## Penutup\nAmalkan secara konsisten."
      },
      research: {
        text: "Contoh output (mode RESEARCH):\n## 1. Pengenalan & Latar Belakang\nProduktiviti merujuk kepada keupayaan menyelesaikan tugas secara efisien...\n\n## 2. Teori & Kerangka Konsep\nTeori Flow Csikszentmihalyi (1990) menjadi asas kepada deep work.\n\n## 3. Kajian Terkini & Data Empirik\nKajian oleh Newport (2016) menunjukkan deep work meningkatkan output sebanyak 400%.\n\n## 4. Isu & Kontroversi\nKritikan: teknik ini sukar diaplikasi dalam persekitaran kerja moden yang serba pantas.\n\n## 7. Sumber & Rujukan\n- Newport, C. (2016). Deep Work.\n- Cirillo, F. (2006). The Pomodoro Technique.",
        web: "Contoh output (mode RESEARCH):\n## 1. Pengenalan & Latar Belakang\nSama seperti format YouTube tetapi berdasarkan kandungan halaman web.\n\n## 7. Sumber & Rujukan\n- Sumber utama: artikel yang dirangkum."
      },
      study: {
        text: "Contoh output (mode STUDY NOTES):\n## Pembuka: Kesilapan Umum dalam Belajar\nRamai pelajar membaca tanpa strategi dan cepat lupa.\n\n## AI Tools untuk Merangkum\nChatGPT boleh merangkum artikel panjang dalam beberapa saat.\n\n## Demonstrasi Penggunaan Tools\nKajian kes: gunakan ChatGPT untuk merangkum bab textbook.\n\n## Strategi Memaksimumkan Hasil Belajar\nGabungkan AI tools dengan teknik aktif recall.\n\n## Langkah Praktikal\n1. Baca bahan.\n2. Minta AI rangkum.\n3. Uji kefahaman dengan soalan.",
        web: "Contoh output (mode STUDY NOTES):\nSama seperti format YouTube tetapi berdasarkan kandungan halaman web."
      }
    };
    const modeExamples = examples[mode] || examples.deep;
    return "\n" + (isYouTube ? modeExamples.text : modeExamples.web) + "\n";
  }

  function buildLanguageOutputRule(languageName) {
    const specificRules = {
      "Bahasa Melayu": "WAJIB jawab 100% dalam Bahasa Melayu standard (tiada campuran bahasa kecuali istilah teknikal).",
      "Bahasa Indonesia": "WAJIB jawab 100% dalam Bahasa Indonesia baku (kecuali istilah teknis).",
      "English": "You MUST answer 100% in English (no mixing with other languages except technical terms)."
    };
    if (specificRules[languageName]) return specificRules[languageName];
    return `WAJIB jawab 100% dalam ${languageName} (kecuali istilah teknikal). Jangan campur dengan bahasa lain.`;
  }

  function buildResearchModeInstructionLines(topic, options) {
    const safeTopic = normalizeSummarySourceText(topic) || "topik ini";
    const includeTimestampRule = !!(options && options.includeTimestampRule);
    const lines = [
      "",
      "Prompt khusus mode RESEARCH:",
      `Saya ingin lakukan research mendalam tentang ${safeTopic}. Tolong buat analisis menyeluruh yang merangkumi:`,
      "",
      "1. **Pengenalan & Latar Belakang**: Terangkan sejarah, konteks, dan kepentingan topik ini.",
      "2. **Teori & Kerangka Konsep**: Senaraikan teori, model, atau kerangka penyelidikan utama yang berkaitan.",
      "3. **Kajian Terkini & Data Empirik**: Ringkaskan kajian akademik terbaru, statistik, trend, dan dapatan penting.",
      "4. **Isu & Kontroversi**: Terangkan perdebatan atau cabaran utama dalam bidang ini.",
      "5. **Kes Kajian / Contoh Praktikal**: Berikan contoh sebenar dari industri, komuniti, atau kajian lapangan.",
      "6. **Cadangan / Insight Praktikal**: Apa implikasi praktikal, cadangan strategi, atau penyelidikan masa depan.",
      "7. **Sumber & Rujukan**: Sertakan senarai sumber yang boleh dipercayai.",
      "",
      "Sila buat jawapan dalam bentuk yang tersusun dengan **tajuk & sub-tajuk** supaya mudah difahami, dan gunakan bahasa yang formal serta tepat.",
      "",
      "Format output WAJIB ikut tajuk seksyen berikut (jangan ubah tajuk):",
      "## 1. Pengenalan & Latar Belakang",
      "## 2. Teori & Kerangka Konsep",
      "## 3. Kajian Terkini & Data Empirik",
      "## 4. Isu & Kontroversi",
      "## 5. Kes Kajian / Contoh Praktikal",
      "## 6. Cadangan / Insight Praktikal",
      "## 7. Sumber & Rujukan"
    ];
    if (includeTimestampRule) {
      lines.push("");
      lines.push("Peraturan tambahan sumber video: jika merujuk bukti transkrip, sertakan cap masa [mm:ss] atau [hh:mm:ss] bila tersedia.");
    }
    return lines;
  }

  function buildStudyModeInstructionLines(options) {
    const includeTimestampRule = !!(options && options.includeTimestampRule);
    const lines = [
      "",
      "Prompt khusus mode STUDY:",
      "Bertindaklah sebagai AI learning optimization specialist profesional.",
      "Tugas anda adalah membina kandungan pendidikan yang menunjukkan bagaimana AI tools boleh membantu proses pembelajaran menjadi lebih cepat, tersusun, dan efisien.",
      "Konteksnya, ramai pelajar dan profesional sukar memahami bahan kompleks dan sering belajar tanpa strategi.",
      "",
      "Struktur output WAJIB ikut tajuk seksyen berikut (jangan ubah tajuk):",
      "## Pembuka: Kesilapan Umum dalam Belajar",
      "## AI Tools untuk Merangkum, Menjelaskan, dan Latihan",
      "## Demonstrasi Penggunaan Tools pada Satu Topik",
      "## Strategi Memaksimumkan Hasil Belajar",
      "## Langkah Praktikal yang Boleh Terus Diterapkan",
      "",
      "Peraturan tambahan:",
      "1. Gunakan Bahasa Melayu standard yang edukatif, sistematik, dan mudah diikuti.",
      "2. Elakkan penjelasan abstrak; fokus pada langkah praktikal yang boleh terus diterapkan audiens.",
      "3. Berikan contoh konkrit penggunaan AI tools untuk merangkum, menjelaskan, dan membina latihan belajar."
    ];
    if (includeTimestampRule) {
      lines.push("4. Jika sumber ialah video, sertakan cap masa [mm:ss] atau [hh:mm:ss] untuk setiap poin demonstrasi bila tersedia.");
    }
    return lines;
  }

  function buildDynamicSectionNote(mode) {
    if (mode === "research" || mode === "study") return "";
    return [
      "",
      "Panduan pemilihan seksyen:",
      "Anda BOLEH menambah atau menggugurkan seksyen yang tidak relevan berdasarkan kandungan. Contohnya:",
      "- Jika kandungan tidak mempunyai elemen praktikal, seksyen 'Tindakan Praktikal' boleh ditinggalkan.",
      "- Jika video sangat pendek, gabungkan 'Ringkasan Umum' dengan 'Inti Utama'.",
      "- Anda boleh menambah seksyen baru jika relevan (contoh: 'Analisis Perbandingan', 'Kronologi', 'Statistik Utama').",
      "Pastikan struktur asas kekal jelas dan output mudah diikuti."
    ].join("\n");
  }

  function buildMalayYouTubeSummaryPrompt(input) {
    const url = input && input.url ? input.url : "";
    const title = input && input.title ? input.title : "";
    const transcript = input && input.transcript ? input.transcript : "";
    const timestampedTranscript = input && input.timestampedTranscript ? input.timestampedTranscript : "";
    const languageCode = input && input.languageCode ? input.languageCode : "";
    const categoryName = input && input.categoryName ? input.categoryName : "";
    const summaryMode = normalizeSummaryMode(input && input.summaryMode ? input.summaryMode : "deep");
    const presetLabel = input && input.presetLabel ? input.presetLabel : "General";
    const presetFocus = input && input.presetFocus ? input.presetFocus : "";
    const source = input && input.source ? input.source : "";
    const autoGenerated = !!(input && input.autoGenerated);
    const confidenceScore = Number.isFinite(input && input.confidenceScore) ? input.confidenceScore : 0;
    const confidenceLabel = input && input.confidenceLabel ? input.confidenceLabel : "Sederhana";
    const coveragePercent = Number.isFinite(input && input.coveragePercent) ? input.coveragePercent : 0;
    const timestampCoveragePercent = Number.isFinite(input && input.timestampCoveragePercent) ? input.timestampCoveragePercent : 0;

    const outputLanguage = normalizeOutputLanguage(input && input.outputLanguage);
    const tone = normalizeTone(input && input.tone);
    const maxWords = normalizeMaxWords(input && input.maxWords);

    const modeLabel = getSummaryModeLabel(summaryMode);
    const modeGuidance = {
      quick: "Mode QUICK: padat dan terus kepada poin paling kritikal; elakkan huraian panjang.",
      deep: "Mode DEEP: berikan analisis menyeluruh, konteks, dan hubungan antara idea.",
      action: "Mode ACTION ITEMS: utamakan langkah praktikal, checklist, dan cadangan pelaksanaan.",
      study: "Mode STUDY NOTES: susun seperti nota pembelajaran, definisi, contoh, dan soalan ulang kaji.",
      research: "Mode RESEARCH: tekankan soalan utama, kaedah/kerangka analisis, bukti, batasan, dan jurang kajian."
    };
    const researchTopic = normalizeSummarySourceText(title || categoryName || "video ini");
    const outputLanguageRule = buildLanguageOutputRule(outputLanguage);

    const heading = [
      "Anda ialah pembantu ringkasan video YouTube.",
      outputLanguageRule,
      "",
      "Maklumat video:",
      "URL: " + (url || "(tiada URL)"),
      "Tajuk: " + (title || "(tiada tajuk)"),
      "Kategori: " + (categoryName || "(tiada kategori)"),
      "Mode ringkasan: " + modeLabel,
      "Preset kategori: " + presetLabel,
      "Fokus preset: " + (presetFocus || "Fokus seimbang"),
      "Sumber transkrip: " + (source || "tidak diketahui"),
      "Bahasa transkrip: " + (languageCode || "tidak diketahui"),
      "Auto-generated transcript: " + (autoGenerated ? "Ya" : "Tidak"),
      "Liputan transkrip anggaran: " + coveragePercent + "%",
      "Liputan cap masa: " + timestampCoveragePercent + "%",
      "Keyakinan asas sistem: " + confidenceLabel + " (" + confidenceScore + "/100)",
      "",
      "Gaya penulisan: " + getToneGuidance(tone)
    ];

    const lengthGuidance = getLengthGuidance(maxWords);
    if (lengthGuidance) heading.push(lengthGuidance);

    const customPrompt = input && input.customPrompt ? normalizeSummarySourceText(input.customPrompt) : "";

    if (summaryMode === "custom") {
      if (!customPrompt) {
        return "Tiada arahan custom prompt ditetapkan. Sila tulis prompt anda di Options atau tambah templat terlebih dahulu.";
      }
      var customLines = [
        ...heading,
        "",
        "Arahan Custom:",
        customPrompt,
        "",
        "Konteks:",
        "URL: " + (url || "(tiada URL)"),
        "Tajuk: " + (title || "(tiada tajuk)")
      ];
      if (transcript) {
        var tPack = truncateTextForPrompt(transcript, 60000);
        customLines.push("", "Transkrip:", tPack.text);
      }
      return customLines.join("\n");
    }

    const instructions = summaryMode === "research"
      ? buildResearchModeInstructionLines(researchTopic, { includeTimestampRule: true })
      : (summaryMode === "study"
        ? buildStudyModeInstructionLines({ includeTimestampRule: true })
        : [
          "",
          "Arahan mode:",
          modeGuidance[summaryMode] || modeGuidance.deep,
          "",
          "Format output WAJIB ikut tajuk seksyen berikut (jangan ubah tajuk):",
          "## Ringkasan Umum",
          "## Inti Utama Bertimestamp",
          "## Tindakan Praktikal",
          "## Istilah Penting",
          "## Confidence & Coverage",
          "## Penutup",
          "",
          "Peraturan tambahan:",
          "1. Dalam seksyen 'Inti Utama Bertimestamp', setiap bullet wajib bermula dengan cap masa [mm:ss] atau [hh:mm:ss].",
          "2. Jika cap masa tidak pasti, gunakan tag [anggaran mm:ss].",
          "3. Dalam seksyen 'Confidence & Coverage', WAJIB nyatakan semula nilai ini dengan tepat:",
          `   - Keyakinan asas sistem: ${confidenceLabel} (${confidenceScore}/100)`,
          `   - Liputan transkrip anggaran: ${coveragePercent}%`,
          `   - Liputan cap masa: ${timestampCoveragePercent}%`,
          "4. Nyatakan batasan data (contoh transkrip terhad/tiada) secara jujur dan ringkas.",
          "5. Kekalkan gaya jelas, padat, dan berstruktur."
        ]);

    instructions.push(...getChainOfThoughtInstruction());
    instructions.push(...getSourceQualityInstruction());

    // Untuk mode quick: skip few-shot example dan self-evaluation
    // supaya prompt lebih ringkas dan token lebih sedikit → AI respond lebih laju
    if (summaryMode !== "quick") {
      instructions.push("");
      instructions.push(getFewShotExample(summaryMode, true));
    }

    instructions.push(buildDynamicSectionNote(summaryMode));

    if (summaryMode !== "quick") {
      instructions.push(...getFollowUpQuestionsInstruction(summaryMode));
      instructions.push(...getSelfEvaluationInstruction());
    }

    if (customPrompt) {
      instructions.push("", "Arahan Khas Tambahan (Sangat Penting):", customPrompt);
    }

    if (!transcript) {
      instructions.push("", "Nota data: Transkrip penuh tidak tersedia. Buat inferens secara konservatif dan nyatakan keterbatasan dengan jelas.");
      return [...heading, ...instructions].join("\n");
    }

    const timestampedPack = truncateTextForPrompt(timestampedTranscript, 52000);
    const plainPack = truncateTextForPrompt(transcript, 60000);
    const body = [""];
    if (timestampedPack.text) {
      body.push("Transkrip bertimestamp (rujukan utama):");
      body.push(timestampedPack.text);
      if (timestampedPack.truncated) {
        body.push("");
        body.push("[Nota] Transkrip bertimestamp dipendekkan kerana terlalu panjang.");
      }
    } else {
      body.push("Transkrip (tanpa cap masa terperinci):");
      body.push(plainPack.text);
      if (plainPack.truncated) {
        body.push("");
        body.push("[Nota] Transkrip dipendekkan kerana terlalu panjang.");
      }
    }

    if (timestampedPack.text && plainPack.text && plainPack.text !== timestampedPack.text) {
      const extraPlain = truncateTextForPrompt(plainPack.text, 14000);
      body.push("");
      body.push("Petikan transkrip biasa (rujukan tambahan):");
      body.push(extraPlain.text);
      if (plainPack.truncated) {
        body.push("[Nota] Petikan tambahan ini juga dipendekkan.");
      }
    }

    return [...heading, ...instructions, ...body].join("\n");
  }

  function buildMalayWebSummaryPrompt(input) {
    const url = input && input.url ? input.url : "";
    const title = input && input.title ? input.title : "";
    const summaryMode = normalizeSummaryMode(input && input.summaryMode ? input.summaryMode : "deep");
    const presetLabel = input && input.presetLabel ? input.presetLabel : "General";
    const presetFocus = input && input.presetFocus ? input.presetFocus : "";
    const categoryName = input && input.categoryName ? input.categoryName : "";
    const source = input && input.source ? input.source : "";
    const pageTitle = input && input.pageTitle ? normalizeSummarySourceText(input.pageTitle) : "";
    const pageDescription = input && input.pageDescription ? normalizeSummarySourceText(input.pageDescription) : "";
    const pageTextRaw = input && input.pageText ? String(input.pageText) : "";
    const pageTextPack = truncateTextForPrompt(pageTextRaw, 52000);
    const pageText = normalizeSummarySourceText(pageTextPack.text || "");

    const outputLanguage = normalizeOutputLanguage(input && input.outputLanguage);
    const tone = normalizeTone(input && input.tone);
    const maxWords = normalizeMaxWords(input && input.maxWords);

    const modeLabel = getSummaryModeLabel(summaryMode);
    const modeGuidance = {
      quick: "Mode QUICK: ringkas, terus kepada poin utama dan kesimpulan segera.",
      deep: "Mode DEEP: ulas dengan konteks, sebab-akibat, dan implikasi yang lebih luas.",
      action: "Mode ACTION ITEMS: fokus pada langkah praktikal dan checklist pelaksanaan.",
      study: "Mode STUDY NOTES: susun seperti nota pembelajaran, definisi dan contoh.",
      research: "Mode RESEARCH: rangkum soalan utama, metodologi, bukti, batasan, dan cadangan kajian lanjutan."
    };
    const researchTopic = normalizeSummarySourceText(title || pageTitle || categoryName || "halaman ini");
    const outputLanguageRule = buildLanguageOutputRule(outputLanguage);

    const heading = [
      "Anda ialah pembantu ringkasan halaman web.",
      outputLanguageRule,
      "",
      "Maklumat halaman:",
      "URL: " + (url || "(tiada URL)"),
      "Tajuk asal: " + (title || "(tiada tajuk)"),
      "Kategori: " + (categoryName || "(tiada kategori)"),
      "Mode ringkasan: " + modeLabel,
      "Preset kategori: " + presetLabel,
      "Fokus preset: " + (presetFocus || "Fokus seimbang"),
      "Sumber kandungan: " + (source || "metadata/URL sahaja"),
      "",
      "Gaya penulisan: " + getToneGuidance(tone)
    ];

    const lengthGuidance = getLengthGuidance(maxWords);
    if (lengthGuidance) heading.push(lengthGuidance);

    const customPrompt = input && input.customPrompt ? normalizeSummarySourceText(input.customPrompt) : "";

    if (summaryMode === "custom") {
      if (!customPrompt) {
        return "Tiada arahan custom prompt ditetapkan. Sila tulis prompt anda di Options atau tambah templat terlebih dahulu.";
      }
      var customLines = [
        ...heading,
        "",
        "Arahan Custom:",
        customPrompt,
        "",
        "Konteks:",
        "URL: " + (url || "(tiada URL)"),
        "Tajuk: " + (title || pageTitle || "(tiada tajuk)")
      ];
      if (pageText) {
        customLines.push("", "Kandungan halaman:", pageText);
      }
      return customLines.join("\n");
    }

    const instructions = summaryMode === "research"
      ? buildResearchModeInstructionLines(researchTopic)
      : (summaryMode === "study"
        ? buildStudyModeInstructionLines()
        : [
          "",
          "Arahan mode:",
          modeGuidance[summaryMode] || modeGuidance.deep,
          "",
          "Format output WAJIB ikut tajuk seksyen berikut (jangan ubah tajuk):",
          "## Ringkasan Umum",
          "## Poin Penting",
          "## Tindakan Praktikal",
          "## Soalan Lanjutan",
          "## Penutup",
          "",
          "Peraturan tambahan:",
          "1. Elakkan ayat terlalu panjang; utamakan kejelasan.",
          "2. Jika data tidak lengkap, nyatakan batasan dengan jujur.",
          "3. Jangan reka fakta yang tiada dalam sumber."
        ]);

    instructions.push(...getChainOfThoughtInstruction());
    instructions.push(...getSourceQualityInstruction());

    // Untuk mode quick: skip few-shot example dan self-evaluation
    // supaya prompt lebih ringkas dan token lebih sedikit → AI respond lebih laju
    if (summaryMode !== "quick") {
      instructions.push("");
      instructions.push(getFewShotExample(summaryMode, false));
    }

    instructions.push(buildDynamicSectionNote(summaryMode));

    if (summaryMode !== "quick") {
      instructions.push(...getFollowUpQuestionsInstruction(summaryMode));
      instructions.push(...getSelfEvaluationInstruction());
    }

    if (customPrompt) {
      instructions.push("", "Arahan Khas Tambahan (Sangat Penting):", customPrompt);
    }

    const body = [""];
    if (pageTitle) {
      body.push("Tajuk halaman (hasil ekstrak): " + pageTitle);
    }
    if (pageDescription) {
      body.push("Penerangan ringkas halaman: " + pageDescription);
    }
    if (pageText) {
      body.push("");
      body.push("Kandungan halaman (rujukan utama):");
      body.push(pageText);
      if (pageTextPack.truncated) {
        body.push("");
        body.push("[Nota] Kandungan halaman dipendekkan kerana terlalu panjang.");
      }
    } else {
      body.push("");
      body.push("Nota data: Kandungan halaman penuh tidak dapat diekstrak.");
      body.push("Gunakan URL, tajuk, dan penerangan yang ada untuk ringkasan konservatif.");
    }

    return [...heading, ...instructions, ...body].join("\n");
  }

  const api = {
    normalizeSummaryMode,
    getSummaryModeLabel,
    truncateTextForPrompt,
    normalizeSummarySourceText,
    normalizeOutputLanguage,
    normalizeTone,
    normalizeMaxWords,
    buildResearchModeInstructionLines,
    buildStudyModeInstructionLines,
    buildMalayYouTubeSummaryPrompt,
    buildMalayWebSummaryPrompt
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketSummaryPromptCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
